import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAnalyticsDeliveryStatus,
  getPendingAnalyticsEventCount,
  maybeSendScheduledAnalyticsBatch,
  sendPendingAnalyticsBatch,
  shouldRetryAnalyticsNow,
} from "./delivery";
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

  it("records retry metadata after a failed delivery", async () => {
    trackAnalyticsEvent("latency_calibration_started", { method: "tap" });
    await expect(
      sendPendingAnalyticsBatch({
        apiBaseUrl: "http://127.0.0.1:8787",
        fetchImpl: vi.fn(async () => ({
          ok: false,
          status: 503,
        })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("analytics batch delivery failed: 503");

    const status = getAnalyticsDeliveryStatus();
    expect(status.consecutiveFailures).toBe(1);
    expect(status.lastError).toContain("503");
    expect(status.nextRetryAt).toEqual(expect.any(String));
    expect(shouldRetryAnalyticsNow(new Date(Date.parse(status.nextRetryAt!) - 1))).toBe(false);
  });

  it("skips scheduled delivery until the retry window is due", async () => {
    trackAnalyticsEvent("latency_calibration_started", { method: "tap" });
    await expect(
      sendPendingAnalyticsBatch({
        apiBaseUrl: "http://127.0.0.1:8787",
        fetchImpl: vi.fn(async () => ({
          ok: false,
          status: 503,
        })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow();

    await expect(
      maybeSendScheduledAnalyticsBatch({
        apiBaseUrl: "http://127.0.0.1:8787",
        fetchImpl: vi.fn(),
      }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "retry_not_due",
    });
  });
});
