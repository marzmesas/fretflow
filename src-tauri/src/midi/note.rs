//! Voice message parsing → wrapped in [`crate::input_event::InputEvent`] (`input:event`).

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiNoteIpc {
    pub kind: String,
    pub channel: u8,
    pub note: u8,
    pub velocity: u8,
    pub timestamp_us: u64,
}

pub fn voice_message_to_ipc(timestamp_us: u64, bytes: &[u8]) -> Option<MidiNoteIpc> {
    if bytes.len() < 3 {
        return None;
    }
    let status = bytes[0];
    if status < 0x80 {
        return None;
    }
    let high = status & 0xF0;
    let channel = status & 0x0F;
    let note = bytes[1];
    let velocity = bytes[2];
    match high {
        0x80 => Some(MidiNoteIpc {
            kind: "note_off".into(),
            channel,
            note,
            velocity,
            timestamp_us,
        }),
        0x90 => {
            if velocity == 0 {
                Some(MidiNoteIpc {
                    kind: "note_off".into(),
                    channel,
                    note,
                    velocity: 0,
                    timestamp_us,
                })
            } else {
                Some(MidiNoteIpc {
                    kind: "note_on".into(),
                    channel,
                    note,
                    velocity,
                    timestamp_us,
                })
            }
        }
        _ => None,
    }
}
