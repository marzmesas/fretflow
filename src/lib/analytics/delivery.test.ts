import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPendingAnalyticsBatch, getPendingAnalyticsEventCount } from "./delivery";
import { clearAnalyticsEvents, trackAnalyticsEvent } from "./events";

describe("analytics delivery", () => {
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
    clearAnalyticsEvents();
  });

  it("skips sending when there is no API base", async () => {
    trackAnalyticsEvent("latency_calibration_started", { method: "tap" });
    await expect(sendPendingAnalyticsBatch({ apiBaseUrl: "   " })).resolves.toEqual({
      status: "skipped",
      reason: "missing_api_base",
    });
  });

  it("sends a pending batch and marks the events sent", async () => {
    trackAnalyticsEvent("latency_calibration_started", { method: "tap" });
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        schemaVersion: 1,
        received: true,
        batchId: "batch-test",
        acceptedEvents: 1,
      }),
    })) as unknown as typeof fetch;

    await expect(
      sendPendingAnalyticsBatch({ apiBaseUrl: "http://127.0.0.1:8787", fetchImpl }),
    ).resolves.toMatchObject({
      status: "sent",
      batchId: "batch-test",
      acceptedEvents: 1,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getPendingAnalyticsEventCount()).toBe(0);
  });

  it("skips sending when there are no pending events", async () => {
    await expect(
      sendPendingAnalyticsBatch({
        apiBaseUrl: "http://127.0.0.1:8787",
        fetchImpl: vi.fn(),
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "no_events",
    });
  });
});
