<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import type {
    AudioInputDevice,
    AudioPreferences,
    MidiInputPortInfo,
    MidiNoteEvent,
  } from "$lib/ipc";
  import {
    EVENT_AUDIO_INPUT_ERROR,
    EVENT_AUDIO_LEVEL,
    EVENT_MIDI_NOTE,
  } from "$lib/ipc";
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
  let unlistenMidi: UnlistenFn | null = null;

  let midiPorts = $state<MidiInputPortInfo[]>([]);
  let selectedMidiPortId = $state<string | null>(null);
  let midiError = $state<string | null>(null);
  let midiListening = $state(false);
  let recentMidiNotes = $state<MidiNoteEvent[]>([]);

  /** User intent: reconnect input monitor after errors / hotplug when window regains focus. */
  let audioMonitorDesired = $state(false);
  /** User intent: reopen MIDI when port id changes after reconnect. */
  let midiListenDesired = $state(false);

  let focusDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function labelForSelectedAudio(): string | null {
    if (selectedId == null) return null;
    return devices.find((d) => d.id === selectedId)?.label ?? null;
  }

  function nameForSelectedMidi(): string | null {
    if (selectedMidiPortId == null) return null;
    return midiPorts.find((p) => p.id === selectedMidiPortId)?.name ?? null;
  }

  /**
   * When OS reorders inputs or MIDI port ids change, map saved labels to current ids.
   * Returns whether audio or MIDI selection changed.
   */
  function remapSelectionsAfterRefresh(): { audio: boolean; midi: boolean } {
    let audioRemapped = false;
    let midiRemapped = false;
    const hintLabel = prefs?.preferredInputDeviceLabel ?? null;
    if (selectedId != null && !devices.some((d) => d.id === selectedId)) {
      if (hintLabel) {
        const m = devices.find((d) => d.label === hintLabel);
        if (m) {
          selectedId = m.id;
          audioRemapped = true;
        }
      }
    }
    const hintMidi = prefs?.preferredMidiInputPortName ?? null;
    if (selectedMidiPortId != null && !midiPorts.some((p) => p.id === selectedMidiPortId)) {
      if (hintMidi) {
        const m = midiPorts.find((p) => p.name === hintMidi);
        if (m) {
          selectedMidiPortId = m.id;
          midiRemapped = true;
        }
      }
    }
    return { audio: audioRemapped, midi: midiRemapped };
  }

  async function reconnectAfterHotplugIfNeeded(flags: { audio: boolean; midi: boolean }) {
    if (audioMonitorDesired && (!monitoring || flags.audio)) {
      try {
        await invoke("stop_input_monitor").catch(() => {});
        monitoring = false;
        await invoke("start_input_monitor", { deviceId: selectedId });
        monitoring = true;
        error = null;
      } catch (e) {
        error = String(e);
      }
    }
    if (
      midiListenDesired &&
      selectedMidiPortId != null &&
      (!midiListening || flags.midi)
    ) {
      try {
        await invoke("stop_midi_input_listen").catch(() => {});
        midiListening = false;
        await invoke("start_midi_input_listen", { portId: selectedMidiPortId });
        midiListening = true;
        midiError = null;
      } catch (e) {
        midiError = String(e);
      }
    }
  }

  async function onWindowFocusHotplug() {
    if (!isTauri() || browserOnly) return;
    await refreshDevices();
    await refreshMidiPorts();
    const remapped = remapSelectionsAfterRefresh();
    if (remapped.audio || remapped.midi) {
      await savePrefs().catch(() => {});
    }
    await reconnectAfterHotplugIfNeeded(remapped);
  }

  function scheduleWindowFocusHotplug() {
    if (focusDebounceTimer != null) clearTimeout(focusDebounceTimer);
    focusDebounceTimer = setTimeout(() => {
      focusDebounceTimer = null;
      void onWindowFocusHotplug();
    }, 250);
  }

  async function refreshMidiPorts() {
    if (!isTauri()) return;
    midiError = null;
    try {
      midiPorts = await invoke<MidiInputPortInfo[]>("list_midi_input_ports");
    } catch (e) {
      midiError = String(e);
    }
  }

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
      selectedMidiPortId = prefs.preferredMidiInputPortId ?? null;
      await refreshMidiPorts();
      const initialRemap = remapSelectionsAfterRefresh();
      if (initialRemap.audio || initialRemap.midi) {
        await savePrefs().catch(() => {});
      }
      window.addEventListener("focus", scheduleWindowFocusHotplug);
      unlistenLevel = await listen<number>(EVENT_AUDIO_LEVEL, (ev) => {
        audioLevel = Math.min(1, Math.max(0, ev.payload));
      });
      unlistenInputError = await listen<string>(EVENT_AUDIO_INPUT_ERROR, (ev) => {
        error = ev.payload;
        monitoring = false;
        audioLevel = 0;
        /* Keep audioMonitorDesired so a window focus can retry after hotplug / stream errors. */
      });
      unlistenMidi = await listen<MidiNoteEvent>(EVENT_MIDI_NOTE, (ev) => {
        recentMidiNotes = [ev.payload, ...recentMidiNotes].slice(0, 8);
      });
    } catch (e) {
      error = String(e);
    }
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", scheduleWindowFocusHotplug);
    }
    if (focusDebounceTimer != null) {
      clearTimeout(focusDebounceTimer);
      focusDebounceTimer = null;
    }
    unlistenLevel?.();
    unlistenInputError?.();
    unlistenMidi?.();
    if (isTauri()) {
      invoke("stop_input_monitor").catch(() => {});
      invoke("stop_mock_audio_meter").catch(() => {});
      invoke("stop_midi_input_listen").catch(() => {});
    }
    audioMonitorDesired = false;
    midiListenDesired = false;
  });

  async function savePrefs() {
    if (!isTauri()) return;
    const next: AudioPreferences = {
      preferredInputDeviceId: selectedId,
      preferredInputDeviceLabel: labelForSelectedAudio(),
      latencyOffsetMs: latencyMs,
      preferredMidiInputPortId: selectedMidiPortId,
      preferredMidiInputPortName: nameForSelectedMidi(),
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
      audioMonitorDesired = true;
    } catch (e) {
      error = String(e);
    }
  }

  async function stopMonitor() {
    if (!isTauri()) return;
    await invoke("stop_input_monitor");
    monitoring = false;
    audioMonitorDesired = false;
    audioLevel = 0;
  }

  async function startMidiListen() {
    if (!isTauri() || selectedMidiPortId == null) return;
    midiError = null;
    try {
      await savePrefs();
      await invoke("start_midi_input_listen", { portId: selectedMidiPortId });
      midiListening = true;
      midiListenDesired = true;
    } catch (e) {
      midiError = String(e);
    }
  }

  async function stopMidiListen() {
    if (!isTauri()) return;
    await invoke("stop_midi_input_listen");
    midiListening = false;
    midiListenDesired = false;
  }
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Settings</h1>
<p class="muted">
  Audio input, MIDI monitoring, and latency offset (used for Practice scoring timing; not in audio DSP).
</p>

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
    <p class="muted" style="margin: -0.5rem 0 1rem; font-size: 0.82rem">
      After plugging or unplugging hardware, use Refresh or switch back to this window: lists update and active monitoring can reconnect when a saved device name still matches.
    </p>

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
  <p class="muted" style="margin-bottom: 0">
    Applied to <strong>Practice</strong> hit/miss timing (MIDI / mic rhythm). The chart highway does not shift.
  </p>
</div>

<div class="panel">
  <h2>MIDI input</h2>
  {#if browserOnly}
    <p class="muted" style="margin-bottom: 0">Open the desktop app to use MIDI.</p>
  {:else}
    {#if midiPorts.length === 0}
      <p class="muted">No MIDI input ports found. Connect a controller and use Refresh.</p>
    {:else}
      <fieldset style="border: none; margin: 0 0 1rem; padding: 0">
        <legend class="muted" style="margin-bottom: 0.5rem">Input port</legend>
        {#each midiPorts as p}
          <label class="row" style="margin-bottom: 0.35rem; cursor: pointer">
            <input
              type="radio"
              name="midi"
              checked={selectedMidiPortId === p.id}
              onchange={() => (selectedMidiPortId = p.id)}
            />
            <span>{p.name}</span>
          </label>
        {/each}
      </fieldset>
    {/if}

    <div class="row" style="margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem">
      <button type="button" class="btn" onclick={savePrefs}>Save MIDI preference</button>
      <button type="button" class="btn" onclick={refreshMidiPorts}>Refresh MIDI ports</button>
    </div>
    <p class="muted" style="margin: -0.5rem 0 1rem; font-size: 0.82rem">
      Saving stores the port name; if the backend assigns a new id after reconnect, refocus this window or Refresh to remap and reopen listening.
    </p>

    <div class="row" style="margin-bottom: 0.75rem">
      <button
        type="button"
        class="btn btn-primary"
        onclick={startMidiListen}
        disabled={midiListening || selectedMidiPortId == null || midiPorts.length === 0}
      >
        Start listening
      </button>
      <button type="button" class="btn" onclick={stopMidiListen} disabled={!midiListening}>
        Stop
      </button>
    </div>

    {#if recentMidiNotes.length > 0}
      <p class="muted" style="margin-bottom: 0.35rem">Recent notes (newest first)</p>
      <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.9rem">
        {#each recentMidiNotes as n}
          <li>
            {n.kind} ch{n.channel} note {n.note} vel {n.velocity}
            <span class="muted">({n.timestampUs} µs)</span>
          </li>
        {/each}
      </ul>
    {/if}

    {#if midiError}
      <p style="color: #f87171; margin-top: 0.75rem; margin-bottom: 0">{midiError}</p>
    {/if}
  {/if}
</div>
