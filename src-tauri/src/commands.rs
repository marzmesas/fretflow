//! Tauri `invoke` handlers. Event names live in `crate::ipc` (mirrored in frontend `src/lib/ipc.ts`).

use serde::Serialize;
use tauri::AppHandle;

use crate::audio_io::monitor;
use crate::meter_mock;
use crate::midi;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub display_name: String,
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME").into(),
        version: env!("CARGO_PKG_VERSION").into(),
        display_name: "Fretflow".into(),
    }
}

/// Emits `audio:level` ~20×/s with a sine-shaped fake level (Phase 0 demo).
#[tauri::command]
pub fn start_mock_audio_meter(app: AppHandle) -> Result<(), String> {
    monitor::stop_input_monitor().map_err(|e| e.to_string())?;
    meter_mock::start_mock_audio_meter(app)
}

#[tauri::command]
pub fn stop_mock_audio_meter() -> Result<(), String> {
    meter_mock::stop_mock_audio_meter()
}

/// Live input monitor (cpal) and MIDI listener activity for shell UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputConnectionStatus {
    pub input_monitor_active: bool,
    pub midi_listen_active: bool,
}

#[tauri::command]
pub fn get_input_connection_status() -> InputConnectionStatus {
    InputConnectionStatus {
        input_monitor_active: monitor::is_input_monitor_active(),
        midi_listen_active: midi::is_midi_input_listen_active(),
    }
}
