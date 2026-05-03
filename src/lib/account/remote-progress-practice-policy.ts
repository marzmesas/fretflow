import type { RemoteProfileRole } from "./remote-profile-gate";

export type PracticeProgressSourcePolicy =
  | {
      mode: "device_local_only";
      reason: "missing_service_url" | "preview_only";
      syncAfterRun: false;
      summary: string;
      detail: string;
    }
  | {
      mode: "device_local_with_cloud_sync";
      reason: "post_run_cloud_sync";
      syncAfterRun: true;
      summary: string;
      detail: string;
    };

export function getPracticeProgressSourcePolicy(input: {
  apiBaseUrl: string | null | undefined;
  remoteProfileRole: RemoteProfileRole;
}): PracticeProgressSourcePolicy {
  const apiBaseUrl = input.apiBaseUrl?.trim() ?? "";
  if (apiBaseUrl === "") {
    return {
      mode: "device_local_only",
      reason: "missing_service_url",
      syncAfterRun: false,
      summary: "Live Practice stays on this device until cloud sync has a real backend target.",
      detail:
        "Timing, loops, wait states, and live scoring should not depend on a remote service. Without a configured service URL, Practice keeps progress entirely local.",
    };
  }
  if (input.remoteProfileRole !== "primary_profile_source") {
    return {
      mode: "device_local_only",
      reason: "preview_only",
      syncAfterRun: false,
      summary: "Live Practice stays device-local while account auth is still in preview mode.",
      detail:
        "Practice should not treat cloud progress as authoritative until the signed-in account is real. Completed runs remain on this device until auth is primary.",
    };
  }
  return {
    mode: "device_local_with_cloud_sync",
    reason: "post_run_cloud_sync",
    syncAfterRun: true,
    summary: "Live Practice stays local during the run and syncs progress after the score is final.",
    detail:
      "Timing, loops, and scoring stay device-local for deterministic playback. After a scored run, Fretflow can merge and save the updated progress snapshot to the signed-in cloud account.",
  };
}
