import type { ChartNoteV1, FretflowChartV1 } from "./types";

export type DensityTier = "full" | "three_quarters" | "half";

export const DENSITY_TIER_LABEL: Record<DensityTier, string> = {
  full: "100%",
  three_quarters: "75%",
  half: "50%",
};

export const DENSITY_TIER_ORDER: DensityTier[] = ["half", "three_quarters", "full"];

/** Next denser tier, or null if already full. */
export function nextDensityTier(t: DensityTier): DensityTier | null {
  const i = DENSITY_TIER_ORDER.indexOf(t);
  if (i < 0 || i >= DENSITY_TIER_ORDER.length - 1) return null;
  return DENSITY_TIER_ORDER[i + 1]!;
}

/**
 * Practice chart with fewer notes (chronological thinning). Keeps `lengthBeats` and metadata from
 * `chart` so timeline, loop, and backing audio stay aligned with the full arrangement.
 */
export function applyDensityToChart(chart: FretflowChartV1, tier: DensityTier): FretflowChartV1 {
  if (tier === "full") {
    return chart;
  }
  const n = chart.notes.length;
  if (n === 0) {
    return chart;
  }

  const order = chart.notes
    .map((_, i) => i)
    .sort((a, b) => {
      const da = chart.notes[a]!.startBeat - chart.notes[b]!.startBeat;
      return da !== 0 ? da : a - b;
    });

  const keep = new Set<number>();
  if (tier === "half") {
    for (let k = 0; k < order.length; k += 2) {
      keep.add(order[k]!);
    }
  } else {
    for (let k = 0; k < order.length; k++) {
      if (k % 4 !== 3) {
        keep.add(order[k]!);
      }
    }
  }

  const newNotes: ChartNoteV1[] = order.filter((i) => keep.has(i)).map((i) => chart.notes[i]!);
  if (newNotes.length === 0) {
    return chart;
  }

  return {
    ...chart,
    notes: newNotes,
  };
}
