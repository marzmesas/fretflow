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
  import { SCORING_MODE_LABEL, TIMING_BY_MODE, type ScoringModeId } from "./scoring-modes";
  import { loadLastSession, saveLastSession, type SessionSummaryV1 } from "./session-storage";
  import { beatToSeconds, chartLengthBeats, chartLengthSeconds, secondsToBeat } from "./time";
  import type { FretflowChartV1 } from "./types";
  import { consumePendingPracticeChartJson } from "./practice-chart-transfer";
  import { validateChart } from "./validate";
  import { resolvePracticeChart } from "$lib/catalog/resolve-practice-chart";
  import { disposeBackingDrone, syncBackingDrone } from "./chart-backing-drone";

  type Props = {
    /** Library `?track=` id; when set, chart title/data resolve from catalog (demo notes for now). */
    trackId?: string | null;
  };
  let { trackId = null }: Props = $props();

  let chart: FretflowChartV1 = $state(DEMO_CHART);

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

  let metronomeEnabled = $state(false);
  let metronomeCtx: AudioContext | null = null;
  const beatMetronome = new ChartBeatMetronome();

  let backingDroneEnabled = $state(false);
  let backingDroneMuted = $state(false);
  const backingLinearGain = 0.042;

  let pixelsPerSecond = $state(140);

  /** Last frame interval (ms) — large values mean background throttling */
  let lastFrameMs = $state(0);
  let lastFrameWall = 0;

  let rafId = 0;

  const totalSec = $derived(chartLengthSeconds(chart));
  const totalBeats = $derived(chartLengthBeats(chart));
  const timingWindows = $derived(TIMING_BY_MODE[scoringMode]);

  const readinessIssues = $derived.by(() => {
    if (!isTauri()) return [];
    const c = inputConn;
    if (!c) return [];
    const out: string[] = [];
    const midiScoringPath = scoringEnabled && !micPitchBeta && !micRhythmBeta;
    if (midiScoringPath && !c.midiListenActive) {
      out.push(
        "Scoring is on (MIDI mode) but no MIDI port is listening. In Settings → MIDI, pick a port and choose Start listening.",
      );
    }
    if ((micPitchBeta || micRhythmBeta) && !c.inputMonitorActive) {
      out.push(
        "A mic scoring mode is on but the input monitor is off. In Settings → Audio input, choose Start monitoring so the app can hear you.",
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
    for (let i = 0; i < chart.notes.length; i++) {
      const ns = noteStartSeconds(chart.notes[i]!, chart.bpm);
      if (ns < loopASec - 0.01 || ns >= loopBSec + 0.01) {
        missedNoteIndices.add(i);
      }
    }
  }

  function applyMissesForTime(t: number) {
    if (!scoringEnabled) return;
    const newMisses = collectMissedNoteIndices(
      chart,
      t,
      consumedNoteIndices,
      missedNoteIndices,
      timingWindows.lateMs,
      latencyOffsetMs,
    );
    if (newMisses.length === 0) return;
    for (const i of newMisses) {
      missedNoteIndices.add(i);
    }
    missIndicesDisplay = [...missIndicesDisplay, ...newMisses];
    combo = 0;
    lastFeedback =
      newMisses.length === 1 ? `Miss (note ${newMisses[0]! + 1})` : `Miss ×${newMisses.length}`;
  }

  function registerHit(hit: { index: number; deltaMs: number }, source: "midi" | "mic") {
    consumedNoteIndices.add(hit.index);
    hitIndicesDisplay = [...hitIndicesDisplay, hit.index];
    combo += 1;
    if (combo > maxComboEver) maxComboEver = combo;
    const sign = hit.deltaMs >= 0 ? "+" : "";
    const src = source === "mic" ? "Mic " : "";
    lastFeedback = `${src}Hit ${sign}${hit.deltaMs.toFixed(0)} ms · combo ${combo}`;
  }

  function handleInputScoring(ev: { payload: InputEventPayload }) {
    if (!scoringEnabled || !playing) return;
    const p = ev.payload;
    if (p.schemaVersion !== 1 || p.kind !== "note_on" || p.velocity === 0) return;

    const useMidi = inputEventIsMidiV1(p);
    const useMicPitch = micPitchBeta && inputEventIsMicPitchV1(p);
    if (!useMidi && !useMicPitch) return;

    const t = captureWallTime();
    const hit = findHitNoteIndex(
      chart,
      t,
      p.note,
      consumedNoteIndices,
      missedNoteIndices,
      timingWindows,
      latencyOffsetMs,
    );
    if (!hit) return;
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
        chart,
        t,
        consumedNoteIndices,
        missedNoteIndices,
        timingWindows,
        latencyOffsetMs,
      );
      if (hit) {
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
    const total = chart.notes.length;
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

  function stopRaf() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  let prevTrackId: string | null | undefined = undefined;
  let bundledFetchSeq = 0;

  function resetPlayerToChart(next: FretflowChartV1) {
    chart = next;
    playing = false;
    stopRaf();
    timeSec = 0;
    anchorChartSec = 0;
    lastFrameWall = 0;
    lastAudioLevel = 0;
    lastMicTriggerWall = 0;
    loopABeat = 0;
    const maxB = chartLengthBeats(next);
    loopBBeat = Math.min(8, maxB);
    beatMetronome.syncAfterJump(0, next.bpm);
    resetScoringState(null);
    syncPracticeBackingAudio();
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
    syncBackingDrone({
      playing,
      enabled: backingDroneEnabled,
      muted: backingDroneMuted,
      linearGain: backingLinearGain,
    });
  }

  function captureWallTime() {
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
    if (!beatMetronome.tick(t, chart.bpm)) return;
    const ctx = getMetronomeCtx();
    if (!ctx) return;
    void ctx.resume().then(() => {
      if (metronomeCtx === ctx && ctx.state !== "closed") playMetronomeClick(ctx);
    });
  }

  function onMetronomeEnabledChange() {
    if (metronomeEnabled && playing) {
      beatMetronome.syncResume(captureWallTime(), chart.bpm);
    }
  }

  function tickFrame() {
    if (!playing) return;
    const now = performance.now();
    if (lastFrameWall > 0) {
      lastFrameMs = now - lastFrameWall;
    }
    lastFrameWall = now;

    let t = anchorChartSec + ((now - anchorWallMs) / 1000) * speed;

    const loopA = beatToSeconds(loopABeat, chart.bpm);
    const loopB = beatToSeconds(loopBBeat, chart.bpm);

    if (loopEnabled && loopB > loopA && t >= loopB) {
      resetScoringForLoop(loopA, loopB);
      const span = loopB - loopA;
      t = loopA + ((t - loopA) % span);
      anchorChartSec = t;
      anchorWallMs = now;
      beatMetronome.syncAfterJump(t, chart.bpm);
    } else if (!loopEnabled && t >= totalSec) {
      t = totalSec;
      const lateSec = timingWindows.lateMs / 1000;
      applyMissesForTime(t + lateSec);
      finalizeSessionSummary();
      playing = false;
      stopRaf();
      anchorChartSec = t;
      timeSec = t;
      lastFrameWall = 0;
      syncPracticeBackingAudio();
      return;
    }

    maybePlayMetronomeClick(t);

    applyMissesForTime(t);
    timeSec = t;
    syncPracticeBackingAudio();
    rafId = requestAnimationFrame(tickFrame);
  }

  function togglePlay() {
    if (playing) {
      playing = false;
      stopRaf();
      timeSec = captureWallTime();
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
        beatMetronome.syncAfterJump(anchorChartSec, chart.bpm);
      } else {
        beatMetronome.syncResume(anchorChartSec, chart.bpm);
      }
      playing = true;
      rafId = requestAnimationFrame(tickFrame);
      syncPracticeBackingAudio();
    }
  }

  function restart() {
    playing = false;
    stopRaf();
    timeSec = 0;
    anchorChartSec = 0;
    lastFrameWall = 0;
    lastAudioLevel = 0;
    lastMicTriggerWall = 0;
    beatMetronome.syncAfterJump(0, chart.bpm);
    resetScoringState(null);
    syncPracticeBackingAudio();
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
    loopABeat = secondsToBeat(timeSec, chart.bpm);
    normalizeLoopBeats();
  }

  function setLoopB() {
    loopBBeat = secondsToBeat(timeSec, chart.bpm);
    normalizeLoopBeats();
  }

  $effect(() => {
    loopBBeat;
    totalBeats;
    if (loopBBeat > totalBeats) loopBBeat = totalBeats;
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
        {chart.bpm} BPM · {chart.timeSignature[0]}/{chart.timeSignature[1]} · {totalBeats.toFixed(1)} beats
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
    {chart}
    {timeSec}
    {pixelsPerSecond}
    hitIndices={hitIndicesDisplay}
    missIndices={missIndicesDisplay}
  />

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
    <label class="row" style="gap: 0.5rem; cursor: pointer; margin-bottom: 0.5rem">
      <input type="checkbox" bind:checked={scoringEnabled} />
      <span>Scoring</span>
      <span class="muted" style="font-size: 0.85rem">MIDI by default; optional mic modes below</span>
    </label>
    {#if isTauri()}
      <p class="muted" style="margin: 0 0 0.5rem; font-size: 0.82rem">
        Latency offset: <strong>{latencyOffsetMs} ms</strong> (Settings → Latency). Shifts hit/miss timing only; highway is unchanged.
      </p>
    {/if}
    <p style="margin: 0 0 0.35rem; font-variant-numeric: tabular-nums">
      Hits <strong>{hitIndicesDisplay.length}</strong>
      · Misses <strong>{missIndicesDisplay.length}</strong>
      · Combo <strong>{combo}</strong>
    </p>
    {#if lastFeedback}
      <p
        class="last-feedback"
        class:last-feedback--hit={lastFeedback.startsWith("Hit") || lastFeedback.startsWith("Mic Hit")}
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
      <label class="row" style="gap: 0.5rem; cursor: pointer; margin-bottom: 0.5rem">
        <input type="checkbox" bind:checked={micRhythmBeta} disabled={micPitchBeta} />
        <span>Mic rhythm (beta)</span>
        <span class="muted" style="font-size: 0.8rem">level peaks only; disabled when mic pitch is on</span>
      </label>
      <label class="row" style="gap: 0.5rem; cursor: pointer; margin-bottom: 0.5rem">
        <input type="checkbox" bind:checked={micPitchBeta} disabled={micRhythmBeta} />
        <span>Mic pitch (beta)</span>
        <span class="muted" style="font-size: 0.8rem">monitor + YIN onset → same scoring as MIDI</span>
      </label>
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

  {#if lastSessionSnapshot}
    <div class="last-session panel-inner">
      <h3 style="margin: 0 0 0.35rem; font-size: 0.95rem">Last session</h3>
      <p style="margin: 0; font-size: 0.88rem; color: var(--ff-muted)">
        <strong style="color: var(--ff-text)">{lastSessionSnapshot.chartTitle}</strong>
        · {lastSessionSnapshot.accuracyPercent}% accuracy
        · {lastSessionSnapshot.hits}/{lastSessionSnapshot.totalNotes ?? (lastSessionSnapshot.hits + lastSessionSnapshot.misses)} notes hit
        · combo {lastSessionSnapshot.maxCombo}
        {#if lastSessionSnapshot.inputSource}
          · {lastSessionSnapshot.inputSource}
        {/if}
        · {lastSessionSnapshot.scoringMode}{lastSessionSnapshot.inputSource ? ` · ${lastSessionSnapshot.inputSource}` : ""}
      </p>
      <p style="margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--ff-muted)">
        {new Date(lastSessionSnapshot.at).toLocaleString()}
      </p>
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

    <label class="row" style="gap: 0.5rem; margin-bottom: 0.35rem; cursor: pointer">
      <input
        type="checkbox"
        checked={backingDroneEnabled}
        onchange={onBackingDroneEnabledChange}
      />
      <span>Backing drone</span>
      <span class="muted" style="font-size: 0.8rem">quiet low E sine while playing (placeholder until stems)</span>
    </label>
    <label class="row" style="gap: 0.5rem; margin-bottom: 0.65rem; cursor: pointer; padding-left: 1.5rem">
      <input
        type="checkbox"
        checked={backingDroneMuted}
        disabled={!backingDroneEnabled}
        onchange={onBackingDroneMutedChange}
      />
      <span>Mute backing</span>
    </label>

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
  .last-session {
    margin-top: 0.75rem;
    padding: 0.75rem 0 0;
    border-top: 1px solid var(--ff-border);
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
</style>
