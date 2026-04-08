//! Live input capture for level metering only (no recording). Emits [`crate::ipc::AUDIO_LEVEL`] ~30×/s.
//!
//! On macOS, [`cpal::Stream`] is not [`Send`], so we create, play, and drop the stream entirely on one
//! dedicated thread.

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};

use tauri::{AppHandle, Emitter};

use crate::ipc;

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
) -> Result<Stream, String> {
    let err_fn = |e| eprintln!("[fretflow] input stream: {e}");

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
                .map_err(|e| format!("build_input_stream: {e}"))
        };
    }

    match sample_format {
        SampleFormat::F32 => build!(f32, |s: f32| s),
        SampleFormat::I16 => build!(i16, |s: i16| s as f32 / i16::MAX as f32),
        SampleFormat::U16 => build!(u16, |s: u16| (s as f32 / u16::MAX as f32) * 2.0 - 1.0),
        SampleFormat::I32 => build!(i32, |s: i32| s as f32 / i32::MAX as f32),
        SampleFormat::U32 => build!(u32, |s: u32| (s as f64 / u32::MAX as f64) as f32 * 2.0 - 1.0),
        SampleFormat::I64 => build!(i64, |s: i64| s as f32 / i64::MAX as f32),
        SampleFormat::U64 => build!(u64, |s: u64| (s as f64 / u64::MAX as f64) as f32 * 2.0 - 1.0),
        SampleFormat::F64 => build!(f64, |s: f64| s as f32),
        f => Err(format!("Unsupported sample format: {f:?}")),
    }
}

/// Stops live input monitoring if running.
pub fn stop_input_monitor() -> Result<(), String> {
    let mut guard = INPUT_MONITOR
        .lock()
        .map_err(|e| format!("input monitor lock: {e}"))?;
    if let Some(handle) = guard.take() {
        handle.stop.store(true, Ordering::SeqCst);
        handle
            .join
            .join()
            .map_err(|_| "input monitor thread panicked")?;
    }
    Ok(())
}

/// Starts monitoring the given logical device id (see [`super::devices::resolve_input_device`]).
pub fn start_input_monitor(app: AppHandle, device_id: Option<String>) -> Result<(), String> {
    stop_input_monitor()?;

    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let emit_handle = app.clone();

    let join = thread::spawn(move || {
        let run = || -> Result<(), String> {
            let device = super::devices::resolve_input_device(device_id.as_deref())?;
            let supported = device
                .default_input_config()
                .map_err(|e| format!("default_input_config: {e}"))?;
            let sample_format = supported.sample_format();
            let config: StreamConfig = supported.config();

            let level_bits = Arc::new(AtomicU32::new(0.0f32.to_bits()));
            let stream = build_input_stream(&device, &config, sample_format, Arc::clone(&level_bits))?;
            stream
                .play()
                .map_err(|e| format!("play stream: {e}"))?;

            while !stop_thread.load(Ordering::SeqCst) {
                let v = f32::from_bits(level_bits.load(Ordering::Relaxed));
                let _ = emit_handle.emit(ipc::AUDIO_LEVEL, v);
                thread::sleep(Duration::from_millis(33));
            }
            drop(stream);
            Ok(())
        };

        if let Err(e) = run() {
            eprintln!("[fretflow] input monitor: {e}");
        }
    });

    let handle = InputMonitorHandle { stop, join };

    let mut guard = INPUT_MONITOR
        .lock()
        .map_err(|e| format!("input monitor lock: {e}"))?;
    *guard = Some(handle);
    Ok(())
}
