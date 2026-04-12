import type { FretflowChartV1 } from "./types";

/** Stable, multiline JSON for diffing two charts (sorted notes, fixed key order). */
export function stableStringifyChart(chart: FretflowChartV1): string {
  const body: Record<string, unknown> = {
    schemaVersion: chart.schemaVersion,
    title: chart.title,
    bpm: chart.bpm,
    timeSignature: chart.timeSignature,
    notes: [...chart.notes].sort((a, b) => {
      if (a.startBeat !== b.startBeat) return a.startBeat - b.startBeat;
      if (a.stringIndex !== b.stringIndex) return a.stringIndex - b.stringIndex;
      if (a.fret !== b.fret) return a.fret - b.fret;
      return a.durationBeats - b.durationBeats;
    }),
  };
  if (chart.lengthBeats != null) {
    body.lengthBeats = chart.lengthBeats;
  }
  return JSON.stringify(body, null, 2);
}

/** First differing line between canonical multiline JSON (1-based line numbers). */
export function firstCanonicalJsonLineDiff(a: FretflowChartV1, b: FretflowChartV1): string {
  const la = stableStringifyChart(a).split("\n");
  const lb = stableStringifyChart(b).split("\n");
  const max = Math.max(la.length, lb.length);
  for (let i = 0; i < max; i++) {
    if (la[i] !== lb[i]) {
      return `First mismatch at line ${i + 1}\nA: ${la[i] ?? "(eof)"}\nB: ${lb[i] ?? "(eof)"}`;
    }
  }
  return "Canonical JSON: identical.";
}
