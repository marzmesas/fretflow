import { beforeEach, describe, expect, it } from "vitest";
import {
  createCollection,
  deleteCollection,
  getCollections,
  removeTrackFromCollections,
  toggleTrackInCollection,
} from "./collections";

describe("catalog collections", () => {
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

  it("creates and deletes collections", () => {
    const collections = createCollection("Warmups");
    expect(collections).toHaveLength(1);
    expect(collections[0]!.name).toBe("Warmups");
    expect(deleteCollection(collections[0]!.id)).toEqual([]);
  });

  it("toggles tracks inside a collection", () => {
    const [collection] = createCollection("Set A");
    expect(toggleTrackInCollection(collection!.id, "track-1")[0]!.trackIds).toEqual(["track-1"]);
    expect(toggleTrackInCollection(collection!.id, "track-2")[0]!.trackIds).toEqual(["track-2", "track-1"]);
    expect(toggleTrackInCollection(collection!.id, "track-1")[0]!.trackIds).toEqual(["track-2"]);
  });

  it("removes a track from all collections", () => {
    const first = createCollection("Set A")[0]!;
    const second = createCollection("Set B")[0]!;
    toggleTrackInCollection(first.id, "track-1");
    toggleTrackInCollection(second.id, "track-1");
    const collections = removeTrackFromCollections("track-1");
    expect(collections.every((collection) => collection.trackIds.length === 0)).toBe(true);
    expect(getCollections()).toHaveLength(2);
  });
});
