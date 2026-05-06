import { describe, expect, it, vi } from "vitest";
import { autoSyncRemoteLibraryMutations } from "./remote-library-auto-sync";

describe("remote library auto sync", () => {
  it("skips cloud writes for local-only imported track ids", async () => {
    const fetchImpl = vi.fn();

    const result = await autoSyncRemoteLibraryMutations({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "player@example.com",
      currentRemoteState: null,
      mutations: [{ kind: "favorite_set", trackId: "user-123", value: true }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.status).toBe("skipped_local_only");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("loads the latest revision before syncing when no remote state is cached", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          revision: 5,
          favorites: [],
          collections: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          revision: 6,
          favorites: ["bundled-one-note"],
          collections: [],
        }),
      });

    const result = await autoSyncRemoteLibraryMutations({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "player@example.com",
      currentRemoteState: null,
      mutations: [{ kind: "favorite_set", trackId: "bundled-one-note", value: true }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.status).toBe("synced");
    expect(result.state.revision).toBe(6);
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8787/api/v1/library-state?accountId=acct_123&email=player%40example.com",
    );
  });

  it("replays the mutation batch after a revision conflict", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          schemaVersion: 1,
          revision: 7,
          favorites: [],
          collections: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          schemaVersion: 1,
          revision: 8,
          favorites: ["bundled-one-note"],
          collections: [],
        }),
      });

    const result = await autoSyncRemoteLibraryMutations({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "player@example.com",
      currentRemoteState: {
        schemaVersion: 1,
        revision: 6,
        favorites: [],
        collections: [],
      },
      mutations: [{ kind: "favorite_set", trackId: "bundled-one-note", value: true }],
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.status).toBe("replayed_after_conflict");
    expect(result.state.revision).toBe(8);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
