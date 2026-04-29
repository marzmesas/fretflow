const STORAGE_KEY = "fretflow.collections.v1";

export type ChartCollectionV1 = {
  id: string;
  name: string;
  trackIds: string[];
  createdAt: string;
};

type CollectionRecordV1 = {
  schemaVersion: 1;
  collections: ChartCollectionV1[];
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRecord(): CollectionRecordV1 {
  if (!canUseStorage()) return { schemaVersion: 1, collections: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { schemaVersion: 1, collections: [] };
    const parsed = JSON.parse(raw) as Partial<CollectionRecordV1>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.collections)) {
      return { schemaVersion: 1, collections: [] };
    }
    return {
      schemaVersion: 1,
      collections: parsed.collections.filter(isChartCollectionV1),
    };
  } catch {
    return { schemaVersion: 1, collections: [] };
  }
}

function writeRecord(record: CollectionRecordV1): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* private mode / quota */
  }
}

function makeId(): string {
  return `collection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isChartCollectionV1(value: unknown): value is ChartCollectionV1 {
  if (value == null || typeof value !== "object") return false;
  const collection = value as Partial<ChartCollectionV1>;
  return (
    typeof collection.id === "string" &&
    typeof collection.name === "string" &&
    typeof collection.createdAt === "string" &&
    Array.isArray(collection.trackIds) &&
    collection.trackIds.every((trackId) => typeof trackId === "string")
  );
}

function normalizeCollections(collections: ChartCollectionV1[]): ChartCollectionV1[] {
  return collections
    .filter(isChartCollectionV1)
    .map((collection) => ({
      id: collection.id.trim(),
      name: collection.name.trim(),
      createdAt: collection.createdAt,
      trackIds: [...new Set(collection.trackIds.map((trackId) => trackId.trim()).filter((trackId) => trackId.length > 0))],
    }))
    .filter((collection) => collection.id !== "" && collection.name !== "");
}

export function getCollections(): ChartCollectionV1[] {
  return readRecord().collections;
}

export function replaceCollections(collections: ChartCollectionV1[]): ChartCollectionV1[] {
  const next = normalizeCollections(collections);
  writeRecord({
    schemaVersion: 1,
    collections: next,
  });
  return next;
}

export function createCollection(name: string): ChartCollectionV1[] {
  const trimmed = name.trim();
  if (trimmed === "") return getCollections();
  const record = readRecord();
  record.collections.unshift({
    id: makeId(),
    name: trimmed,
    trackIds: [],
    createdAt: new Date().toISOString(),
  });
  writeRecord(record);
  return record.collections;
}

export function deleteCollection(collectionId: string): ChartCollectionV1[] {
  const record = readRecord();
  record.collections = record.collections.filter((collection) => collection.id !== collectionId);
  writeRecord(record);
  return record.collections;
}

export function toggleTrackInCollection(collectionId: string, trackId: string): ChartCollectionV1[] {
  const record = readRecord();
  record.collections = record.collections.map((collection) => {
    if (collection.id !== collectionId) return collection;
    const trackIds = collection.trackIds.includes(trackId)
      ? collection.trackIds.filter((id) => id !== trackId)
      : [trackId, ...collection.trackIds];
    return { ...collection, trackIds };
  });
  writeRecord(record);
  return record.collections;
}

export function removeTrackFromCollections(trackId: string): ChartCollectionV1[] {
  const record = readRecord();
  record.collections = record.collections.map((collection) => ({
    ...collection,
    trackIds: collection.trackIds.filter((id) => id !== trackId),
  }));
  writeRecord(record);
  return record.collections;
}
