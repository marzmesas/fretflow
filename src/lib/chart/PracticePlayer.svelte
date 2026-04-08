<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { onDestroy, onMount } from "svelte";
  import type { AudioPreferences, MidiNoteEvent } from "$lib/ipc";
  import { EVENT_AUDIO_LEVEL, EVENT_MIDI_NOTE } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";
  import ChartHighway from "./ChartHighway.svelte";
  import { DEMO_CHART } from "./demo-chart";
  import {
    collectMissedNoteIndices,
    findHitNoteIndex,
    findRhythmHitNoteIndex,
  } from "./midi-scoring";
  import { MIDI_SCORING_LABEL, TIMING_BY_MODE, type ScoringModeId } from "./scoring-modes";
  import { loadLastSession, saveLastSession, type SessionSummaryV1 } from "./session-storage";
  import { beatToSeconds, chartLengthBeats, chartLengthSeconds, secondsToBeat } from "./time";
  import type { FretflowChartV1 } from "./types";
  import { validateChart } from "./validate";

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
  let maxComboEver = 0;
  let lastAudioLevel = 0;
  let lastMicTriggerWall = 0;

  let midiUnlisten: UnlistenFn | null = null;
  let levelUnlisten: UnlistenFn | null = null;

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

  let pixelsPerSecond = $state(140);

  /** Last frame interval (ms) — large values mean background throttling */
  let lastFrameMs = $state(0);
  let lastFrameWall = 0;

  let rafId = 0;

  const totalSec = $derived(chartLengthSeconds(chart));
  const totalBeats = $derived(chartLengthBeats(chart));
  const timingWindows = $derived(TIMING_BY_MODE[scoringMode]);

  function resetScoringState(feedback: string | null = null) {
    consumedNoteIndices.clear();
    missedNoteIndices.clear();
    hitIndicesDisplay = [];
    missIndicesDisplay = [];
    combo = 0;
    maxComboEver = 0;
    lastFeedback = feedback;
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

  function handleMidiScoring(ev: { payload: MidiNoteEvent }) {
    if (!scoringEnabled || !playing) return;
    const p = ev.payload;
    if (p.kind !== "note_on" || p.velocity === 0) return;
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
    registerHit(hit, "midi");
  }

  function handleAudioLevel(ev: { payload: number }) {
    if (!scoringEnabled || !playing || !micRhythmBeta) return;
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

  function finalizeSessionSummary() {
    if (!scoringEnabled) return;
    const hits = hitIndicesDisplay.length;
    const misses = missIndicesDisplay.length;
    const judged = hits + misses;
    if (judged === 0) return;
    const accuracyPercent = Math.round((100 * hits) / judged);
    const summary: SessionSummaryV1 = {
      schemaVersion: 1,
      at: new Date().toISOString(),
      chartTitle: chart.title,
      scoringMode,
      hits,
      misses,
      accuracyPercent,
      maxCombo: maxComboEver,
    };
    saveLastSession(summary);
    lastSessionSnapshot = summary;
    lastFeedback = `Run complete · ${accuracyPercent}% · ${hits} hits / ${misses} misses · max combo ${maxComboEver}`;
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

  function captureWallTime() {
    const now = performance.now();
    return anchorChartSec + ((now - anchorWallMs) / 1000) * speed;
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
      resetScoringState("Loop — scoring reset");
      const span = loopB - loopA;
      t = loopA + ((t - loopA) % span);
      anchorChartSec = t;
      anchorWallMs = now;
    } else if (!loopEnabled && t >= totalSec) {
      t = totalSec;
      applyMissesForTime(t);
      finalizeSessionSummary();
      playing = false;
      stopRaf();
      anchorChartSec = t;
      timeSec = t;
      lastFrameWall = 0;
      return;
    }

    applyMissesForTime(t);
    timeSec = t;
    rafId = requestAnimationFrame(tickFrame);
  }

  function togglePlay() {
    if (playing) {
      playing = false;
      stopRaf();
      timeSec = captureWallTime();
      lastFrameWall = 0;
    } else {
      if (timeSec >= totalSec && !loopEnabled) {
        timeSec = 0;
      }
      anchorChartSec = timeSec;
      anchorWallMs = performance.now();
      lastFrameWall = 0;
      playing = true;
      rafId = requestAnimationFrame(tickFrame);
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
    resetScoringState(null);
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
    } catch {
      /* keep previous */
    }
  }

  function onWindowFocusCalib() {
    void refreshCalibrationFromPrefs();
  }

  onMount(() => {
    lastSessionSnapshot = loadLastSession();
    void refreshCalibrationFromPrefs();
    window.addEventListener("focus", onWindowFocusCalib);
    void (async () => {
      if (isTauri()) {
        midiUnlisten = await listen<MidiNoteEvent>(EVENT_MIDI_NOTE, handleMidiScoring);
        levelUnlisten = await listen<number>(EVENT_AUDIO_LEVEL, handleAudioLevel);
      }
    })();
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", onWindowFocusCalib);
    }
    stopRaf();
    midiUnlisten?.();
    levelUnlisten?.();
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

  <div class="scoring-block">
    <label class="row" style="gap: 0.5rem; cursor: pointer; margin-bottom: 0.5rem">
      <input type="checkbox" bind:checked={scoringEnabled} />
      <span>MIDI scoring</span>
      <span class="muted" style="font-size: 0.85rem">(standard tuning · concert pitch)</span>
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
      <span class="muted" style="font-size: 0.8rem">{MIDI_SCORING_LABEL[scoringMode]}</span>
    </div>
    {#if isTauri()}
      <label class="row" style="gap: 0.5rem; cursor: pointer; margin-bottom: 0.5rem">
        <input type="checkbox" bind:checked={micRhythmBeta} />
        <span>Mic rhythm (beta)</span>
        <span class="muted" style="font-size: 0.8rem">needs input monitor + level peaks; no pitch</span>
      </label>
    {/if}
    <p class="muted" style="margin: 0; font-size: 0.85rem">
      {#if isTauri()}
        MIDI: <strong>Settings → MIDI → Start listening</strong>. Mic beta: <strong>Settings → Start monitoring</strong>.
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
        · {lastSessionSnapshot.accuracyPercent}% · {lastSessionSnapshot.hits}H / {lastSessionSnapshot.misses}M · combo
        {lastSessionSnapshot.maxCombo} · {lastSessionSnapshot.scoringMode}
      </p>
      <p style="margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--ff-muted)">
        {new Date(lastSessionSnapshot.at).toLocaleString()}
      </p>
    </div>
  {/if}

  <div class="panel-inner">
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
</style>
