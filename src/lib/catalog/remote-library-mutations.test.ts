import { describe, expect, it, vi } from "vitest";
import { applyRemoteLibraryMutationBatch } from "./remote-library-mutations";
import { RemoteLibraryWriteConflictError } from "./remote-library";

describe("remote library mutations", () => {
  it("posts mutation batches with account identity and base revision", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        revision: 4,
        favorites: ["track-a"],
        collections: [],
      }),
    })) as unknown as typeof fetch;

    const state = await applyRemoteLibraryMutationBatch({
      apiBaseUrl: "http://127.0.0.1:8787",
      accountId: "acct_123",
      email: "PLAYER@example.com",
      baseRevision: 3,
      mutations: [{ kind: "favorite_set", trackId: "track-a", value: true }],
      fetchImpl,
    });

    expect(state.revision).toBe(4);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8787/api/v1/library-state/mutations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          schemaVersion: 1,
          accountId: "acct_123",
          email: "player@example.com",
          baseRevision: 3,
          mutations: [{ kind: "favorite_set", trackId: "track-a", value: true }],
        }),
      }),
    );
  });

  it("surfaces the latest cloud snapshot on mutation conflicts", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({
        schemaVersion: 1,
        revision: 5,
        favorites: ["track-z"],
        collections: [],
      }),
    })) as unknown as typeof fetch;

    await expect(
      applyRemoteLibraryMutationBatch({
        apiBaseUrl: "http://127.0.0.1:8787",
        accountId: "acct_123",
        email: "player@example.com",
        baseRevision: 4,
        mutations: [{ kind: "favorite_set", trackId: "track-a", value: true }],
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(RemoteLibraryWriteConflictError);
  });
});
