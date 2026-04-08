//! Sine demo emitter for `audio:level` (Phase 0). Independent of real [`audio_io`] capture.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter};

use crate::ipc;

static MOCK_AUDIO_METER: Mutex<Option<(Arc<AtomicBool>, thread::JoinHandle<()>)>> =
    Mutex::new(None);

pub fn start_mock_audio_meter(app: AppHandle) -> Result<(), String> {
    let mut guard = MOCK_AUDIO_METER
        .lock()
        .map_err(|e| format!("mock meter lock: {e}"))?;
    if guard.is_some() {
        return Ok(());
    }
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = Arc::clone(&stop);
    let handle = app.clone();
    let join = thread::spawn(move || {
        let mut t = 0.0_f64;
        while !stop_thread.load(Ordering::SeqCst) {
            let level = ((t.sin() * 0.5 + 0.5) as f32).clamp(0.0, 1.0);
            if handle.emit(ipc::AUDIO_LEVEL, level).is_err() {
                break;
            }
            t += 0.12;
            thread::sleep(Duration::from_millis(50));
        }
    });
    *guard = Some((stop, join));
    Ok(())
}

pub fn stop_mock_audio_meter() -> Result<(), String> {
    let mut guard = MOCK_AUDIO_METER
        .lock()
        .map_err(|e| format!("mock meter lock: {e}"))?;
    if let Some((stop, join)) = guard.take() {
        stop.store(true, Ordering::SeqCst);
        join.join().map_err(|_| "mock meter thread panicked")?;
    }
    Ok(())
}
