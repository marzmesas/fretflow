<script lang="ts">
  import { onDestroy } from "svelte";
  import ChartHighway from "./ChartHighway.svelte";
  import { DEMO_CHART } from "./demo-chart";
  import { beatToSeconds, chartLengthBeats, chartLengthSeconds, secondsToBeat } from "./time";
  import type { FretflowChartV1 } from "./types";
  import { validateChart } from "./validate";

  let chart: FretflowChartV1 = $state(DEMO_CHART);

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
      const span = loopB - loopA;
      t = loopA + ((t - loopA) % span);
      anchorChartSec = t;
      anchorWallMs = now;
    } else if (!loopEnabled && t >= totalSec) {
      t = totalSec;
      playing = false;
      stopRaf();
      anchorChartSec = t;
      timeSec = t;
      lastFrameWall = 0;
      return;
    }

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

  onDestroy(() => stopRaf());
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

  <ChartHighway {chart} {timeSec} {pixelsPerSecond} />

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
</style>
