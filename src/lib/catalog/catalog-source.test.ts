import { beforeEach, describe, expect, it } from "vitest";
import {
  getCatalogSourceMode,
  getCatalogSourcePreference,
  setCatalogSourceMode,
  setCatalogSourcePreference,
} from "./catalog-source";

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

  it("defaults to system preference while resolving local mode", () => {
    expect(getCatalogSourcePreference()).toBe("system");
    expect(getCatalogSourceMode()).toBe("local_seed");
  });

  it("persists the remote mode", () => {
    expect(setCatalogSourceMode("remote_api")).toBe("remote_api");
    expect(getCatalogSourceMode()).toBe("remote_api");
  });

  it("persists system preference explicitly", () => {
    expect(setCatalogSourcePreference("system")).toBe("system");
    expect(getCatalogSourcePreference()).toBe("system");
    expect(getCatalogSourceMode()).toBe("local_seed");
  });
});
