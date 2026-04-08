import type { ChartNoteV1, FretflowChartV1 } from "./types";
import { beatToSeconds } from "./time";
import { chartNoteToMidi } from "./guitar";

/** Default if caller omits windows (legacy). Prefer `TIMING_BY_MODE` from `scoring-modes.ts`. */
export const DEFAULT_TIMING_WINDOWS = { earlyMs: 100, lateMs: 160 } as const;

export function noteStartSeconds(note: ChartNoteV1, bpm: number): number {
  return beatToSeconds(note.startBeat, bpm);
}

/**
 * Pick the unconsumed chart note that matches `midiNote` and is closest in time to `chartTimeSec`.
 */
export function findHitNoteIndex(
  chart: FretflowChartV1,
  chartTimeSec: number,
  midiNote: number,
  consumed: ReadonlySet<number>,
  missed: ReadonlySet<number>,
  windowMs: { earlyMs: number; lateMs: number } = DEFAULT_TIMING_WINDOWS,
): { index: number; deltaMs: number } | null {
  let best: { index: number; deltaMs: number; abs: number } | null = null;
  for (let i = 0; i < chart.notes.length; i++) {
    if (consumed.has(i) || missed.has(i)) continue;
    const n = chart.notes[i]!;
    if (chartNoteToMidi(n) !== midiNote) continue;
    const startSec = noteStartSeconds(n, chart.bpm);
    const deltaMs = (chartTimeSec - startSec) * 1000;
    if (deltaMs < -windowMs.earlyMs || deltaMs > windowMs.lateMs) continue;
    const abs = Math.abs(deltaMs);
    if (!best || abs < best.abs) {
      best = { index: i, deltaMs, abs };
    }
  }
  return best ? { index: best.index, deltaMs: best.deltaMs } : null;
}

/**
 * Timing-only hit: closest chart note in the window (no pitch).
 * For mic / clap beta — ambiguous when chords or overlapping notes exist.
 */
export function findRhythmHitNoteIndex(
  chart: FretflowChartV1,
  chartTimeSec: number,
  consumed: ReadonlySet<number>,
  missed: ReadonlySet<number>,
  windowMs: { earlyMs: number; lateMs: number } = DEFAULT_TIMING_WINDOWS,
): { index: number; deltaMs: number } | null {
  let best: { index: number; deltaMs: number; abs: number } | null = null;
  for (let i = 0; i < chart.notes.length; i++) {
    if (consumed.has(i) || missed.has(i)) continue;
    const n = chart.notes[i]!;
    const startSec = noteStartSeconds(n, chart.bpm);
    const deltaMs = (chartTimeSec - startSec) * 1000;
    if (deltaMs < -windowMs.earlyMs || deltaMs > windowMs.lateMs) continue;
    const abs = Math.abs(deltaMs);
    if (!best || abs < best.abs) {
      best = { index: i, deltaMs, abs };
    }
  }
  return best ? { index: best.index, deltaMs: best.deltaMs } : null;
}

/** Note indices that are past the late window without a hit. */
export function collectMissedNoteIndices(
  chart: FretflowChartV1,
  chartTimeSec: number,
  consumed: ReadonlySet<number>,
  missed: ReadonlySet<number>,
  lateMs: number = DEFAULT_TIMING_WINDOWS.lateMs,
): number[] {
  const lateSec = lateMs / 1000;
  const out: number[] = [];
  for (let i = 0; i < chart.notes.length; i++) {
    if (consumed.has(i) || missed.has(i)) continue;
    const startSec = noteStartSeconds(chart.notes[i]!, chart.bpm);
    if (chartTimeSec > startSec + lateSec) {
      out.push(i);
    }
  }
  return out;
}
