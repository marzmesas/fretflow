/**
 * IPC event names — keep in sync with `src-tauri/src/ipc.rs` and `docs/IPC.md`.
 */
export const EVENT_AUDIO_LEVEL = "audio:level";
/** cpal stream / monitor failure — payload is a human-readable string */
export const EVENT_AUDIO_INPUT_ERROR = "audio:input_error";
/** Unified input stream (MIDI + mic pitch events). */
export const EVENT_INPUT_EVENT = "input:event";
export const EVENT_PRACTICE_TICK = "practice:tick";

export type AppInfo = {
  name: string;
  version: string;
  displayName: string;
};

/** From `get_session` / `dev_sign_in` / `sign_out` — local stub until real auth. */
export type AppSession = {
  schemaVersion: number;
  signedIn: boolean;
  authKind: string | null;
  displayName: string | null;
  signedInAtUnixMs: number | null;
  /** Placeholder capability strings for future gating (dev login fills local:*). */
  entitlements: string[];
};

/** From `get_subscription_state` / `sync_subscription_now` / `set_subscription_api_base`. */
export type SubscriptionState = {
  schemaVersion: number;
  apiBaseUrl: string;
  graceDays: number;
  subscriptionStatus: string;
  tier: string | null;
  validUntilUnixMs: number | null;
  lastSyncOkUnixMs: number;
  lastSyncError: string | null;
  lastSyncSucceeded: boolean;
  offlineGraceActive: boolean;
  entitled: boolean;
};

/** From `get_input_connection_status` — cpal monitor and MIDI listener threads. */
export type InputConnectionStatus = {
  inputMonitorActive: boolean;
  midiListenActive: boolean;
};

export type AudioInputDevice = {
  id: string;
  label: string;
};

export type AudioPreferences = {
  preferredInputDeviceId: string | null;
  /** Matches `AudioInputDevice.label` when a specific input was saved (hotplug remapping). */
  preferredInputDeviceLabel?: string | null;
  latencyOffsetMs: number;
  /** Opaque id from `list_midi_input_ports` */
  preferredMidiInputPortId: string | null;
  /** Matches `MidiInputPortInfo.name` when a port was saved (hotplug remapping). */
  preferredMidiInputPortName?: string | null;
  /** Practice: low sine drone placeholder until stems. */
  backingDroneEnabled?: boolean;
  backingDroneMuted?: boolean;
  /** Input monitor: `null` = device default sample rate. */
  inputStreamSampleRateHz?: number | null;
  /** Input monitor: `null` = cpal default buffer; else fixed frames (clamped to device range when known). */
  inputStreamBufferFrames?: number | null;
};

/** From `get_input_device_stream_info` — capabilities for the selected (or default) input device. */
export type InputDeviceStreamInfo = {
  defaultSampleRate: number;
  defaultChannels: number;
  sampleFormat: string;
  supportedSampleRates: number[];
  bufferFramesMin: number | null;
  bufferFramesMax: number | null;
};

export type MidiInputPortInfo = {
  id: string;
  name: string;
};

/** Payload for `input:event` (versioned; ignore unknown `schemaVersion`). */
export type InputEventPayload = {
  schemaVersion: number;
  source: string;
  kind: string;
  channel: number;
  note: number;
  velocity: number;
  timestampUs: number;
  pitchHz?: number | null;
  confidence?: number | null;
};

export function inputEventIsMidiV1(e: InputEventPayload): boolean {
  return e.schemaVersion === 1 && e.source === "midi";
}

/** Live monitor + YIN pitch → `note_on` with `pitchHz` / `confidence`. */
export function inputEventIsMicPitchV1(e: InputEventPayload): boolean {
  return e.schemaVersion === 1 && e.source === "mic" && e.kind === "note_on";
}

/** Mic legato / teardown — `note_off`, no `pitchHz` in payload. */
export function inputEventIsMicNoteOffV1(e: InputEventPayload): boolean {
  return e.schemaVersion === 1 && e.source === "mic" && e.kind === "note_off";
}

/** MIDI `pitch_bend`: 14-bit unsigned `0..16383` packed in `note` (LSB) and `velocity` (MSB); center = 8192. */
export function inputEventMidiPitchBendRaw14(e: InputEventPayload): number | null {
  if (e.schemaVersion !== 1 || e.source !== "midi" || e.kind !== "pitch_bend") {
    return null;
  }
  return e.note | (e.velocity << 7);
}
