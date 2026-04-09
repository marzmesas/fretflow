//! Live input capture for level metering ([`crate::ipc::AUDIO_LEVEL`] ~30×/s) and mic pitch → [`crate::ipc::INPUT_EVENT`].
//!
//! On macOS, [`cpal::Stream`] is not [`Send`], so we create, play, and drop the stream entirely on one
//! dedicated thread.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};

use tauri::{AppHandle, Emitter};

use crate::ipc;

use super::mic_pitch::{
    mic_capture_lock, new_yin_detector, process_mic_pitch_trigger, MicCaptureState, WINDOW,
};
use super::prefs::load_audio_preferences;
use super::stream_config;
use super::AudioError;

static INPUT_MONITOR: Mutex<Option<InputMonitorHandle>> = Mutex::new(None);

struct InputMonitorHandle {
    stop: Arc<AtomicBool>,
    join: thread::JoinHandle<()>,
}

fn set_peak_level(level_bits: &Arc<AtomicU32>, peak: f32) {
    let normalized = (peak * 5.0).clamp(0.0, 1.0);
    level_bits.store(normalized.to_bits(), Ordering::Relaxed);
}

fn process_f32_input(
    data: &[f32],
    channels: usize,
    capture: &Arc<Mutex<MicCaptureState>>,
    trigger: &Arc<AtomicBool>,
    level_bits: &Arc<AtomicU32>,
) {
    let mut peak = 0.0f32;
    {
        let mut cap = mic_capture_lock(capture);
        if channels <= 1 {
            for &s in data {
                cap.feed_mono_sample(s);
                peak = peak.max(s.abs());
            }
        } else {
            for frame in data.chunks(channels) {
                let mono = frame.iter().copied().sum::<f32>() / channels as f32;
                cap.feed_mono_sample(mono);
                peak = peak.max(mono.abs());
            }
        }
        if cap.note_buffer_end(peak) {
            trigger.store(true, Ordering::Release);
        }
    }
    set_peak_level(level_bits, peak);
}

fn process_i16_input(
    data: &[i16],
    channels: usize,
    capture: &Arc<Mutex<MicCaptureState>>,
    trigger: &Arc<AtomicBool>,
    level_bits: &Arc<AtomicU32>,
) {
    let scale = 1.0 / i16::MAX as f32;
    let mut peak = 0.0f32;
    {
        let mut cap = mic_capture_lock(capture);
        if channels <= 1 {
            for &s in data {
                let v = s as f32 * scale;
                cap.feed_mono_sample(v);
                peak = peak.max(v.abs());
            }
        } else {
            for frame in data.chunks(channels) {
                let mono = frame.iter().map(|&s| s as f32 * scale).sum::<f32>() / channels as f32;
                cap.feed_mono_sample(mono);
                peak = peak.max(mono.abs());
            }
        }
        if cap.note_buffer_end(peak) {
            trigger.store(true, Ordering::Release);
        }
    }
    set_peak_level(level_bits, peak);
}

fn process_u16_input(
    data: &[u16],
    channels: usize,
    capture: &Arc<Mutex<MicCaptureState>>,
    trigger: &Arc<AtomicBool>,
    level_bits: &Arc<AtomicU32>,
) {
    let scale = 1.0 / u16::MAX as f32;
    let mut peak = 0.0f32;
    {
        let mut cap = mic_capture_lock(capture);
        if channels <= 1 {
            for &s in data {
                let v = (s as f32 * scale) * 2.0 - 1.0;
                cap.feed_mono_sample(v);
                peak = peak.max(v.abs());
            }
        } else {
            for frame in data.chunks(channels) {
                let mono = frame
                    .iter()
                    .map(|&s| (s as f32 * scale) * 2.0 - 1.0)
                    .sum::<f32>()
                    / channels as f32;
                cap.feed_mono_sample(mono);
                peak = peak.max(mono.abs());
            }
        }
        if cap.note_buffer_end(peak) {
            trigger.store(true, Ordering::Release);
        }
    }
    set_peak_level(level_bits, peak);
}

fn process_i32_input(
    data: &[i32],
    channels: usize,
    capture: &Arc<Mutex<MicCaptureState>>,
    trigger: &Arc<AtomicBool>,
    level_bits: &Arc<AtomicU32>,
) {
    let scale = 1.0 / i32::MAX as f32;
    let mut peak = 0.0f32;
    {
        let mut cap = mic_capture_lock(capture);
        if channels <= 1 {
            for &s in data {
                let v = s as f32 * scale;
                cap.feed_mono_sample(v);
                peak = peak.max(v.abs());
            }
        } else {
            for frame in data.chunks(channels) {
                let mono = frame.iter().map(|&s| s as f32 * scale).sum::<f32>() / channels as f32;
                cap.feed_mono_sample(mono);
                peak = peak.max(mono.abs());
            }
        }
        if cap.note_buffer_end(peak) {
            trigger.store(true, Ordering::Release);
        }
    }
    set_peak_level(level_bits, peak);
}

fn process_u32_input(
    data: &[u32],
    channels: usize,
    capture: &Arc<Mutex<MicCaptureState>>,
    trigger: &Arc<AtomicBool>,
    level_bits: &Arc<AtomicU32>,
) {
    let mut peak = 0.0f32;
    {
        let mut cap = mic_capture_lock(capture);
        if channels <= 1 {
            for &s in data {
                let v = (s as f64 / u32::MAX as f64) as f32 * 2.0 - 1.0;
                cap.feed_mono_sample(v);
                peak = peak.max(v.abs());
            }
        } else {
            for frame in data.chunks(channels) {
                let mono = frame
                    .iter()
                    .map(|&s| (s as f64 / u32::MAX as f64) as f32 * 2.0 - 1.0)
                    .sum::<f32>()
                    / channels as f32;
                cap.feed_mono_sample(mono);
                peak = peak.max(mono.abs());
            }
        }
        if cap.note_buffer_end(peak) {
            trigger.store(true, Ordering::Release);
        }
    }
    set_peak_level(level_bits, peak);
}

fn process_i64_input(
    data: &[i64],
    channels: usize,
    capture: &Arc<Mutex<MicCaptureState>>,
    trigger: &Arc<AtomicBool>,
    level_bits: &Arc<AtomicU32>,
) {
    let scale = 1.0 / i64::MAX as f32;
    let mut peak = 0.0f32;
    {
        let mut cap = mic_capture_lock(capture);
        if channels <= 1 {
            for &s in data {
                let v = s as f32 * scale;
                cap.feed_mono_sample(v);
                peak = peak.max(v.abs());
            }
        } else {
            for frame in data.chunks(channels) {
                let mono = frame.iter().map(|&s| s as f32 * scale).sum::<f32>() / channels as f32;
                cap.feed_mono_sample(mono);
                peak = peak.max(mono.abs());
            }
        }
        if cap.note_buffer_end(peak) {
            trigger.store(true, Ordering::Release);
        }
    }
    set_peak_level(level_bits, peak);
}

fn process_u64_input(
    data: &[u64],
    channels: usize,
    capture: &Arc<Mutex<MicCaptureState>>,
    trigger: &Arc<AtomicBool>,
    level_bits: &Arc<AtomicU32>,
) {
    let mut peak = 0.0f32;
    {
        let mut cap = mic_capture_lock(capture);
        if channels <= 1 {
            for &s in data {
                let v = (s as f64 / u64::MAX as f64) as f32 * 2.0 - 1.0;
                cap.feed_mono_sample(v);
                peak = peak.max(v.abs());
            }
        } else {
            for frame in data.chunks(channels) {
                let mono = frame
                    .iter()
                    .map(|&s| (s as f64 / u64::MAX as f64) as f32 * 2.0 - 1.0)
                    .sum::<f32>()
                    / channels as f32;
                cap.feed_mono_sample(mono);
                peak = peak.max(mono.abs());
            }
        }
        if cap.note_buffer_end(peak) {
            trigger.store(true, Ordering::Release);
        }
    }
    set_peak_level(level_bits, peak);
}

fn process_f64_input(
    data: &[f64],
    channels: usize,
    capture: &Arc<Mutex<MicCaptureState>>,
    trigger: &Arc<AtomicBool>,
    level_bits: &Arc<AtomicU32>,
) {
    let mut peak = 0.0f32;
    {
        let mut cap = mic_capture_lock(capture);
        if channels <= 1 {
            for &s in data {
                let v = s as f32;
                cap.feed_mono_sample(v);
                peak = peak.max(v.abs());
            }
        } else {
            for frame in data.chunks(channels) {
                let mono = frame.iter().map(|&s| s as f32).sum::<f32>() / channels as f32;
                cap.feed_mono_sample(mono);
                peak = peak.max(mono.abs());
            }
        }
        if cap.note_buffer_end(peak) {
            trigger.store(true, Ordering::Release);
        }
    }
    set_peak_level(level_bits, peak);
}

fn stream_error_callback(app: AppHandle) -> impl FnMut(cpal::StreamError) + Send + 'static {
    let app_err = app.clone();
    let last_emit: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
    let last_emit_cb = Arc::clone(&last_emit);
    move |e: cpal::StreamError| {
        let should_emit = match last_emit_cb.lock() {
            Ok(mut g) => {
                let now = Instant::now();
                let emit = match *g {
                    None => true,
                    Some(t) if now.duration_since(t) >= Duration::from_millis(500) => true,
                    _ => false,
                };
                if emit {
                    *g = Some(now);
                }
                emit
            }
            Err(_) => false,
        };
        if should_emit {
            let msg = format!("Input stream: {e}");
            let _ = app_err.emit(ipc::AUDIO_INPUT_ERROR, msg);
        }
        eprintln!("[fretflow] input stream: {e}");
    }
}

fn build_input_stream(
    device: &Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    level_bits: Arc<AtomicU32>,
    capture: Arc<Mutex<MicCaptureState>>,
    trigger: Arc<AtomicBool>,
    app: AppHandle,
) -> Result<Stream, AudioError> {
    let channels = config.channels as usize;

    let cap_f32 = Arc::clone(&capture);
    let trig_f32 = Arc::clone(&trigger);
    let lb_f32 = Arc::clone(&level_bits);

    match sample_format {
        SampleFormat::F32 => device
            .build_input_stream(
                config,
                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                    process_f32_input(data, channels, &cap_f32, &trig_f32, &lb_f32);
                },
                stream_error_callback(app.clone()),
                None,
            )
            .map_err(AudioError::BuildStream),
        SampleFormat::I16 => {
            let cap = Arc::clone(&capture);
            let trig = Arc::clone(&trigger);
            let lb = Arc::clone(&level_bits);
            device
                .build_input_stream(
                    config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        process_i16_input(data, channels, &cap, &trig, &lb);
                    },
                    stream_error_callback(app.clone()),
                    None,
                )
                .map_err(AudioError::BuildStream)
        }
        SampleFormat::U16 => {
            let cap = Arc::clone(&capture);
            let trig = Arc::clone(&trigger);
            let lb = Arc::clone(&level_bits);
            device
                .build_input_stream(
                    config,
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        process_u16_input(data, channels, &cap, &trig, &lb);
                    },
                    stream_error_callback(app.clone()),
                    None,
                )
                .map_err(AudioError::BuildStream)
        }
        SampleFormat::I32 => {
            let cap = Arc::clone(&capture);
            let trig = Arc::clone(&trigger);
            let lb = Arc::clone(&level_bits);
            device
                .build_input_stream(
                    config,
                    move |data: &[i32], _: &cpal::InputCallbackInfo| {
                        process_i32_input(data, channels, &cap, &trig, &lb);
                    },
                    stream_error_callback(app.clone()),
                    None,
                )
                .map_err(AudioError::BuildStream)
        }
        SampleFormat::U32 => {
            let cap = Arc::clone(&capture);
            let trig = Arc::clone(&trigger);
            let lb = Arc::clone(&level_bits);
            device
                .build_input_stream(
                    config,
                    move |data: &[u32], _: &cpal::InputCallbackInfo| {
                        process_u32_input(data, channels, &cap, &trig, &lb);
                    },
                    stream_error_callback(app.clone()),
                    None,
                )
                .map_err(AudioError::BuildStream)
        }
        SampleFormat::I64 => {
            let cap = Arc::clone(&capture);
            let trig = Arc::clone(&trigger);
            let lb = Arc::clone(&level_bits);
            device
                .build_input_stream(
                    config,
                    move |data: &[i64], _: &cpal::InputCallbackInfo| {
                        process_i64_input(data, channels, &cap, &trig, &lb);
                    },
                    stream_error_callback(app.clone()),
                    None,
                )
                .map_err(AudioError::BuildStream)
        }
        SampleFormat::U64 => {
            let cap = Arc::clone(&capture);
            let trig = Arc::clone(&trigger);
            let lb = Arc::clone(&level_bits);
            device
                .build_input_stream(
                    config,
                    move |data: &[u64], _: &cpal::InputCallbackInfo| {
                        process_u64_input(data, channels, &cap, &trig, &lb);
                    },
                    stream_error_callback(app.clone()),
                    None,
                )
                .map_err(AudioError::BuildStream)
        }
        SampleFormat::F64 => {
            let cap = Arc::clone(&capture);
            let trig = Arc::clone(&trigger);
            let lb = Arc::clone(&level_bits);
            device
                .build_input_stream(
                    config,
                    move |data: &[f64], _: &cpal::InputCallbackInfo| {
                        process_f64_input(data, channels, &cap, &trig, &lb);
                    },
                    stream_error_callback(app.clone()),
                    None,
                )
                .map_err(AudioError::BuildStream)
        }
        f => Err(AudioError::UnsupportedSampleFormat(f)),
    }
}

/// Whether the cpal input monitor thread is running.
pub(crate) fn is_input_monitor_active() -> bool {
    match INPUT_MONITOR.lock() {
        Ok(g) => g.is_some(),
        Err(_) => false,
    }
}

/// Stops live input monitoring if running.
pub fn stop_input_monitor() -> Result<(), AudioError> {
    let mut guard = INPUT_MONITOR
        .lock()
        .map_err(|_| AudioError::MonitorLockPoisoned)?;
    if let Some(handle) = guard.take() {
        handle.stop.store(true, Ordering::SeqCst);
        handle
            .join
            .join()
            .map_err(|_| AudioError::MonitorThreadPanicked)?;
    }
    Ok(())
}

/// Starts monitoring the given logical device id (see [`super::devices::resolve_input_device`]).
pub fn start_input_monitor(app: AppHandle, device_id: Option<String>) -> Result<(), AudioError> {
    stop_input_monitor()?;

    let prefs = load_audio_preferences(&app)?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let emit_handle = app.clone();

    let join = thread::spawn(move || {
        let run = || -> Result<(), AudioError> {
            let device = super::devices::resolve_input_device(device_id.as_deref())?;
            let (config, sample_format) =
                stream_config::resolve_input_stream_config_for_device(&device, &prefs)?;

            let level_bits = Arc::new(AtomicU32::new(0.0f32.to_bits()));
            let capture = Arc::new(Mutex::new(MicCaptureState::new()));
            let pitch_trigger = Arc::new(AtomicBool::new(false));
            let sample_rate = config.sample_rate.0;

            let stream = build_input_stream(
                &device,
                &config,
                sample_format,
                Arc::clone(&level_bits),
                Arc::clone(&capture),
                Arc::clone(&pitch_trigger),
                app.clone(),
            )?;
            stream.play()?;

            let mut yin = new_yin_detector();
            let mut scratch = [0.0f32; WINDOW];
            let mut last_pitch_emit = None::<Instant>;

            while !stop_thread.load(Ordering::SeqCst) {
                process_mic_pitch_trigger(
                    &pitch_trigger,
                    &capture,
                    sample_rate,
                    &mut yin,
                    &mut scratch,
                    &mut last_pitch_emit,
                    &emit_handle,
                );
                let v = f32::from_bits(level_bits.load(Ordering::Relaxed));
                let _ = emit_handle.emit(ipc::AUDIO_LEVEL, v);
                thread::sleep(Duration::from_millis(33));
            }
            drop(stream);
            Ok(())
        };

        if let Err(e) = run() {
            let msg = e.to_string();
            eprintln!("[fretflow] input monitor: {msg}");
            let _ = emit_handle.emit(ipc::AUDIO_INPUT_ERROR, msg);
        }
    });

    let handle = InputMonitorHandle { stop, join };

    let mut guard = INPUT_MONITOR
        .lock()
        .map_err(|_| AudioError::MonitorLockPoisoned)?;
    *guard = Some(handle);
    Ok(())
}
