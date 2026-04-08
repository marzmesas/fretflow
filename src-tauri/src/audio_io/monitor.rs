//! Live input capture for level metering only (no recording). Emits [`crate::ipc::AUDIO_LEVEL`] ~30×/s.
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

fn build_input_stream(
    device: &Device,
    config: &StreamConfig,
    sample_format: SampleFormat,
    level_bits: Arc<AtomicU32>,
    app: AppHandle,
) -> Result<Stream, AudioError> {
    let app_err = app.clone();
    let last_emit: Arc<Mutex<Option<Instant>>> = Arc::new(Mutex::new(None));
    let last_emit_cb = Arc::clone(&last_emit);
    let err_fn = move |e: cpal::StreamError| {
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
    };

    macro_rules! build {
        ($t:ty, $conv:expr) => {
            device
                .build_input_stream(
                    config,
                    move |data: &[$t], _: &cpal::InputCallbackInfo| {
                        let mut peak = 0.0f32;
                        for &s in data {
                            let v: f32 = $conv(s);
                            peak = peak.max(v.abs());
                        }
                        set_peak_level(&level_bits, peak);
                    },
                    err_fn,
                    None,
                )
                .map_err(AudioError::BuildStream)
        };
    }

    match sample_format {
        SampleFormat::F32 => build!(f32, |s: f32| s),
        SampleFormat::I16 => build!(i16, |s: i16| s as f32 / i16::MAX as f32),
        SampleFormat::U16 => build!(u16, |s: u16| (s as f32 / u16::MAX as f32) * 2.0 - 1.0),
        SampleFormat::I32 => build!(i32, |s: i32| s as f32 / i32::MAX as f32),
        SampleFormat::U32 => build!(u32, |s: u32| (s as f64 / u32::MAX as f64) as f32 * 2.0
            - 1.0),
        SampleFormat::I64 => build!(i64, |s: i64| s as f32 / i64::MAX as f32),
        SampleFormat::U64 => build!(u64, |s: u64| (s as f64 / u64::MAX as f64) as f32 * 2.0
            - 1.0),
        SampleFormat::F64 => build!(f64, |s: f64| s as f32),
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

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let emit_handle = app.clone();

    let join = thread::spawn(move || {
        let run = || -> Result<(), AudioError> {
            let device = super::devices::resolve_input_device(device_id.as_deref())?;
            let supported = device.default_input_config()?;
            let sample_format = supported.sample_format();
            let config: StreamConfig = supported.config();

            let level_bits = Arc::new(AtomicU32::new(0.0f32.to_bits()));
            let stream = build_input_stream(
                &device,
                &config,
                sample_format,
                Arc::clone(&level_bits),
                app.clone(),
            )?;
            stream.play()?;

            while !stop_thread.load(Ordering::SeqCst) {
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
