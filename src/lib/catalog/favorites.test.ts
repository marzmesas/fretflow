import { beforeEach, describe, expect, it } from "vitest";
import {
  getFavoriteTrackIds,
  replaceFavoriteTrackIds,
  removeFavoriteTrackId,
  toggleFavoriteTrackId,
} from "./favorites";

describe("catalog favorites", () => {
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

  it("adds and removes favorites", () => {
    expect(toggleFavoriteTrackId("track-a")).toEqual(["track-a"]);
    expect(toggleFavoriteTrackId("track-b")).toEqual(["track-b", "track-a"]);
    expect(toggleFavoriteTrackId("track-a")).toEqual(["track-b"]);
    expect(getFavoriteTrackIds()).toEqual(["track-b"]);
  });

  it("removes a specific favorite without affecting others", () => {
    toggleFavoriteTrackId("track-a");
    toggleFavoriteTrackId("track-b");
    expect(removeFavoriteTrackId("track-a")).toEqual(["track-b"]);
    expect(getFavoriteTrackIds()).toEqual(["track-b"]);
  });

  it("replaces favorites with a normalized list", () => {
    expect(replaceFavoriteTrackIds([" track-a ", "track-b", "track-a", ""])).toEqual([
      "track-a",
      "track-b",
    ]);
    expect(getFavoriteTrackIds()).toEqual(["track-a", "track-b"]);
  });
});
