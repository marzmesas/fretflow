export type RemoteProfileWritePolicy = {
  revisionGuardRequiredNext: false;
  broadenProfileEditingNow: false;
  summary: string;
  detail: string;
  nextRequirement: string;
};

export function getRemoteProfileWritePolicy(): RemoteProfileWritePolicy {
  return {
    revisionGuardRequiredNext: false,
    broadenProfileEditingNow: false,
    summary: "Remote profile editing stays intentionally narrow for now.",
    detail:
      "Identity, learning-seed placement, and the daily goal target are enough for the current cross-device profile story. Device setup, rollout flags, and broader preferences should stay off the remote profile until there is a concrete user-facing reason to carry them between machines.",
    nextRequirement:
      "Only broaden the remote profile when a new field clearly belongs to the user rather than the device, and when the cloud value should dominate across machines.",
  };
}
