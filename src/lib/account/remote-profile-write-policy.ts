export type RemoteProfileWritePolicy = {
  revisionGuardRequiredNext: true;
  summary: string;
  detail: string;
  nextRequirement: string;
};

export function getRemoteProfileWritePolicy(): RemoteProfileWritePolicy {
  return {
    revisionGuardRequiredNext: true,
    summary: "Remote profile writes are still narrow, but the next expansion should add revision guards.",
    detail:
      "Today the online profile only carries a small set of fields and writes happen explicitly from Account. Once more editable profile fields are exposed, stale-write protection should match the cloud progress and cloud library contracts.",
    nextRequirement:
      "Add a profile revision field plus 409 conflict handling before expanding remote profile edits beyond the current small field set.",
  };
}
