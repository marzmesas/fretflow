export type RemoteProfileWritePolicy = {
  revisionGuardRequiredNext: true;
  broadenProfileEditingNow: false;
  summary: string;
  detail: string;
  nextRequirement: string;
};

export function getRemoteProfileWritePolicy(): RemoteProfileWritePolicy {
  return {
    revisionGuardRequiredNext: true,
    broadenProfileEditingNow: false,
    summary: "Remote profile editing stays intentionally narrow for now.",
    detail:
      "Only the core identity and learning-seed fields should be cloud-editable right now. Device setup, rollout flags, and broader account settings should wait until auth, billing, and revision-guarded writes are more mature.",
    nextRequirement:
      "Keep the current narrow cloud profile field set, then add a profile revision field plus 409 conflict handling before expanding remote profile edits further.",
  };
}
