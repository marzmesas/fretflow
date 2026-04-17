/**
 * Browser-side MIDI → Fretflow chart conversion.
 * Extracted from scripts/midi-to-chart.ts — no Node dependencies.
 */
import { parseMidi, type MidiData, type MidiEvent } from "midi-file";
import { OPEN_STRING_MIDI } from "$lib/chart/guitar";
import type { ChartNoteV1, FretflowChartV1 } from "$lib/chart/types";

const DRUM_CHANNEL = 9;
const DEFAULT_MICROS = 500_000;

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
  if (!prev) return Math.abs(p.fret - 5) + p.stringIndex * 0.5;
  return Math.abs(p.fret - prev.fret) + 2.5 * Math.abs(p.stringIndex - prev.stringIndex);
}

function minTransitionToMidi(from: Pos, nextMidi: number): number {
  const nextPos = allGuitarPositions(nextMidi);
  if (nextPos.length === 0) return 0;
  let m = Infinity;
  for (const d of nextPos) m = Math.min(m, scoreTransition(from, d));
  return m;
}

type RawNote = { startBeat: number; durationBeats: number; midi: number };

function beatGroupKey(startBeat: number): number {
  return Math.round(startBeat * 1e9) / 1e9;
}

function nextChordLeadMidi(groups: Map<number, RawNote[]>, orderedKeys: number[], ki: number): number | null {
  if (ki + 1 >= orderedKeys.length) return null;
  const next = groups.get(orderedKeys[ki + 1]!);
  if (!next || next.length === 0) return null;
  return [...next].sort((a, b) => a.midi - b.midi)[0]!.midi;
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
    const chord = groups.get(orderedKeys[ki]!)!;
    chord.sort((a, b) => a.midi - b.midi);
    const nextLead = nextChordLeadMidi(groups, orderedKeys, ki);
    const usedStrings = new Set<number>();

    for (let idx = 0; idx < chord.length; idx++) {
      const r = chord[idx]!;
      const all = allGuitarPositions(r.midi);
      if (all.length === 0) continue;
      let candidates = all.filter((c) => !usedStrings.has(c.stringIndex));
      if (candidates.length === 0) candidates = all;

      const lastInChord = idx === chord.length - 1;
      const useLookahead = nextLead != null && (chord.length === 1 || lastInChord) && allGuitarPositions(nextLead).length > 0;

      let best = candidates[0]!;
      let bestScore = Infinity;
      for (const c of candidates) {
        let sc = scoreTransition(prev, c);
        if (useLookahead) sc += LOOKAHEAD_WEIGHT * minTransitionToMidi(c, nextLead!);
        if (sc < bestScore) { bestScore = sc; best = c; }
      }
      usedStrings.add(best.stringIndex);
      out.push({ startBeat: r.startBeat, durationBeats: r.durationBeats, stringIndex: best.stringIndex, fret: best.fret });
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

function flattenTracks(midi: MidiData): { tick: number; e: MidiEvent }[] {
  const out: { tick: number; e: MidiEvent }[] = [];
  for (const track of midi.tracks) {
    let tick = 0;
    for (const e of track) {
      tick += e.deltaTime;
      out.push({ tick, e });
    }
  }
  out.sort((a, b) => a.tick !== b.tick ? a.tick - b.tick : eventRank(a.e) - eventRank(b.e));
  return out;
}

function extractTempoTimeline(timed: { tick: number; e: MidiEvent }[]): { tick: number; micros: number }[] {
  const raw: { tick: number; micros: number }[] = [];
  for (const { tick, e } of timed) {
    if (e.type === "setTempo" && "microsecondsPerBeat" in e && (e as { microsecondsPerBeat: number }).microsecondsPerBeat > 0) {
      raw.push({ tick, micros: (e as { microsecondsPerBeat: number }).microsecondsPerBeat });
    }
  }
  raw.sort((a, b) => a.tick - b.tick);
  const out: { tick: number; micros: number }[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (last && last.tick === p.tick) last.micros = p.micros;
    else out.push({ ...p });
  }
  return out;
}

function integrateSecondsToTick(endTick: number, ppq: number, timeline: { tick: number; micros: number }[]): number {
  if (endTick <= 0) return 0;
  let pts = timeline.slice().sort((a, b) => a.tick - b.tick);
  if (pts.length === 0) return (endTick / ppq) * (DEFAULT_MICROS / 1e6);
  if (pts[0]!.tick > 0) pts = [{ tick: 0, micros: DEFAULT_MICROS }, ...pts];
  let sec = 0;
  for (let i = 0; i < pts.length; i++) {
    const start = pts[i]!.tick;
    const micros = pts[i]!.micros;
    const segEnd = i + 1 < pts.length ? Math.min(endTick, pts[i + 1]!.tick) : endTick;
    if (segEnd <= start || endTick <= start) break;
    const from = Math.max(start, 0);
    const to = Math.min(segEnd, endTick);
    if (to > from) sec += ((to - from) / ppq) * (micros / 1e6);
    if (segEnd >= endTick) break;
  }
  return sec;
}

function effectiveBpmFromTimeline(endBeat: number, endTick: number, ppq: number, timeline: { tick: number; micros: number }[]): number {
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

export type MidiImportResult =
  | { ok: true; chart: FretflowChartV1; warnings: string[] }
  | { ok: false; error: string };

export function midiBufferToChart(buffer: ArrayBuffer, filename: string): MidiImportResult {
  try {
    const midi = parseMidi(new Uint8Array(buffer));
    const ppq = midi.header.ticksPerBeat;
    if (!ppq || midi.header.framesPerSecond != null) {
      return { ok: false, error: "MIDI file uses SMPTE time division; only ticks-per-quarter is supported." };
    }

    const warnings: string[] = [];
    let timeSignature: [number, number] = [4, 4];
    let sawTimeSig = false;
    let title = filename.replace(/\.(mid|midi)$/i, "");
    let titleFromTrack = false;

    const timed = flattenTracks(midi);
    const tempoTimeline = extractTempoTimeline(timed);

    let hasPitchBend = false;
    for (const { e } of timed) {
      if (e.type === "pitchBend") hasPitchBend = true;
    }
    if (hasPitchBend) warnings.push("Source contains pitch bend (not applied; chart uses equal temperament).");

    const pending = new Map<string, number>();
    const rawNotes: RawNote[] = [];
    let skipped = 0;

    for (const { tick, e } of timed) {
      if (!sawTimeSig && e.type === "timeSignature" && "numerator" in e && "denominator" in e) {
        timeSignature = [(e as { numerator: number }).numerator, (e as { denominator: number }).denominator];
        sawTimeSig = true;
      }
      if (e.type === "trackName" && "text" in e && (e as { text: string }).text.trim() && !titleFromTrack) {
        title = (e as { text: string }).text.trim();
        titleFromTrack = true;
      }
      if (!("channel" in e)) continue;
      const ch = (e as { channel: number }).channel;
      if (ch === DRUM_CHANNEL) continue;

      if (e.type === "noteOn" && (e as { velocity: number }).velocity > 0) {
        pending.set(`${ch}:${(e as { noteNumber: number }).noteNumber}`, tick);
      } else if (e.type === "noteOff" || (e.type === "noteOn" && (e as { velocity: number }).velocity === 0)) {
        const noteNum = (e as { noteNumber: number }).noteNumber;
        const k = `${ch}:${noteNum}`;
        const start = pending.get(k);
        pending.delete(k);
        if (start == null) continue;
        const dur = Math.max(1, tick - start);
        if (allGuitarPositions(noteNum).length === 0) { skipped++; continue; }
        rawNotes.push({ startBeat: start / ppq, durationBeats: dur / ppq, midi: noteNum });
      }
    }

    if (rawNotes.length === 0) {
      return { ok: false, error: "No guitar-range notes found in the MIDI file." };
    }

    if (skipped > 0) warnings.push(`${skipped} note(s) outside guitar range were skipped.`);

    const notes = assignFingering(rawNotes);
    let endBeat = 0;
    for (const n of notes) endBeat = Math.max(endBeat, n.startBeat + n.durationBeats);
    const endTick = endBeat * ppq;
    let bpm = effectiveBpmFromTimeline(endBeat, endTick, ppq, tempoTimeline);
    if (bpm > 400) { bpm = 400; warnings.push("BPM clamped to 400."); }

    const chart: FretflowChartV1 = { schemaVersion: 1, title, bpm, timeSignature, notes };
    return { ok: true, chart, warnings };
  } catch (err) {
    return { ok: false, error: `Failed to parse MIDI: ${err instanceof Error ? err.message : String(err)}` };
  }
}
