<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { drawHighway, HIGHWAY_THEME_DARK, type HighwayColors } from "./draw-highway";
  import type { FretflowChartV1 } from "./types";

  type Props = {
    chart: FretflowChartV1;
    timeSec: number;
    pixelsPerSecond?: number;
    colors?: HighwayColors;
    /** Chart note indices judged as hits (MIDI scoring). */
    hitIndices?: number[];
    missIndices?: number[];
  };

  let {
    chart,
    timeSec,
    pixelsPerSecond = 140,
    colors = HIGHWAY_THEME_DARK,
    hitIndices = [],
    missIndices = [],
  }: Props = $props();

  const hitSet = $derived(new Set(hitIndices));
  const missSet = $derived(new Set(missIndices));

  let canvas: HTMLCanvasElement | undefined = $state();
  let wrap: HTMLDivElement | undefined = $state();
  let ro: ResizeObserver | undefined;

  function paint() {
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(280, wrap.clientWidth);
    const h = 300;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    drawHighway(ctx, chart, timeSec, pixelsPerSecond, colors, dpr, w, h, hitSet, missSet);
  }

  $effect(() => {
    chart;
    timeSec;
    pixelsPerSecond;
    colors;
    hitIndices;
    missIndices;
    paint();
  });

  onMount(() => {
    ro = new ResizeObserver(() => paint());
    if (wrap) ro.observe(wrap);
    paint();
  });

  onDestroy(() => ro?.disconnect());
</script>

<div bind:this={wrap} class="chart-highway-wrap">
  <canvas bind:this={canvas} aria-label="Scrolling note highway"></canvas>
</div>

<style>
  .chart-highway-wrap {
    width: 100%;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid var(--ff-border);
    background: var(--ff-bg);
  }
  canvas {
    display: block;
  }
</style>
