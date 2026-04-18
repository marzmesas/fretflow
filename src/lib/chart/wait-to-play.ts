import type { FretflowChartV1 } from "./types";
import { noteStartSeconds } from "./midi-scoring";

/**
 * Earliest unjudged "event" (all notes with the same `startBeat` as that note).
 * Loop filtering is handled by `resetScoringForLoop` (outside = pre-missed).
 */
export function getNextWaitEvent(
  chart: FretflowChartV1,
  consumed: ReadonlySet<number>,
  missed: ReadonlySet<number>,
): { tVis: number; group: number[] } | null {
  let minT = Number.POSITIVE_INFINITY;
  let minBeat: number | null = null;
  for (let i = 0; i < chart.notes.length; i++) {
    if (consumed.has(i) || missed.has(i)) continue;
    const t0 = noteStartSeconds(chart.notes[i]!, chart.bpm);
    if (t0 < minT) {
      minT = t0;
      minBeat = chart.notes[i]!.startBeat;
    }
  }
  if (minBeat == null) return null;

  const group: number[] = [];
  for (let j = 0; j < chart.notes.length; j++) {
    if (consumed.has(j) || missed.has(j)) continue;
    if (chart.notes[j]!.startBeat === minBeat) {
      group.push(j);
    }
  }
  if (group.length === 0) return null;
  return { tVis: minT, group };
}
