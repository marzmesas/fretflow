import { describe, expect, it } from "vitest";
import type { FretflowChartV1 } from "./types";
import { applyDensityToChart, nextDensityTier } from "./adaptive-density";

const chordThenSingles: FretflowChartV1 = {
  schemaVersion: 1,
  title: "c",
  bpm: 120,
  timeSignature: [4, 4],
  notes: [
    { startBeat: 0, durationBeats: 0.25, stringIndex: 0, fret: 0 },
    { startBeat: 0, durationBeats: 0.25, stringIndex: 1, fret: 1 },
    { startBeat: 1, durationBeats: 0.25, stringIndex: 2, fret: 0 },
    { startBeat: 2, durationBeats: 0.25, stringIndex: 3, fret: 0 },
  ],
};

describe("applyDensityToChart", () => {
  it("returns same chart for full tier", () => {
    expect(applyDensityToChart(chordThenSingles, "full")).toBe(chordThenSingles);
  });

  it("keeps both strings when thinning would split a chord (half tier)", () => {
    const th = applyDensityToChart(chordThenSingles, "half");
    expect(th.notes.length).toBe(3);
    const beatsAt0 = th.notes.filter((n) => n.startBeat === 0).length;
    expect(beatsAt0).toBe(2);
  });

  it("three_quarters tier removes roughly one in four chronological notes without breaking chord", () => {
    const tq = applyDensityToChart(chordThenSingles, "three_quarters");
    expect(tq.notes.length).toBeGreaterThanOrEqual(3);
    const beatsAt0 = tq.notes.filter((n) => n.startBeat === 0).length;
    expect(beatsAt0).toBe(2);
  });
});

describe("nextDensityTier", () => {
  it("steps toward full", () => {
    expect(nextDensityTier("half")).toBe("three_quarters");
    expect(nextDensityTier("three_quarters")).toBe("full");
    expect(nextDensityTier("full")).toBeNull();
  });
});
