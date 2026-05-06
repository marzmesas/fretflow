export type RemoteLibrarySyncPolicy =
  | {
      mode: "manual_snapshot_sync";
      autoSyncReady: false;
      summary: string;
      detail: string;
      nextRequirement: string;
    };

export function getRemoteLibrarySyncPolicy(): RemoteLibrarySyncPolicy {
  return {
    mode: "manual_snapshot_sync",
    autoSyncReady: false,
    summary: "Cloud library stays on explicit snapshot save/load for now.",
    detail:
      "Favorites and collections currently sync as whole-library snapshots. That is safe for manual review in Account, but not safe enough for background auto-sync because deletes and reorder changes can overwrite another device's intent.",
    nextRequirement:
      "Add mutation-style endpoints for favorite add/remove and collection create/update/delete before enabling automatic cloud library sync.",
  };
}
