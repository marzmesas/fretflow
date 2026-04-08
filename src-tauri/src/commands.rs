//! Tauri `invoke` handlers. Event names live in `crate::ipc` (mirrored in frontend `src/lib/ipc.ts`).

use serde::Serialize;
use tauri::AppHandle;

use crate::audio_io::monitor;
use crate::meter_mock;

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
    monitor::stop_input_monitor()?;
    meter_mock::start_mock_audio_meter(app)
}

#[tauri::command]
pub fn stop_mock_audio_meter() -> Result<(), String> {
    meter_mock::stop_mock_audio_meter()
}
