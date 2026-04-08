//! MIDI input enumeration and live note events ([`midir`]).

mod error;
mod note;

pub use error::MidiError;

use std::sync::Mutex;

use midir::MidiInput;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::ipc;

static MIDI_INPUT: Mutex<Option<midir::MidiInputConnection<AppHandle>>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiInputPortInfo {
    /// Stable opaque id from the backend (use when opening a connection).
    pub id: String,
    pub name: String,
}

fn map_midi_err<T>(r: Result<T, MidiError>) -> Result<T, String> {
    r.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_midi_input_ports() -> Result<Vec<MidiInputPortInfo>, String> {
    map_midi_err(list_midi_input_ports_inner())
}

fn list_midi_input_ports_inner() -> Result<Vec<MidiInputPortInfo>, MidiError> {
    let midi_in = MidiInput::new("Fretflow")?;
    let mut out = Vec::new();
    for port in midi_in.ports() {
        let id = port.id();
        let name = midi_in
            .port_name(&port)
            .unwrap_or_else(|_| format!("MIDI port ({id})"));
        out.push(MidiInputPortInfo { id, name });
    }
    Ok(out)
}

fn close_midi_listener() -> Result<(), MidiError> {
    let mut guard = MIDI_INPUT.lock().map_err(|_| MidiError::LockPoisoned)?;
    if let Some(conn) = guard.take() {
        let (_midi_in, _app) = conn.close();
    }
    Ok(())
}

/// Stops the active MIDI input listener, if any.
#[tauri::command]
pub fn stop_midi_input_listen() -> Result<(), String> {
    map_midi_err(close_midi_listener())
}

#[tauri::command]
pub fn start_midi_input_listen(app: AppHandle, port_id: String) -> Result<(), String> {
    map_midi_err(start_midi_input_listen_inner(app, port_id))
}

fn start_midi_input_listen_inner(app: AppHandle, port_id: String) -> Result<(), MidiError> {
    close_midi_listener()?;

    let midi_in = MidiInput::new("Fretflow")?;
    let port = midi_in
        .find_port_by_id(port_id)
        .ok_or(MidiError::PortNotFound)?;
    let app_cb = app.clone();
    let conn = midi_in
        .connect(
            &port,
            "fretflow-input",
            move |ts, msg, handle: &mut AppHandle| {
                if let Some(ev) = note::voice_message_to_ipc(ts, msg) {
                    let _ = handle.emit(ipc::MIDI_NOTE, &ev);
                }
            },
            app_cb,
        )
        .map_err(|e| MidiError::Connect(e.to_string()))?;

    let mut guard = MIDI_INPUT.lock().map_err(|_| MidiError::LockPoisoned)?;
    *guard = Some(conn);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::note::voice_message_to_ipc;

    #[test]
    fn note_on_middle_c() {
        let ev = voice_message_to_ipc(1_000, &[0x90, 60, 80]).expect("note on");
        assert_eq!(ev.kind, "note_on");
        assert_eq!(ev.channel, 0);
        assert_eq!(ev.note, 60);
        assert_eq!(ev.velocity, 80);
        assert_eq!(ev.timestamp_us, 1_000);
    }

    #[test]
    fn note_on_zero_velocity_is_note_off() {
        let ev = voice_message_to_ipc(0, &[0x90, 60, 0]).expect("note off");
        assert_eq!(ev.kind, "note_off");
        assert_eq!(ev.velocity, 0);
    }

    #[test]
    fn note_off() {
        let ev = voice_message_to_ipc(0, &[0x81, 60, 0]).expect("note off");
        assert_eq!(ev.kind, "note_off");
        assert_eq!(ev.channel, 1);
    }
}
