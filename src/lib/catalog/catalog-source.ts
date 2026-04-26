const STORAGE_KEY = "fretflow.catalogSourceMode.v1";

export type CatalogSourceMode = "local_seed" | "remote_api";
export type CatalogSourcePreference = "system" | CatalogSourceMode;

export function getCatalogSourcePreference(): CatalogSourcePreference {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return "system";
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "remote_api" || raw === "local_seed" || raw === "system") {
      return raw;
    }
    return "system";
  } catch {
    return "system";
  }
}

export function setCatalogSourcePreference(
  preference: CatalogSourcePreference,
): CatalogSourcePreference {
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return preference;
  }
  try {
    localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    /* private mode / quota */
  }
  return preference;
}

export function getCatalogSourceMode(): CatalogSourceMode {
  const preference = getCatalogSourcePreference();
  return preference === "remote_api" ? "remote_api" : "local_seed";
}

export function setCatalogSourceMode(mode: CatalogSourceMode): CatalogSourceMode {
  return setCatalogSourcePreference(mode) === "remote_api" ? "remote_api" : "local_seed";
}
