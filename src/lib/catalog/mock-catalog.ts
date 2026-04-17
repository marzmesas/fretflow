import type { CatalogTrackStub } from "./types";

/** Placeholder data — not loaded from network; subscription gates are cosmetic only. */
export const MOCK_CATALOG: CatalogTrackStub[] = [
  {
    id: "demo-warmup",
    title: "Warm-up — single-string eighths",
    artist: "Fretflow",
    tier: "free",
    practiceChartKey: "demo",
  },
  {
    id: "demo-open-chords",
    title: "Open chord changes (slow)",
    artist: "Fretflow",
    tier: "free",
    practiceChartKey: "demo",
  },
  {
    id: "bundled-one-note",
    title: "One open low E (static chart)",
    artist: "Fretflow",
    tier: "free",
    practiceChartKey: "bundled",
    bundledChartFile: "one-note.json",
  },
  {
    id: "bundled-ladder",
    title: "Demo: ladder & sustain (static file)",
    artist: "Fretflow",
    tier: "free",
    practiceChartKey: "bundled",
    bundledChartFile: "demo-chart.json",
  },
  {
    id: "premium-blues",
    title: "Blues turnaround in A",
    artist: "Catalog preview",
    tier: "premium",
    practiceChartKey: "none",
  },
  {
    id: "premium-fingerstyle",
    title: "Fingerstyle étude No. 1",
    artist: "Catalog preview",
    tier: "premium",
    practiceChartKey: "none",
  },
];
