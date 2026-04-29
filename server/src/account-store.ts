import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type StoredAccountRecord = {
  accountId: string;
  email: string;
  displayName: string | null;
  entitlements: string[];
  lastSignedInAtUnixMs: number;
  stripeCustomerId: string | null;
};

type StoredAccountSnapshot = {
  schemaVersion: 1;
  accounts: StoredAccountRecord[];
};

const STORE_SCHEMA_VERSION = 1;
const STORE_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".data",
  "accounts.json",
);

let accountCache: Map<string, StoredAccountRecord> | null = null;

function normalizeString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function readAccountSnapshot(): Map<string, StoredAccountRecord> {
  if (!fs.existsSync(STORE_FILE)) {
    return new Map();
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredAccountSnapshot>;
    if (parsed.schemaVersion !== STORE_SCHEMA_VERSION || !Array.isArray(parsed.accounts)) {
      return new Map();
    }
    const records = parsed.accounts.filter(isStoredAccountRecord);
    return new Map(records.map((record) => [record.accountId, record]));
  } catch {
    return new Map();
  }
}

function isStoredAccountRecord(value: unknown): value is StoredAccountRecord {
  if (value == null || typeof value !== "object") return false;
  const record = value as Partial<StoredAccountRecord>;
  return (
    typeof record.accountId === "string" &&
    typeof record.email === "string" &&
    (typeof record.displayName === "string" || record.displayName === null) &&
    Array.isArray(record.entitlements) &&
    record.entitlements.every((entitlement) => typeof entitlement === "string") &&
    typeof record.lastSignedInAtUnixMs === "number" &&
    (typeof record.stripeCustomerId === "string" || record.stripeCustomerId === null)
  );
}

function getAccountCache(): Map<string, StoredAccountRecord> {
  accountCache ??= readAccountSnapshot();
  return accountCache;
}

function persistAccountCache(cache: Map<string, StoredAccountRecord>): void {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  const snapshot: StoredAccountSnapshot = {
    schemaVersion: STORE_SCHEMA_VERSION,
    accounts: [...cache.values()],
  };
  fs.writeFileSync(STORE_FILE, JSON.stringify(snapshot, null, 2));
}

export function recordSignedInAccount(input: {
  accountId: string;
  email: string;
  displayName: string | null;
  entitlements: string[];
  signedInAtUnixMs: number;
}): StoredAccountRecord {
  const cache = getAccountCache();
  const existing = cache.get(input.accountId);
  const record: StoredAccountRecord = {
    accountId: input.accountId,
    email: input.email,
    displayName: normalizeString(input.displayName),
    entitlements: [...input.entitlements],
    lastSignedInAtUnixMs: input.signedInAtUnixMs,
    stripeCustomerId: existing?.stripeCustomerId ?? null,
  };
  cache.set(record.accountId, record);
  persistAccountCache(cache);
  return record;
}

export function getStoredAccount(accountId: string): StoredAccountRecord | null {
  return getAccountCache().get(accountId) ?? null;
}

export function assignStripeCustomerId(
  accountId: string,
  stripeCustomerId: string,
): StoredAccountRecord | null {
  const normalizedCustomerId = normalizeString(stripeCustomerId);
  if (normalizedCustomerId == null) return null;
  const cache = getAccountCache();
  const existing = cache.get(accountId);
  if (existing == null) return null;
  const updated: StoredAccountRecord = {
    ...existing,
    stripeCustomerId: normalizedCustomerId,
  };
  cache.set(accountId, updated);
  persistAccountCache(cache);
  return updated;
}
