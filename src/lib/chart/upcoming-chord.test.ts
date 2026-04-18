import { describe, expect, it } from "vitest";
import type { FretflowChartV1 } from "./types";
import { getUpcomingChordNotes } from "./upcoming-chord";

const chart: FretflowChartV1 = {
  schemaVersion: 1,
  title: "C",
  bpm: 60,
  timeSignature: [4, 4],
  notes: [
    { startBeat: 0, durationBeats: 1, stringIndex: 0, fret: 0 },
    { startBeat: 0, durationBeats: 1, stringIndex: 1, fret: 0 },
    { startBeat: 2, durationBeats: 1, stringIndex: 2, fret: 3 },
  ],
};

describe("getUpcomingChordNotes", () => {
  it("returns chord at beat 0 when time is 0", () => {
    const g = getUpcomingChordNotes(chart, new Set(), new Set(), 0);
    expect(g.length).toBe(2);
  });

  it("moves to next group after consumption", () => {
    const g = getUpcomingChordNotes(chart, new Set([0, 1]), new Set(), 0);
    expect(g.length).toBe(1);
    expect(g[0]!.stringIndex).toBe(2);
  });
});
