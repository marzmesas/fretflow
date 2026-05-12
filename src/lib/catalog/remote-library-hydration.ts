import type { RemoteLibraryStateV1 } from "./remote-library";

export type RemoteLibraryHydrationDecision =
  | {
      action: "noop";
      status: string | null;
    }
  | {
      action: "apply_remote";
      status: string;
    }
  | {
      action: "keep_local";
      status: string;
    };

function hasLibraryContent(state: RemoteLibraryStateV1): boolean {
  return state.favorites.length > 0 || state.collections.length > 0;
}

function statesEqual(a: RemoteLibraryStateV1, b: RemoteLibraryStateV1): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function getRemoteLibraryHydrationDecision(input: {
  localState: RemoteLibraryStateV1;
  remoteState: RemoteLibraryStateV1;
}): RemoteLibraryHydrationDecision {
  const { localState, remoteState } = input;
  const localHasContent = hasLibraryContent(localState);
  const remoteHasContent = hasLibraryContent(remoteState);

  if (statesEqual(localState, remoteState)) {
    return {
      action: "noop",
      status: null,
    };
  }

  if (!localHasContent && remoteHasContent) {
    return {
      action: "apply_remote",
      status: "Loaded favorites and collections from your signed-in cloud library.",
    };
  }

  if (localHasContent && !remoteHasContent) {
    return {
      action: "keep_local",
      status:
        "This device already has favorites or collections. The cloud library is empty, so local state stays in place until a later sync writes it.",
    };
  }

  if (!localHasContent && !remoteHasContent) {
    return {
      action: "noop",
      status: null,
    };
  }

  return {
    action: "keep_local",
    status:
      "This device and the cloud library differ. Local state stays in place here; use Account recovery tools if you need the cloud snapshot instead.",
  };
}
