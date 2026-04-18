import { describe, expect, it } from "vitest";
import type { FretflowChartV1 } from "./types";
import { applyDensityToChart, nextDensityTier } from "./adaptive-density";

const tiny: FretflowChartV1 = {
  schemaVersion: 1,
  title: "T",
  bpm: 120,
  timeSignature: [4, 4],
  lengthBeats: 16,
  notes: [
    { startBeat: 0, durationBeats: 0.25, stringIndex: 2, fret: 0 },
    { startBeat: 1, durationBeats: 0.25, stringIndex: 2, fret: 1 },
    { startBeat: 2, durationBeats: 0.25, stringIndex: 2, fret: 2 },
    { startBeat: 3, durationBeats: 0.25, stringIndex: 2, fret: 3 },
  ],
};

describe("applyDensityToChart", () => {
  it("returns same ref for full", () => {
    expect(applyDensityToChart(tiny, "full")).toBe(tiny);
  });

  it("half keeps every other note in time order", () => {
    const h = applyDensityToChart(tiny, "half");
    expect(h.notes.length).toBe(2);
    expect(h.notes.map((x) => x.startBeat)).toEqual([0, 2]);
    expect(h.lengthBeats).toBe(16);
  });

  it("three_quarters drops every fourth in time order", () => {
    const q = applyDensityToChart(tiny, "three_quarters");
    expect(q.notes.length).toBe(3);
    expect(q.notes.map((x) => x.startBeat)).toEqual([0, 1, 2]);
  });
});

describe("nextDensityTier", () => {
  it("steps toward full", () => {
    expect(nextDensityTier("half")).toBe("three_quarters");
    expect(nextDensityTier("three_quarters")).toBe("full");
    expect(nextDensityTier("full")).toBe(null);
  });
});
