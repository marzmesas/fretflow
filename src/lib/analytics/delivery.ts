import {
  buildPendingAnalyticsBatch,
  loadAnalyticsEvents,
  markAnalyticsBatchSent,
} from "./events";

const DELIVERY_STATUS_KEY = "fretflow.analyticsDeliveryStatus.v1";

type AnalyticsBatchAcceptedResponse = {
  schemaVersion: 1;
  received: true;
  batchId: string;
  acceptedEvents: number;
};

export type AnalyticsDeliveryStatus = {
  schemaVersion: 1;
  consecutiveFailures: number;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  lastError: string | null;
};

export type SendAnalyticsBatchResult =
  | { status: "skipped"; reason: "missing_api_base" | "no_events" }
  | {
      status: "sent";
      batchId: string;
      acceptedEvents: number;
      sentEventIds: string[];
    };

export type SendAnalyticsBatchOptions = {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
  limit?: number;
};

const DEFAULT_DELIVERY_STATUS: AnalyticsDeliveryStatus = {
  schemaVersion: 1,
  consecutiveFailures: 0,
  lastAttemptAt: null,
  nextRetryAt: null,
  lastError: null,
};

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.trim().replace(/\/+$/, "");
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function countPendingEvents(): number {
  return loadAnalyticsEvents().filter((event) => event.sentAt == null).length;
}

function isAcceptedResponse(value: unknown): value is AnalyticsBatchAcceptedResponse {
  if (value == null || typeof value !== "object") return false;
  const response = value as Partial<AnalyticsBatchAcceptedResponse>;
  return (
    response.schemaVersion === 1 &&
    response.received === true &&
    typeof response.batchId === "string" &&
    typeof response.acceptedEvents === "number"
  );
}

export function getPendingAnalyticsEventCount(): number {
  return countPendingEvents();
}

export function getAnalyticsDeliveryStatus(): AnalyticsDeliveryStatus {
  if (!canUseStorage()) return { ...DEFAULT_DELIVERY_STATUS };
  try {
    const raw = localStorage.getItem(DELIVERY_STATUS_KEY);
    if (!raw) return { ...DEFAULT_DELIVERY_STATUS };
    const parsed = JSON.parse(raw) as Partial<AnalyticsDeliveryStatus>;
    if (parsed.schemaVersion !== 1) return { ...DEFAULT_DELIVERY_STATUS };
    return {
      schemaVersion: 1,
      consecutiveFailures: Math.max(0, Math.round(Number(parsed.consecutiveFailures) || 0)),
      lastAttemptAt: typeof parsed.lastAttemptAt === "string" ? parsed.lastAttemptAt : null,
      nextRetryAt: typeof parsed.nextRetryAt === "string" ? parsed.nextRetryAt : null,
      lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
    };
  } catch {
    return { ...DEFAULT_DELIVERY_STATUS };
  }
}

function saveAnalyticsDeliveryStatus(status: AnalyticsDeliveryStatus): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(DELIVERY_STATUS_KEY, JSON.stringify(status));
  } catch {
    /* private mode / quota */
  }
}

function nextRetryDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 1) return 5 * 60_000;
  if (consecutiveFailures === 2) return 15 * 60_000;
  return 60 * 60_000;
}

function recordAnalyticsDeliverySuccess(): void {
  saveAnalyticsDeliveryStatus({
    ...DEFAULT_DELIVERY_STATUS,
    lastAttemptAt: new Date().toISOString(),
  });
}

function recordAnalyticsDeliveryFailure(error: string): AnalyticsDeliveryStatus {
  const current = getAnalyticsDeliveryStatus();
  const consecutiveFailures = current.consecutiveFailures + 1;
  const now = new Date();
  const nextRetryAt = new Date(now.getTime() + nextRetryDelayMs(consecutiveFailures)).toISOString();
  const nextStatus: AnalyticsDeliveryStatus = {
    schemaVersion: 1,
    consecutiveFailures,
    lastAttemptAt: now.toISOString(),
    nextRetryAt,
    lastError: error,
  };
  saveAnalyticsDeliveryStatus(nextStatus);
  return nextStatus;
}

export function shouldRetryAnalyticsNow(now = new Date()): boolean {
  const status = getAnalyticsDeliveryStatus();
  if (status.nextRetryAt == null) return true;
  return Date.parse(status.nextRetryAt) <= now.getTime();
}

export async function sendPendingAnalyticsBatch(
  options: SendAnalyticsBatchOptions,
): Promise<SendAnalyticsBatchResult> {
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  if (apiBaseUrl === "") {
    return { status: "skipped", reason: "missing_api_base" };
  }
  const batch = buildPendingAnalyticsBatch(options.limit);
  if (batch == null) {
    return { status: "skipped", reason: "no_events" };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/analytics/batch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(batch),
  });
  if (!response.ok) {
    const message = `analytics batch delivery failed: ${response.status}`;
    recordAnalyticsDeliveryFailure(message);
    throw new Error(message);
  }
  const payload = (await response.json()) as unknown;
  if (!isAcceptedResponse(payload)) {
    const message = "analytics batch delivery returned an invalid response";
    recordAnalyticsDeliveryFailure(message);
    throw new Error(message);
  }
  const sentEventIds = batch.events.map((event) => event.id);
  markAnalyticsBatchSent(sentEventIds);
  recordAnalyticsDeliverySuccess();
  return {
    status: "sent",
    batchId: payload.batchId,
    acceptedEvents: payload.acceptedEvents,
    sentEventIds,
  };
}

export async function maybeSendScheduledAnalyticsBatch(
  options: SendAnalyticsBatchOptions,
): Promise<SendAnalyticsBatchResult | { status: "skipped"; reason: "retry_not_due" }> {
  if (!shouldRetryAnalyticsNow()) {
    return { status: "skipped", reason: "retry_not_due" };
  }
  return sendPendingAnalyticsBatch(options);
}
