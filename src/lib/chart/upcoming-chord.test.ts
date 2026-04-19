import { describe, expect, it } from "vitest";
import type { FretflowChartV1 } from "./types";
import { getUpcomingChordNotes } from "./upcoming-chord";

const chart: FretflowChartV1 = {
  schemaVersion: 1,
  title: "c",
  bpm: 60,
  timeSignature: [4, 4],
  lengthBeats: 32,
  notes: [
    { startBeat: 0, durationBeats: 1, stringIndex: 0, fret: 0 },
    { startBeat: 0, durationBeats: 1, stringIndex: 1, fret: 1 },
    { startBeat: 8, durationBeats: 1, stringIndex: 2, fret: 0 },
  ],
};

describe("getUpcomingChordNotes", () => {
  it("returns all notes sharing the earliest pending beat", () => {
    const g = getUpcomingChordNotes(chart, new Set(), new Set(), 0, 0.12, null);
    expect(g.length).toBe(2);
    expect(g[0]!.startBeat).toBe(0);
    expect(g[1]!.startBeat).toBe(0);
  });

  it("returns empty when next onset is beyond lookahead", () => {
    const g = getUpcomingChordNotes(chart, new Set([0, 1]), new Set(), 0, 0.12, 2);
    expect(g).toEqual([]);
  });

  it("returns single next note when lookahead allows", () => {
    const g = getUpcomingChordNotes(chart, new Set([0, 1]), new Set(), 0, 0.12, 20);
    expect(g.length).toBe(1);
    expect(g[0]!.startBeat).toBe(8);
  });
});
