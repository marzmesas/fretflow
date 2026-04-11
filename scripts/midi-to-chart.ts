/**
 * Draft importer: Standard MIDI File → Fretflow chart JSON v1.
 *
 * Usage:
 *   npm run midi-to-chart -- <file.mid> [out.json]
 *
 * Options (flags anywhere):
 *   --bpm=120        Override BPM (default: first setTempo in file, else 120)
 *   --title="Name"   Chart title (default: first track name, else .mid basename)
 *   --track=0        Only read this track index (0-based); default: merge all tracks
 *
 * Limitations (v1): constant tempo from first setTempo; skips MIDI channel 10 (drums,
 * 0-based channel 9); one guitar position per pitch (prefers lower fret); ignores
 * pitch bend and polyphonic string assignment.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { parseMidi, type MidiData, type MidiEvent } from "midi-file";
import { OPEN_STRING_MIDI } from "../src/lib/chart/guitar";
import type { ChartNoteV1, FretflowChartV1 } from "../src/lib/chart/types";
import { getChartValidationIssues, validateChart } from "../src/lib/chart/validate";

const DRUM_CHANNEL = 9; // General MIDI percussion (0-based)

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

function midiPitchToChartNote(pitch: number): Pick<ChartNoteV1, "stringIndex" | "fret"> | null {
  let best: { stringIndex: number; fret: number; score: number } | null = null;
  for (let s = 0; s <= 5; s++) {
    const fret = pitch - OPEN_STRING_MIDI[s]!;
    if (fret < 0 || fret > 24 || !Number.isInteger(fret)) continue;
    const score = fret * 64 + s;
    if (!best || score < best.score) {
      best = { stringIndex: s, fret, score };
    }
  }
  return best;
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

function buildChart(
  midi: MidiData,
  opts: { bpmOverride: number | null; titleOverride: string | null; trackIndex: number | null; midBasename: string },
): FretflowChartV1 {
  const ppq = midi.header.ticksPerBeat;
  if (!ppq || midi.header.framesPerSecond != null) {
    throw new Error("Need ticks-per-quarter time division (re-export MIDI without SMPTE frames).");
  }

  let microsForBpm = 500_000;
  let sawTempo = false;
  let timeSignature: [number, number] = [4, 4];
  let sawTimeSig = false;
  let title = opts.titleOverride ?? opts.midBasename.replace(/\.(mid|midi)$/i, "");
  let titleFromTrack = false;

  const timed = flattenTracks(midi, opts.trackIndex);
  const pending = new Map<string, number>();
  const notes: ChartNoteV1[] = [];
  let skippedUnmapped = 0;

  for (const { tick, e } of timed) {
    if (
      !sawTempo &&
      e.type === "setTempo" &&
      "microsecondsPerBeat" in e &&
      e.microsecondsPerBeat > 0
    ) {
      microsForBpm = e.microsecondsPerBeat;
      sawTempo = true;
    }
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
      const pos = midiPitchToChartNote(e.noteNumber);
      if (!pos) {
        skippedUnmapped += 1;
        continue;
      }
      notes.push({
        startBeat,
        durationBeats,
        stringIndex: pos.stringIndex,
        fret: pos.fret,
      });
    }
  }

  notes.sort((a, b) => a.startBeat - b.startBeat || a.stringIndex - b.stringIndex);

  const bpm = opts.bpmOverride ?? Math.max(1, Math.round((60 * 1_000_000) / microsForBpm));

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
