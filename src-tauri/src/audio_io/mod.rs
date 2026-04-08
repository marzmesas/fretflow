//! Audio input enumeration, preferences, and live level monitoring ([`cpal`]).

mod devices;
pub(crate) mod monitor;
mod prefs;

pub use devices::AudioInputDevice;
pub use prefs::{load_audio_preferences, save_audio_preferences, AudioPreferences};

use tauri::AppHandle;

#[tauri::command]
pub fn list_audio_input_devices() -> Result<Vec<AudioInputDevice>, String> {
    devices::list_audio_input_devices()
}

#[tauri::command]
pub fn get_default_audio_input_device() -> Result<Option<AudioInputDevice>, String> {
    devices::get_default_audio_input_device()
}

#[tauri::command]
pub fn get_audio_preferences(app: AppHandle) -> Result<AudioPreferences, String> {
    load_audio_preferences(&app)
}

#[tauri::command]
pub fn set_audio_preferences(app: AppHandle, prefs: AudioPreferences) -> Result<(), String> {
    save_audio_preferences(&app, &prefs)
}

#[tauri::command]
pub fn start_input_monitor(app: AppHandle, device_id: Option<String>) -> Result<(), String> {
    crate::meter_mock::stop_mock_audio_meter()?;
    monitor::start_input_monitor(app, device_id)
}

#[tauri::command]
pub fn stop_input_monitor() -> Result<(), String> {
    monitor::stop_input_monitor()
}
