import { beforeEach, describe, expect, it } from "vitest";
import { getCatalogSourceMode, setCatalogSourceMode } from "./catalog-source";

describe("catalog source mode", () => {
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
      },
    });
  });

  it("defaults to the local seed", () => {
    expect(getCatalogSourceMode()).toBe("local_seed");
  });

  it("persists the remote mode", () => {
    expect(setCatalogSourceMode("remote_api")).toBe("remote_api");
    expect(getCatalogSourceMode()).toBe("remote_api");
  });
});
