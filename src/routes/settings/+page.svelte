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

<div class="settings-page">
  <section class="panel settings-hero ff-page-hero">
    <div class="settings-hero__copy">
      <p class="ff-page-hero__eyebrow">Studio setup</p>
      <h1 class="ff-page-hero__title">Turn setup into a soundcheck, not a debugging session.</h1>
      <p class="muted ff-page-hero__body">
        Configure audio input, MIDI, and latency for Practice scoring. The goal is simple: get one reliable signal path working quickly, then hide the lower-level details unless you need them.
      </p>
    </div>
    <div class="ff-page-hero__stats">
      <div class="ff-page-hero__stat">
        <span class="ff-page-hero__stat-label">Monitor</span>
        <strong>{monitoring ? "Live" : "Off"}</strong>
        <span class="muted">{monitoring ? "Mic input is flowing into the app." : "Start monitoring to unlock tuner and mic scoring."}</span>
      </div>
      <div class="ff-page-hero__stat">
        <span class="ff-page-hero__stat-label">Tuner</span>
        <strong>{tunerReading?.label ?? "Waiting"}</strong>
        <span class="muted">{tunerReading ? `${tunerReading.cents >= 0 ? "+" : ""}${tunerReading.cents.toFixed(1)} cents` : "Play one clean note after monitoring starts."}</span>
      </div>
      <div class="ff-page-hero__stat">
        <span class="ff-page-hero__stat-label">MIDI</span>
        <strong>{midiListening ? "Ready" : "Idle"}</strong>
        <span class="muted">{midiListening ? "A controller is actively feeding note input." : selectedMidiPortId ? "A port is selected but not listening yet." : "Choose a port if you prefer direct note scoring."}</span>
      </div>
    </div>
  </section>

  {#if !browserOnly && !setupGuideHidden}
    <div class="panel setup-guide-panel">
      <div class="ff-section-header setup-guide-panel__header">
        <div>
          <p class="ff-section-eyebrow setup-guide-panel__eyebrow">Setup wizard</p>
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

  <div class="settings-layout">
    <div class="settings-layout__main">
      <div class="panel settings-card" id="audio-input-section">
        <div class="ff-section-header settings-card__header">
          <div>
            <p class="ff-section-eyebrow">Signal path</p>
            <h2>Audio input</h2>
            <p class="muted ff-section-intro settings-card__intro">
              Pick one reliable input, start monitoring, and confirm the tuner can see a clean note before using mic scoring.
            </p>
          </div>
          <div class="settings-card__actions">
            <button type="button" class="btn btn-primary" onclick={startMonitor} disabled={monitoring || browserOnly}>
              Start monitoring
            </button>
            <button type="button" class="btn" onclick={stopMonitor} disabled={!monitoring || browserOnly}>Stop</button>
          </div>
        </div>
        {#if browserOnly}
          <p>Open the app with <code>npm run tauri dev</code> to use these controls.</p>
        {:else if error && !devices.length}
          <p style="color: #f87171">{error}</p>
        {:else}
          {#if defaultDevice}
            <p class="settings-inline-note">
              <span class="muted">OS default:</span>
              {defaultDevice.label}
            </p>
          {/if}
          {#if devices.length === 0}
            <p class="muted">No input devices reported by the OS.</p>
          {:else}
            <fieldset class="settings-choice-group">
              <legend class="muted">Input for monitoring</legend>
              <label class="row settings-choice-row">
                <input type="radio" name="in" checked={selectedId === null} onchange={() => (selectedId = null)} />
                <span>System default</span>
              </label>
              {#each devices as d}
                <label class="row settings-choice-row">
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

          <div class="settings-card__actions">
            <button type="button" class="btn" onclick={savePrefs}>Save preference</button>
            <button type="button" class="btn" onclick={refreshDevices}>Refresh device list</button>
          </div>
          <p class="muted settings-helper-copy">
            After plugging or unplugging hardware, use Refresh or switch back to this window: lists update and active monitoring can reconnect when a saved device name still matches.
          </p>

          {#if monitorStreamError}
            <div class="stream-error-banner" role="alert">
              <div class="row settings-banner__row">
                <p class="settings-banner__text">
                  <strong>Monitor error.</strong>
                  {monitorStreamError}
                </p>
                <button type="button" class="btn" onclick={() => (monitorStreamError = null)}>Dismiss</button>
              </div>
              <p class="muted settings-helper-copy">
                Try another device, sample rate, or buffer size below, then start again.
              </p>
            </div>
          {/if}

          <div class="settings-live-card">
            <p class="muted settings-live-card__label">Live level (~30/s)</p>
            <div class="meter" aria-label="Input level">
              <div class="meter-fill" style="width: {audioLevel * 100}%"></div>
            </div>
          </div>

          <div class="tuner-panel" aria-live="polite">
            <h3 class="tuner-panel__title">Chromatic tuner</h3>
            <p class="muted tuner-panel__hint">
              Start monitoring, then play a single clean note. This tuner follows the same pitch listening path used by mic-based Practice scoring.
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

          <details class="settings-advanced ff-disclosure">
            <summary>Advanced audio tuning</summary>
            <div class="settings-advanced__body ff-disclosure__body">
              <p class="muted settings-helper-copy">
                These settings only affect the live monitor. Smaller buffers can feel tighter, but they can also crackle on slower machines.
                Unsupported sample rates fall back to the device default.
              </p>
              {#if streamInfoError}
                <p style="color: #f87171; font-size: 0.9rem; margin: 0 0 0.5rem">{streamInfoError}</p>
              {:else if streamInfo}
                <p class="muted settings-helper-copy">
                  Device default: <strong>{streamInfo.defaultSampleRate} Hz</strong>, {streamInfo.defaultChannels}
                  ch, {streamInfo.sampleFormat}
                  {#if streamInfo.bufferFramesMin != null && streamInfo.bufferFramesMax != null}
                    · buffer range ~{streamInfo.bufferFramesMin}–{streamInfo.bufferFramesMax} frames
                  {/if}
                </p>
              {/if}
              <div class="settings-inline-fields">
                <label class="row settings-inline-label">
                  <span class="muted">Sample rate</span>
                  <select bind:value={streamSampleRateChoice}>
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
                <label class="row settings-inline-label">
                  <span class="muted">Buffer (frames)</span>
                  <input
                    type="text"
                    inputmode="numeric"
                    placeholder="Auto"
                    bind:value={streamBufferFramesStr}
                  />
                </label>
              </div>
              <div class="settings-card__actions">
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
          </details>
        {/if}
      </div>

      <div class="panel settings-card" id="latency-section">
        <div class="ff-section-header settings-card__header">
          <div>
            <p class="ff-section-eyebrow">Timing alignment</p>
            <h2>Latency</h2>
            <p class="muted ff-section-intro settings-card__intro">
              Shift Practice hit and miss timing for MIDI and mic input. Positive values delay the expected hit if you consistently register early.
            </p>
          </div>
        </div>
        <label class="row settings-inline-label settings-inline-label--wide">
          <span class="muted">Offset (ms)</span>
          <input type="number" bind:value={latencyMs} step="1" />
          <button type="button" class="btn" onclick={savePrefs}>Save</button>
        </label>

        <div class="settings-subsection">
          <h3 class="settings-subsection__title">Tap calibration</h3>
          <p class="muted settings-helper-copy">
            {TAP_CALIBRATION_BEATS} beeps at {TAP_CALIBRATION_BPM} BPM. After the 1 s count-in, tap <kbd class="settings-kbd">Space</kbd>
            on each beep. Fretflow uses the middle of those taps to suggest a timing offset. Treat it as a practical starting point, not a lab-grade measurement.
          </p>
          <div class="settings-card__actions" style="margin-bottom: 0.5rem">
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
    </div>

    <div class="settings-layout__side">
      <div class="panel settings-card" id="midi-input-section">
        <div class="ff-section-header settings-card__header">
          <div>
            <p class="ff-section-eyebrow">Direct note input</p>
            <h2>MIDI input</h2>
            <p class="muted ff-section-intro settings-card__intro">
              Choose a controller if you want direct note scoring instead of relying on the mic path.
            </p>
          </div>
          <div class="settings-card__actions">
            <button
              type="button"
              class="btn btn-primary"
              onclick={startMidiListen}
              disabled={midiListening || selectedMidiPortId == null || midiPorts.length === 0 || browserOnly}
            >
              Start listening
            </button>
            <button type="button" class="btn" onclick={stopMidiListen} disabled={!midiListening || browserOnly}>
              Stop
            </button>
          </div>
        </div>
        {#if browserOnly}
          <p class="muted" style="margin-bottom: 0">Open the desktop app to use MIDI.</p>
        {:else}
          {#if midiPorts.length === 0}
            <p class="muted">No MIDI input ports found. Connect a controller and use Refresh.</p>
          {:else}
            <fieldset class="settings-choice-group">
              <legend class="muted">Input port</legend>
              {#each midiPorts as p}
                <label class="row settings-choice-row">
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

          <div class="settings-card__actions">
            <button type="button" class="btn" onclick={savePrefs}>Save MIDI preference</button>
            <button type="button" class="btn" onclick={refreshMidiPorts}>Refresh MIDI ports</button>
          </div>
          <p class="muted settings-helper-copy">
            Port names are saved so reconnecting a controller stays predictable after unplugging and replugging. Refocusing this window or using Refresh remaps the active port.
          </p>

          {#if recentMidiNotes.length > 0}
            <details class="settings-advanced ff-disclosure">
              <summary>Recent controller activity</summary>
              <div class="settings-advanced__body ff-disclosure__body">
                <ul class="settings-midi-log">
                  {#each recentMidiNotes as n}
                    <li>
                      {#if n.kind === "pitch_bend"}
                        {n.source} · pitch bend ch{n.channel} value {inputEventMidiPitchBendRaw14(n) ?? "?"}
                        <span class="muted">(center 8192)</span>
                        <span class="muted">({n.timestampUs} µs)</span>
                      {:else}
                        {n.source} · {n.kind} ch{n.channel} note {n.note} vel {n.velocity}
                        <span class="muted">({n.timestampUs} µs)</span>
                      {/if}
                    </li>
                  {/each}
                </ul>
              </div>
            </details>
          {/if}

          {#if midiError}
            <div class="row settings-banner__row" style="margin-top: 0.75rem">
              <p style="color: #f87171; margin: 0; flex: 1">{midiError}</p>
              <button type="button" class="btn" onclick={() => (midiError = null)}>Dismiss</button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .settings-page {
    display: grid;
    gap: 1rem;
  }
  .settings-hero {
    background:
      radial-gradient(circle at top right, rgba(63, 208, 195, 0.14), transparent 28%),
      radial-gradient(circle at left center, rgba(213, 138, 84, 0.18), transparent 24%),
      linear-gradient(145deg, rgba(33, 24, 29, 0.96), rgba(18, 15, 19, 0.96));
  }
  .settings-hero .ff-page-hero__title {
    max-width: 14ch;
  }
  .settings-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.9fr);
    gap: 1rem;
    align-items: start;
  }
  .settings-layout__main,
  .settings-layout__side {
    display: grid;
    gap: 1rem;
  }
  .settings-card {
    display: grid;
    gap: 1rem;
  }
  .settings-card__intro {
    max-width: 44rem;
  }
  .settings-card__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    align-items: center;
  }
  .settings-inline-note {
    margin: 0;
    padding: 0.85rem 0.95rem;
    border-radius: 16px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.2);
  }
  .settings-choice-group {
    border: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.55rem;
  }
  .settings-choice-group legend {
    margin-bottom: 0.2rem;
  }
  .settings-choice-row {
    cursor: pointer;
    padding: 0.72rem 0.8rem;
    border-radius: 14px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.18);
  }
  .settings-helper-copy {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.55;
  }
  .settings-live-card {
    display: grid;
    gap: 0.45rem;
    padding: 0.95rem 1rem;
    border-radius: 16px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.22);
  }
  .settings-live-card__label {
    margin: 0;
  }
  .settings-banner__row {
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    align-items: flex-start;
  }
  .settings-banner__text {
    margin: 0;
    flex: 1;
    min-width: 10rem;
    font-size: 0.88rem;
    color: var(--ff-text);
  }
  .settings-advanced__body {
    gap: 0.8rem;
  }
  .settings-inline-fields {
    display: grid;
    gap: 0.8rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .settings-inline-label {
    gap: 0.5rem;
    align-items: center;
  }
  .settings-inline-label select,
  .settings-inline-label input {
    max-width: 100%;
  }
  .settings-inline-label--wide {
    flex-wrap: wrap;
  }
  .settings-subsection {
    padding-top: 1rem;
    border-top: 1px solid color-mix(in srgb, var(--ff-border) 65%, transparent);
  }
  .settings-subsection__title {
    margin: 0 0 0.35rem;
    font-size: 0.98rem;
  }
  .settings-kbd {
    padding: 0.1rem 0.35rem;
    border-radius: 6px;
    border: 1px solid var(--ff-border);
    background: rgba(9, 8, 10, 0.28);
  }
  .settings-midi-log {
    margin: 0;
    padding-left: 1.2rem;
    font-size: 0.88rem;
    line-height: 1.55;
  }
  .setup-guide-panel {
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--ff-success) 12%, transparent), transparent 36%),
      linear-gradient(180deg, rgba(31, 24, 29, 0.96), rgba(18, 15, 19, 0.96));
  }
  .setup-guide-panel__eyebrow {
    color: var(--ff-success);
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
    padding: 0.95rem 1rem;
    border-radius: 18px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.2);
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
    padding-top: 1rem;
    border-top: 1px solid color-mix(in srgb, var(--ff-border) 65%, transparent);
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
  .stream-error-banner {
    padding: 0.75rem 0.9rem;
    border-radius: 16px;
    border: 1px solid color-mix(in srgb, #f87171 50%, var(--ff-border));
    background: color-mix(in srgb, #f87171 10%, var(--ff-surface));
  }
  @media (max-width: 900px) {
    .settings-hero,
    .settings-layout {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 720px) {
    .setup-step,
    .settings-inline-fields {
      grid-template-columns: 1fr;
      align-items: flex-start;
    }
  }
</style>
