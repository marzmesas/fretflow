//! Typed errors for the audio stack (commands still surface `String` for Tauri).

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AudioError {
    #[error("input devices")]
    InputDevices(#[from] cpal::DevicesError),

    #[error("device name")]
    DeviceName(#[from] cpal::DeviceNameError),

    #[error("no default input device")]
    NoDefaultInput,

    #[error("invalid device id: {0}")]
    InvalidDeviceId(String),

    #[error("input device #{0} not found (it may have been unplugged)")]
    DeviceIndexNotFound(usize),

    #[error("default input configuration")]
    DefaultConfig(#[from] cpal::DefaultStreamConfigError),

    #[error("build input stream")]
    BuildStream(#[from] cpal::BuildStreamError),

    #[error("start playback")]
    PlayStream(#[from] cpal::PlayStreamError),

    #[error("unsupported sample format: {0:?}")]
    UnsupportedSampleFormat(cpal::SampleFormat),

    #[error("input monitor mutex poisoned")]
    MonitorLockPoisoned,

    #[error("input monitor thread panicked")]
    MonitorThreadPanicked,

    #[error("app config directory")]
    AppConfigDir(#[from] tauri::Error),

    #[error("read preferences")]
    PrefsRead(#[source] std::io::Error),

    #[error("parse preferences")]
    PrefsParse(#[source] serde_json::Error),

    #[error("serialize preferences")]
    PrefsSerialize(#[source] serde_json::Error),

    #[error("write preferences")]
    PrefsWrite(#[source] std::io::Error),

    #[error("create config directory")]
    ConfigDirCreate(#[source] std::io::Error),
}
