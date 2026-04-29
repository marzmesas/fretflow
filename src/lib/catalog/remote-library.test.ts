import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRemoteLibraryState,
  buildLocalRemoteLibraryState,
  loadRemoteLibraryState,
  saveRemoteLibraryState,
} from "./remote-library";

describe("remote library state", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem(key: string) {
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
        removeItem(key: string) {
          store.delete(key);
        },
        clear() {
          store.clear();
        },
      },
    });
  });

  it("builds the current local library snapshot", () => {
    applyRemoteLibraryState({
      schemaVersion: 1,
      favorites: ["track-a"],
      collections: [
        {
          id: "set-a",
          name: "Set A",
          trackIds: ["track-a"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    expect(buildLocalRemoteLibraryState()).toEqual({
      schemaVersion: 1,
      favorites: ["track-a"],
      collections: [
        {
          id: "set-a",
          name: "Set A",
          trackIds: ["track-a"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("applies a remote library snapshot into local storage", () => {
    expect(
      applyRemoteLibraryState({
        schemaVersion: 1,
        favorites: [" track-a ", "track-a", "track-b"],
        collections: [
          {
            id: " set-a ",
            name: " Warmups ",
            trackIds: ["track-a", " track-a ", "track-b"],
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      schemaVersion: 1,
      favorites: ["track-a", "track-b"],
      collections: [
        {
          id: "set-a",
          name: "Warmups",
          trackIds: ["track-a", "track-b"],
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("requests the remote library snapshot with account identity", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        favorites: ["track-a"],
        collections: [],
      }),
    })) as unknown as typeof fetch;

    const state = await loadRemoteLibraryState({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "PLAYER@example.com",
      fetchImpl,
    });

    expect(state.favorites).toEqual(["track-a"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/library-state?accountId=acct_123&email=player%40example.com",
    );
  });

  it("writes the remote library snapshot with account identity", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        favorites: ["track-a"],
        collections: [],
      }),
    })) as unknown as typeof fetch;

    await saveRemoteLibraryState({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "player@example.com",
      state: {
        schemaVersion: 1,
        favorites: ["track-a"],
        collections: [],
      },
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/library-state",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          accountId: "acct_123",
          email: "player@example.com",
          state: {
            schemaVersion: 1,
            favorites: ["track-a"],
            collections: [],
          },
        }),
      }),
    );
  });
});
