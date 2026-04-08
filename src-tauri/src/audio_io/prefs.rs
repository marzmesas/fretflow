//! Persisted audio-related preferences under the app config directory.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const PREFS_FILE: &str = "preferences.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioPreferences {
    /// `Some("0")` = first enumerated input; `None` = use OS default when starting monitor.
    pub preferred_input_device_id: Option<String>,
    /// Reserved for Phase 1 latency compensation (not applied to DSP yet).
    pub latency_offset_ms: i32,
}

fn prefs_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("app_config_dir: {e}"))?;
    Ok(dir.join(PREFS_FILE))
}

pub fn load_audio_preferences(app: &AppHandle) -> Result<AudioPreferences, String> {
    let path = prefs_path(app)?;
    if !path.exists() {
        return Ok(AudioPreferences::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read prefs: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse prefs: {e}"))
}

pub fn save_audio_preferences(app: &AppHandle, prefs: &AudioPreferences) -> Result<(), String> {
    let path = prefs_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create config dir: {e}"))?;
    }
    let raw = serde_json::to_string_pretty(prefs).map_err(|e| format!("serialize prefs: {e}"))?;
    fs::write(&path, raw).map_err(|e| format!("write prefs: {e}"))
}
