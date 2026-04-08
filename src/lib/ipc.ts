/**
 * IPC event names — keep in sync with `src-tauri/src/ipc.rs` and `docs/IPC.md`.
 */
export const EVENT_AUDIO_LEVEL = "audio:level";
/** cpal stream / monitor failure — payload is a human-readable string */
export const EVENT_AUDIO_INPUT_ERROR = "audio:input_error";
/** Unified input stream (MIDI today; mic / other sources later). */
export const EVENT_INPUT_EVENT = "input:event";
export const EVENT_PRACTICE_TICK = "practice:tick";

export type AppInfo = {
  name: string;
  version: string;
  displayName: string;
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
