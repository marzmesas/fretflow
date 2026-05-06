export type RemoteLibraryRecoveryPolicy = {
  summary: string;
  detail: string;
  whenToUse: string;
};

export function getRemoteLibraryRecoveryPolicy(): RemoteLibraryRecoveryPolicy {
  return {
    summary: "Manual cloud-library snapshots are now a recovery path, not the primary sync flow.",
    detail:
      "Signed-in favorite and collection edits now sync automatically from Library. Account should only be used to inspect the cloud snapshot, push a full device snapshot intentionally, or restore the server copy after a conflict.",
    whenToUse:
      "Use these tools when local and cloud library state diverge, when you want to audit the server snapshot directly, or when you intentionally want to restore cloud state onto this device.",
  };
}
