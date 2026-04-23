const STORAGE_KEY = "fretflow.analyticsEvents.v1";
const MAX_EVENTS = 200;

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
  name: N;
  payload: AnalyticsEventMap[N];
  at: string;
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
        typeof entry.name === "string" &&
        typeof entry.at === "string" &&
        entry.payload != null &&
        typeof entry.payload === "object",
    );
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
    name,
    payload,
    at: new Date().toISOString(),
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

export function confidenceBucket(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.45) return "medium";
  return "low";
}
