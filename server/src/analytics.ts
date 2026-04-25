type AnalyticsEventPayload = Record<string, unknown>;

type AnalyticsEvent = {
  id: string;
  name: string;
  payload: AnalyticsEventPayload;
  at: string;
  sentAt: string | null;
};

export type AnalyticsBatchV1 = {
  schemaVersion: 1;
  generatedAt: string;
  batchId: string;
  events: AnalyticsEvent[];
};

function isAnalyticsEvent(value: unknown): value is AnalyticsEvent {
  if (value == null || typeof value !== "object") return false;
  const event = value as Partial<AnalyticsEvent>;
  return (
    typeof event.id === "string" &&
    typeof event.name === "string" &&
    typeof event.at === "string" &&
    (typeof event.sentAt === "string" || event.sentAt === null) &&
    event.payload != null &&
    typeof event.payload === "object"
  );
}

export function isAnalyticsBatchV1(value: unknown): value is AnalyticsBatchV1 {
  if (value == null || typeof value !== "object") return false;
  const batch = value as Partial<AnalyticsBatchV1>;
  return (
    batch.schemaVersion === 1 &&
    typeof batch.generatedAt === "string" &&
    typeof batch.batchId === "string" &&
    Array.isArray(batch.events) &&
    batch.events.every(isAnalyticsEvent)
  );
}
