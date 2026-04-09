//! Pick [`cpal::StreamConfig`] + sample format for the input monitor from prefs and device caps.

use cpal::traits::DeviceTrait;
use cpal::{
    BufferSize, Device, SampleFormat, SampleRate, StreamConfig, SupportedBufferSize,
    SupportedStreamConfigRange,
};

use super::devices;
use super::prefs::AudioPreferences;
use super::AudioError;

fn sample_format_label(f: SampleFormat) -> &'static str {
    match f {
        SampleFormat::I8 => "i8",
        SampleFormat::I16 => "i16",
        SampleFormat::I32 => "i32",
        SampleFormat::I64 => "i64",
        SampleFormat::U8 => "u8",
        SampleFormat::U16 => "u16",
        SampleFormat::U32 => "u32",
        SampleFormat::U64 => "u64",
        SampleFormat::F32 => "f32",
        SampleFormat::F64 => "f64",
        _ => "unknown",
    }
}

fn buffer_size_from_supported(supported: &SupportedBufferSize, frames: Option<u32>) -> BufferSize {
    let Some(n) = frames else {
        return BufferSize::Default;
    };
    match supported {
        SupportedBufferSize::Range { min, max } => BufferSize::Fixed(n.clamp(*min, *max)),
        SupportedBufferSize::Unknown => BufferSize::Fixed(n),
    }
}

fn pick_range_for_rate<'a>(
    ranges: &'a [SupportedStreamConfigRange],
    channels: u16,
    format: SampleFormat,
    rate: SampleRate,
) -> Option<&'a SupportedStreamConfigRange> {
    ranges.iter().find(|r| {
        r.channels() == channels
            && r.sample_format() == format
            && r.min_sample_rate() <= rate
            && r.max_sample_rate() >= rate
    })
}

/// Build [`StreamConfig`] for an already-resolved [`Device`].
pub fn resolve_input_stream_config_for_device(
    device: &Device,
    prefs: &AudioPreferences,
) -> Result<(StreamConfig, SampleFormat), AudioError> {
    let default = device.default_input_config()?;
    let channels = default.channels();
    let format = default.sample_format();
    let default_rate = default.sample_rate();

    let want_rate = prefs
        .input_stream_sample_rate_hz
        .map(SampleRate)
        .unwrap_or(default_rate);

    let ranges: Vec<_> = device.supported_input_configs()?.collect();

    let chosen = pick_range_for_rate(&ranges, channels, format, want_rate)
        .and_then(|r| r.try_with_sample_rate(want_rate));

    if let Some(sc) = chosen {
        let mut cfg = sc.config();
        cfg.sample_rate = want_rate;
        cfg.buffer_size =
            buffer_size_from_supported(sc.buffer_size(), prefs.input_stream_buffer_frames);
        return Ok((cfg, sc.sample_format()));
    }

    // Invalid or unsupported custom rate: fall back to device default stream layout.
    let mut cfg = default.config();
    cfg.buffer_size =
        buffer_size_from_supported(default.buffer_size(), prefs.input_stream_buffer_frames);
    Ok((cfg, format))
}

/// Standard rates we surface in Settings when the device reports support.
const LIST_SAMPLE_RATES: &[u32] = &[
    8_000, 11_025, 16_000, 22_050, 44_100, 48_000, 88_200, 96_000, 192_000,
];

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputDeviceStreamInfo {
    pub default_sample_rate: u32,
    pub default_channels: u16,
    pub sample_format: String,
    /// Subset of [`LIST_SAMPLE_RATES`] supported for this device at default channels + format.
    pub supported_sample_rates: Vec<u32>,
    pub buffer_frames_min: Option<u32>,
    pub buffer_frames_max: Option<u32>,
}

pub fn get_input_device_stream_info(
    device_id: Option<&str>,
) -> Result<InputDeviceStreamInfo, AudioError> {
    let device = devices::resolve_input_device(device_id)?;
    let default = device.default_input_config()?;
    let channels = default.channels();
    let format = default.sample_format();

    let mut rates: Vec<u32> = Vec::new();
    let mut buf_min: Option<u32> = None;
    let mut buf_max: Option<u32> = None;

    for r in device.supported_input_configs()? {
        if r.channels() != channels || r.sample_format() != format {
            continue;
        }
        let rmin = r.min_sample_rate().0;
        let rmax = r.max_sample_rate().0;
        for &sr in LIST_SAMPLE_RATES {
            if rmin <= sr && sr <= rmax && !rates.contains(&sr) {
                rates.push(sr);
            }
        }
        match r.buffer_size() {
            SupportedBufferSize::Range { min, max } => {
                buf_min = Some(buf_min.map(|m| m.min(*min)).unwrap_or(*min));
                buf_max = Some(buf_max.map(|m| m.max(*max)).unwrap_or(*max));
            }
            SupportedBufferSize::Unknown => {}
        }
    }

    rates.sort_unstable();

    Ok(InputDeviceStreamInfo {
        default_sample_rate: default.sample_rate().0,
        default_channels: channels,
        sample_format: sample_format_label(format).to_string(),
        supported_sample_rates: rates,
        buffer_frames_min: buf_min,
        buffer_frames_max: buf_max,
    })
}
