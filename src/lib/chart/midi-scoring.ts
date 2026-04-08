import type { ChartNoteV1, FretflowChartV1 } from "./types";
import { beatToSeconds } from "./time";
import { chartNoteToMidi } from "./guitar";

/** Default if caller omits windows (legacy). Prefer `TIMING_BY_MODE` from `scoring-modes.ts`. */
export const DEFAULT_TIMING_WINDOWS = { earlyMs: 100, lateMs: 160 } as const;

export function noteStartSeconds(note: ChartNoteV1, bpm: number): number {
  return beatToSeconds(note.startBeat, bpm);
}

/**
 * Note start time used for hit/miss judgement after **latency offset** (Settings).
 * Positive `latencyOffsetMs` shifts the expected hit **later** on the wall-clock timeline
 * (compensate if you consistently register early vs the chart).
 */
export function judgedNoteStartSeconds(
  note: ChartNoteV1,
  bpm: number,
  latencyOffsetMs: number,
): number {
  return noteStartSeconds(note, bpm) + latencyOffsetMs / 1000;
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
  latencyOffsetMs: number = 0,
): { index: number; deltaMs: number } | null {
  let best: { index: number; deltaMs: number; abs: number } | null = null;
  for (let i = 0; i < chart.notes.length; i++) {
    if (consumed.has(i) || missed.has(i)) continue;
    const n = chart.notes[i]!;
    if (chartNoteToMidi(n) !== midiNote) continue;
    const judgedStart = judgedNoteStartSeconds(n, chart.bpm, latencyOffsetMs);
    const deltaMs = (chartTimeSec - judgedStart) * 1000;
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
  latencyOffsetMs: number = 0,
): { index: number; deltaMs: number } | null {
  let best: { index: number; deltaMs: number; abs: number } | null = null;
  for (let i = 0; i < chart.notes.length; i++) {
    if (consumed.has(i) || missed.has(i)) continue;
    const n = chart.notes[i]!;
    const judgedStart = judgedNoteStartSeconds(n, chart.bpm, latencyOffsetMs);
    const deltaMs = (chartTimeSec - judgedStart) * 1000;
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
  latencyOffsetMs: number = 0,
): number[] {
  const lateSec = lateMs / 1000;
  const out: number[] = [];
  for (let i = 0; i < chart.notes.length; i++) {
    if (consumed.has(i) || missed.has(i)) continue;
    const judgedStart = judgedNoteStartSeconds(chart.notes[i]!, chart.bpm, latencyOffsetMs);
    if (chartTimeSec > judgedStart + lateSec) {
      out.push(i);
    }
  }
  return out;
}
