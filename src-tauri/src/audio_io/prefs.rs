//! Persisted audio-related preferences under the app config directory.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

use super::AudioError;

const PREFS_FILE: &str = "preferences.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AudioPreferences {
    /// `Some("0")` = first enumerated input; `None` = use OS default when starting monitor.
    pub preferred_input_device_id: Option<String>,
    /// Last known cpal device label (hotplug / reorder remapping when `id` no longer matches).
    #[serde(default)]
    pub preferred_input_device_label: Option<String>,
    /// Reserved for Phase 1 latency compensation (not applied to DSP yet).
    pub latency_offset_ms: i32,
    /// Opaque MIDI input port id from [`crate::midi::list_midi_input_ports`].
    #[serde(default)]
    pub preferred_midi_input_port_id: Option<String>,
    /// Last known MIDI port display name (remap when opaque `id` changes after reconnect).
    #[serde(default)]
    pub preferred_midi_input_port_name: Option<String>,
}

fn prefs_path(app: &AppHandle) -> Result<PathBuf, AudioError> {
    let dir = app.path().app_config_dir()?;
    Ok(dir.join(PREFS_FILE))
}

pub fn load_audio_preferences(app: &AppHandle) -> Result<AudioPreferences, AudioError> {
    let path = prefs_path(app)?;
    if !path.exists() {
        return Ok(AudioPreferences::default());
    }
    let raw = fs::read_to_string(&path).map_err(AudioError::PrefsRead)?;
    serde_json::from_str(&raw).map_err(AudioError::PrefsParse)
}

pub fn save_audio_preferences(app: &AppHandle, prefs: &AudioPreferences) -> Result<(), AudioError> {
    let path = prefs_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(AudioError::ConfigDirCreate)?;
    }
    let raw = serde_json::to_string_pretty(prefs).map_err(AudioError::PrefsSerialize)?;
    fs::write(&path, raw).map_err(AudioError::PrefsWrite)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prefs_json_roundtrip() {
        let p = AudioPreferences {
            preferred_input_device_id: Some("0".into()),
            preferred_input_device_label: Some("Scarlett".into()),
            latency_offset_ms: -12,
            preferred_midi_input_port_id: Some("abc".into()),
            preferred_midi_input_port_name: Some("KeyStation".into()),
        };
        let s = serde_json::to_string(&p).unwrap();
        let q: AudioPreferences = serde_json::from_str(&s).unwrap();
        assert_eq!(p.preferred_input_device_id, q.preferred_input_device_id);
        assert_eq!(p.latency_offset_ms, q.latency_offset_ms);
        assert_eq!(
            p.preferred_midi_input_port_id,
            q.preferred_midi_input_port_id
        );
        assert_eq!(
            p.preferred_input_device_label,
            q.preferred_input_device_label
        );
        assert_eq!(
            p.preferred_midi_input_port_name,
            q.preferred_midi_input_port_name
        );
    }

    #[test]
    fn prefs_deserialize_without_midi_field() {
        let raw = r#"{"preferredInputDeviceId":null,"latencyOffsetMs":0}"#;
        let p: AudioPreferences = serde_json::from_str(raw).unwrap();
        assert!(p.preferred_midi_input_port_id.is_none());
    }

    #[test]
    fn prefs_deserialize_without_label_fields() {
        let raw = r#"{"preferredInputDeviceId":"1","latencyOffsetMs":0,"preferredMidiInputPortId":"x"}"#;
        let p: AudioPreferences = serde_json::from_str(raw).unwrap();
        assert!(p.preferred_input_device_label.is_none());
        assert!(p.preferred_midi_input_port_name.is_none());
    }
}
