/**
 * IPC event names — keep in sync with `src-tauri/src/ipc.rs` and `docs/IPC.md`.
 */
export const EVENT_AUDIO_LEVEL = "audio:level";
/** cpal stream / monitor failure — payload is a human-readable string */
export const EVENT_AUDIO_INPUT_ERROR = "audio:input_error";
export const EVENT_MIDI_NOTE = "input:midi_note";
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
  latencyOffsetMs: number;
};
