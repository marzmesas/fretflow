import {
  loadSessionHistory,
  replaceSessionHistory,
  type SessionSummaryV1,
} from "../chart/session-storage";
import {
  getLearningPathProgress,
  type LearningPathId,
  type LearningPathProgress,
} from "../catalog/learning-paths";

export type RemoteLearningPathProgressSummaryV1 = {
  pathId: LearningPathId;
  completedSteps: number;
  totalSteps: number;
  completionPercent: number;
  status: "not_started" | "in_progress" | "completed";
  nextTrackId: string | null;
  nextTrackTitle: string | null;
};

export type RemoteProgressStateV1 = {
  schemaVersion: 1;
  revision: number;
  lastUpdatedAt: string;
  sessionHistory: SessionSummaryV1[];
  learningPathProgress: RemoteLearningPathProgressSummaryV1[];
};

type RemoteProgressIdentity = {
  accountId: string;
  email: string;
};

type RemoteProgressApiOptions = {
  apiBaseUrl: string;
  fetchImpl?: typeof fetch;
};

export type LoadRemoteProgressStateOptions = RemoteProgressApiOptions &
  RemoteProgressIdentity;

export type SaveRemoteProgressStateOptions = RemoteProgressApiOptions &
  RemoteProgressIdentity & {
    state: RemoteProgressStateV1;
  };

export class RemoteProgressWriteConflictError extends Error {
  readonly currentState: RemoteProgressStateV1;

  constructor(currentState: RemoteProgressStateV1) {
    super("remote progress write conflict");
    this.name = "RemoteProgressWriteConflictError";
    this.currentState = currentState;
  }
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  const normalized = apiBaseUrl.trim().replace(/\/+$/, "");
  if (normalized === "") {
    throw new Error("remote progress requests require an API base URL");
  }
  return normalized;
}

function normalizeIdentity(identity: RemoteProgressIdentity): RemoteProgressIdentity {
  const accountId = identity.accountId.trim();
  const email = identity.email.trim().toLowerCase();
  if (accountId === "" || email === "") {
    throw new Error("remote progress requests require a signed-in account");
  }
  return {
    accountId,
    email,
  };
}

function isLearningPathId(value: unknown): value is LearningPathId {
  return value === "starter" || value === "rhythm" || value === "technique";
}

function isSessionSummary(value: unknown): value is SessionSummaryV1 {
  if (value == null || typeof value !== "object") return false;
  const session = value as Partial<SessionSummaryV1>;
  return (
    session.schemaVersion === 1 &&
    typeof session.at === "string" &&
    typeof session.chartTitle === "string" &&
    (typeof session.practiceTrackId === "string" ||
      session.practiceTrackId === null ||
      session.practiceTrackId === undefined) &&
    typeof session.scoringMode === "string" &&
    typeof session.hits === "number" &&
    typeof session.misses === "number" &&
    typeof session.accuracyPercent === "number" &&
    typeof session.maxCombo === "number" &&
    (typeof session.totalNotes === "number" || session.totalNotes === undefined) &&
    (typeof session.inputSource === "string" || session.inputSource === undefined)
  );
}

function normalizeSessionHistory(history: SessionSummaryV1[]): SessionSummaryV1[] {
  return history
    .filter(isSessionSummary)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 50);
}

function isRemoteLearningPathProgressSummary(
  value: unknown,
): value is RemoteLearningPathProgressSummaryV1 {
  if (value == null || typeof value !== "object") return false;
  const summary = value as Partial<RemoteLearningPathProgressSummaryV1>;
  return (
    isLearningPathId(summary.pathId) &&
    typeof summary.completedSteps === "number" &&
    typeof summary.totalSteps === "number" &&
    typeof summary.completionPercent === "number" &&
    (summary.status === "not_started" ||
      summary.status === "in_progress" ||
      summary.status === "completed") &&
    (typeof summary.nextTrackId === "string" || summary.nextTrackId === null) &&
    (typeof summary.nextTrackTitle === "string" || summary.nextTrackTitle === null)
  );
}

export function isRemoteProgressState(value: unknown): value is RemoteProgressStateV1 {
  if (value == null || typeof value !== "object") return false;
  const state = value as Partial<RemoteProgressStateV1>;
  return (
    state.schemaVersion === 1 &&
    typeof state.revision === "number" &&
    typeof state.lastUpdatedAt === "string" &&
    Array.isArray(state.sessionHistory) &&
    state.sessionHistory.every(isSessionSummary) &&
    Array.isArray(state.learningPathProgress) &&
    state.learningPathProgress.every(isRemoteLearningPathProgressSummary)
  );
}

function summarizeLearningPathProgress(
  progress: LearningPathProgress[],
): RemoteLearningPathProgressSummaryV1[] {
  return progress.map((item) => ({
    pathId: item.path.id,
    completedSteps: item.completedSteps,
    totalSteps: item.totalSteps,
    completionPercent: item.completionPercent,
    status: item.status,
    nextTrackId: item.nextStep?.track.id ?? null,
    nextTrackTitle: item.nextStep?.track.title ?? null,
  }));
}

export function buildRemoteProgressStateFromHistory(
  history: SessionSummaryV1[],
  lastUpdatedAt = new Date().toISOString(),
  revision = 0,
): RemoteProgressStateV1 {
  const sessionHistory = normalizeSessionHistory(history);
  return {
    schemaVersion: 1,
    revision,
    lastUpdatedAt,
    sessionHistory,
    learningPathProgress: summarizeLearningPathProgress(getLearningPathProgress(sessionHistory)),
  };
}

export function buildLocalRemoteProgressState(
  history: SessionSummaryV1[] = loadSessionHistory(),
): RemoteProgressStateV1 {
  return buildRemoteProgressStateFromHistory(history);
}

export function applyRemoteProgressState(
  state: RemoteProgressStateV1,
): RemoteProgressStateV1 {
  const normalizedHistory = replaceSessionHistory(state.sessionHistory);
  return {
    schemaVersion: 1,
    revision: state.revision,
    lastUpdatedAt: state.lastUpdatedAt,
    sessionHistory: normalizedHistory,
    learningPathProgress: summarizeLearningPathProgress(
      getLearningPathProgress(normalizedHistory),
    ),
  };
}

export async function loadRemoteProgressState(
  options: LoadRemoteProgressStateOptions,
): Promise<RemoteProgressStateV1> {
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  const identity = normalizeIdentity(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const params = new URLSearchParams(identity);
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/progress-state?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`remote progress fetch failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isRemoteProgressState(payload)) {
    throw new Error("remote progress fetch returned an invalid response");
  }
  return payload;
}

export async function saveRemoteProgressState(
  options: SaveRemoteProgressStateOptions,
): Promise<RemoteProgressStateV1> {
  const apiBaseUrl = normalizeApiBaseUrl(options.apiBaseUrl);
  const identity = normalizeIdentity(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${apiBaseUrl}/api/v1/progress-state`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...identity,
      state: options.state,
    }),
  });
  if (!response.ok) {
    if (response.status === 409) {
      const payload = (await response.json()) as unknown;
      if (isRemoteProgressState(payload)) {
        throw new RemoteProgressWriteConflictError(payload);
      }
      throw new Error("remote progress write conflict returned an invalid response");
    }
    throw new Error(`remote progress write failed: ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!isRemoteProgressState(payload)) {
    throw new Error("remote progress write returned an invalid response");
  }
  return payload;
}
