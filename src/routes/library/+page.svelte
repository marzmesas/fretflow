<script lang="ts">
  import { goto } from "$app/navigation";
  import { MOCK_CATALOG } from "$lib/catalog/mock-catalog";
  import { midiBufferToChart } from "$lib/catalog/midi-import";
  import { addUserChart, getUserCharts, removeUserChart, type UserChartEntry } from "$lib/catalog/user-charts";
  import type { CatalogTrackStub } from "$lib/catalog/types";
  import { validateChart } from "$lib/chart/validate";

  type Filter = "all" | "free" | "premium" | "mine";

  let filter = $state<Filter>("all");
  let userCharts = $state<UserChartEntry[]>(getUserCharts());
  let importError = $state<string | null>(null);
  let importWarnings = $state<string[]>([]);

  const filtered = $derived.by(() => {
    if (filter === "mine") return [];
    if (filter === "all") return MOCK_CATALOG;
    return MOCK_CATALOG.filter((t) => t.tier === filter);
  });

  function isLocked(t: CatalogTrackStub): boolean {
    return t.tier === "premium" || Boolean(t.locked);
  }

  function canOpenInPractice(t: CatalogTrackStub): boolean {
    if (isLocked(t)) return false;
    if (t.practiceChartKey === "demo") return true;
    if (t.practiceChartKey === "bundled") return Boolean(t.bundledChartFile?.trim());
    return false;
  }

  function openInPractice(t: CatalogTrackStub) {
    if (!canOpenInPractice(t)) return;
    void goto(`/practice?track=${encodeURIComponent(t.id)}`);
  }

  function openUserChart(entry: UserChartEntry) {
    void goto(`/practice?track=${encodeURIComponent(entry.id)}`);
  }

  function deleteUserChart(entry: UserChartEntry) {
    removeUserChart(entry.id);
    userCharts = getUserCharts();
  }

  async function handleImportFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importError = null;
    importWarnings = [];

    const name = file.name.toLowerCase();

    if (name.endsWith(".json")) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!validateChart(data)) {
          importError = "JSON file is not a valid Fretflow chart (schema v1).";
          input.value = "";
          return;
        }
        addUserChart(data);
        userCharts = getUserCharts();
        filter = "mine";
      } catch {
        importError = "Could not parse the JSON file.";
      }
    } else if (name.endsWith(".mid") || name.endsWith(".midi")) {
      try {
        const buf = await file.arrayBuffer();
        const result = midiBufferToChart(buf, file.name);
        if (!result.ok) {
          importError = result.error;
          input.value = "";
          return;
        }
        if (result.warnings.length > 0) importWarnings = result.warnings;
        addUserChart(result.chart);
        userCharts = getUserCharts();
        filter = "mine";
      } catch (e) {
        importError = `MIDI import failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      importError = "Unsupported file type. Use .json (chart) or .mid / .midi (Standard MIDI).";
    }

    input.value = "";
  }
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Library</h1>
<p class="muted" style="margin: 0 0 1rem">
  Browse bundled exercises or import your own charts (JSON or MIDI files).
</p>

<div class="panel">
  <h2>Browse</h2>

  <div class="row catalog-filters" style="margin-bottom: 1rem">
    {#each (["all", "free", "premium", "mine"] as Filter[]) as f (f)}
      <button
        type="button"
        class="btn"
        class:btn-primary={filter === f}
        onclick={() => (filter = f)}
        aria-pressed={filter === f}
      >
        {f === "all" ? "All" : f === "free" ? "Free" : f === "premium" ? "Premium" : `My Charts (${userCharts.length})`}
      </button>
    {/each}
  </div>

  {#if filter === "mine"}
    {#if userCharts.length === 0}
      <p class="muted" style="margin: 0 0 1rem">No imported charts yet. Use the import section below to add MIDI or JSON files.</p>
    {:else}
      <ul class="catalog-list" aria-label="My imported charts">
        {#each userCharts as entry (entry.id)}
          <li class="catalog-row">
            <div class="catalog-main">
              <div class="catalog-title">{entry.title}</div>
              <div class="catalog-meta">
                <span class="muted">{entry.artist}</span>
                <span class="muted">{new Date(entry.addedAt).toLocaleDateString()}</span>
              </div>
            </div>
            <div class="catalog-action">
              <button type="button" class="btn btn-primary" onclick={() => openUserChart(entry)}>
                Practice
              </button>
              <button type="button" class="btn btn-danger" onclick={() => deleteUserChart(entry)}
                title="Remove this imported chart"
              >
                Remove
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <ul class="catalog-list" aria-label="Tracks">
      {#each filtered as t (t.id)}
        <li class="catalog-row">
          <div class="catalog-main">
            <div class="catalog-title">{t.title}</div>
            <div class="catalog-meta">
              <span class="muted">{t.artist}</span>
              {#if t.difficulty}
                <span class="difficulty-pill difficulty-pill--{t.difficulty}">{t.difficulty}</span>
              {/if}
              {#if t.durationSec != null}
                <span class="muted">{t.durationSec < 60 ? `${t.durationSec}s` : `${Math.floor(t.durationSec / 60)}m ${t.durationSec % 60}s`}</span>
              {/if}
              <span
                class="tier-pill"
                class:tier-pill--free={t.tier === "free"}
                class:tier-pill--premium={t.tier === "premium"}
              >
                {t.tier}
              </span>
            </div>
          </div>
          <div class="catalog-action">
            {#if isLocked(t)}
              <span class="locked-label" title="Subscription / purchase flow not wired yet">
                <svg
                  class="lock-icon"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.35"
                  aria-hidden="true"
                >
                  <rect x="3" y="7" width="10" height="7" rx="1" />
                  <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                </svg>
                Locked
              </span>
            {:else if canOpenInPractice(t)}
              <button type="button" class="btn btn-primary" onclick={() => openInPractice(t)}>
                Practice
              </button>
            {:else}
              <span class="locked-label" title="No chart wired for this row">Soon</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<div class="panel">
  <h2>Import chart</h2>
  <p class="muted" style="margin: 0 0 0.75rem">
    Add a <strong>.json</strong> (Fretflow chart v1) or <strong>.mid</strong> (Standard MIDI) file.
    MIDI files are converted to chart format automatically using the same voicing engine as the CLI importer.
  </p>
  <input
    type="file"
    accept=".json,.mid,.midi,application/json,audio/midi"
    onchange={handleImportFile}
    style="margin-bottom: 0.75rem"
  />
  {#if importError}
    <p class="import-error">{importError}</p>
  {/if}
  {#if importWarnings.length > 0}
    <ul class="import-warnings">
      {#each importWarnings as w}
        <li>{w}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .catalog-filters .btn.btn-primary {
    border-color: var(--ff-accent);
    background: var(--ff-accent-dim);
    color: #fff;
  }
  .catalog-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .catalog-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--ff-border);
  }
  .catalog-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .catalog-row:first-child {
    padding-top: 0;
  }
  .catalog-title {
    font-weight: 600;
    color: var(--ff-text);
    font-size: 0.95rem;
  }
  .catalog-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.65rem;
    margin-top: 0.2rem;
    font-size: 0.82rem;
  }
  .catalog-action {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .tier-pill {
    text-transform: capitalize;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--ff-border);
    color: var(--ff-muted);
  }
  .tier-pill--free {
    border-color: color-mix(in srgb, var(--ff-success) 45%, var(--ff-border));
    color: var(--ff-success);
  }
  .tier-pill--premium {
    border-color: color-mix(in srgb, var(--ff-accent) 55%, var(--ff-border));
    color: var(--ff-accent);
  }
  .locked-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.88rem;
    color: var(--ff-muted);
  }
  .lock-icon {
    flex-shrink: 0;
    opacity: 0.8;
  }
  .difficulty-pill {
    text-transform: capitalize;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--ff-border);
    color: var(--ff-muted);
  }
  .difficulty-pill--beginner {
    border-color: color-mix(in srgb, #4ade80 45%, var(--ff-border));
    color: #4ade80;
  }
  .difficulty-pill--easy {
    border-color: color-mix(in srgb, #38bdf8 45%, var(--ff-border));
    color: #38bdf8;
  }
  .difficulty-pill--intermediate {
    border-color: color-mix(in srgb, #fbbf24 45%, var(--ff-border));
    color: #fbbf24;
  }
  .difficulty-pill--advanced {
    border-color: color-mix(in srgb, #f87171 45%, var(--ff-border));
    color: #f87171;
  }
  .btn-danger {
    color: #f87171;
    border-color: color-mix(in srgb, #f87171 40%, var(--ff-border));
  }
  .btn-danger:hover {
    background: color-mix(in srgb, #f87171 12%, var(--ff-bg));
    border-color: #f87171;
  }
  .import-error {
    color: #f87171;
    font-size: 0.9rem;
    margin: 0 0 0.5rem;
  }
  .import-warnings {
    margin: 0 0 0.5rem;
    padding-left: 1.2rem;
    font-size: 0.85rem;
    color: #fbbf24;
  }
</style>
