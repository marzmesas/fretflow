const STORAGE_KEY = "fretflow.favoriteTracks.v1";

export function getFavoriteTrackIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function saveFavoriteTrackIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* private mode / quota */
  }
}

export function toggleFavoriteTrackId(trackId: string): string[] {
  const current = getFavoriteTrackIds();
  const next = current.includes(trackId)
    ? current.filter((id) => id !== trackId)
    : [trackId, ...current];
  saveFavoriteTrackIds(next);
  return next;
}

export function removeFavoriteTrackId(trackId: string): string[] {
  const next = getFavoriteTrackIds().filter((id) => id !== trackId);
  saveFavoriteTrackIds(next);
  return next;
}
