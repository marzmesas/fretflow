//! Input device enumeration and resolution by id (`"0"`, `"1"`, … or default).

use cpal::traits::{DeviceTrait, HostTrait};
use cpal::Device;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInputDevice {
    pub id: String,
    pub label: String,
}

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

/// `device_id`: `None`, `"default"`, or `"0"` / `"1"` / … matching [`list_audio_input_devices`].
pub fn resolve_input_device(device_id: Option<&str>) -> Result<Device, String> {
    let host = cpal::default_host();
    match device_id {
        None | Some("default") | Some("") => host
            .default_input_device()
            .ok_or_else(|| "No default input device".into()),
        Some(raw) => {
            let index: usize = raw
                .parse()
                .map_err(|_| format!("Invalid device id: {raw}"))?;
            let devices: Vec<_> = host
                .input_devices()
                .map_err(|e| format!("input devices: {e}"))?
                .collect();
            let device = devices
                .into_iter()
                .nth(index)
                .ok_or_else(|| format!("Input device #{index} not found"))?;
            Ok(device)
        }
    }
}
