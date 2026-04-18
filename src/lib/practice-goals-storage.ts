const KEY = "fretflow.practiceGoals.v1";

export type PracticeGoalsV1 = {
  schemaVersion: 1;
  /** Sessions to complete per local calendar day to satisfy the daily goal. */
  dailyGoalSessions: number;
  /** `YYYY-MM-DD` in local time — last day we recorded a completed session. */
  lastLocalDay: string | null;
  /** Consecutive local days with at least one completed session (minimum 1 after first day). */
  streakDays: number;
  /** Completed sessions counted for `lastLocalDay` (reset when day changes). */
  sessionsToday: number;
};

export type PracticeGoalsSnapshot = PracticeGoalsV1 & {
  goalMetToday: boolean;
  progressToday: string;
};

const DEFAULT_GOALS: PracticeGoalsV1 = {
  schemaVersion: 1,
  dailyGoalSessions: 1,
  lastLocalDay: null,
  streakDays: 0,
  sessionsToday: 0,
};

export function localDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function previousLocalDay(day: string): string {
  const [ys, ms, ds] = day.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return localDateString(dt);
}

export function toPracticeGoalsSnapshot(g: PracticeGoalsV1): PracticeGoalsSnapshot {
  const today = localDateString(new Date());
  const goalMetToday = g.lastLocalDay === today && g.sessionsToday >= g.dailyGoalSessions;
  const progressToday =
    g.lastLocalDay === today
      ? `${Math.min(g.sessionsToday, g.dailyGoalSessions)}/${g.dailyGoalSessions}`
      : `0/${g.dailyGoalSessions}`;
  return { ...g, goalMetToday, progressToday };
}

export function loadPracticeGoals(): PracticeGoalsV1 {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_GOALS };
    const o = JSON.parse(raw) as Partial<PracticeGoalsV1>;
    if (o?.schemaVersion !== 1) return { ...DEFAULT_GOALS };
    const daily = Math.min(10, Math.max(1, Math.round(Number(o.dailyGoalSessions) || 1)));
    return {
      schemaVersion: 1,
      dailyGoalSessions: daily,
      lastLocalDay: typeof o.lastLocalDay === "string" ? o.lastLocalDay : null,
      streakDays: Math.max(0, Math.round(Number(o.streakDays) || 0)),
      sessionsToday: Math.max(0, Math.round(Number(o.sessionsToday) || 0)),
    };
  } catch {
    return { ...DEFAULT_GOALS };
  }
}

function savePracticeGoals(g: PracticeGoalsV1): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(g));
  } catch {
    /* private mode / quota */
  }
}

export function setDailyGoalSessions(count: number): PracticeGoalsV1 {
  const g = loadPracticeGoals();
  const next = {
    ...g,
    dailyGoalSessions: Math.min(10, Math.max(1, Math.round(count))),
  };
  savePracticeGoals(next);
  return next;
}

/** Call when a chart run completes (full play-through, not pause). */
export function recordCompletedPracticeSession(): PracticeGoalsSnapshot {
  const g = loadPracticeGoals();
  const today = localDateString(new Date());
  let streakDays = g.streakDays;
  let sessionsToday = g.sessionsToday;
  let lastLocalDay = g.lastLocalDay;

  if (lastLocalDay === today) {
    sessionsToday += 1;
  } else {
    const prev = previousLocalDay(today);
    if (lastLocalDay === prev) {
      streakDays = streakDays <= 0 ? 1 : streakDays + 1;
    } else if (lastLocalDay === null) {
      streakDays = 1;
    } else {
      streakDays = 1;
    }
    sessionsToday = 1;
    lastLocalDay = today;
  }

  const next: PracticeGoalsV1 = {
    schemaVersion: 1,
    dailyGoalSessions: g.dailyGoalSessions,
    lastLocalDay,
    streakDays,
    sessionsToday,
  };
  savePracticeGoals(next);
  const goalMetToday = sessionsToday >= next.dailyGoalSessions;
  return {
    ...next,
    goalMetToday,
    progressToday: `${Math.min(sessionsToday, next.dailyGoalSessions)}/${next.dailyGoalSessions}`,
  };
}
