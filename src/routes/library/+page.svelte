<script lang="ts">
  import { goto } from "$app/navigation";
  import { MOCK_CATALOG } from "$lib/catalog/mock-catalog";
  import type { CatalogTierId, CatalogTrackStub } from "$lib/catalog/types";

  type Filter = "all" | CatalogTierId;

  let filter = $state<Filter>("all");

  const filtered = $derived.by(() => {
    if (filter === "all") return MOCK_CATALOG;
    return MOCK_CATALOG.filter((t) => t.tier === filter);
  });

  function isLocked(t: CatalogTrackStub): boolean {
    return t.tier === "premium" || Boolean(t.locked);
  }

  function canOpenInPractice(t: CatalogTrackStub): boolean {
    if (isLocked(t)) return false;
    if (t.practiceChartKey === "demo") return true;
    if (t.practiceChartKey === "bundled") {
      return Boolean(t.bundledChartFile?.trim());
    }
    return false;
  }

  function openInPractice(t: CatalogTrackStub) {
    if (!canOpenInPractice(t)) return;
    void goto(`/practice?track=${encodeURIComponent(t.id)}`);
  }
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Library</h1>
<p class="muted" style="margin: 0 0 1rem">
  Local catalog (no network). Some rows use the embedded demo chart; others load JSON from
  <code>static/charts/</code>. Premium rows are UI-only locks until entitlements exist.
</p>

<div class="panel">
  <h2>Browse</h2>
  <p class="muted" style="margin-bottom: 0.75rem">
    Free tracks open <strong>Practice</strong> with either the built-in demo chart or a bundled file.
    Premium rows preview locked content.
  </p>

  <div class="row catalog-filters" style="margin-bottom: 1rem">
    {#each (["all", "free", "premium"] as Filter[]) as f (f)}
      <button
        type="button"
        class="btn"
        class:btn-primary={filter === f}
        onclick={() => (filter = f)}
        aria-pressed={filter === f}
      >
        {f === "all" ? "All" : f === "free" ? "Free" : "Premium"}
      </button>
    {/each}
  </div>

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
</style>
