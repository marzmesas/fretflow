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
    inputEventIsMicPitchV1,
    inputEventMidiPitchBendRaw14,
  } from "$lib/ipc";
  import { readingFromMicPitch, type TunerReading } from "$lib/tuner/chromatic";
  import { isTauri } from "$lib/tauri-env";
  import { createMetronomeAudioContext, playMetronomeClick } from "$lib/chart/chart-metronome";
  import { confidenceBucket, trackAnalyticsEvent } from "$lib/analytics/events";
  import { markOnboardingStepCompleted } from "$lib/onboarding-storage";
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
  /** Input monitor / cpal stream failures from `audio:input_error` (dismissible). */
  let monitorStreamError = $state<string | null>(null);
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
  /** Latest mic YIN reading for chromatic tuner (monitor must be running). */
  let tunerReading = $state<TunerReading | null>(null);

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
  let setupGuideDismissed = $state(false);
  let lastTrackedTunerLabel = $state<string | null>(null);

  const setupSteps = $derived.by(() => [
    {
      id: "audio",
      title: "Start input monitoring",
      detail: monitoring
        ? "Your audio monitor is live. Practice can now use mic pitch or rhythm input."
        : "Choose an input and start monitoring so the app can read live level and pitch.",
      complete: monitoring,
      ctaLabel: monitoring ? "Open Practice" : "Start monitoring",
    },
    {
      id: "pitch",
      title: "Verify a note with the tuner",
      detail:
        monitoring && tunerReading != null
          ? `Detected ${tunerReading.label} at ${tunerReading.targetHz.toFixed(1)} Hz target.`
          : "Play one clean note and confirm the tuner locks onto it before scoring with the mic.",
      complete: monitoring && tunerReading != null,
      ctaLabel: monitoring ? "Use tuner below" : "Turn on monitoring first",
    },
    {
      id: "midi",
      title: "Enable MIDI input",
      detail: midiListening
        ? "A MIDI port is active. Note input will feed directly into Practice scoring."
        : selectedMidiPortId != null
          ? "A MIDI port is selected. Start listening to make it available in Practice."
          : "Select a MIDI controller if you want direct note scoring instead of mic input.",
      complete: midiListening,
      ctaLabel: midiListening ? "MIDI ready" : selectedMidiPortId != null ? "Start listening" : "Choose a MIDI port",
    },
  ]);

  const setupCompletedCount = $derived(setupSteps.filter((step) => step.complete).length);
  const setupGuideHidden = $derived(setupGuideDismissed || setupCompletedCount === setupSteps.length);

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
        monitorStreamError = null;
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
        monitorStreamError = ev.payload;
        monitoring = false;
        audioLevel = 0;
        /* Keep audioMonitorDesired so a window focus can retry after hotplug / stream errors. */
      });
      unlistenMidi = await listen<InputEventPayload>(EVENT_INPUT_EVENT, (ev) => {
        const p = ev.payload;
        recentMidiNotes = [p, ...recentMidiNotes].slice(0, 8);
        if (
          inputEventIsMicPitchV1(p) &&
          p.pitchHz != null &&
          p.pitchHz > 30 &&
          (p.confidence ?? 0) >= 0.22
        ) {
          tunerReading = readingFromMicPitch(p.note, p.pitchHz, p.confidence ?? 0);
          if (tunerReading != null && tunerReading.label !== lastTrackedTunerLabel) {
            trackAnalyticsEvent("tuner_note_detected", {
              detected_note: tunerReading.label,
              confidence_bucket: confidenceBucket(tunerReading.confidence),
            });
            lastTrackedTunerLabel = tunerReading.label;
          }
        }
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
    trackAnalyticsEvent("latency_calibration_started", { method: "tap" });
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
    trackAnalyticsEvent("latency_calibration_applied", {
      method: "tap",
      offset_ms: tapCalSuggested,
    });
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
    if (selectedId != null || selectedMidiPortId != null || latencyMs !== 0) {
      markOnboardingStepCompleted("settings");
    }
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
    monitorStreamError = null;
    try {
      await savePrefs();
      await invoke("start_input_monitor", {
        deviceId: selectedId,
      });
      monitoring = true;
      audioMonitorDesired = true;
      markOnboardingStepCompleted("settings");
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
      markOnboardingStepCompleted("settings");
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

  async function runSetupStep(stepId: string) {
    switch (stepId) {
      case "audio":
        if (!monitoring) {
          await startMonitor();
          return;
        }
        window.location.hash = "latency-section";
        return;
      case "pitch":
        window.location.hash = "audio-input-section";
        return;
      case "midi":
        if (!midiListening && selectedMidiPortId != null) {
          await startMidiListen();
        } else {
          window.location.hash = "midi-input-section";
        }
        return;
      default:
        return;
    }
  }
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Settings</h1>
<p class="muted">
  Configure your audio input, MIDI controller, and latency offset for Practice scoring.
  Monitoring and MIDI connections stay active when you navigate away — stop them here or close the app.
</p>

{#if !browserOnly && !setupGuideHidden}
  <div class="panel setup-guide-panel">
    <div class="setup-guide-panel__header">
      <div>
        <p class="setup-guide-panel__eyebrow">Setup wizard</p>
        <h2>Get ready for your first scored session</h2>
      </div>
      <button type="button" class="btn" onclick={() => (setupGuideDismissed = true)}>Dismiss</button>
    </div>
    <p class="muted" style="margin: 0 0 0.85rem">
      {setupCompletedCount} of {setupSteps.length} steps complete. Finish the basics here, then switch to Practice.
    </p>
    <div class="setup-guide-steps" role="list" aria-label="Settings setup steps">
      {#each setupSteps as step (step.id)}
        <div class="setup-step" role="listitem">
          <div class="setup-step__status" class:setup-step__status--done={step.complete}>
            {step.complete ? "Done" : "Next"}
          </div>
          <div class="setup-step__body">
            <div class="setup-step__title">{step.title}</div>
            <p class="setup-step__detail">{step.detail}</p>
          </div>
          <button
            type="button"
            class="btn"
            class:btn-primary={!step.complete}
            onclick={() => void runSetupStep(step.id)}
          >
            {step.ctaLabel}
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<div class="panel" id="audio-input-section">
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

    {#if monitorStreamError}
      <div
        class="stream-error-banner"
        role="alert"
        style="margin-bottom: 1rem; padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid color-mix(in srgb, #f87171 50%, var(--ff-border)); background: color-mix(in srgb, #f87171 10%, var(--ff-surface))"
      >
        <div class="row" style="flex-wrap: wrap; justify-content: space-between; gap: 0.5rem 1rem; align-items: flex-start">
          <p style="margin: 0; flex: 1; min-width: 10rem; font-size: 0.88rem; color: var(--ff-text)">
            <strong>Monitor error.</strong>
            {monitorStreamError}
          </p>
          <button type="button" class="btn" onclick={() => (monitorStreamError = null)}>Dismiss</button>
        </div>
        <p class="muted" style="margin: 0.45rem 0 0; font-size: 0.8rem">
          Try another device, sample rate, or buffer size below, then start again.
        </p>
      </div>
    {/if}

    <p class="muted" style="margin-bottom: 0.35rem">Live level (~30/s)</p>
    <div class="meter" aria-label="Input level">
      <div class="meter-fill" style="width: {audioLevel * 100}%"></div>
    </div>

    <div class="tuner-panel" aria-live="polite">
      <h3 class="tuner-panel__title">Chromatic tuner</h3>
      <p class="muted tuner-panel__hint">
        Uses the same YIN pitch path as Practice mic scoring. Start monitoring, then play a single note.
        Reference A4 = 440 Hz.
      </p>
      {#if !monitoring}
        <p class="muted tuner-panel__idle">Start monitoring to see pitch.</p>
      {:else if tunerReading == null}
        <p class="muted tuner-panel__idle">Listening… play a note.</p>
      {:else}
        {@const cents = tunerReading.cents}
        {@const needlePct = Math.min(92, Math.max(8, 50 + (cents / 45) * 38))}
        {@const inTune = Math.abs(cents) < 8}
        <div class="tuner-note">{tunerReading.label}</div>
        <div class="tuner-meta">
          <span>{tunerReading.targetHz.toFixed(1)} Hz target</span>
          <span class="muted">·</span>
          <span>conf {tunerReading.confidence.toFixed(2)}</span>
        </div>
        <div class="tuner-track" aria-label="Cents deviation from equal temperament">
          <div class="tuner-track__tick tuner-track__tick--center"></div>
          <div class="tuner-track__labels">
            <span>♭</span><span>0</span><span>♯</span>
          </div>
          <div
            class="tuner-needle"
            class:tuner-needle--green={inTune}
            style="left: {needlePct}%"
          ></div>
        </div>
        <p class="tuner-cents" class:tuner-cents--green={inTune}>
          {cents >= 0 ? "+" : ""}{cents.toFixed(1)} cents
          {#if inTune}<span class="muted"> — in tune</span>{/if}
        </p>
      {/if}
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

<div class="panel" id="latency-section">
  <h2>Latency</h2>
  <p class="muted" style="margin: 0 0 0.65rem; font-size: 0.88rem">
    Shifts Practice hit/miss timing for MIDI and mic. The chart highway stays unchanged.
    Positive values delay the expected hit (use if you're consistently early).
  </p>
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

<div class="panel" id="midi-input-section">
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
      Port names are saved so connections survive id changes after unplug/replug. Refocusing this window or using Refresh remaps and reopens.
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
      <p class="muted" style="margin-bottom: 0.35rem">Recent MIDI events (newest first)</p>
      <ul style="margin: 0; padding-left: 1.25rem; font-size: 0.9rem">
        {#each recentMidiNotes as n}
          <li>
            {#if n.kind === "pitch_bend"}
              {n.source} · pitch bend ch{n.channel} raw14 {inputEventMidiPitchBendRaw14(n) ?? "?"}
              <span class="muted">(center 8192)</span>
              <span class="muted">({n.timestampUs} µs)</span>
            {:else}
              {n.source} · {n.kind} ch{n.channel} note {n.note} vel {n.velocity}
              <span class="muted">({n.timestampUs} µs)</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if midiError}
      <div class="row" style="margin-top: 0.75rem; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: flex-start">
        <p style="color: #f87171; margin: 0; flex: 1">{midiError}</p>
        <button type="button" class="btn" onclick={() => (midiError = null)}>Dismiss</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .setup-guide-panel {
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--ff-success) 12%, transparent), transparent 36%),
      linear-gradient(180deg, color-mix(in srgb, var(--ff-surface) 94%, #101826), var(--ff-surface));
  }
  .setup-guide-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem 1rem;
    flex-wrap: wrap;
  }
  .setup-guide-panel__eyebrow {
    margin: 0 0 0.2rem;
    color: var(--ff-success);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.74rem;
    font-weight: 700;
  }
  .setup-guide-steps {
    display: grid;
    gap: 0.7rem;
  }
  .setup-step {
    display: grid;
    grid-template-columns: 3.25rem minmax(0, 1fr) auto;
    gap: 0.75rem;
    align-items: center;
    padding: 0.8rem 0.85rem;
    border-radius: 10px;
    border: 1px solid var(--ff-border);
    background: color-mix(in srgb, var(--ff-bg) 72%, transparent);
  }
  .setup-step__status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2rem;
    border-radius: 999px;
    border: 1px solid var(--ff-border);
    color: var(--ff-muted);
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .setup-step__status--done {
    color: var(--ff-success);
    border-color: color-mix(in srgb, var(--ff-success) 50%, var(--ff-border));
  }
  .setup-step__title {
    font-size: 0.94rem;
    font-weight: 600;
    color: var(--ff-text);
  }
  .setup-step__detail {
    margin: 0.2rem 0 0;
    font-size: 0.84rem;
    color: var(--ff-muted);
  }
  @media (max-width: 720px) {
    .setup-step {
      grid-template-columns: 1fr;
      align-items: flex-start;
    }
  }
  .tuner-panel {
    margin-top: 1.25rem;
    padding-top: 1.1rem;
    border-top: 1px solid var(--ff-border);
  }
  .tuner-panel__title {
    margin: 0 0 0.35rem;
    font-size: 0.95rem;
  }
  .tuner-panel__hint {
    margin: 0 0 0.65rem;
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .tuner-panel__idle {
    margin: 0;
    font-size: 0.88rem;
  }
  .tuner-note {
    font-size: 1.65rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    margin: 0.25rem 0 0.15rem;
  }
  .tuner-meta {
    font-size: 0.82rem;
    color: var(--ff-muted);
    margin-bottom: 0.55rem;
  }
  .tuner-track {
    position: relative;
    height: 1.35rem;
    margin: 0.35rem 0 0.25rem;
    border-radius: 6px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, #60a5fa 25%, var(--ff-surface)) 0%,
      color-mix(in srgb, #34d399 35%, var(--ff-surface)) 46%,
      color-mix(in srgb, #34d399 35%, var(--ff-surface)) 54%,
      color-mix(in srgb, #60a5fa 25%, var(--ff-surface)) 100%
    );
    border: 1px solid var(--ff-border);
  }
  .tuner-track__tick--center {
    position: absolute;
    left: 50%;
    top: 0;
    bottom: 0;
    width: 2px;
    margin-left: -1px;
    background: color-mix(in srgb, var(--ff-text) 35%, transparent);
    pointer-events: none;
  }
  .tuner-track__labels {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 0.5rem;
    font-size: 0.72rem;
    color: var(--ff-muted);
    pointer-events: none;
  }
  .tuner-needle {
    position: absolute;
    top: -0.2rem;
    bottom: -0.2rem;
    width: 3px;
    margin-left: -1.5px;
    border-radius: 2px;
    background: #fbbf24;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ff-bg) 70%, #000);
    transition: left 80ms linear;
    pointer-events: none;
  }
  .tuner-needle--green {
    background: #34d399;
  }
  .tuner-cents {
    margin: 0.35rem 0 0;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
  }
  .tuner-cents--green {
    color: #34d399;
  }
</style>
