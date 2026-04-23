import { beforeEach, describe, expect, it } from "vitest";
import { deleteLoopBookmark, loadLoopBookmarks, saveLoopBookmark } from "./loop-bookmarks-storage";

describe("loop-bookmarks-storage", () => {
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

  it("saves named loop bookmarks per chart key", () => {
    const bookmarks = saveLoopBookmark("track:bundled-one-note", {
      name: "Verse pocket",
      loopABeat: 4,
      loopBBeat: 12,
    });
    expect(bookmarks).toHaveLength(1);
    expect(bookmarks[0]).toMatchObject({
      name: "Verse pocket",
      loopABeat: 4,
      loopBBeat: 12,
    });
    expect(loadLoopBookmarks("track:bundled-one-note")).toHaveLength(1);
  });

  it("ignores blank bookmark names", () => {
    saveLoopBookmark("track:bundled-one-note", {
      name: "   ",
      loopABeat: 1,
      loopBBeat: 2,
    });
    expect(loadLoopBookmarks("track:bundled-one-note")).toEqual([]);
  });

  it("deletes a saved bookmark", () => {
    const [bookmark] = saveLoopBookmark("track:bundled-one-note", {
      name: "Bridge cleanup",
      loopABeat: 8,
      loopBBeat: 16,
    });
    expect(deleteLoopBookmark("track:bundled-one-note", bookmark!.id)).toEqual([]);
  });
});
