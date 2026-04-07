<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { AudioInputDevice } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  let devices = $state<AudioInputDevice[]>([]);
  let defaultDevice = $state<AudioInputDevice | null>(null);
  let error = $state<string | null>(null);
  let browserOnly = $state(false);

  onMount(async () => {
    if (!isTauri()) {
      browserOnly = true;
      return;
    }
    try {
      devices = await invoke<AudioInputDevice[]>("list_audio_input_devices");
      defaultDevice = await invoke<AudioInputDevice | null>(
        "get_default_audio_input_device",
      );
    } catch (e) {
      error = String(e);
    }
  });
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Settings</h1>
<p class="muted">Audio and MIDI device selection, latency calibration (Phase 1–2).</p>

<div class="panel">
  <h2>Audio input</h2>
  {#if browserOnly}
    <p>Open the app with <code>npm run tauri dev</code> to enumerate inputs.</p>
  {:else if error}
    <p style="color: #f87171">{error}</p>
  {:else}
    {#if defaultDevice}
      <p style="margin-bottom: 0.5rem">
        <span class="muted">Default:</span>
        {defaultDevice.label}
      </p>
    {/if}
    {#if devices.length === 0}
      <p class="muted">No input devices reported by the OS.</p>
    {:else}
      <ul class="device-list">
        {#each devices as d}
          <li><span class="muted">{d.id}</span> — {d.label}</li>
        {/each}
      </ul>
    {/if}
    <p class="muted" style="margin-bottom: 0">
      Persisted device choice, buffer size, and calibration UI next (Phase 1).
    </p>
  {/if}
</div>

<div class="panel">
  <h2>MIDI</h2>
  <p class="muted" style="margin-bottom: 0">Device picker and status (Phase 2).</p>
</div>
