const STORAGE_KEY = "fretflow.loopBookmarks.v1";

type LoopBookmarkRecordV1 = {
  schemaVersion: 1;
  byChartKey: Record<string, LoopBookmarkV1[]>;
};

export type LoopBookmarkV1 = {
  schemaVersion: 1;
  id: string;
  name: string;
  loopABeat: number;
  loopBBeat: number;
  createdAt: string;
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRecord(): LoopBookmarkRecordV1 {
  if (!canUseStorage()) return { schemaVersion: 1, byChartKey: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { schemaVersion: 1, byChartKey: {} };
    const parsed = JSON.parse(raw) as Partial<LoopBookmarkRecordV1>;
    if (parsed.schemaVersion !== 1 || parsed.byChartKey == null || typeof parsed.byChartKey !== "object") {
      return { schemaVersion: 1, byChartKey: {} };
    }
    return {
      schemaVersion: 1,
      byChartKey: Object.fromEntries(
        Object.entries(parsed.byChartKey).map(([chartKey, bookmarks]) => [
          chartKey,
          Array.isArray(bookmarks)
            ? bookmarks.filter(
                (bookmark): bookmark is LoopBookmarkV1 =>
                  bookmark != null &&
                  typeof bookmark === "object" &&
                  bookmark.schemaVersion === 1 &&
                  typeof bookmark.id === "string" &&
                  typeof bookmark.name === "string" &&
                  typeof bookmark.loopABeat === "number" &&
                  typeof bookmark.loopBBeat === "number" &&
                  typeof bookmark.createdAt === "string",
              )
            : [],
        ]),
      ),
    };
  } catch {
    return { schemaVersion: 1, byChartKey: {} };
  }
}

function writeRecord(record: LoopBookmarkRecordV1): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* private mode / quota */
  }
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 40);
}

function clampBeat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 1000) / 1000);
}

function createBookmarkId(): string {
  return `loop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadLoopBookmarks(chartKey: string): LoopBookmarkV1[] {
  return readRecord().byChartKey[chartKey] ?? [];
}

export function saveLoopBookmark(
  chartKey: string,
  input: { name: string; loopABeat: number; loopBBeat: number },
): LoopBookmarkV1[] {
  const name = normalizeName(input.name);
  if (name === "") {
    return loadLoopBookmarks(chartKey);
  }
  const record = readRecord();
  const current = record.byChartKey[chartKey] ?? [];
  const nextBookmark: LoopBookmarkV1 = {
    schemaVersion: 1,
    id: createBookmarkId(),
    name,
    loopABeat: clampBeat(input.loopABeat),
    loopBBeat: clampBeat(input.loopBBeat),
    createdAt: new Date().toISOString(),
  };
  record.byChartKey[chartKey] = [
    nextBookmark,
    ...current,
  ].slice(0, 12);
  writeRecord(record);
  return record.byChartKey[chartKey];
}

export function deleteLoopBookmark(chartKey: string, bookmarkId: string): LoopBookmarkV1[] {
  const record = readRecord();
  const current = record.byChartKey[chartKey] ?? [];
  const next = current.filter((bookmark) => bookmark.id !== bookmarkId);
  if (next.length === 0) {
    delete record.byChartKey[chartKey];
  } else {
    record.byChartKey[chartKey] = next;
  }
  writeRecord(record);
  return next;
}
