import { beforeEach, describe, expect, it } from "vitest";
import { getPracticePresetKey, loadPracticePreset, savePracticePreset, clearPracticePreset } from "./practice-presets-storage";
import type { FretflowChartV1 } from "./types";

const DEMO_CHART: FretflowChartV1 = {
  schemaVersion: 1,
  title: "Demo",
  bpm: 120,
  timeSignature: [4, 4],
  notes: [{ startBeat: 0, durationBeats: 1, stringIndex: 5, fret: 0 }],
};

describe("practice-presets-storage", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem(key: string) {
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
        removeItem(key: string) {
          store.delete(key);
        },
        clear() {
          store.clear();
        },
      },
    });
  });

  it("uses track id when available", () => {
    expect(getPracticePresetKey("bundled-one-note", DEMO_CHART)).toBe("track:bundled-one-note");
  });

  it("saves and loads a preset", () => {
    const key = getPracticePresetKey(null, DEMO_CHART);
    savePracticePreset(key, {
      schemaVersion: 1,
      speed: 1.2,
      pixelsPerSecond: 155,
      loopEnabled: true,
      loopABeat: 2,
      loopBBeat: 6,
      autoSpeedLoop: true,
      densityTier: "half",
      autoDensityBump: true,
      metronomeEnabled: true,
      backingAudioMuted: true,
      backingAudioVolume: 0.45,
    });
    expect(loadPracticePreset(key, 8)).toMatchObject({
      speed: 1.2,
      pixelsPerSecond: 155,
      loopEnabled: true,
      loopABeat: 2,
      loopBBeat: 6,
      autoSpeedLoop: true,
      densityTier: "half",
      autoDensityBump: true,
      metronomeEnabled: true,
      backingAudioMuted: true,
      backingAudioVolume: 0.45,
    });
  });

  it("returns defaults again after clearing", () => {
    const key = getPracticePresetKey(null, DEMO_CHART);
    savePracticePreset(key, {
      schemaVersion: 1,
      speed: 1.2,
      pixelsPerSecond: 155,
      loopEnabled: true,
      loopABeat: 2,
      loopBBeat: 6,
      autoSpeedLoop: false,
      densityTier: "three_quarters",
      autoDensityBump: false,
      metronomeEnabled: true,
      backingAudioMuted: false,
      backingAudioVolume: 0.3,
    });
    clearPracticePreset(key);
    expect(loadPracticePreset(key, 5)).toMatchObject({
      speed: 1,
      pixelsPerSecond: 140,
      loopEnabled: false,
      loopABeat: 0,
      loopBBeat: 5,
      densityTier: "full",
      metronomeEnabled: false,
    });
  });
});
