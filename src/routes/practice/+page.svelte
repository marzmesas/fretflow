<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import PracticePlayer from "$lib/chart/PracticePlayer.svelte";
  import { resolvePracticeChart } from "$lib/catalog/resolve-practice-chart";
  import type { InputEventPayload } from "$lib/ipc";
  import { EVENT_INPUT_EVENT } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  const maxNotes = 16;
  let recent = $state<InputEventPayload[]>([]);
  let unlisten: UnlistenFn | null = null;
  let browserOnly = $state(false);

  const practiceTrackId = $derived(page.url.searchParams.get("track"));
  const trackResolve = $derived(resolvePracticeChart(practiceTrackId));

  onMount(async () => {
    if (!isTauri()) {
      browserOnly = true;
      return;
    }
    unlisten = await listen<InputEventPayload>(EVENT_INPUT_EVENT, (ev) => {
      recent = [ev.payload, ...recent].slice(0, maxNotes);
    });
  });

  onDestroy(() => {
    unlisten?.();
  });
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Practice</h1>
<p class="muted">
  Phase 3: embedded chart + scrolling highway. Phase 4 adds scoring against mic/MIDI. Chart schema:
  <code>docs/CHART_SCHEMA.md</code>.
</p>

{#if trackResolve.trackRequestInvalid}
  <p class="muted" style="margin: 0 0 0.75rem; color: #fbbf24">
    Unknown or locked <code>track</code> — showing the demo chart. Open a free row from
    <a href="/library">Library</a>.
  </p>
{/if}

<div class="panel">
  <PracticePlayer trackId={practiceTrackId} />
</div>

<div class="panel">
  <h2>MIDI debug</h2>
  {#if browserOnly}
    <p class="muted" style="margin-bottom: 0">Run the desktop app and start MIDI listening in Settings to see events here.</p>
  {:else if recent.length === 0}
    <p class="muted" style="margin-bottom: 0">
      No MIDI notes yet. In <strong>Settings</strong>, pick a port and choose <strong>Start listening</strong>.
    </p>
  {:else}
    <p class="muted" style="margin-bottom: 0.5rem">Last {maxNotes} events (global; same stream as Settings)</p>
    <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.9rem">
      {#each recent as n}
        <li>
          {n.source} · {n.kind} ch{n.channel} note {n.note} vel {n.velocity}
          <span class="muted">({n.timestampUs} µs)</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
