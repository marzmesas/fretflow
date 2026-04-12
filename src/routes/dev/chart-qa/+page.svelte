<script lang="ts">
  import { goto } from "$app/navigation";
  import { DEMO_CHART } from "$lib/chart/demo-chart";
  import { stageChartForPractice } from "$lib/chart/practice-chart-transfer";
  import type { FretflowChartV1 } from "$lib/chart/types";
  import { firstCanonicalJsonLineDiff } from "$lib/chart/chart-json-canonical";
  import { chartLengthBeats } from "$lib/chart/time";
  import { getChartValidationIssues, validateChart } from "$lib/chart/validate";

  let jsonText = $state(JSON.stringify(DEMO_CHART, null, 2));
  let compareJson = $state("");
  let issues = $state<string[]>([]);
  let parseError = $state<string | null>(null);
  let lastValid = $state<FretflowChartV1 | null>(null);
  let compareSummary = $state<string | null>(null);

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

  function runCompare() {
    compareSummary = null;
    let a: unknown;
    let b: unknown;
    try {
      a = JSON.parse(jsonText);
    } catch (e) {
      compareSummary = `Chart A: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
    try {
      b = JSON.parse(compareJson.trim() || "{}");
    } catch (e) {
      compareSummary = `Chart B: ${e instanceof Error ? e.message : String(e)}`;
      return;
    }
    if (compareJson.trim() === "") {
      compareSummary = "Chart B: empty (paste a second chart JSON).";
      return;
    }
    const ia = getChartValidationIssues(a);
    const ib = getChartValidationIssues(b);
    if (ia.length > 0 || ib.length > 0) {
      compareSummary = `A: ${ia.length} validation issue(s). B: ${ib.length} validation issue(s). Fix both to compare structure.`;
      return;
    }
    if (!validateChart(a) || !validateChart(b)) {
      compareSummary = "Unexpected validation state.";
      return;
    }
    const A = a as FretflowChartV1;
    const B = b as FretflowChartV1;
    const lines = [
      `title: "${A.title}" vs "${B.title}"`,
      `BPM: ${A.bpm} vs ${B.bpm}`,
      `time sig: ${A.timeSignature.join("/")} vs ${B.timeSignature.join("/")}`,
      `notes: ${A.notes.length} vs ${B.notes.length}`,
      `length (beats): ${chartLengthBeats(A).toFixed(2)} vs ${chartLengthBeats(B).toFixed(2)}`,
    ];
    const n = Math.min(A.notes.length, B.notes.length);
    let diffAtIndex = 0;
    for (let i = 0; i < n; i++) {
      const x = A.notes[i]!;
      const y = B.notes[i]!;
      if (
        x.startBeat !== y.startBeat ||
        x.durationBeats !== y.durationBeats ||
        x.stringIndex !== y.stringIndex ||
        x.fret !== y.fret
      ) {
        diffAtIndex += 1;
      }
    }
    lines.push(`notes differing among first ${n} indices: ${diffAtIndex}`);
    if (A.notes.length !== B.notes.length) {
      lines.push("(index compare truncated by shorter note list)");
    }
    lines.push("---");
    lines.push(firstCanonicalJsonLineDiff(A, B));
    compareSummary = lines.join("\n");
  }
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Chart QA</h1>
<p class="muted" style="margin: 0 0 1rem">
  Validate <code>docs/CHART_SCHEMA.md</code> v1 JSON, inspect issues, then open the chart in
  <strong>Practice</strong> (one-shot handoff). Same checks as <code>npm run validate-charts</code> for bundled
  files under <code>static/charts/</code>.
</p>
<p class="muted" style="margin: 0 0 1rem">
  From a <code>.mid</code> file, run <code>npm run midi-to-chart -- path/to/song.mid out.json</code> (skips channel 10
  drums). BPM matches wall-clock from all <code>setTempo</code> segments vs. note span; simultaneous notes prefer
  distinct strings. Regression tests: <code>npm run assert-midi-golden</code>. Paste the JSON here to validate or open
  in Practice.
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

  <h2 style="margin: 1.5rem 0 0.5rem; font-size: 1.1rem">Compare two charts</h2>
  <p class="muted" style="margin: 0 0 0.5rem; font-size: 0.88rem">
    Optional second JSON (same schema). Both must validate; you get a short field diff, a count of note rows that
    differ by index, and the first mismatch in <strong>canonical</strong> multiline JSON (sorted notes, stable key
    order) so reordered arrays still compare meaningfully.
  </p>
  <div class="row" style="flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem">
    <button type="button" class="btn" onclick={runCompare}>Compare</button>
  </div>
  {#if compareSummary}
    <pre
      style="
        margin: 0 0 1rem;
        padding: 0.65rem 0.75rem;
        border-radius: 8px;
        border: 1px solid var(--ff-border);
        background: var(--ff-bg);
        color: var(--ff-text);
        font-size: 0.82rem;
        white-space: pre-wrap;
      ">{compareSummary}</pre>
  {/if}
  <label for="chart-qa-compare" class="muted" style="display: block; margin-bottom: 0.35rem; font-size: 0.88rem"
    >Chart B JSON</label
  >
  <textarea
    id="chart-qa-compare"
    bind:value={compareJson}
    spellcheck="false"
    style="
      width: 100%;
      min-height: 10rem;
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
