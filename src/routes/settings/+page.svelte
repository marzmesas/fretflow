<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import type { AudioInputDevice, AudioPreferences } from "$lib/ipc";
  import { EVENT_AUDIO_INPUT_ERROR, EVENT_AUDIO_LEVEL } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  let devices = $state<AudioInputDevice[]>([]);
  let defaultDevice = $state<AudioInputDevice | null>(null);
  let prefs = $state<AudioPreferences | null>(null);
  let selectedId = $state<string | null>(null);
  let latencyMs = $state(0);
  let error = $state<string | null>(null);
  let browserOnly = $state(false);
  let monitoring = $state(false);
  let audioLevel = $state(0);
  let unlistenLevel: UnlistenFn | null = null;
  let unlistenInputError: UnlistenFn | null = null;

  async function refreshDevices() {
    if (!isTauri()) return;
    error = null;
    try {
      devices = await invoke<AudioInputDevice[]>("list_audio_input_devices");
      defaultDevice = await invoke<AudioInputDevice | null>(
        "get_default_audio_input_device",
      );
    } catch (e) {
      error = String(e);
    }
  }

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
      prefs = await invoke<AudioPreferences>("get_audio_preferences");
      selectedId =
        prefs.preferredInputDeviceId ??
        (defaultDevice?.id === "default" ? null : defaultDevice?.id ?? null);
      latencyMs = prefs.latencyOffsetMs;
      unlistenLevel = await listen<number>(EVENT_AUDIO_LEVEL, (ev) => {
        audioLevel = Math.min(1, Math.max(0, ev.payload));
      });
      unlistenInputError = await listen<string>(EVENT_AUDIO_INPUT_ERROR, (ev) => {
        error = ev.payload;
        monitoring = false;
        audioLevel = 0;
      });
    } catch (e) {
      error = String(e);
    }
  });

  onDestroy(() => {
    unlistenLevel?.();
    unlistenInputError?.();
    if (isTauri()) {
      invoke("stop_input_monitor").catch(() => {});
      invoke("stop_mock_audio_meter").catch(() => {});
    }
  });

  async function savePrefs() {
    if (!isTauri()) return;
    const next: AudioPreferences = {
      preferredInputDeviceId: selectedId,
      latencyOffsetMs: latencyMs,
    };
    await invoke("set_audio_preferences", { prefs: next });
    prefs = next;
  }

  async function startMonitor() {
    if (!isTauri()) return;
    error = null;
    try {
      await savePrefs();
      await invoke("start_input_monitor", {
        deviceId: selectedId,
      });
      monitoring = true;
    } catch (e) {
      error = String(e);
    }
  }

  async function stopMonitor() {
    if (!isTauri()) return;
    await invoke("stop_input_monitor");
    monitoring = false;
    audioLevel = 0;
  }
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Settings</h1>
<p class="muted">Audio input, monitoring, and (soon) MIDI. Latency offset is stored but not applied to DSP yet.</p>

<div class="panel">
  <h2>Audio input</h2>
  {#if browserOnly}
    <p>Open the app with <code>npm run tauri dev</code> to use these controls.</p>
  {:else if error && !devices.length}
    <p style="color: #f87171">{error}</p>
  {:else}
    {#if defaultDevice}
      <p style="margin-bottom: 0.75rem">
        <span class="muted">OS default:</span>
        {defaultDevice.label}
      </p>
    {/if}
    {#if devices.length === 0}
      <p class="muted">No input devices reported by the OS.</p>
    {:else}
      <fieldset style="border: none; margin: 0 0 1rem; padding: 0">
        <legend class="muted" style="margin-bottom: 0.5rem">Input for monitoring</legend>
        <label class="row" style="margin-bottom: 0.35rem; cursor: pointer">
          <input type="radio" name="in" checked={selectedId === null} onchange={() => (selectedId = null)} />
          <span>System default</span>
        </label>
        {#each devices as d}
          <label class="row" style="margin-bottom: 0.35rem; cursor: pointer">
            <input
              type="radio"
              name="in"
              checked={selectedId === d.id}
              onchange={() => (selectedId = d.id)}
            />
            <span>{d.label}</span>
          </label>
        {/each}
      </fieldset>
    {/if}

    <div class="row" style="margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem">
      <button type="button" class="btn" onclick={savePrefs}>Save preference</button>
      <button type="button" class="btn" onclick={refreshDevices}>Refresh device list</button>
    </div>

    <div class="row" style="margin-bottom: 0.75rem">
      <button type="button" class="btn btn-primary" onclick={startMonitor} disabled={monitoring}>
        Start monitoring
      </button>
      <button type="button" class="btn" onclick={stopMonitor} disabled={!monitoring}>Stop</button>
    </div>

    <p class="muted" style="margin-bottom: 0.35rem">Live level (~30/s)</p>
    <div class="meter" aria-label="Input level">
      <div class="meter-fill" style="width: {audioLevel * 100}%"></div>
    </div>

    {#if error}
      <p style="color: #f87171; margin-top: 0.75rem; margin-bottom: 0">{error}</p>
    {/if}
  {/if}
</div>

<div class="panel">
  <h2>Latency</h2>
  <label class="row" style="gap: 0.75rem; align-items: center">
    <span class="muted">Offset (ms)</span>
    <input
      type="number"
      bind:value={latencyMs}
      step="1"
      style="width: 5rem; padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--ff-border); background: var(--ff-bg); color: var(--ff-text)"
    />
    <button type="button" class="btn" onclick={savePrefs}>Save</button>
  </label>
  <p class="muted" style="margin-bottom: 0">Used for scoring sync in a later phase.</p>
</div>

<div class="panel">
  <h2>MIDI</h2>
  <p class="muted" style="margin-bottom: 0">Device picker and status (Phase 2).</p>
</div>
