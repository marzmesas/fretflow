<script lang="ts">
  import { goto } from "$app/navigation";
  import { DEMO_CHART } from "$lib/chart/demo-chart";
  import { stageChartForPractice } from "$lib/chart/practice-chart-transfer";
  import type { FretflowChartV1 } from "$lib/chart/types";
  import { chartLengthBeats } from "$lib/chart/time";
  import { getChartValidationIssues, validateChart } from "$lib/chart/validate";

  let jsonText = $state(JSON.stringify(DEMO_CHART, null, 2));
  let issues = $state<string[]>([]);
  let parseError = $state<string | null>(null);
  let lastValid = $state<FretflowChartV1 | null>(null);

  function runValidate() {
    parseError = null;
    lastValid = null;
    let data: unknown;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
      issues = [];
      return;
    }
    issues = getChartValidationIssues(data);
    if (issues.length === 0 && validateChart(data)) {
      lastValid = data;
    }
  }

  function loadDemo() {
    jsonText = JSON.stringify(DEMO_CHART, null, 2);
    parseError = null;
    issues = [];
    lastValid = null;
  }

  function onJsonFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      jsonText = String(reader.result ?? "");
      parseError = null;
      issues = [];
      lastValid = null;
    };
    reader.readAsText(file);
    input.value = "";
  }

  function openInPractice() {
    if (!lastValid) return;
    stageChartForPractice(lastValid);
    void goto("/practice");
  }
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Chart QA</h1>
<p class="muted" style="margin: 0 0 1rem">
  Validate <code>docs/CHART_SCHEMA.md</code> v1 JSON, inspect issues, then open the chart in
  <strong>Practice</strong> (one-shot handoff). Same checks as <code>npm run validate-charts</code> for bundled
  files under <code>static/charts/</code>.
</p>

<div class="panel" style="max-width: 52rem">
  <div class="row" style="flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.75rem">
    <button type="button" class="btn btn-primary" onclick={runValidate}>Validate</button>
    <button type="button" class="btn" onclick={loadDemo}>Load demo JSON</button>
    <button type="button" class="btn" class:btn-primary={!!lastValid} disabled={!lastValid} onclick={openInPractice}>
      Open in Practice
    </button>
    <label class="muted row" style="gap: 0.35rem; cursor: pointer; font-size: 0.88rem">
      <span>Load file</span>
      <input type="file" accept="application/json,.json" onchange={onJsonFile} />
    </label>
  </div>

  {#if parseError}
    <p style="color: #f87171; margin: 0 0 0.75rem">JSON parse error: {parseError}</p>
  {/if}

  {#if issues.length > 0}
    <p style="margin: 0 0 0.35rem; color: #fbbf24">Validation issues ({issues.length})</p>
    <ul style="margin: 0 0 0.75rem; padding-left: 1.25rem; font-size: 0.9rem">
      {#each issues as it (it)}
        <li>{it}</li>
      {/each}
    </ul>
  {:else if lastValid && !parseError}
    <p style="margin: 0 0 0.75rem; color: var(--ff-success)">
      Chart is valid — <strong>{lastValid.notes.length}</strong> notes ·
      <strong>{chartLengthBeats(lastValid).toFixed(2)}</strong> beats · {lastValid.bpm} BPM
    </p>
  {/if}

  <label for="chart-qa-json" class="muted" style="display: block; margin-bottom: 0.35rem; font-size: 0.88rem"
    >Chart JSON</label
  >
  <textarea
    id="chart-qa-json"
    bind:value={jsonText}
    spellcheck="false"
    style="
      width: 100%;
      min-height: 18rem;
      font-family: ui-monospace, monospace;
      font-size: 0.82rem;
      padding: 0.6rem 0.65rem;
      border-radius: 8px;
      border: 1px solid var(--ff-border);
      background: var(--ff-bg);
      color: var(--ff-text);
      resize: vertical;
      box-sizing: border-box;
    "
  ></textarea>
</div>
