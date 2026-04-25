export const CATALOG_MUTATION_KEYS = [
  "favorites",
  "collections",
  "user_charts",
  "practice_presets",
  "loop_bookmarks",
  "session_history",
] as const;

export type CatalogMutationKey = (typeof CATALOG_MUTATION_KEYS)[number];

export type MutationOwnership = "local_only" | "sync_candidate" | "server_backed_later";

export type CatalogMutationPolicy = {
  key: CatalogMutationKey;
  label: string;
  ownership: MutationOwnership;
  rationale: string;
};

const CATALOG_MUTATION_POLICIES: readonly CatalogMutationPolicy[] = [
  {
    key: "favorites",
    label: "Favorites",
    ownership: "sync_candidate",
    rationale: "Pinned tracks should follow the user across devices once account sync exists.",
  },
  {
    key: "collections",
    label: "Collections",
    ownership: "sync_candidate",
    rationale: "Named playlists are part of the user library and should eventually sync.",
  },
  {
    key: "user_charts",
    label: "Imported charts",
    ownership: "local_only",
    rationale: "User-imported files can be large and rights-sensitive, so keep them device-local for now.",
  },
  {
    key: "practice_presets",
    label: "Practice presets",
    ownership: "local_only",
    rationale: "Presets depend on device setup, input feel, and local chart context.",
  },
  {
    key: "loop_bookmarks",
    label: "Saved loops",
    ownership: "local_only",
    rationale: "Loop bookmarks are lightweight but tightly coupled to local practice workflow and charts.",
  },
  {
    key: "session_history",
    label: "Session history",
    ownership: "server_backed_later",
    rationale: "Progress summaries should become account-backed later, but only after analytics and profile models settle.",
  },
] as const;

export function listCatalogMutationPolicies(): CatalogMutationPolicy[] {
  return [...CATALOG_MUTATION_POLICIES];
}

export function getCatalogMutationPolicy(
  key: CatalogMutationKey,
): CatalogMutationPolicy {
  const policy = CATALOG_MUTATION_POLICIES.find((entry) => entry.key === key);
  if (policy == null) {
    throw new Error(`missing catalog mutation policy for key: ${key}`);
  }
  return policy;
}

export function listMutationPoliciesByOwnership(
  ownership: MutationOwnership,
): CatalogMutationPolicy[] {
  return CATALOG_MUTATION_POLICIES.filter((policy) => policy.ownership === ownership);
}
