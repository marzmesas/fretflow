import type { FretflowChartV1 } from "$lib/chart/types";

const STORAGE_KEY = "fretflow.userCharts.v1";

export type UserChartEntry = {
  id: string;
  title: string;
  artist: string;
  addedAt: string;
  chartJson: string;
};

function generateId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function loadAll(): UserChartEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr as UserChartEntry[];
  } catch {
    return [];
  }
}

function saveAll(entries: UserChartEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode */
  }
}

export function getUserCharts(): UserChartEntry[] {
  return loadAll();
}

export function addUserChart(chart: FretflowChartV1, artist?: string): UserChartEntry {
  const entries = loadAll();
  const entry: UserChartEntry = {
    id: generateId(),
    title: chart.title,
    artist: artist?.trim() || "Imported",
    addedAt: new Date().toISOString(),
    chartJson: JSON.stringify(chart),
  };
  entries.unshift(entry);
  saveAll(entries);
  return entry;
}

export function removeUserChart(id: string): void {
  const entries = loadAll().filter((e) => e.id !== id);
  saveAll(entries);
}

export function resolveUserChart(id: string): FretflowChartV1 | null {
  const entries = loadAll();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  try {
    return JSON.parse(entry.chartJson) as FretflowChartV1;
  } catch {
    return null;
  }
}
