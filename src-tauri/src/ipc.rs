//! IPC naming for Rust ↔ frontend. **Keep in sync** with `src/lib/ipc.ts` and `docs/IPC.md`.

/// Throttled input level for UI meters (`f32` in `0.0..=1.0`).
pub const AUDIO_LEVEL: &str = "audio:level";

/// Input monitor or cpal stream failure (`String` message for the UI).
pub const AUDIO_INPUT_ERROR: &str = "audio:input_error";

/// Unified realtime input: MIDI today; future mic onset / pitch as additional `source` values.
pub const INPUT_EVENT: &str = "input:event";

/// Future: playhead / scoring ticks toward the UI.
#[allow(dead_code)]
pub const PRACTICE_TICK: &str = "practice:tick";
