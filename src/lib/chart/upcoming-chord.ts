import type { ChartNoteV1, FretflowChartV1 } from "./types";
import { noteStartSeconds } from "./midi-scoring";

/**
 * Notes at the earliest pending onset at or after `timeSec` (same `startBeat` = chord).
 * Skips onsets that are clearly in the past (more than `pastGraceSec` before `timeSec`).
 */
export function getUpcomingChordNotes(
  chart: FretflowChartV1,
  consumed: ReadonlySet<number>,
  missed: ReadonlySet<number>,
  timeSec: number,
  pastGraceSec = 0.12,
): ChartNoteV1[] {
  let minBeat: number | null = null;
  let minT = Infinity;
  for (let i = 0; i < chart.notes.length; i++) {
    if (consumed.has(i) || missed.has(i)) continue;
    const t0 = noteStartSeconds(chart.notes[i]!, chart.bpm);
    if (t0 < timeSec - pastGraceSec) continue;
    if (t0 < minT) {
      minT = t0;
      minBeat = chart.notes[i]!.startBeat;
    }
  }
  if (minBeat == null) {
    return [];
  }
  const out: ChartNoteV1[] = [];
  for (let j = 0; j < chart.notes.length; j++) {
    if (consumed.has(j) || missed.has(j)) continue;
    if (chart.notes[j]!.startBeat === minBeat) {
      out.push(chart.notes[j]!);
    }
  }
  return out;
}
