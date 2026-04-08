import type { FretflowChartV1 } from "./types";

export function beatToSeconds(beat: number, bpm: number): number {
  return (beat * 60) / bpm;
}

export function secondsToBeat(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}

export function chartLengthBeats(chart: FretflowChartV1): number {
  if (chart.lengthBeats != null && chart.lengthBeats > 0) {
    return chart.lengthBeats;
  }
  let end = 0;
  for (const n of chart.notes) {
    end = Math.max(end, n.startBeat + n.durationBeats);
  }
  return Math.max(end, 4);
}

export function chartLengthSeconds(chart: FretflowChartV1): number {
  return beatToSeconds(chartLengthBeats(chart), chart.bpm);
}
