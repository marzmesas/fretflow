import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAnalyticsEvents,
  confidenceBucket,
  loadAnalyticsEvents,
  trackAnalyticsEvent,
} from "./events";

describe("analytics events", () => {
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

  it("stores typed analytics events", () => {
    trackAnalyticsEvent("latency_calibration_started", { method: "tap" });
    const [event] = loadAnalyticsEvents();
    expect(event).toMatchObject({
      name: "latency_calibration_started",
      payload: { method: "tap" },
    });
  });

  it("clears stored events", () => {
    trackAnalyticsEvent("latency_calibration_started", { method: "tap" });
    clearAnalyticsEvents();
    expect(loadAnalyticsEvents()).toEqual([]);
  });

  it("buckets tuner confidence", () => {
    expect(confidenceBucket(0.2)).toBe("low");
    expect(confidenceBucket(0.5)).toBe("medium");
    expect(confidenceBucket(0.92)).toBe("high");
  });
});
