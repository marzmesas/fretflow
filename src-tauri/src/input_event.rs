//! Unified Rust → UI input events ([`InputEvent`]) for MIDI, future mic pitch, etc.

use serde::Serialize;

/// Bump when adding sources or breaking field meaning (UI should ignore unknown `schemaVersion`).
pub const INPUT_EVENT_SCHEMA_VERSION: u32 = 1;

pub const INPUT_SOURCE_MIDI: &str = "midi";

/// Single envelope for all realtime playing inputs; MIDI path fills voice fields today.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputEvent {
    pub schema_version: u32,
    pub source: &'static str,
    pub kind: String,
    pub channel: u8,
    pub note: u8,
    pub velocity: u8,
    pub timestamp_us: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_hz: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<f32>,
}

impl InputEvent {
    #[must_use]
    pub fn from_midi_voice(
        kind: String,
        channel: u8,
        note: u8,
        velocity: u8,
        timestamp_us: u64,
    ) -> Self {
        Self {
            schema_version: INPUT_EVENT_SCHEMA_VERSION,
            source: INPUT_SOURCE_MIDI,
            kind,
            channel,
            note,
            velocity,
            timestamp_us,
            pitch_hz: None,
            confidence: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_event_json_shape() {
        let ev = InputEvent::from_midi_voice("note_on".into(), 0, 60, 100, 42);
        let s = serde_json::to_value(&ev).unwrap();
        assert_eq!(s["schemaVersion"], 1);
        assert_eq!(s["source"], "midi");
        assert_eq!(s["kind"], "note_on");
        assert!(!s.as_object().unwrap().contains_key("pitchHz"));
    }
}
