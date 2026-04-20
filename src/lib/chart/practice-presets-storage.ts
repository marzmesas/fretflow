import type { DensityTier } from "./adaptive-density";
import type { FretflowChartV1 } from "./types";

const STORAGE_KEY = "fretflow.practicePresets.v1";

type PracticePresetRecordV1 = {
  schemaVersion: 1;
  presets: Record<string, PracticePresetV1>;
};

export type PracticePresetV1 = {
  schemaVersion: 1;
  speed: number;
  pixelsPerSecond: number;
  loopEnabled: boolean;
  loopABeat: number;
  loopBBeat: number;
  autoSpeedLoop: boolean;
  densityTier: DensityTier;
  autoDensityBump: boolean;
  metronomeEnabled: boolean;
  backingAudioMuted: boolean;
  backingAudioVolume: number;
};

const DEFAULT_PRESET: PracticePresetV1 = {
  schemaVersion: 1,
  speed: 1,
  pixelsPerSecond: 140,
  loopEnabled: false,
  loopABeat: 0,
  loopBBeat: 8,
  autoSpeedLoop: false,
  densityTier: "full",
  autoDensityBump: false,
  metronomeEnabled: false,
  backingAudioMuted: false,
  backingAudioVolume: 0.7,
};

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readRecord(): PracticePresetRecordV1 {
  if (!canUseStorage()) return { schemaVersion: 1, presets: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { schemaVersion: 1, presets: {} };
    const parsed = JSON.parse(raw) as Partial<PracticePresetRecordV1>;
    if (parsed.schemaVersion !== 1 || parsed.presets == null || typeof parsed.presets !== "object") {
      return { schemaVersion: 1, presets: {} };
    }
    return {
      schemaVersion: 1,
      presets: Object.fromEntries(
        Object.entries(parsed.presets).filter(([, value]) => value != null && typeof value === "object"),
      ),
    };
  } catch {
    return { schemaVersion: 1, presets: {} };
  }
}

function writeRecord(record: PracticePresetRecordV1): void {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* private mode / quota */
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coerceDensityTier(value: unknown): DensityTier {
  return value === "half" || value === "three_quarters" || value === "full" ? value : "full";
}

function normalizePreset(raw: Partial<PracticePresetV1>): PracticePresetV1 {
  return {
    schemaVersion: 1,
    speed: clamp(Number(raw.speed) || DEFAULT_PRESET.speed, 0.5, 1.5),
    pixelsPerSecond: clamp(Math.round(Number(raw.pixelsPerSecond) || DEFAULT_PRESET.pixelsPerSecond), 80, 220),
    loopEnabled: Boolean(raw.loopEnabled),
    loopABeat: Math.max(0, Number(raw.loopABeat) || 0),
    loopBBeat: Math.max(0, Number(raw.loopBBeat) || DEFAULT_PRESET.loopBBeat),
    autoSpeedLoop: Boolean(raw.autoSpeedLoop),
    densityTier: coerceDensityTier(raw.densityTier),
    autoDensityBump: Boolean(raw.autoDensityBump),
    metronomeEnabled: Boolean(raw.metronomeEnabled),
    backingAudioMuted: Boolean(raw.backingAudioMuted),
    backingAudioVolume: clamp(Number(raw.backingAudioVolume) || DEFAULT_PRESET.backingAudioVolume, 0, 1),
  };
}

function chartFingerprint(chart: FretflowChartV1): string {
  const noteCount = chart.notes.length;
  const lastNote = noteCount > 0 ? chart.notes[noteCount - 1]! : null;
  const lastNoteKey = lastNote
    ? `${lastNote.startBeat}:${lastNote.durationBeats}:${lastNote.stringIndex}:${lastNote.fret}`
    : "empty";
  return [
    chart.title.trim().toLowerCase(),
    chart.bpm,
    chart.timeSignature.join("/"),
    noteCount,
    lastNoteKey,
  ].join("|");
}

export function getPracticePresetKey(
  trackId: string | null | undefined,
  chart: FretflowChartV1,
): string {
  const trimmedTrackId = typeof trackId === "string" ? trackId.trim() : "";
  if (trimmedTrackId !== "") return `track:${trimmedTrackId}`;
  return `chart:${chartFingerprint(chart)}`;
}

export function getDefaultPracticePreset(loopBBeat: number): PracticePresetV1 {
  return { ...DEFAULT_PRESET, loopBBeat };
}

export function loadPracticePreset(key: string, loopBBeat: number): PracticePresetV1 {
  const entry = readRecord().presets[key];
  const base = entry ? normalizePreset(entry) : getDefaultPracticePreset(loopBBeat);
  const normalizedLoopB = Math.max(Math.max(base.loopABeat + 0.25, 0.25), Math.min(loopBBeat, base.loopBBeat));
  return {
    ...base,
    loopABeat: Math.min(base.loopABeat, loopBBeat),
    loopBBeat: normalizedLoopB,
  };
}

export function savePracticePreset(key: string, preset: PracticePresetV1): void {
  const record = readRecord();
  record.presets[key] = normalizePreset(preset);
  writeRecord(record);
}

export function clearPracticePreset(key: string): void {
  const record = readRecord();
  if (!(key in record.presets)) return;
  delete record.presets[key];
  writeRecord(record);
}
