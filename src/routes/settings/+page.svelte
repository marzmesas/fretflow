<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import type {
    AudioInputDevice,
    AudioPreferences,
    InputConnectionStatus,
    InputDeviceStreamInfo,
    InputEventPayload,
    MidiInputPortInfo,
  } from "$lib/ipc";
  import {
    EVENT_AUDIO_INPUT_ERROR,
    EVENT_AUDIO_LEVEL,
    EVENT_INPUT_EVENT,
  } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";
  import { createMetronomeAudioContext, playMetronomeClick } from "$lib/chart/chart-metronome";
  import {
    TAP_CALIBRATION_BEATS,
    TAP_CALIBRATION_BPM,
    beatIntervalMs,
    median,
    orderedTapDeltas,
  } from "$lib/latency-tap-calibration";

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
  let recentMidiNotes = $state<InputEventPayload[]>([]);

  /** User intent: reconnect input monitor after errors / hotplug when window regains focus. */
  let audioMonitorDesired = $state(false);
  /** User intent: reopen MIDI when port id changes after reconnect. */
  let midiListenDesired = $state(false);

  let focusDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** `""` = use device default sample rate. */
  let streamSampleRateChoice = $state("");
  /** Empty = cpal default buffer; otherwise frames per buffer (numeric string). */
  let streamBufferFramesStr = $state("");
  let streamInfo = $state<InputDeviceStreamInfo | null>(null);
  let streamInfoError = $state<string | null>(null);

  let tapCalRunning = $state(false);
  let tapCalSuggested = $state<number | null>(null);
  let tapCalTimeout: ReturnType<typeof setTimeout> | null = null;
  let tapCalKeyHandler: ((e: KeyboardEvent) => void) | null = null;

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

  async function refreshStreamInfo() {
    if (!isTauri()) return;
    streamInfoError = null;
    try {
      streamInfo = await invoke<InputDeviceStreamInfo>("get_input_device_stream_info", {
        deviceId: selectedId,
      });
    } catch (e) {
      streamInfo = null;
      streamInfoError = String(e);
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
      streamSampleRateChoice =
        prefs.inputStreamSampleRateHz != null && prefs.inputStreamSampleRateHz !== undefined
          ? String(prefs.inputStreamSampleRateHz)
          : "";
      streamBufferFramesStr =
        prefs.inputStreamBufferFrames != null && prefs.inputStreamBufferFrames !== undefined
          ? String(prefs.inputStreamBufferFrames)
          : "";
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
      unlistenMidi = await listen<InputEventPayload>(EVENT_INPUT_EVENT, (ev) => {
        recentMidiNotes = [ev.payload, ...recentMidiNotes].slice(0, 8);
      });
      const conn = await invoke<InputConnectionStatus>("get_input_connection_status");
      monitoring = conn.inputMonitorActive;
      midiListening = conn.midiListenActive;
      audioMonitorDesired = conn.inputMonitorActive;
      midiListenDesired = conn.midiListenActive;
      await refreshStreamInfo();
    } catch (e) {
      error = String(e);
    }
  });

  $effect(() => {
    if (!isTauri() || browserOnly) return;
    void selectedId;
    void refreshStreamInfo();
  });

  function stopTapCalibration() {
    if (tapCalTimeout != null) {
      clearTimeout(tapCalTimeout);
      tapCalTimeout = null;
    }
    if (tapCalKeyHandler && typeof window !== "undefined") {
      window.removeEventListener("keydown", tapCalKeyHandler);
      tapCalKeyHandler = null;
    }
    tapCalRunning = false;
  }

  function startTapCalibration() {
    if (typeof window === "undefined") return;
    stopTapCalibration();
    tapCalSuggested = null;
    tapCalRunning = true;
    const expectedWall: number[] = [];
    const tapsLocal: number[] = [];
    const ctx = createMetronomeAudioContext();
    void ctx?.resume();
    const beatMs = beatIntervalMs(TAP_CALIBRATION_BPM);

    tapCalKeyHandler = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      e.preventDefault();
      tapsLocal.push(performance.now());
    };
    window.addEventListener("keydown", tapCalKeyHandler);

    let beatIndex = 0;
    const finish = () => {
      if (tapCalKeyHandler) {
        window.removeEventListener("keydown", tapCalKeyHandler);
        tapCalKeyHandler = null;
      }
      tapCalTimeout = null;
      const deltas = orderedTapDeltas(expectedWall, tapsLocal);
      tapCalSuggested = deltas.length ? Math.round(median(deltas)) : null;
      tapCalRunning = false;
    };

    const scheduleBeat = () => {
      if (ctx) playMetronomeClick(ctx);
      expectedWall.push(performance.now());
      beatIndex++;
      if (beatIndex >= TAP_CALIBRATION_BEATS) {
        tapCalTimeout = window.setTimeout(finish, 1500);
        return;
      }
      tapCalTimeout = window.setTimeout(scheduleBeat, beatMs);
    };

    tapCalTimeout = window.setTimeout(scheduleBeat, 1000);
  }

  async function applyTapSuggestedOffset() {
    if (tapCalSuggested == null) return;
    latencyMs = tapCalSuggested;
    await savePrefs();
  }

  onDestroy(() => {
    stopTapCalibration();
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
    /* Input monitor and MIDI keep running for Practice / layout status; stop from Settings buttons. */
    audioMonitorDesired = false;
    midiListenDesired = false;
  });

  function parseBufferFrames(): number | null {
    const t = streamBufferFramesStr.trim();
    if (t === "") return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 1) return null;
    return Math.round(n);
  }

  async function savePrefs() {
    if (!isTauri()) return;
    const base =
      prefs ??
      (await invoke<AudioPreferences>("get_audio_preferences").catch(() => null));
    const next: AudioPreferences = {
      preferredInputDeviceId: selectedId,
      preferredInputDeviceLabel: labelForSelectedAudio(),
      latencyOffsetMs: latencyMs,
      preferredMidiInputPortId: selectedMidiPortId,
      preferredMidiInputPortName: nameForSelectedMidi(),
      backingDroneEnabled: base?.backingDroneEnabled ?? false,
      backingDroneMuted: base?.backingDroneMuted ?? false,
      inputStreamSampleRateHz:
        streamSampleRateChoice === "" ? null : Number(streamSampleRateChoice),
      inputStreamBufferFrames: parseBufferFrames(),
    };
    await invoke("set_audio_preferences", { prefs: next });
    prefs = next;
  }

  /** Save stream prefs and reopen the cpal monitor so new buffer/rate apply. */
  async function saveStreamPrefsAndRestartMonitor() {
    if (!isTauri()) return;
    await savePrefs();
    if (!audioMonitorDesired && !monitoring) return;
    try {
      await invoke("stop_input_monitor").catch(() => {});
      monitoring = false;
      await invoke("start_input_monitor", { deviceId: selectedId });
      monitoring = true;
      audioMonitorDesired = true;
      error = null;
    } catch (e) {
      error = String(e);
    }
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
  Audio input, MIDI monitoring, and latency offset (used for Practice scoring timing; not in audio DSP). Monitoring and MIDI stay active when you switch routes — use <strong>Stop</strong> here or close the app.
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

    <div
      style="margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid var(--ff-border)"
    >
      <h3 style="margin: 0 0 0.35rem; font-size: 0.95rem">Advanced (cpal stream)</h3>
      <p class="muted" style="margin: 0 0 0.65rem; font-size: 0.82rem">
        Applies to the <strong>input monitor</strong> only. Lower buffer frames can reduce latency but may glitch on slow machines.
        Invalid sample rates fall back to the device default.
      </p>
      {#if streamInfoError}
        <p style="color: #f87171; font-size: 0.9rem; margin: 0 0 0.5rem">{streamInfoError}</p>
      {:else if streamInfo}
        <p class="muted" style="margin: 0 0 0.5rem; font-size: 0.82rem">
          Device default: <strong>{streamInfo.defaultSampleRate} Hz</strong>, {streamInfo.defaultChannels}
          ch, {streamInfo.sampleFormat}
          {#if streamInfo.bufferFramesMin != null && streamInfo.bufferFramesMax != null}
            · buffer range ~{streamInfo.bufferFramesMin}–{streamInfo.bufferFramesMax} frames
          {/if}
        </p>
      {/if}
      <div class="row" style="flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-bottom: 0.65rem">
        <label class="row" style="gap: 0.5rem; align-items: center">
          <span class="muted">Sample rate</span>
          <select
            bind:value={streamSampleRateChoice}
            style="padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--ff-border); background: var(--ff-bg); color: var(--ff-text)"
          >
            <option value="">
              Auto ({streamInfo?.defaultSampleRate ?? "…"} Hz)
            </option>
            {#if streamSampleRateChoice !== "" && streamInfo && !streamInfo.supportedSampleRates.includes(Number(streamSampleRateChoice))}
              <option value={streamSampleRateChoice}>{streamSampleRateChoice} Hz (saved)</option>
            {/if}
            {#if streamInfo}
              {#each streamInfo.supportedSampleRates as hz}
                <option value={String(hz)}>{hz} Hz</option>
              {/each}
            {/if}
          </select>
        </label>
        <label class="row" style="gap: 0.5rem; align-items: center">
          <span class="muted">Buffer (frames)</span>
          <input
            type="text"
            inputmode="numeric"
            placeholder="Auto"
            bind:value={streamBufferFramesStr}
            style="width: 5.5rem; padding: 0.35rem 0.5rem; border-radius: 6px; border: 1px solid var(--ff-border); background: var(--ff-bg); color: var(--ff-text)"
          />
        </label>
      </div>
      <div class="row" style="flex-wrap: wrap; gap: 0.5rem">
        <button type="button" class="btn" onclick={() => void refreshStreamInfo()} disabled={browserOnly}>
          Refresh caps
        </button>
        <button type="button" class="btn" onclick={() => void savePrefs()} disabled={browserOnly}>
          Save stream prefs
        </button>
        <button
          type="button"
          class="btn btn-primary"
          onclick={() => void saveStreamPrefsAndRestartMonitor()}
          disabled={browserOnly}
        >
          Save &amp; restart monitor
        </button>
      </div>
    </div>
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

  <div
    style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--ff-border)"
  >
    <h3 style="margin: 0 0 0.35rem; font-size: 0.95rem">Tap calibration (rough)</h3>
    <p class="muted" style="margin: 0 0 0.65rem; font-size: 0.82rem">
      {TAP_CALIBRATION_BEATS} beeps at {TAP_CALIBRATION_BPM} BPM. After the 1 s count-in, tap <kbd
        style="padding: 0.1rem 0.35rem; border-radius: 4px; border: 1px solid var(--ff-border)"
        >Space</kbd
      >
      on each beep. Median (tap − beep) is a <strong>heuristic</strong> offset hint — not a lab impulse
      measurement.
    </p>
    <div class="row" style="flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem">
      <button
        type="button"
        class="btn btn-primary"
        onclick={startTapCalibration}
        disabled={tapCalRunning || browserOnly}
      >
        {tapCalRunning ? "Listening…" : "Start tap test"}
      </button>
      {#if tapCalRunning}
        <button type="button" class="btn" onclick={stopTapCalibration}>Cancel</button>
      {/if}
    </div>
    {#if tapCalSuggested != null}
      <p style="margin: 0 0 0.5rem; font-size: 0.9rem">
        Suggested offset: <strong>{tapCalSuggested} ms</strong>
        <span class="muted" style="font-size: 0.82rem">
          (positive ≈ taps after the beep on average)</span
        >
      </p>
      <button
        type="button"
        class="btn"
        onclick={() => void applyTapSuggestedOffset()}
        disabled={browserOnly}
      >
        Set offset to suggested &amp; save
      </button>
    {/if}
  </div>
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
            {n.source} · {n.kind} ch{n.channel} note {n.note} vel {n.velocity}
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
