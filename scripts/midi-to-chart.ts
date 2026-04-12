/**
 * Draft importer: Standard MIDI File → Fretflow chart JSON v1.
 *
 * Usage:
 *   npm run midi-to-chart -- <file.mid> [out.json]
 *
 * Options (flags anywhere):
 *   --bpm=120        Override BPM (default: match wall-clock from tempo map + note span)
 *   --title="Name"   Chart title (default: first track name, else .mid basename)
 *   --track=0        Only read this track index (0-based); default: merge all tracks
 *
 * Heuristics: piecewise-constant tempo from all setTempo events; effective BPM so that
 * chart seconds (beat*60/bpm) match integrated MIDI time to the last note end. Notes
 * sharing the same start beat are voiced as a chord: prefer distinct strings, then
 * greedy transitions from bass note upward within the chord and across chords.
 * Skips MIDI channel 10 (drums, 0-based channel 9). Logs once if the file contains pitch bend
 * (chart stays equal-temperament; bends are not applied).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseMidi, type MidiData, type MidiEvent } from "midi-file";
import { OPEN_STRING_MIDI } from "../src/lib/chart/guitar";
import type { ChartNoteV1, FretflowChartV1 } from "../src/lib/chart/types";
import { getChartValidationIssues, validateChart } from "../src/lib/chart/validate";

const DRUM_CHANNEL = 9; // General MIDI percussion (0-based)
const DEFAULT_MICROS = 500_000;

function usage(): void {
  console.error(`Usage: midi-to-chart <file.mid> [out.json] [--bpm=N] [--title=T] [--track=N]

If out.json is omitted, writes to stdout.`);
}

function parseArgs(argv: string[]): {
  inPath: string;
  outPath: string | null;
  bpmOverride: number | null;
  titleOverride: string | null;
  trackIndex: number | null;
} {
  const positional: string[] = [];
  let bpmOverride: number | null = null;
  let titleOverride: string | null = null;
  let trackIndex: number | null = null;
  for (const a of argv) {
    if (a.startsWith("--bpm=")) {
      const n = Number(a.slice(6));
      if (Number.isFinite(n) && n > 0) bpmOverride = n;
    } else if (a.startsWith("--title=")) {
      titleOverride = a.slice(8).replace(/^"(.*)"$/, "$1");
    } else if (a.startsWith("--track=")) {
      const n = Number(a.slice(8));
      if (Number.isInteger(n) && n >= 0) trackIndex = n;
    } else if (!a.startsWith("-")) {
      positional.push(a);
    }
  }
  const inPath = positional[0] ?? "";
  const outPath = positional[1] ?? null;
  return { inPath, outPath, bpmOverride, titleOverride, trackIndex };
}

type Pos = Pick<ChartNoteV1, "stringIndex" | "fret">;

function allGuitarPositions(midi: number): Pos[] {
  const out: Pos[] = [];
  for (let s = 0; s <= 5; s++) {
    const fret = midi - OPEN_STRING_MIDI[s]!;
    if (fret >= 0 && fret <= 24 && Number.isInteger(fret)) {
      out.push({ stringIndex: s, fret });
    }
  }
  return out;
}

function scoreTransition(prev: Pos | null, p: Pos): number {
  if (!prev) {
    return Math.abs(p.fret - 5) + p.stringIndex * 0.5;
  }
  return Math.abs(p.fret - prev.fret) + 2.5 * Math.abs(p.stringIndex - prev.stringIndex);
}

/** Best transition cost from `from` into any valid position for `nextMidi`. */
function minTransitionToMidi(from: Pos, nextMidi: number): number {
  const nextPos = allGuitarPositions(nextMidi);
  if (nextPos.length === 0) {
    return 0;
  }
  let m = Infinity;
  for (const d of nextPos) {
    m = Math.min(m, scoreTransition(from, d));
  }
  return m;
}

type RawNote = { startBeat: number; durationBeats: number; midi: number };

function beatGroupKey(startBeat: number): number {
  return Math.round(startBeat * 1e9) / 1e9;
}

function nextChordLeadMidi(groups: Map<number, RawNote[]>, orderedKeys: number[], ki: number): number | null {
  if (ki + 1 >= orderedKeys.length) {
    return null;
  }
  const next = groups.get(orderedKeys[ki + 1]!);
  if (!next || next.length === 0) {
    return null;
  }
  const sorted = [...next].sort((a, b) => a.midi - b.midi);
  return sorted[0]!.midi;
}

const LOOKAHEAD_WEIGHT = 0.35;

function assignFingering(raw: RawNote[]): ChartNoteV1[] {
  const groups = new Map<number, RawNote[]>();
  for (const r of raw) {
    const k = beatGroupKey(r.startBeat);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const orderedKeys = [...groups.keys()].sort((a, b) => a - b);
  const out: ChartNoteV1[] = [];
  let prev: Pos | null = null;

  for (let ki = 0; ki < orderedKeys.length; ki++) {
    const k = orderedKeys[ki]!;
    const chord = groups.get(k)!;
    chord.sort((a, b) => a.midi - b.midi);
    const nextLead = nextChordLeadMidi(groups, orderedKeys, ki);
    const usedStrings = new Set<number>();
    for (let idx = 0; idx < chord.length; idx++) {
      const r = chord[idx]!;
      const all = allGuitarPositions(r.midi);
      if (all.length === 0) continue;
      let candidates = all.filter((c) => !usedStrings.has(c.stringIndex));
      if (candidates.length === 0) {
        candidates = all;
      }
      const lastInChord = idx === chord.length - 1;
      const useLookahead =
        nextLead != null && (chord.length === 1 || lastInChord) && allGuitarPositions(nextLead).length > 0;

      let best = candidates[0]!;
      let bestScore = Infinity;
      for (const c of candidates) {
        let sc = scoreTransition(prev, c);
        if (useLookahead) {
          sc += LOOKAHEAD_WEIGHT * minTransitionToMidi(c, nextLead);
        }
        if (sc < bestScore) {
          bestScore = sc;
          best = c;
        }
      }
      usedStrings.add(best.stringIndex);
      out.push({
        startBeat: r.startBeat,
        durationBeats: r.durationBeats,
        stringIndex: best.stringIndex,
        fret: best.fret,
      });
      prev = best;
    }
  }

  out.sort((a, b) => a.startBeat - b.startBeat || a.stringIndex - b.stringIndex);
  return out;
}

function eventRank(e: MidiEvent): number {
  if (e.type === "noteOff") return 0;
  if (e.type === "noteOn") return 1;
  return 2;
}

function flattenTracks(midi: MidiData, onlyTrack: number | null): { tick: number; e: MidiEvent }[] {
  const out: { tick: number; e: MidiEvent }[] = [];
  for (let ti = 0; ti < midi.tracks.length; ti++) {
    if (onlyTrack != null && ti !== onlyTrack) continue;
    let tick = 0;
    for (const e of midi.tracks[ti]!) {
      tick += e.deltaTime;
      out.push({ tick, e });
    }
  }
  out.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    const d = eventRank(a.e) - eventRank(b.e);
    if (d !== 0) return d;
    return 0;
  });
  return out;
}

/** Sorted, de-duplicated by tick (later event wins). */
function extractTempoTimeline(timed: { tick: number; e: MidiEvent }[]): { tick: number; micros: number }[] {
  const raw: { tick: number; micros: number }[] = [];
  for (const { tick, e } of timed) {
    if (e.type === "setTempo" && "microsecondsPerBeat" in e && e.microsecondsPerBeat > 0) {
      raw.push({ tick, micros: e.microsecondsPerBeat });
    }
  }
  raw.sort((a, b) => a.tick - b.tick);
  const out: { tick: number; micros: number }[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (last && last.tick === p.tick) {
      last.micros = p.micros;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

/** Wall-clock seconds from tick 0 to endTick under piecewise-constant setTempo map. */
function integrateSecondsToTick(
  endTick: number,
  ppq: number,
  timeline: { tick: number; micros: number }[],
): number {
  if (endTick <= 0) return 0;
  let pts = timeline.slice().sort((a, b) => a.tick - b.tick);
  if (pts.length === 0) {
    return (endTick / ppq) * (DEFAULT_MICROS / 1e6);
  }
  if (pts[0]!.tick > 0) {
    pts = [{ tick: 0, micros: DEFAULT_MICROS }, ...pts];
  }
  let sec = 0;
  for (let i = 0; i < pts.length; i++) {
    const start = pts[i]!.tick;
    const micros = pts[i]!.micros;
    const segEnd = i + 1 < pts.length ? Math.min(endTick, pts[i + 1]!.tick) : endTick;
    if (segEnd <= start) continue;
    if (endTick <= start) break;
    const from = Math.max(start, 0);
    const to = Math.min(segEnd, endTick);
    if (to > from) {
      sec += ((to - from) / ppq) * (micros / 1e6);
    }
    if (segEnd >= endTick) break;
  }
  return sec;
}

function effectiveBpmFromTimeline(
  endBeat: number,
  endTick: number,
  ppq: number,
  timeline: { tick: number; micros: number }[],
): number {
  if (endBeat <= 1e-9) {
    const m = timeline[0]?.micros ?? DEFAULT_MICROS;
    return Math.max(1, Math.round((60 * 1e6) / m));
  }
  const totalSec = integrateSecondsToTick(endTick, ppq, timeline);
  if (totalSec <= 1e-9) {
    const m = timeline[0]?.micros ?? DEFAULT_MICROS;
    return Math.max(1, Math.round((60 * 1e6) / m));
  }
  return Math.max(1, Math.round((endBeat * 60) / totalSec));
}

function buildChart(
  midi: MidiData,
  opts: { bpmOverride: number | null; titleOverride: string | null; trackIndex: number | null; midBasename: string },
): FretflowChartV1 {
  const ppq = midi.header.ticksPerBeat;
  if (!ppq || midi.header.framesPerSecond != null) {
    throw new Error("Need ticks-per-quarter time division (re-export MIDI without SMPTE frames).");
  }

  let timeSignature: [number, number] = [4, 4];
  let sawTimeSig = false;
  let title = opts.titleOverride ?? opts.midBasename.replace(/\.(mid|midi)$/i, "");
  let titleFromTrack = false;

  const timed = flattenTracks(midi, opts.trackIndex);
  const tempoTimeline = extractTempoTimeline(timed);
  let sawPitchBendInFile = false;
  for (const { e } of timed) {
    if (e.type === "pitchBend") {
      sawPitchBendInFile = true;
    }
  }
  if (sawPitchBendInFile) {
    console.error(
      "midi-to-chart: source contains pitch bend; chart uses equal temperament (per-note pitch bends not applied).",
    );
  }
  const pending = new Map<string, number>();
  const rawNotes: RawNote[] = [];
  let skippedUnmapped = 0;

  for (const { tick, e } of timed) {
    if (!sawTimeSig && e.type === "timeSignature" && "numerator" in e && "denominator" in e) {
      timeSignature = [e.numerator, e.denominator];
      sawTimeSig = true;
    }
    if (e.type === "trackName" && "text" in e && e.text.trim() && !titleFromTrack && !opts.titleOverride) {
      title = e.text.trim();
      titleFromTrack = true;
    }

    if (!("channel" in e) || e.type === "endOfTrack") continue;
    if (e.channel === DRUM_CHANNEL) continue;

    if (e.type === "noteOn" && e.velocity > 0) {
      const k = `${e.channel}:${e.noteNumber}`;
      pending.set(k, tick);
    } else if (e.type === "noteOff" || (e.type === "noteOn" && e.velocity === 0)) {
      const k = `${e.channel}:${e.noteNumber}`;
      const start = pending.get(k);
      pending.delete(k);
      if (start == null) continue;
      const durationTicks = Math.max(1, tick - start);
      const startBeat = start / ppq;
      const durationBeats = durationTicks / ppq;
      if (allGuitarPositions(e.noteNumber).length === 0) {
        skippedUnmapped += 1;
        continue;
      }
      rawNotes.push({
        startBeat,
        durationBeats,
        midi: e.noteNumber,
      });
    }
  }

  const notes = assignFingering(rawNotes);
  notes.sort((a, b) => a.startBeat - b.startBeat || a.stringIndex - b.stringIndex);

  let endBeat = 0;
  for (const n of notes) {
    endBeat = Math.max(endBeat, n.startBeat + n.durationBeats);
  }
  const endTick = endBeat * ppq;

  let bpm = opts.bpmOverride ?? effectiveBpmFromTimeline(endBeat, endTick, ppq, tempoTimeline);
  if (bpm > 400) {
    console.error(`midi-to-chart: clamping BPM ${bpm} → 400 (schema max).`);
    bpm = 400;
  }

  const chart: FretflowChartV1 = {
    schemaVersion: 1,
    title,
    bpm,
    timeSignature,
    notes,
  };

  if (skippedUnmapped > 0) {
    console.error(`midi-to-chart: skipped ${skippedUnmapped} note(s) outside guitar range (0–24 frets per string).`);
  }

  return chart;
}

function main(): void {
  const { inPath, outPath, bpmOverride, titleOverride, trackIndex } = parseArgs(process.argv.slice(2));
  if (!inPath) {
    usage();
    process.exit(1);
  }

  const buf = readFileSync(inPath);
  const midi = parseMidi(buf);
  const chart = buildChart(midi, {
    bpmOverride,
    titleOverride,
    trackIndex,
    midBasename: basename(inPath),
  });

  const issues = getChartValidationIssues(chart);
  if (issues.length > 0) {
    console.error("Generated chart failed validation:", issues);
    process.exit(1);
  }
  if (!validateChart(chart)) {
    console.error("validateChart returned false unexpectedly.");
    process.exit(1);
  }

  const json = JSON.stringify(chart, null, 2) + "\n";
  if (outPath) {
    writeFileSync(outPath, json, "utf8");
    console.error(`Wrote ${outPath} (${chart.notes.length} notes, ${chart.bpm} BPM).`);
  } else {
    process.stdout.write(json);
  }
}

main();
