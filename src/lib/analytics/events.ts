const STORAGE_KEY = "fretflow.analyticsEvents.v1";
const MAX_EVENTS = 200;
const ANALYTICS_BATCH_SCHEMA_VERSION = 1;

export type AnalyticsEventMap = {
  tuner_note_detected: {
    detected_note: string;
    confidence_bucket: "low" | "medium" | "high";
  };
  latency_calibration_started: {
    method: "tap";
  };
  latency_calibration_applied: {
    method: "tap";
    offset_ms: number;
  };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

export type AnalyticsEvent<N extends AnalyticsEventName = AnalyticsEventName> = {
  id: string;
  name: N;
  payload: AnalyticsEventMap[N];
  at: string;
  sentAt: string | null;
};

export type AnalyticsBatchV1 = {
  schemaVersion: 1;
  generatedAt: string;
  batchId: string;
  events: AnalyticsEvent[];
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readEvents(): AnalyticsEvent[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is AnalyticsEvent =>
        entry != null &&
        typeof entry === "object" &&
        typeof entry.id === "string" &&
        typeof entry.name === "string" &&
        typeof entry.at === "string" &&
        (typeof entry.sentAt === "string" || entry.sentAt === null || entry.sentAt === undefined) &&
        entry.payload != null &&
        typeof entry.payload === "object",
    ).map((entry) => ({
      ...entry,
      sentAt: entry.sentAt ?? null,
    }));
  } catch {
    return [];
  }
}

function writeEvents(events: AnalyticsEvent[]): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(0, MAX_EVENTS)));
  } catch {
    /* private mode / quota */
  }
}

export function trackAnalyticsEvent<N extends AnalyticsEventName>(
  name: N,
  payload: AnalyticsEventMap[N],
): AnalyticsEvent<N> {
  const event: AnalyticsEvent<N> = {
    id: `analytics-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    payload,
    at: new Date().toISOString(),
    sentAt: null,
  };
  writeEvents([event, ...readEvents()]);
  return event;
}

export function loadAnalyticsEvents(): AnalyticsEvent[] {
  return readEvents();
}

export function clearAnalyticsEvents(): void {
  if (!canUseStorage()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function buildPendingAnalyticsBatch(limit = 50): AnalyticsBatchV1 | null {
  const events = readEvents()
    .filter((event) => event.sentAt == null)
    .slice(0, limit);
  if (events.length === 0) return null;
  return {
    schemaVersion: ANALYTICS_BATCH_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    batchId: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    events,
  };
}

export function markAnalyticsBatchSent(eventIds: string[]): void {
  if (eventIds.length === 0) return;
  const sentIds = new Set(eventIds);
  const now = new Date().toISOString();
  writeEvents(
    readEvents().map((event) => (sentIds.has(event.id) ? { ...event, sentAt: now } : event)),
  );
}

export function confidenceBucket(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.45) return "medium";
  return "low";
}
