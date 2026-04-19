<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { onDestroy, onMount } from "svelte";
  import type { AudioPreferences, InputConnectionStatus, InputEventPayload } from "$lib/ipc";
  import {
    EVENT_AUDIO_INPUT_ERROR,
    EVENT_AUDIO_LEVEL,
    EVENT_INPUT_EVENT,
    inputEventIsMicPitchV1,
    inputEventIsMidiV1,
  } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";
  import ChartHighway from "./ChartHighway.svelte";
  import {
    ChartBeatMetronome,
    createMetronomeAudioContext,
    playMetronomeClick,
  } from "./chart-metronome";
  import { DEMO_CHART } from "./demo-chart";
  import {
    collectMissedNoteIndices,
    findHitNoteIndex,
    findRhythmHitNoteIndex,
    noteStartSeconds,
  } from "./midi-scoring";
  import {
    GRADE_COLOR,
    GRADE_LABEL,
    SCORING_MODE_LABEL,
    TIMING_BY_MODE,
    gradeHitTiming,
    type ScoringModeId,
    type TimingGrade,
  } from "./scoring-modes";
  import {
    clearSessionHistory,
    getSessionStats,
    loadLastSession,
    loadSessionHistory,
    saveLastSession,
    type SessionSummaryV1,
  } from "./session-storage";
  import {
    loadPracticeGoals,
    recordCompletedPracticeSession,
    setDailyGoalSessions,
    toPracticeGoalsSnapshot,
    type PracticeGoalsSnapshot,
  } from "$lib/practice-goals-storage";
  import { beatToSeconds, chartLengthBeats, chartLengthSeconds, secondsToBeat } from "./time";
  import type { FretflowChartV1 } from "./types";
  import { consumePendingPracticeChartJson } from "./practice-chart-transfer";
  import { validateChart } from "./validate";
  import { resolvePracticeChart } from "$lib/catalog/resolve-practice-chart";
  import {
    disposeBackingAudio,
    isBackingAudioLoaded,
    loadBackingAudio,
    playBackingAudio,
    setBackingAudioSpeed,
    setBackingAudioVolume,
    stopBackingAudio,
  } from "./chart-backing-audio";
  import { disposeBackingDrone, syncBackingDrone } from "./chart-backing-drone";
  import { getNextWaitEvent } from "./wait-to-play";
  import {
    applyDensityToChart,
    DENSITY_TIER_LABEL,
    nextDensityTier,
    type DensityTier,
  } from "./adaptive-density";
  import { getUpcomingChordNotes } from "./upcoming-chord";
  import ChordFretboard from "./ChordFretboard.svelte";

  type Props = {
    /** Library `?track=` id; when set, chart title/data resolve from catalog (demo notes for now). */
    trackId?: string | null;
  };
  let { trackId = null }: Props = $props();

  let chart: FretflowChartV1 = $state(DEMO_CHART);
  /** Thinned note set for highway + scoring; timeline length matches source `chart`. */
  let densityTier = $state<DensityTier>("full");
  let autoDensityBump = $state(false);
  const practiceChart = $derived(applyDensityToChart(chart, densityTier));

  const consumedNoteIndices = new Set<number>();
  const missedNoteIndices = new Set<number>();
  let hitIndicesDisplay = $state<number[]>([]);
  let missIndicesDisplay = $state<number[]>([]);
  let combo = $state(0);
  let lastFeedback = $state<string | null>(null);
  let scoringEnabled = $state(true);
  let scoringMode = $state<ScoringModeId>("practice");
  let micRhythmBeta = $state(false);
  let micPitchBeta = $state(false);
  let maxComboEver = 0;
  let lastAudioLevel = 0;
  let lastMicTriggerWall = 0;

  let midiUnlisten: UnlistenFn | null = null;
  let levelUnlisten: UnlistenFn | null = null;
  let unlistenAudioError: UnlistenFn | null = null;

  /** cpal / monitor thread failure (dismissible). */
  let audioStreamError = $state<string | null>(null);

  /** Refreshed on focus and on an interval while Practice is open (same command as the header pills). */
  let inputConn = $state<InputConnectionStatus | null>(null);
  let inputConnPoll: ReturnType<typeof setInterval> | null = null;

  let lastSessionSnapshot = $state<SessionSummaryV1 | null>(null);
  let sessionHistory = $state<SessionSummaryV1[]>([]);
  let showHistory = $state(false);
  function readGoalsSnapshot(): PracticeGoalsSnapshot {
    if (typeof window === "undefined") {
      return toPracticeGoalsSnapshot({
        schemaVersion: 1,
        dailyGoalSessions: 1,
        lastLocalDay: null,
        streakDays: 0,
        sessionsToday: 0,
      });
    }
    return toPracticeGoalsSnapshot(loadPracticeGoals());
  }
  let practiceGoals = $state<PracticeGoalsSnapshot>(readGoalsSnapshot());

  /** From Settings → Latency; applied to hit/miss only (highway unchanged). */
  let latencyOffsetMs = $state(0);

  let playing = $state(false);
  let speed = $state(1);
  let timeSec = $state(0);
  let anchorWallMs = 0;
  let anchorChartSec = 0;

  let loopEnabled = $state(false);
  let loopABeat = $state(0);
  let loopBBeat = $state(8);
  /** When loop wraps, raise speed if hit rate in the loop window was strong enough. */
  let autoSpeedLoop = $state(false);
  let loopPassHits = 0;
  let loopPassMisses = 0;
  const AUTO_SPEED_LOOP_STEP = 0.05;
  const AUTO_SPEED_LOOP_MAX = 1.25;
  const AUTO_SPEED_LOOP_MIN_ACCURACY = 0.88;

  /**
   * E2 — time stops at the next note group until the expected input(s) register (MIDI, mic pitch, or
   * mic rhythm). Chord: all notes in the `startBeat` group must be hit. Requires scoring on.
   */
  let waitToPlay = $state(false);
  let waitFrozen = $state(false);
  let waitFreezeT = 0;
  let waitGroupIndices = $state<number[]>([]);

  function clearWaitState() {
    waitFrozen = false;
    waitGroupIndices = [];
    waitFreezeT = 0;
  }

  function releaseWait() {
    const t0 = waitFreezeT;
    waitFrozen = false;
    waitGroupIndices = [];
    waitFreezeT = 0;
    anchorChartSec = t0;
    anchorWallMs = performance.now();
    timeSec = t0;
    if (metronomeEnabled) {
      beatMetronome.syncResume(t0, practiceChart.bpm);
    }
    if (playing && backingAudioAvailable && !backingAudioMuted) {
      playBackingAudio({ offsetSec: t0, speed, volume: backingAudioVolume });
    }
    syncPracticeBackingAudio();
  }

  let metronomeEnabled = $state(false);
  let metronomeCtx: AudioContext | null = null;
  const beatMetronome = new ChartBeatMetronome();

  let backingDroneEnabled = $state(false);
  let backingDroneMuted = $state(false);
  const backingLinearGain = 0.042;

  let backingAudioAvailable = $state(false);
  let backingAudioVolume = $state(0.7);
  let backingAudioMuted = $state(false);

  let pixelsPerSecond = $state(140);

  /** Last frame interval (ms) — large values mean background throttling */
  let lastFrameMs = $state(0);
  let lastFrameWall = 0;

  let rafId = 0;

  const totalSec = $derived(chartLengthSeconds(practiceChart));
  const totalBeats = $derived(chartLengthBeats(practiceChart));
  const timingWindows = $derived(TIMING_BY_MODE[scoringMode]);

  const upcomingChordNotes = $derived.by(() => {
    hitIndicesDisplay.length;
    missIndicesDisplay.length;
    timeSec;
    practiceChart.notes.length;
    return getUpcomingChordNotes(practiceChart, consumedNoteIndices, missedNoteIndices, timeSec);
  });

  const readinessIssues = $derived.by(() => {
    if (!isTauri()) return [];
    const c = inputConn;
    if (!c) return [];
    const out: string[] = [];
    const midiScoringPath = scoringEnabled && !micPitchBeta && !micRhythmBeta;
    if (midiScoringPath && !c.midiListenActive) {
      out.push(
        "MIDI scoring is on but no port is listening — open Settings → MIDI, pick a port, and press Start listening.",
      );
    }
    if (micPitchBeta && !c.inputMonitorActive) {
      out.push(
        "Mic pitch is on but the input monitor is off — open Settings → Audio input and press Start monitoring.",
      );
    }
    if (micRhythmBeta && !micPitchBeta && !c.inputMonitorActive) {
      out.push(
        "Mic rhythm is on but the input monitor is off — open Settings → Audio input and press Start monitoring.",
      );
    }
    if (micPitchBeta && c.inputMonitorActive && midiScoringPath && c.midiListenActive) {
      out.push(
        "Both MIDI and mic pitch are active — MIDI note_on events and mic pitch will both trigger scoring.",
      );
    }
    return out;
  });

  function resetScoringState(feedback: string | null = null) {
    consumedNoteIndices.clear();
    missedNoteIndices.clear();
    hitIndicesDisplay = [];
    missIndicesDisplay = [];
    combo = 0;
    maxComboEver = 0;
    lastFeedback = feedback;
  }

  /**
   * Loop-aware reset: clear scoring but pre-mark notes **outside** A–B as missed so they
   * are never re-judged (no false miss cascade on notes before `loopA`).
   */
  function resetScoringForLoop(loopASec: number, loopBSec: number) {
    consumedNoteIndices.clear();
    missedNoteIndices.clear();
    hitIndicesDisplay = [];
    missIndicesDisplay = [];
    combo = 0;
    maxComboEver = 0;
    lastFeedback = "Loop — scoring reset";
    for (let i = 0; i < practiceChart.notes.length; i++) {
      const ns = noteStartSeconds(practiceChart.notes[i]!, practiceChart.bpm);
      if (ns < loopASec - 0.01 || ns >= loopBSec + 0.01) {
        missedNoteIndices.add(i);
      }
    }
  }

  function applyMissesForTime(t: number) {
    if (!scoringEnabled) return;
    const newMisses = collectMissedNoteIndices(
      practiceChart,
      t,
      consumedNoteIndices,
      missedNoteIndices,
      timingWindows.lateMs,
      latencyOffsetMs,
    );
    if (newMisses.length === 0) return;
    for (const i of newMisses) {
      missedNoteIndices.add(i);
      if (loopEnabled && autoSpeedLoop && scoringEnabled && noteInLoopRange(i)) {
        loopPassMisses += 1;
      }
    }
    missIndicesDisplay = [...missIndicesDisplay, ...newMisses];
    combo = 0;
    lastFeedback =
      newMisses.length === 1 ? `Miss (note ${newMisses[0]! + 1})` : `Miss ×${newMisses.length}`;
  }

  let lastGrade = $state<TimingGrade | null>(null);
  let lastGradeKey = $state(0);

  function registerHit(hit: { index: number; deltaMs: number }, source: "midi" | "mic") {
    consumedNoteIndices.add(hit.index);
    hitIndicesDisplay = [...hitIndicesDisplay, hit.index];
    combo += 1;
    if (combo > maxComboEver) maxComboEver = combo;
    const grade = gradeHitTiming(Math.abs(hit.deltaMs));
    lastGrade = grade;
    lastGradeKey += 1;
    const sign = hit.deltaMs >= 0 ? "+" : "";
    const src = source === "mic" ? "Mic " : "";
    lastFeedback = `${src}${GRADE_LABEL[grade]}! ${sign}${hit.deltaMs.toFixed(0)} ms · combo ${combo}`;
    if (loopEnabled && autoSpeedLoop && scoringEnabled && playing && noteInLoopRange(hit.index)) {
      loopPassHits += 1;
    }
    if (waitFrozen) {
      waitGroupIndices = waitGroupIndices.filter((i) => i !== hit.index);
      if (waitGroupIndices.length === 0) {
        releaseWait();
      }
    }
  }

  const liveAccuracy = $derived.by(() => {
    const judged = hitIndicesDisplay.length + missIndicesDisplay.length;
    if (judged === 0) return null;
    return Math.round((100 * hitIndicesDisplay.length) / judged);
  });

  function handleInputScoring(ev: { payload: InputEventPayload }) {
    if (!scoringEnabled || !playing) return;
    const p = ev.payload;
    if (p.schemaVersion !== 1 || p.kind !== "note_on" || p.velocity === 0) return;

    const useMidi = inputEventIsMidiV1(p);
    const useMicPitch = micPitchBeta && inputEventIsMicPitchV1(p);
    if (!useMidi && !useMicPitch) return;

    const t = captureWallTime();
    const hit = findHitNoteIndex(
      practiceChart,
      t,
      p.note,
      consumedNoteIndices,
      missedNoteIndices,
      timingWindows,
      latencyOffsetMs,
    );
    if (!hit) return;
    if (waitFrozen) {
      const inGroup = waitGroupIndices.includes(hit.index);
      if (!inGroup) {
        lastFeedback = "Play the string(s) shown at the line to continue.";
        return;
      }
    }
    registerHit(hit, useMicPitch ? "mic" : "midi");
  }

  function handleAudioLevel(ev: { payload: number }) {
    if (!scoringEnabled || !playing || !micRhythmBeta || micPitchBeta) return;
    const level = Math.min(1, Math.max(0, ev.payload));
    const th = 0.34;
    const now = performance.now();
    if (now - lastMicTriggerWall < 95) {
      lastAudioLevel = level;
      return;
    }
    if (lastAudioLevel < th && level >= th) {
      lastMicTriggerWall = now;
      const t = captureWallTime();
      const hit = findRhythmHitNoteIndex(
        practiceChart,
        t,
        consumedNoteIndices,
        missedNoteIndices,
        timingWindows,
        latencyOffsetMs,
      );
      if (hit) {
        if (waitFrozen) {
          if (!waitGroupIndices.includes(hit.index)) {
            lastFeedback = "Play the string(s) at the line to continue.";
            lastAudioLevel = level;
            return;
          }
        }
        registerHit(hit, "mic");
      }
    }
    lastAudioLevel = level;
  }

  function resolveInputSourceLabel(): string {
    if (micPitchBeta) return "mic-pitch";
    if (micRhythmBeta) return "mic-rhythm";
    return "midi";
  }

  function finalizeSessionSummary() {
    if (!scoringEnabled) return;
    const hits = hitIndicesDisplay.length;
    const total = practiceChart.notes.length;
    if (total === 0) return;
    const misses = total - hits;
    const accuracyPercent = Math.round((100 * hits) / total);
    const summary: SessionSummaryV1 = {
      schemaVersion: 1,
      at: new Date().toISOString(),
      chartTitle: chart.title,
      scoringMode,
      hits,
      misses,
      accuracyPercent,
      maxCombo: maxComboEver,
      totalNotes: total,
      inputSource: resolveInputSourceLabel(),
    };
    saveLastSession(summary);
    lastSessionSnapshot = summary;
    sessionHistory = loadSessionHistory();
    practiceGoals = recordCompletedPracticeSession();
    if (autoDensityBump && accuracyPercent >= 85) {
      const nextTier = nextDensityTier(densityTier);
      if (nextTier) {
        densityTier = nextTier;
      }
    }
    lastFeedback = `Run complete · ${accuracyPercent}% · ${hits}/${total} hits · max combo ${maxComboEver}`;
  }

  function normalizeLoopBeats() {
    let a = loopABeat;
    let b = loopBBeat;
    if (a > b) [a, b] = [b, a];
    if (b - a < 0.25) b = a + 1;
    loopABeat = Math.max(0, a);
    loopBBeat = Math.min(totalBeats, Math.max(loopABeat + 0.25, b));
  }

  function noteInLoopRange(noteIndex: number): boolean {
    if (noteIndex < 0 || noteIndex >= practiceChart.notes.length) return false;
    const loopA = beatToSeconds(loopABeat, practiceChart.bpm);
    const loopB = beatToSeconds(loopBBeat, practiceChart.bpm);
    const ns = noteStartSeconds(practiceChart.notes[noteIndex]!, practiceChart.bpm);
    return ns >= loopA - 0.01 && ns < loopB + 0.01;
  }

  function resetLoopPassCounters() {
    loopPassHits = 0;
    loopPassMisses = 0;
  }

  function stopRaf() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  let prevTrackId: string | null | undefined = undefined;
  let bundledFetchSeq = 0;

  function resetPlayerToChart(next: FretflowChartV1) {
    clearWaitState();
    chart = next;
    playing = false;
    stopRaf();
    stopBackingAudio();
    timeSec = 0;
    anchorChartSec = 0;
    lastFrameWall = 0;
    lastAudioLevel = 0;
    lastMicTriggerWall = 0;
    loopABeat = 0;
    const maxB = chartLengthBeats(next);
    loopBBeat = Math.min(8, maxB);
    beatMetronome.syncAfterJump(0, next.bpm);
    resetLoopPassCounters();
    resetScoringState(null);
    syncPracticeBackingAudio();
    void loadChartBackingAudio(next);
  }

  async function loadChartBackingAudio(c: FretflowChartV1) {
    if (c.backingAudioUrl) {
      backingAudioAvailable = await loadBackingAudio(c.backingAudioUrl);
    } else {
      backingAudioAvailable = false;
    }
  }

  function syncFileBackingAudio() {
    if (waitFrozen) {
      stopBackingAudio();
      return;
    }
    if (!backingAudioAvailable || !isBackingAudioLoaded()) return;
    if (!playing) {
      stopBackingAudio();
      return;
    }
    const vol = backingAudioMuted ? 0 : backingAudioVolume;
    setBackingAudioVolume(vol);
    setBackingAudioSpeed(speed);
  }

  $effect(() => {
    const id = trackId ?? null;

    const pendingRaw = consumePendingPracticeChartJson();
    if (pendingRaw != null) {
      try {
        const data = JSON.parse(pendingRaw) as unknown;
        if (validateChart(data)) {
          resetPlayerToChart(data);
          prevTrackId = id;
          return;
        }
      } catch {
        /* ignore */
      }
    }

    if (prevTrackId === id) return;
    prevTrackId = id;

    const resolved = resolvePracticeChart(id);
    const bundledUrl = resolved.bundledChartUrl;
    if (bundledUrl) {
      const seq = ++bundledFetchSeq;
      resetPlayerToChart(resolved.chart);
      void (async () => {
        try {
          const r = await fetch(bundledUrl);
          if (seq !== bundledFetchSeq) return;
          const data = (await r.json()) as unknown;
          if (seq !== bundledFetchSeq) return;
          if (validateChart(data)) {
            resetPlayerToChart(data);
          } else {
            resetScoringState("Bundled chart failed validation — loaded embedded demo.");
            resetPlayerToChart(DEMO_CHART);
          }
        } catch {
          if (seq !== bundledFetchSeq) return;
          resetScoringState("Could not load bundled chart — loaded embedded demo.");
          resetPlayerToChart(DEMO_CHART);
        }
      })();
      return;
    }

    resetPlayerToChart(resolved.chart);
  });

  function syncPracticeBackingAudio() {
    const effectivePlaying = playing && !waitFrozen;
    syncBackingDrone({
      playing: effectivePlaying,
      enabled: backingDroneEnabled,
      muted: backingDroneMuted,
      linearGain: backingLinearGain,
    });
  }

  function captureWallTime() {
    if (waitFrozen) return waitFreezeT;
    const now = performance.now();
    return anchorChartSec + ((now - anchorWallMs) / 1000) * speed;
  }

  function getMetronomeCtx(): AudioContext | null {
    if (!metronomeEnabled) return null;
    if (metronomeCtx?.state === "closed") metronomeCtx = null;
    if (!metronomeCtx) metronomeCtx = createMetronomeAudioContext();
    return metronomeCtx;
  }

  function maybePlayMetronomeClick(t: number) {
    if (!metronomeEnabled || !playing) return;
    if (!beatMetronome.tick(t, practiceChart.bpm)) return;
    const ctx = getMetronomeCtx();
    if (!ctx) return;
    void ctx.resume().then(() => {
      if (metronomeCtx === ctx && ctx.state !== "closed") playMetronomeClick(ctx);
    });
  }

  function onMetronomeEnabledChange() {
    if (metronomeEnabled && playing) {
      beatMetronome.syncResume(captureWallTime(), practiceChart.bpm);
    }
  }

  function tickFrame() {
    if (!playing) return;
    const now = performance.now();
    if (lastFrameWall > 0) {
      lastFrameMs = now - lastFrameWall;
    }
    lastFrameWall = now;

    if (waitFrozen) {
      const t0 = waitFreezeT;
      anchorChartSec = t0;
      anchorWallMs = now;
      applyMissesForTime(t0);
      timeSec = t0;
      syncPracticeBackingAudio();
      syncFileBackingAudio();
      rafId = requestAnimationFrame(tickFrame);
      return;
    }

    const loopA = beatToSeconds(loopABeat, practiceChart.bpm);
    const loopB = beatToSeconds(loopBBeat, practiceChart.bpm);

    let t = anchorChartSec + ((now - anchorWallMs) / 1000) * speed;

    if (loopEnabled && loopB > loopA && t >= loopB) {
      clearWaitState();
      let speedBumped = false;
      if (autoSpeedLoop && scoringEnabled) {
        const attempts = loopPassHits + loopPassMisses;
        if (attempts >= 1) {
          const acc = loopPassHits / attempts;
          if (acc >= AUTO_SPEED_LOOP_MIN_ACCURACY && speed < AUTO_SPEED_LOOP_MAX) {
            speed = Math.round((Math.min(AUTO_SPEED_LOOP_MAX, speed + AUTO_SPEED_LOOP_STEP) * 100)) / 100;
            speedBumped = true;
          }
        }
      }
      resetLoopPassCounters();
      resetScoringForLoop(loopA, loopB);
      if (speedBumped) {
        lastFeedback = `Loop — scoring reset · speed ${speed.toFixed(2)}×`;
      }
      const span = loopB - loopA;
      t = loopA + ((t - loopA) % span);
      anchorChartSec = t;
      anchorWallMs = now;
      beatMetronome.syncAfterJump(t, practiceChart.bpm);
      if (backingAudioAvailable && !backingAudioMuted) {
        playBackingAudio({ offsetSec: t, speed, volume: backingAudioVolume });
      }
    } else if (!loopEnabled && t >= totalSec) {
      t = totalSec;
      clearWaitState();
      const lateSec = timingWindows.lateMs / 1000;
      applyMissesForTime(t + lateSec);
      finalizeSessionSummary();
      playing = false;
      stopRaf();
      stopBackingAudio();
      anchorChartSec = t;
      timeSec = t;
      lastFrameWall = 0;
      syncPracticeBackingAudio();
      return;
    }

    if (waitToPlay && scoringEnabled && !waitFrozen) {
      const nxt = getNextWaitEvent(practiceChart, consumedNoteIndices, missedNoteIndices);
      if (nxt && t + 0.0001 >= nxt.tVis) {
        t = nxt.tVis;
        waitFreezeT = t;
        waitFrozen = true;
        waitGroupIndices = nxt.group;
        const n = nxt.group.length;
        lastFeedback = n === 1 ? "Hold — play this note" : `Hold — play this chord (${n} notes)`;
        stopBackingAudio();
        anchorChartSec = t;
        anchorWallMs = now;
        applyMissesForTime(t);
        timeSec = t;
        syncPracticeBackingAudio();
        syncFileBackingAudio();
        rafId = requestAnimationFrame(tickFrame);
        return;
      }
    }

    if (!waitFrozen) {
      maybePlayMetronomeClick(t);
    }
    applyMissesForTime(t);
    timeSec = t;
    syncPracticeBackingAudio();
    rafId = requestAnimationFrame(tickFrame);
  }

  function togglePlay() {
    if (playing) {
      if (waitFrozen) {
        timeSec = waitFreezeT;
      } else {
        timeSec = captureWallTime();
      }
      clearWaitState();
      playing = false;
      stopRaf();
      stopBackingAudio();
      lastFrameWall = 0;
      syncPracticeBackingAudio();
    } else {
      if (timeSec >= totalSec && !loopEnabled) {
        timeSec = 0;
        resetScoringState(null);
      }
      anchorChartSec = timeSec;
      anchorWallMs = performance.now();
      lastFrameWall = 0;
      if (anchorChartSec < 0.05) {
        beatMetronome.syncAfterJump(anchorChartSec, practiceChart.bpm);
      } else {
        beatMetronome.syncResume(anchorChartSec, practiceChart.bpm);
      }
      playing = true;
      rafId = requestAnimationFrame(tickFrame);
      syncPracticeBackingAudio();
      if (backingAudioAvailable && !backingAudioMuted) {
        playBackingAudio({
          offsetSec: anchorChartSec,
          speed,
          volume: backingAudioVolume,
        });
      }
    }
  }

  function restart() {
    clearWaitState();
    playing = false;
    stopRaf();
    stopBackingAudio();
    timeSec = 0;
    anchorChartSec = 0;
    lastFrameWall = 0;
    lastAudioLevel = 0;
    lastMicTriggerWall = 0;
    beatMetronome.syncAfterJump(0, practiceChart.bpm);
    resetLoopPassCounters();
    resetScoringState(null);
    syncPracticeBackingAudio();
  }

  function setDensityTierUser(tier: DensityTier) {
    if (tier === densityTier) return;
    densityTier = tier;
    if (playing) {
      restart();
    } else {
      resetScoringState("Density changed — scoring reset.");
    }
  }

  async function persistBackingDronePrefs() {
    if (!isTauri()) return;
    try {
      const p = await invoke<AudioPreferences>("get_audio_preferences");
      await invoke("set_audio_preferences", {
        prefs: {
          ...p,
          backingDroneEnabled,
          backingDroneMuted,
        },
      });
    } catch {
      /* ignore */
    }
  }

  function onBackingDroneEnabledChange(ev: Event) {
    backingDroneEnabled = (ev.currentTarget as HTMLInputElement).checked;
    if (!backingDroneEnabled) backingDroneMuted = false;
    void persistBackingDronePrefs();
    syncPracticeBackingAudio();
  }

  function onBackingDroneMutedChange(ev: Event) {
    backingDroneMuted = (ev.currentTarget as HTMLInputElement).checked;
    void persistBackingDronePrefs();
    syncPracticeBackingAudio();
  }

  function setLoopA() {
    loopABeat = secondsToBeat(timeSec, practiceChart.bpm);
    normalizeLoopBeats();
  }

  function setLoopB() {
    loopBBeat = secondsToBeat(timeSec, practiceChart.bpm);
    normalizeLoopBeats();
  }

  $effect(() => {
    loopBBeat;
    totalBeats;
    if (loopBBeat > totalBeats) loopBBeat = totalBeats;
  });

  $effect(() => {
    if (!loopEnabled && autoSpeedLoop) {
      autoSpeedLoop = false;
    }
    if (!autoSpeedLoop) {
      resetLoopPassCounters();
    }
  });

  $effect(() => {
    if (!scoringEnabled) {
      waitToPlay = false;
    }
  });

  /** Optional: load JSON from file input (Phase 3 local test) */
  function onChartFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (validateChart(data)) {
          chart = data;
          loopABeat = 0;
          loopBBeat = Math.min(chartLengthBeats(data), loopBBeat);
          restart();
        }
      } catch {
        /* ignore */
      }
    };
    reader.readAsText(file);
    input.value = "";
  }

  async function refreshCalibrationFromPrefs() {
    if (!isTauri()) {
      latencyOffsetMs = 0;
      return;
    }
    try {
      const p = await invoke<AudioPreferences>("get_audio_preferences");
      latencyOffsetMs = p.latencyOffsetMs;
      backingDroneEnabled = p.backingDroneEnabled ?? false;
      backingDroneMuted = p.backingDroneMuted ?? false;
    } catch {
      /* keep previous */
    }
  }

  async function refreshInputConnection() {
    if (!isTauri()) return;
    try {
      inputConn = await invoke<InputConnectionStatus>("get_input_connection_status");
    } catch {
      inputConn = null;
    }
  }

  function onWindowFocusPractice() {
    void refreshCalibrationFromPrefs();
    void refreshInputConnection();
  }

  onMount(() => {
    lastSessionSnapshot = loadLastSession();
    sessionHistory = loadSessionHistory();
    practiceGoals = readGoalsSnapshot();
    void refreshCalibrationFromPrefs();
    window.addEventListener("focus", onWindowFocusPractice);
    void (async () => {
      if (isTauri()) {
        void refreshInputConnection();
        inputConnPoll = setInterval(() => void refreshInputConnection(), 2500);
        midiUnlisten = await listen<InputEventPayload>(EVENT_INPUT_EVENT, handleInputScoring);
        levelUnlisten = await listen<number>(EVENT_AUDIO_LEVEL, handleAudioLevel);
        unlistenAudioError = await listen<string>(EVENT_AUDIO_INPUT_ERROR, (ev) => {
          audioStreamError = ev.payload;
        });
      }
    })();
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", onWindowFocusPractice);
    }
    if (inputConnPoll != null) {
      clearInterval(inputConnPoll);
      inputConnPoll = null;
    }
    stopRaf();
    midiUnlisten?.();
    levelUnlisten?.();
    unlistenAudioError?.();
    disposeBackingAudio();
    disposeBackingDrone();
    void metronomeCtx?.close();
    metronomeCtx = null;
  });
</script>

<div class="practice-player">
  <div class="row" style="margin-bottom: 0.75rem; justify-content: space-between; flex-wrap: wrap">
    <div>
      <h2 style="margin: 0; font-size: 1.05rem">{chart.title}</h2>
      <p class="muted" style="margin: 0.25rem 0 0">
        {practiceChart.bpm} BPM · {practiceChart.timeSignature[0]}/{practiceChart.timeSignature[1]} · {totalBeats.toFixed(1)} beats
        {#if densityTier !== "full"}
          <span> · Density <strong>{DENSITY_TIER_LABEL[densityTier]}</strong></span>
        {/if}
      </p>
    </div>
    <div class="row">
      <button type="button" class="btn btn-primary" onclick={togglePlay}>
        {playing ? "Pause" : "Play"}
      </button>
      <button type="button" class="btn" onclick={restart}>Restart</button>
    </div>
  </div>

  <ChartHighway
    chart={practiceChart}
    {timeSec}
    {pixelsPerSecond}
    hitIndices={hitIndicesDisplay}
    missIndices={missIndicesDisplay}
  />

  {#if upcomingChordNotes.length >= 2}
    <ChordFretboard notes={upcomingChordNotes} />
  {/if}

  {#if isTauri() && audioStreamError}
    <div class="practice-audio-error" role="alert">
      <div class="practice-audio-error__row">
        <p class="practice-audio-error__text"><strong>Input monitor error.</strong> {audioStreamError}</p>
        <button type="button" class="btn" onclick={() => (audioStreamError = null)}>Dismiss</button>
      </div>
      <p class="muted practice-audio-error__hint">
        Fix device or stream settings in <a href="/settings">Settings</a>, then start monitoring again.
      </p>
    </div>
  {/if}

  {#if isTauri() && readinessIssues.length > 0}
    <div class="practice-readiness" role="status">
      <p class="practice-readiness__title">Before you play</p>
      <ul class="practice-readiness__list">
        {#each readinessIssues as line}
          <li>{line}</li>
        {/each}
      </ul>
      <p class="practice-readiness__link muted">
        <a href="/settings">Open Settings</a>
        — Mic and MIDI status also appear as pills in the header.
      </p>
    </div>
  {/if}

  <div class="scoring-block">
    <label class="row" style="gap: 0.5rem; cursor: pointer; margin-bottom: 0.5rem"
      title="When on, incoming notes are matched against the chart. MIDI works out of the box; mic modes are optional betas below."
    >
      <input type="checkbox" bind:checked={scoringEnabled} />
      <span>Scoring</span>
      <span class="muted" style="font-size: 0.85rem">MIDI by default; optional mic modes below</span>
    </label>
    {#if isTauri()}
      <p class="muted" style="margin: 0 0 0.5rem; font-size: 0.82rem">
        Latency offset: <strong>{latencyOffsetMs} ms</strong> (Settings → Latency). Shifts hit/miss timing only; highway is unchanged.
      </p>
    {/if}
    <div class="scoring-stats">
      <div class="scoring-stats__row">
        <span>Hits <strong>{hitIndicesDisplay.length}</strong></span>
        <span>Misses <strong>{missIndicesDisplay.length}</strong></span>
        <span>Combo <strong>{combo}</strong></span>
        {#if liveAccuracy != null}
          <span class="scoring-accuracy">{liveAccuracy}%</span>
        {/if}
      </div>
      {#if liveAccuracy != null}
        <div class="accuracy-bar">
          <div
            class="accuracy-bar__fill"
            style="width: {liveAccuracy}%; background: {liveAccuracy >= 90 ? '#3dd68c' : liveAccuracy >= 70 ? '#3d8bfd' : liveAccuracy >= 50 ? '#fbbf24' : '#f87171'}"
          ></div>
        </div>
      {/if}
    </div>
    {#if lastGrade && lastFeedback && !lastFeedback.startsWith("Miss") && !lastFeedback.startsWith("Loop") && !lastFeedback.startsWith("Run") && !lastFeedback.startsWith("Hold") && !lastFeedback.startsWith("Density")}
      {#key lastGradeKey}
        <div class="grade-flash" style="color: {GRADE_COLOR[lastGrade]}">
          {GRADE_LABEL[lastGrade]}!
        </div>
      {/key}
    {/if}
    {#if lastFeedback}
      <p
        class="last-feedback"
        class:last-feedback--hit={!lastFeedback.startsWith("Miss") && !lastFeedback.startsWith("Loop") && !lastFeedback.startsWith("Run") && !lastFeedback.startsWith("Density")}
        class:last-feedback--miss={lastFeedback.startsWith("Miss")}
        class:last-feedback--loop={lastFeedback.startsWith("Loop")}
        class:last-feedback--summary={lastFeedback.startsWith("Run complete")}
        style="margin: 0 0 0.5rem"
      >
        {lastFeedback}
      </p>
    {/if}
    <div class="mode-row" style="margin-bottom: 0.65rem">
      <span class="muted" style="margin-right: 0.5rem">Accuracy</span>
      {#each (["practice", "performance"] as ScoringModeId[]) as m (m)}
        <label class="row" style="gap: 0.35rem; margin-right: 1rem; cursor: pointer">
          <input type="radio" name="scoring-mode" value={m} bind:group={scoringMode} />
          <span>{m === "practice" ? "Practice" : "Performance"}</span>
        </label>
      {/each}
      <span class="muted" style="font-size: 0.8rem">{SCORING_MODE_LABEL[scoringMode]}</span>
    </div>
    {#if isTauri()}
      <label class="row" style="gap: 0.5rem; cursor: pointer; margin-bottom: 0.5rem"
        title="Triggers hits on audio level peaks (timing only, no pitch). Needs input monitor running in Settings."
      >
        <input type="checkbox" bind:checked={micRhythmBeta} disabled={micPitchBeta} />
        <span>Mic rhythm (beta)</span>
        <span class="muted" style="font-size: 0.8rem">level peaks only; disabled when mic pitch is on</span>
      </label>
      <label class="row" style="gap: 0.5rem; cursor: pointer; margin-bottom: 0.5rem"
        title="Uses YIN pitch detection on the mic input to match MIDI notes in the chart. Needs input monitor running in Settings."
      >
        <input type="checkbox" bind:checked={micPitchBeta} disabled={micRhythmBeta} />
        <span>Mic pitch (beta)</span>
        <span class="muted" style="font-size: 0.8rem">monitor + YIN pitch detection → same scoring as MIDI</span>
      </label>
    {/if}
    <label
      class="row"
      style="gap: 0.5rem; cursor: pointer; margin-bottom: 0.5rem"
      title="Chart time and backing pause when the next note reaches the play line, until the correct string(s) register. Chords need each string. Turn scoring on."
    >
      <input type="checkbox" bind:checked={waitToPlay} disabled={!scoringEnabled} />
      <span>Wait to play</span>
      <span class="muted" style="font-size: 0.8rem">unfreezes after you hit the note(s) at the line (no time pressure on new licks)</span>
    </label>
    <div class="density-block">
      <p class="muted" style="margin: 0 0 0.35rem; font-size: 0.82rem">
        <strong>Adaptive density</strong> — fewer notes in the same timeline (backing unchanged). Use 50% / 75% while learning, then full chart.
      </p>
      <div class="row" style="flex-wrap: wrap; gap: 0.35rem 1.1rem; align-items: center">
        {#each (["full", "three_quarters", "half"] as const) as tier (tier)}
          <label class="row" style="gap: 0.35rem; cursor: pointer">
            <input
              type="radio"
              name="density-tier"
              checked={densityTier === tier}
              onchange={() => setDensityTierUser(tier)}
            />
            <span>{DENSITY_TIER_LABEL[tier]}</span>
          </label>
        {/each}
      </div>
      <label class="row" style="gap: 0.5rem; margin-top: 0.45rem; cursor: pointer">
        <input type="checkbox" bind:checked={autoDensityBump} disabled={densityTier === "full"} />
        <span class="muted" style="font-size: 0.8rem">After each full run at ≥85%, step up one level (toward 100%)</span>
      </label>
    </div>
    {#if waitFrozen && waitGroupIndices.length > 0}
      <p class="wait-hold-banner" role="status">
        Paused: play <strong>{waitGroupIndices.length}</strong> more note{waitGroupIndices.length === 1
          ? ""
          : "s"} on the string(s) at the line, then the chart continues.
      </p>
    {/if}
    <p class="muted" style="margin: 0; font-size: 0.85rem">
      {#if isTauri()}
        MIDI: <strong>Settings → MIDI → Start listening</strong>. Mic: <strong>Settings → Start monitoring</strong>
        (rhythm and/or pitch betas).
      {:else}
        Scoring needs the desktop app (MIDI and mic use Tauri events).
      {/if}
    </p>
  </div>

  <div class="practice-goals panel-inner">
    <h3 style="margin: 0 0 0.45rem; font-size: 0.95rem">Daily goal &amp; streak</h3>
    <div class="practice-goals__row">
      <span>Today: <strong>{practiceGoals.progressToday}</strong> sessions</span>
      {#if practiceGoals.goalMetToday}
        <span class="practice-goals__met">Daily goal met</span>
      {/if}
    </div>
    <p class="muted" style="margin: 0.35rem 0 0.5rem; font-size: 0.82rem">
      Streak: <strong>{practiceGoals.streakDays}</strong> day{practiceGoals.streakDays === 1 ? "" : "s"} with practice
      (local calendar). Counts when you finish a full chart run.
    </p>
    <label class="row" style="gap: 0.5rem; align-items: center; flex-wrap: wrap">
      <span class="muted" style="font-size: 0.82rem">Sessions per day target</span>
      <select
        class="practice-goals__select"
        value={String(practiceGoals.dailyGoalSessions)}
        onchange={(ev) => {
          const n = Number((ev.currentTarget as HTMLSelectElement).value);
          practiceGoals = toPracticeGoalsSnapshot(setDailyGoalSessions(n));
        }}
      >
        {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as n (n)}
          <option value={String(n)}>{n}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if lastSessionSnapshot || sessionHistory.length > 0}
    {@const stats = getSessionStats(sessionHistory)}
    <div class="session-history panel-inner">
      <div class="row" style="justify-content: space-between; align-items: center; margin-bottom: 0.5rem">
        <h3 style="margin: 0; font-size: 0.95rem">Practice history</h3>
        <div class="row" style="gap: 0.5rem">
          {#if sessionHistory.length > 0}
            <button type="button" class="btn" style="font-size: 0.78rem; padding: 0.25rem 0.55rem" onclick={() => (showHistory = !showHistory)}>
              {showHistory ? "Hide" : `Show all (${sessionHistory.length})`}
            </button>
            <button type="button" class="btn" style="font-size: 0.78rem; padding: 0.25rem 0.55rem; color: var(--ff-muted)"
              onclick={() => { clearSessionHistory(); lastSessionSnapshot = null; sessionHistory = []; showHistory = false; }}
            >Clear</button>
          {/if}
        </div>
      </div>
      {#if stats.totalSessions > 0}
        <div class="history-stats">
          <span><strong>{stats.totalSessions}</strong> sessions</span>
          <span><strong>{stats.uniqueCharts}</strong> charts</span>
          {#if stats.averageAccuracy != null}
            <span>avg <strong>{stats.averageAccuracy}%</strong></span>
          {/if}
          {#if stats.bestAccuracy != null}
            <span>best <strong>{stats.bestAccuracy}%</strong></span>
          {/if}
          <span>top combo <strong>{stats.bestCombo}</strong></span>
        </div>
      {/if}
      {#if lastSessionSnapshot && !showHistory}
        <div class="history-entry">
          <div class="history-entry__title">{lastSessionSnapshot.chartTitle}</div>
          <div class="history-entry__meta">
            {lastSessionSnapshot.accuracyPercent}% · {lastSessionSnapshot.hits}/{lastSessionSnapshot.totalNotes ?? (lastSessionSnapshot.hits + lastSessionSnapshot.misses)} hits · combo {lastSessionSnapshot.maxCombo}
            · {lastSessionSnapshot.scoringMode}
            {#if lastSessionSnapshot.inputSource} · {lastSessionSnapshot.inputSource}{/if}
          </div>
          <div class="history-entry__time">{new Date(lastSessionSnapshot.at).toLocaleString()}</div>
        </div>
      {/if}
      {#if showHistory}
        <ul class="history-list">
          {#each sessionHistory as s, i (s.at + i)}
            <li class="history-entry">
              <div class="history-entry__title">{s.chartTitle}</div>
              <div class="history-entry__meta">
                {s.accuracyPercent}% · {s.hits}/{s.totalNotes ?? (s.hits + s.misses)} hits · combo {s.maxCombo}
                · {s.scoringMode}
                {#if s.inputSource} · {s.inputSource}{/if}
              </div>
              <div class="history-entry__time">{new Date(s.at).toLocaleString()}</div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}

  <div class="panel-inner">
    <label class="row" style="gap: 0.5rem; margin-bottom: 0.5rem; cursor: pointer">
      <input
        type="checkbox"
        bind:checked={metronomeEnabled}
        onchange={onMetronomeEnabledChange}
      />
      <span>Metronome</span>
      <span class="muted" style="font-size: 0.8rem">quarter clicks in chart time (respects speed)</span>
    </label>

    {#if backingAudioAvailable}
      <label class="row" style="gap: 0.5rem; margin-bottom: 0.35rem; cursor: pointer">
        <input
          type="checkbox"
          checked={!backingAudioMuted}
          onchange={(ev) => { backingAudioMuted = !(ev.currentTarget as HTMLInputElement).checked; syncFileBackingAudio(); }}
        />
        <span>Backing track</span>
        <span class="muted" style="font-size: 0.8rem">audio file bundled with chart</span>
      </label>
      <label class="row" style="gap: 0.75rem; align-items: center; margin-bottom: 0.65rem; padding-left: 1.5rem">
        <span class="muted" style="font-size: 0.82rem">Volume</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={backingAudioVolume}
          oninput={() => syncFileBackingAudio()}
          style="flex: 1; max-width: 10rem"
        />
        <span class="muted" style="min-width: 2.5rem; font-size: 0.82rem; font-variant-numeric: tabular-nums">{Math.round(backingAudioVolume * 100)}%</span>
      </label>
    {:else}
      <label class="row" style="gap: 0.5rem; margin-bottom: 0.35rem; cursor: pointer"
        title="Low E sine reference tone — replaced by a real backing track when the chart includes one"
      >
        <input
          type="checkbox"
          checked={backingDroneEnabled}
          onchange={onBackingDroneEnabledChange}
        />
        <span>Backing drone</span>
        <span class="muted" style="font-size: 0.8rem">reference tone (no backing track on this chart)</span>
      </label>
      <label class="row" style="gap: 0.5rem; margin-bottom: 0.65rem; cursor: pointer; padding-left: 1.5rem">
        <input
          type="checkbox"
          checked={backingDroneMuted}
          disabled={!backingDroneEnabled}
          onchange={onBackingDroneMutedChange}
        />
        <span>Mute drone</span>
      </label>
    {/if}

    <label class="row" style="gap: 0.75rem; align-items: center; margin-bottom: 0.65rem">
      <span class="muted" style="min-width: 5rem">Speed</span>
      <input
        type="range"
        min="0.5"
        max="1.5"
        step="0.05"
        bind:value={speed}
        disabled={playing}
        style="flex: 1; max-width: 14rem"
      />
      <span style="min-width: 2.5rem; font-variant-numeric: tabular-nums">{speed.toFixed(2)}×</span>
    </label>

    <label class="row" style="gap: 0.75rem; align-items: center; margin-bottom: 0.65rem">
      <span class="muted" style="min-width: 5rem">Scroll</span>
      <input
        type="range"
        min="80"
        max="220"
        step="5"
        bind:value={pixelsPerSecond}
        style="flex: 1; max-width: 14rem"
      />
      <span class="muted" style="min-width: 3rem">{pixelsPerSecond} px/s</span>
    </label>

    <p class="muted" style="margin: 0 0 0.5rem; font-size: 0.85rem">
      Time {timeSec.toFixed(2)}s / {totalSec.toFixed(2)}s · wall-clock playback
      {#if playing && lastFrameMs > 64}
        · frame {lastFrameMs.toFixed(0)} ms (tab may throttle in background)
      {/if}
    </p>

    <div class="loop-block">
      <label class="row" style="gap: 0.5rem; margin-bottom: 0.5rem; cursor: pointer">
        <input type="checkbox" bind:checked={loopEnabled} />
        <span>Loop A–B</span>
      </label>
      <label class="row" style="gap: 0.5rem; margin-bottom: 0.5rem; cursor: pointer; padding-left: 1.5rem">
        <input type="checkbox" bind:checked={autoSpeedLoop} disabled={!loopEnabled} />
        <span>Auto speed in loop</span>
        <span class="muted" style="font-size: 0.78rem"
          >+{AUTO_SPEED_LOOP_STEP.toFixed(2)}× when a pass is ≥{Math.round(
            AUTO_SPEED_LOOP_MIN_ACCURACY * 100,
          )}% hits in the loop (cap {AUTO_SPEED_LOOP_MAX}×)</span
        >
      </label>
      <div class="row" style="flex-wrap: wrap; gap: 0.5rem; align-items: center">
        <span class="muted">A</span>
        <input
          type="number"
          step="0.25"
          bind:value={loopABeat}
          onchange={normalizeLoopBeats}
          style="width: 4.5rem; padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--ff-border); background: var(--ff-bg); color: var(--ff-text)"
        />
        <span class="muted">B</span>
        <input
          type="number"
          step="0.25"
          bind:value={loopBBeat}
          onchange={normalizeLoopBeats}
          style="width: 4.5rem; padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--ff-border); background: var(--ff-bg); color: var(--ff-text)"
        />
        <button type="button" class="btn" onclick={setLoopA}>Set A here</button>
        <button type="button" class="btn" onclick={setLoopB}>Set B here</button>
      </div>
    </div>

    <p class="muted" style="margin: 0.75rem 0 0; font-size: 0.85rem">
      Load chart JSON (schema v1):
      <input type="file" accept="application/json,.json" onchange={onChartFile} style="margin-left: 0.35rem" />
    </p>
  </div>
</div>

<style>
  .practice-player {
    margin-bottom: 1rem;
  }
  .panel-inner {
    margin-top: 1rem;
    padding: 0;
  }
  .loop-block {
    padding-top: 0.35rem;
    border-top: 1px solid var(--ff-border);
  }
  .scoring-block {
    margin-top: 1rem;
    padding: 0.85rem 0 0;
    border-top: 1px solid var(--ff-border);
  }
  .wait-hold-banner {
    margin: 0.35rem 0 0.5rem;
    font-size: 0.86rem;
    line-height: 1.4;
    padding: 0.5rem 0.65rem;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--ff-accent) 50%, var(--ff-border));
    background: color-mix(in srgb, var(--ff-accent) 10%, var(--ff-surface));
    color: var(--ff-text);
  }
  .last-feedback {
    font-size: 0.9rem;
    color: var(--ff-muted);
  }
  .last-feedback--hit {
    color: var(--ff-success);
  }
  .last-feedback--miss {
    color: #f87171;
  }
  .last-feedback--loop {
    color: var(--ff-accent);
  }
  .last-feedback--summary {
    color: var(--ff-accent);
  }
  .mode-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem;
  }
  .practice-readiness {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, #f59e0b 55%, var(--ff-border));
    background: color-mix(in srgb, #f59e0b 12%, var(--ff-surface));
  }
  .practice-readiness__title {
    margin: 0 0 0.4rem;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--ff-text);
  }
  .practice-readiness__list {
    margin: 0 0 0.5rem;
    padding-left: 1.2rem;
    font-size: 0.86rem;
    color: var(--ff-text);
    line-height: 1.45;
  }
  .practice-readiness__link {
    margin: 0;
    font-size: 0.82rem;
  }
  .practice-audio-error {
    margin-top: 1rem;
    padding: 0.75rem 1rem;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, #f87171 50%, var(--ff-border));
    background: color-mix(in srgb, #f87171 10%, var(--ff-surface));
  }
  .practice-audio-error__row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }
  .practice-audio-error__text {
    margin: 0;
    flex: 1;
    min-width: 12rem;
    font-size: 0.86rem;
    color: var(--ff-text);
    line-height: 1.45;
  }
  .practice-audio-error__hint {
    margin: 0.5rem 0 0;
    font-size: 0.82rem;
  }
  .scoring-stats {
    margin: 0 0 0.5rem;
  }
  .scoring-stats__row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1rem;
    font-variant-numeric: tabular-nums;
    font-size: 0.95rem;
    align-items: center;
  }
  .scoring-accuracy {
    font-weight: 700;
    font-size: 1.05rem;
    color: var(--ff-text);
  }
  .accuracy-bar {
    margin-top: 0.4rem;
    height: 6px;
    border-radius: 3px;
    background: var(--ff-border);
    overflow: hidden;
    max-width: 20rem;
  }
  .accuracy-bar__fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.2s ease, background 0.3s ease;
  }
  .grade-flash {
    font-size: 1.3rem;
    font-weight: 800;
    letter-spacing: 0.02em;
    margin: 0.15rem 0 0.25rem;
    animation: grade-pop 0.4s ease-out;
  }
  @keyframes grade-pop {
    0% { transform: scale(1.5); opacity: 0.5; }
    50% { transform: scale(1.1); opacity: 1; }
    100% { transform: scale(1); opacity: 1; }
  }
  .density-block {
    margin-top: 0.65rem;
    padding-top: 0.65rem;
    border-top: 1px solid color-mix(in srgb, var(--ff-border) 70%, transparent);
  }
  .session-history {
    margin-top: 0.75rem;
    padding: 0.75rem 0 0;
    border-top: 1px solid var(--ff-border);
  }
  .history-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    font-size: 0.85rem;
    color: var(--ff-muted);
    margin-bottom: 0.6rem;
  }
  .history-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 18rem;
    overflow-y: auto;
  }
  .history-entry {
    padding: 0.45rem 0;
    border-bottom: 1px solid color-mix(in srgb, var(--ff-border) 50%, transparent);
  }
  .history-entry:last-child {
    border-bottom: none;
  }
  .history-entry__title {
    font-weight: 600;
    font-size: 0.9rem;
    color: var(--ff-text);
  }
  .history-entry__meta {
    font-size: 0.82rem;
    color: var(--ff-muted);
    margin-top: 0.1rem;
  }
  .history-entry__time {
    font-size: 0.75rem;
    color: var(--ff-muted);
    opacity: 0.7;
    margin-top: 0.1rem;
  }
  .practice-goals {
    margin-top: 1rem;
    padding: 0.75rem 0 0;
    border-top: 1px solid var(--ff-border);
  }
  .practice-goals__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    font-size: 0.9rem;
  }
  .practice-goals__met {
    font-size: 0.82rem;
    font-weight: 600;
    color: #34d399;
  }
  .practice-goals__select {
    padding: 0.3rem 0.45rem;
    border-radius: 6px;
    border: 1px solid var(--ff-border);
    background: var(--ff-bg);
    color: var(--ff-text);
  }
</style>
