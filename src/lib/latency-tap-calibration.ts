/** Helpers for Settings tap-to-beat latency hint (rough; not a lab impulse test). */

export const TAP_CALIBRATION_BPM = 100;
export const TAP_CALIBRATION_BEATS = 8;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Pair taps to beats in order; length = min(beats, taps). */
export function orderedTapDeltas(expectedBeatWallMs: number[], tapWallMs: number[]): number[] {
  const n = Math.min(expectedBeatWallMs.length, tapWallMs.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(tapWallMs[i]! - expectedBeatWallMs[i]!);
  }
  return out;
}

export function beatIntervalMs(bpm: number): number {
  return 60000 / bpm;
}
