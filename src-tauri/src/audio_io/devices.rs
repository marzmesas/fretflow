//! Input device enumeration and resolution by id (`"0"`, `"1"`, … or default).

use cpal::traits::{DeviceTrait, HostTrait};
use cpal::Device;
use serde::Serialize;

use super::AudioError;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioInputDevice {
    pub id: String,
    pub label: String,
}

pub fn list_audio_input_devices() -> Result<Vec<AudioInputDevice>, AudioError> {
    let host = cpal::default_host();
    let devices: Vec<_> = host.input_devices()?.collect();

    let mut out = Vec::with_capacity(devices.len());
    for (index, device) in devices.into_iter().enumerate() {
        let label = device.name()?;
        out.push(AudioInputDevice {
            id: format!("{index}"),
            label,
        });
    }
    Ok(out)
}

pub fn get_default_audio_input_device() -> Result<Option<AudioInputDevice>, AudioError> {
    let host = cpal::default_host();
    let Some(device) = host.default_input_device() else {
        return Ok(None);
    };
    let label = device.name()?;
    Ok(Some(AudioInputDevice {
        id: "default".into(),
        label,
    }))
}

/// `device_id`: `None`, `"default"`, or `"0"` / `"1"` / … matching [`list_audio_input_devices`].
pub fn resolve_input_device(device_id: Option<&str>) -> Result<Device, AudioError> {
    let host = cpal::default_host();
    match device_id {
        None | Some("default") | Some("") => host
            .default_input_device()
            .ok_or(AudioError::NoDefaultInput),
        Some(raw) => {
            let index: usize = raw
                .parse()
                .map_err(|_| AudioError::InvalidDeviceId(raw.to_string()))?;
            let devices: Vec<_> = host.input_devices()?.collect();
            let device = devices
                .into_iter()
                .nth(index)
                .ok_or(AudioError::DeviceIndexNotFound(index))?;
            Ok(device)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_device_id_is_rejected() {
        let out = resolve_input_device(Some("not-a-number"));
        assert!(matches!(
            out,
            Err(AudioError::InvalidDeviceId(ref s)) if s == "not-a-number"
        ));
    }
}
