import { beforeEach, describe, expect, it } from "vitest";
import {
  buildPendingAnalyticsBatch,
  clearAnalyticsEvents,
  confidenceBucket,
  loadAnalyticsEvents,
  markAnalyticsBatchSent,
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
    expect(event?.id).toEqual(expect.any(String));
    expect(event?.sentAt).toBeNull();
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

  it("builds and marks a pending analytics batch", () => {
    const event = trackAnalyticsEvent("latency_calibration_started", { method: "tap" });
    const batch = buildPendingAnalyticsBatch();
    expect(batch).not.toBeNull();
    expect(batch?.schemaVersion).toBe(1);
    expect(batch?.events[0]?.id).toBe(event.id);

    markAnalyticsBatchSent([event.id]);
    expect(buildPendingAnalyticsBatch()).toBeNull();
    expect(loadAnalyticsEvents()[0]?.sentAt).toEqual(expect.any(String));
  });
});
