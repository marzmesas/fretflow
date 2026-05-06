export type RemoteLibrarySyncPolicy =
  | {
      mode: "mutation_auto_sync";
      autoSyncReady: true;
      summary: string;
      detail: string;
      nextRequirement: string;
    };

export function getRemoteLibrarySyncPolicy(): RemoteLibrarySyncPolicy {
  return {
    mode: "mutation_auto_sync",
    autoSyncReady: true,
    summary: "Cloud library can auto-sync favorites and collections through mutation writes.",
    detail:
      "Bundled and catalog-backed favorite or collection edits now sync with revisioned mutation batches instead of whole-library snapshot overwrites. Imported-chart IDs stay device-local and are stripped from cloud writes.",
    nextRequirement:
      "Decide whether Account should keep explicit snapshot save/load as a recovery tool, or whether the mutation path should become the only cloud-library write surface.",
  };
}
