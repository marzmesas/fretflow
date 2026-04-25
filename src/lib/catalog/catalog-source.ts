const STORAGE_KEY = "fretflow.catalogSourceMode.v1";

export type CatalogSourceMode = "local_seed" | "remote_api";

export function getCatalogSourceMode(): CatalogSourceMode {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "local_seed";
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "remote_api" ? "remote_api" : "local_seed";
  } catch {
    return "local_seed";
  }
}

export function setCatalogSourceMode(mode: CatalogSourceMode): CatalogSourceMode {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return mode;
  }
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* private mode / quota */
  }
  return mode;
}
