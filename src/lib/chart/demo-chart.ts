import type { FretflowChartV1 } from "./types";

/** Short original warm-up in A minor feel — embedded for Phase 3 demo */
export const DEMO_CHART: FretflowChartV1 = {
  schemaVersion: 1,
  title: "Demo: ladder & sustain",
  bpm: 72,
  timeSignature: [4, 4],
  lengthBeats: 8,
  notes: [
    { startBeat: 0, durationBeats: 0.5, stringIndex: 5, fret: 5 },
    { startBeat: 0.5, durationBeats: 0.5, stringIndex: 5, fret: 7 },
    { startBeat: 1, durationBeats: 0.5, stringIndex: 5, fret: 5 },
    { startBeat: 1.5, durationBeats: 0.5, stringIndex: 4, fret: 5 },
    { startBeat: 2, durationBeats: 1, stringIndex: 4, fret: 7 },
    { startBeat: 3, durationBeats: 0.5, stringIndex: 3, fret: 5 },
    { startBeat: 3.5, durationBeats: 0.5, stringIndex: 3, fret: 7 },
    { startBeat: 4, durationBeats: 2, stringIndex: 2, fret: 5 },
    { startBeat: 4, durationBeats: 2, stringIndex: 1, fret: 5 },
    { startBeat: 6, durationBeats: 0.5, stringIndex: 0, fret: 5 },
    { startBeat: 6.5, durationBeats: 0.5, stringIndex: 0, fret: 8 },
    { startBeat: 7, durationBeats: 0.5, stringIndex: 0, fret: 7 },
    { startBeat: 7.5, durationBeats: 0.5, stringIndex: 0, fret: 5 },
  ],
};
