import { describe, expect, it } from "vitest";
import { getRemoteLibraryHydrationDecision } from "./remote-library-hydration";
import type { RemoteLibraryStateV1 } from "./remote-library";

function state(input?: Partial<RemoteLibraryStateV1>): RemoteLibraryStateV1 {
  return {
    schemaVersion: 1,
    revision: 0,
    favorites: [],
    collections: [],
    ...input,
  };
}

describe("remote library hydration", () => {
  it("does nothing when local and remote already match", () => {
    expect(
      getRemoteLibraryHydrationDecision({
        localState: state({ favorites: ["bundled-one-note"] }),
        remoteState: state({ favorites: ["bundled-one-note"] }),
      }),
    ).toEqual({
      action: "noop",
      status: null,
    });
  });

  it("applies remote state when the device has no cloud-eligible library data", () => {
    expect(
      getRemoteLibraryHydrationDecision({
        localState: state(),
        remoteState: state({ favorites: ["bundled-one-note"] }),
      }),
    ).toEqual({
      action: "apply_remote",
      status: "Loaded favorites and collections from your signed-in cloud library.",
    });
  });

  it("keeps local state when the cloud copy is empty", () => {
    expect(
      getRemoteLibraryHydrationDecision({
        localState: state({ favorites: ["bundled-one-note"] }),
        remoteState: state(),
      }),
    ).toEqual({
      action: "keep_local",
      status:
        "This device already has favorites or collections. The cloud library is empty, so local state stays in place until a later sync writes it.",
    });
  });

  it("keeps local state when both sides have content but diverge", () => {
    expect(
      getRemoteLibraryHydrationDecision({
        localState: state({ favorites: ["bundled-one-note"] }),
        remoteState: state({ favorites: ["bundled-two-chords"] }),
      }),
    ).toEqual({
      action: "keep_local",
      status:
        "This device and the cloud library differ. Local state stays in place here; use Account recovery tools if you need the cloud snapshot instead.",
    });
  });
});
