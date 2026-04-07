//! Audio input device enumeration ([`cpal`]). Stream capture comes in a later iteration.

use cpal::traits::{DeviceTrait, HostTrait};
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInputDevice {
    /// Stable enough for session UI; prefer matching by `label` when persisting (Phase 1+).
    pub id: String,
    pub label: String,
}

#[tauri::command]
pub fn list_audio_input_devices() -> Result<Vec<AudioInputDevice>, String> {
    let host = cpal::default_host();
    let devices: Vec<_> = host
        .input_devices()
        .map_err(|e| format!("input devices: {e}"))?
        .collect();

    let mut out = Vec::with_capacity(devices.len());
    for (index, device) in devices.into_iter().enumerate() {
        let label = device.name().map_err(|e| format!("device name: {e}"))?;
        out.push(AudioInputDevice {
            id: format!("{index}"),
            label,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn get_default_audio_input_device() -> Result<Option<AudioInputDevice>, String> {
    let host = cpal::default_host();
    let Some(device) = host.default_input_device() else {
        return Ok(None);
    };
    let label = device.name().map_err(|e| format!("device name: {e}"))?;
    Ok(Some(AudioInputDevice {
        id: "default".into(),
        label,
    }))
}
