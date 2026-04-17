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
  Play along with the scrolling highway. Scoring works with MIDI or mic input — configure both in
  <a href="/settings">Settings</a>.
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
  <h2>Input debug</h2>
  {#if browserOnly}
    <p class="muted" style="margin-bottom: 0">
      Run the desktop app: enable <strong>Start monitoring</strong> (mic) and/or <strong>Start listening</strong> (MIDI) in
      <strong>Settings</strong> to see events here.
    </p>
  {:else if recent.length === 0}
    <p class="muted" style="margin-bottom: 0">
      No input events yet. In <strong>Settings</strong>, start the input monitor (mic) and/or MIDI listening; with
      <strong>Mic pitch (beta)</strong> on in Practice you will see <code>mic</code> <code>note_on</code> /
      <code>note_off</code>.
    </p>
  {:else}
    <p class="muted" style="margin-bottom: 0.5rem">Last {maxNotes} events (global; same stream as Settings)</p>
    <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.9rem">
      {#each recent as n}
        <li>
          {n.source} · {n.kind} ch{n.channel} note {n.note} vel {n.velocity}
          {#if n.pitchHz != null && n.confidence != null}
            <span class="muted"> — {n.pitchHz.toFixed(1)} Hz, conf {n.confidence.toFixed(2)}</span>
          {/if}
          <span class="muted">({n.timestampUs} µs)</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
