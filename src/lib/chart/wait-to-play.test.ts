import { describe, expect, it } from "vitest";
import type { FretflowChartV1 } from "./types";
import { getNextWaitEvent } from "./wait-to-play";

const chart = {
  schemaVersion: 1 as const,
  title: "T",
  bpm: 120,
  timeSignature: [4, 4] as [number, number],
  lengthBeats: 8,
  notes: [
    { startBeat: 0, durationBeats: 0.25, stringIndex: 2, fret: 0 },
    { startBeat: 0, durationBeats: 0.25, stringIndex: 3, fret: 0 },
    { startBeat: 1, durationBeats: 0.25, stringIndex: 2, fret: 1 },
  ],
} satisfies FretflowChartV1;

describe("getNextWaitEvent", () => {
  it("returns chord group (same startBeat) at t=0", () => {
    const a = getNextWaitEvent(
      chart,
      new Set<number>(),
      new Set<number>(),
    )!;
    expect(a.tVis).toBe(0);
    expect(new Set(a.group)).toEqual(new Set([0, 1]));
  });

  it("moves to next time after some consumed", () => {
    const b = getNextWaitEvent(chart, new Set([0, 1]), new Set())!;
    expect(b.tVis).toBe(0.5);
    expect(b.group).toEqual([2]);
  });
});
