<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import type { MidiNoteEvent } from "$lib/ipc";
  import { EVENT_MIDI_NOTE } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  const maxNotes = 16;
  let recent = $state<MidiNoteEvent[]>([]);
  let unlisten: UnlistenFn | null = null;
  let browserOnly = $state(false);

  onMount(async () => {
    if (!isTauri()) {
      browserOnly = true;
      return;
    }
    unlisten = await listen<MidiNoteEvent>(EVENT_MIDI_NOTE, (ev) => {
      recent = [ev.payload, ...recent].slice(0, maxNotes);
    });
  });

  onDestroy(() => {
    unlisten?.();
  });
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Practice</h1>
<p class="muted">
  Scrolling highway, chart data, and scoring land in Phase 3–4. This route is reserved for the core
  play-along experience.
</p>
<div class="panel">
  <h2>Roadmap</h2>
  <p>Chart engine → metronome & loops → mic/MIDI scoring → session summaries.</p>
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
          {n.kind} ch{n.channel} note {n.note} vel {n.velocity}
          <span class="muted">({n.timestampUs} µs)</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
