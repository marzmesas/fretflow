//! Audio input enumeration, preferences, and live level monitoring ([`cpal`]).

mod devices;
mod error;
pub(crate) mod mic_pitch;
pub(crate) mod monitor;
mod prefs;
mod stream_config;

pub use devices::AudioInputDevice;
pub(crate) use error::AudioError;
pub use prefs::{load_audio_preferences, save_audio_preferences, AudioPreferences};
pub use stream_config::InputDeviceStreamInfo;

use tauri::AppHandle;

fn map_audio_err<T>(r: Result<T, AudioError>) -> Result<T, String> {
    r.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_audio_input_devices() -> Result<Vec<AudioInputDevice>, String> {
    map_audio_err(devices::list_audio_input_devices())
}

#[tauri::command]
pub fn get_default_audio_input_device() -> Result<Option<AudioInputDevice>, String> {
    map_audio_err(devices::get_default_audio_input_device())
}

#[tauri::command]
pub fn get_audio_preferences(app: AppHandle) -> Result<AudioPreferences, String> {
    map_audio_err(load_audio_preferences(&app))
}

#[tauri::command]
pub fn set_audio_preferences(app: AppHandle, prefs: AudioPreferences) -> Result<(), String> {
    map_audio_err(save_audio_preferences(&app, &prefs))
}

#[tauri::command]
pub fn start_input_monitor(app: AppHandle, device_id: Option<String>) -> Result<(), String> {
    crate::meter_mock::stop_mock_audio_meter()?;
    map_audio_err(monitor::start_input_monitor(app, device_id))
}

#[tauri::command]
pub fn stop_input_monitor() -> Result<(), String> {
    map_audio_err(monitor::stop_input_monitor())
}

#[tauri::command]
pub fn get_input_device_stream_info(device_id: Option<String>) -> Result<InputDeviceStreamInfo, String> {
    map_audio_err(stream_config::get_input_device_stream_info(device_id.as_deref()))
}
