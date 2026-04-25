import {
  buildPendingAnalyticsBatch,
  loadAnalyticsEvents,
  markAnalyticsBatchSent,
} from "./events";

type AnalyticsBatchAcceptedResponse = {
  schemaVersion: 1;
  received: true;
  batchId: string;
  acceptedEvents: number;
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

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return apiBaseUrl.trim().replace(/\/+$/, "");
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
    throw new Error(`analytics batch delivery failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isAcceptedResponse(payload)) {
    throw new Error("analytics batch delivery returned an invalid response");
  }
  const sentEventIds = batch.events.map((event) => event.id);
  markAnalyticsBatchSent(sentEventIds);
  return {
    status: "sent",
    batchId: payload.batchId,
    acceptedEvents: payload.acceptedEvents,
    sentEventIds,
  };
}
