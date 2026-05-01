import {
  getStoredAccount,
  getStoredRemoteProgress,
  saveStoredRemoteProgress,
} from "./account-store.js";

type RemoteProgressIdentity = {
  accountId?: string;
  email?: string;
};

type RemoteProgressWriteRequest = RemoteProgressIdentity & {
  state?: unknown;
};

export type RemoteLearningPathProgressSummaryV1 = {
  pathId: "starter" | "rhythm" | "technique";
  completedSteps: number;
  totalSteps: number;
  completionPercent: number;
  status: "not_started" | "in_progress" | "completed";
  nextTrackId: string | null;
  nextTrackTitle: string | null;
};

export type RemoteSessionSummaryV1 = {
  schemaVersion: 1;
  at: string;
  chartTitle: string;
  practiceTrackId?: string | null;
  scoringMode: string;
  hits: number;
  misses: number;
  accuracyPercent: number;
  maxCombo: number;
  totalNotes?: number;
  inputSource?: string;
};

export type RemoteProgressStateV1 = {
  schemaVersion: 1;
  lastUpdatedAt: string;
  sessionHistory: RemoteSessionSummaryV1[];
  learningPathProgress: RemoteLearningPathProgressSummaryV1[];
};

function normalizeEmail(email: string | null | undefined): string {
  return email?.trim().toLowerCase() ?? "";
}

function resolveStoredProgressAccount(identity: RemoteProgressIdentity) {
  const accountId = identity.accountId?.trim() ?? "";
  const email = normalizeEmail(identity.email);
  if (accountId === "" || email === "") {
    return null;
  }
  const account = getStoredAccount(accountId);
  if (account == null || normalizeEmail(account.email) !== email) {
    return null;
  }
  return account;
}

function isRemoteSessionSummary(value: unknown): value is RemoteSessionSummaryV1 {
  if (value == null || typeof value !== "object") return false;
  const session = value as Partial<RemoteSessionSummaryV1>;
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

function isLearningPathId(value: unknown): value is RemoteLearningPathProgressSummaryV1["pathId"] {
  return value === "starter" || value === "rhythm" || value === "technique";
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

export function isRemoteProgressStatePayload(value: unknown): value is RemoteProgressStateV1 {
  if (value == null || typeof value !== "object") return false;
  const payload = value as Partial<RemoteProgressStateV1>;
  return (
    payload.schemaVersion === 1 &&
    typeof payload.lastUpdatedAt === "string" &&
    Array.isArray(payload.sessionHistory) &&
    payload.sessionHistory.every(isRemoteSessionSummary) &&
    Array.isArray(payload.learningPathProgress) &&
    payload.learningPathProgress.every(isRemoteLearningPathProgressSummary)
  );
}

function normalizeSessionHistory(
  history: RemoteSessionSummaryV1[],
): RemoteSessionSummaryV1[] {
  return history
    .filter(isRemoteSessionSummary)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 50);
}

function normalizeLearningPathProgress(
  progress: RemoteLearningPathProgressSummaryV1[],
): RemoteLearningPathProgressSummaryV1[] {
  const seenPathIds = new Set<RemoteLearningPathProgressSummaryV1["pathId"]>();
  const normalized: RemoteLearningPathProgressSummaryV1[] = [];
  for (const item of progress) {
    if (!isRemoteLearningPathProgressSummary(item) || seenPathIds.has(item.pathId)) {
      continue;
    }
    seenPathIds.add(item.pathId);
    normalized.push({
      pathId: item.pathId,
      completedSteps: item.completedSteps,
      totalSteps: item.totalSteps,
      completionPercent: item.completionPercent,
      status: item.status,
      nextTrackId: item.nextTrackId,
      nextTrackTitle: item.nextTrackTitle,
    });
  }
  return normalized;
}

function emptyRemoteProgressState(): RemoteProgressStateV1 {
  return {
    schemaVersion: 1,
    lastUpdatedAt: new Date(0).toISOString(),
    sessionHistory: [],
    learningPathProgress: [],
  };
}

export function getCurrentRemoteProgressState(identity: RemoteProgressIdentity): RemoteProgressStateV1 | null {
  const account = resolveStoredProgressAccount(identity);
  if (account == null) {
    return null;
  }
  const persisted = getStoredRemoteProgress(account.accountId);
  if (persisted != null && isRemoteProgressStatePayload(persisted)) {
    return {
      schemaVersion: 1,
      lastUpdatedAt: persisted.lastUpdatedAt,
      sessionHistory: normalizeSessionHistory(persisted.sessionHistory),
      learningPathProgress: normalizeLearningPathProgress(persisted.learningPathProgress),
    };
  }
  return emptyRemoteProgressState();
}

export function saveRemoteProgressState(request: unknown): RemoteProgressStateV1 | null {
  if (request == null || typeof request !== "object") {
    return null;
  }
  const payload = request as RemoteProgressWriteRequest;
  const account = resolveStoredProgressAccount(payload);
  if (account == null || !isRemoteProgressStatePayload(payload.state)) {
    return null;
  }
  const persistedState: RemoteProgressStateV1 = {
    schemaVersion: 1,
    lastUpdatedAt: payload.state.lastUpdatedAt,
    sessionHistory: normalizeSessionHistory(payload.state.sessionHistory),
    learningPathProgress: normalizeLearningPathProgress(payload.state.learningPathProgress),
  };
  saveStoredRemoteProgress(account.accountId, persistedState as Record<string, unknown>);
  return persistedState;
}
