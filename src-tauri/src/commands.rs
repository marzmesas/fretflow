//! Tauri [`invoke`] handlers. Event names live in `crate::ipc` (mirrored in frontend `src/lib/ipc.ts`).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::ipc;

/// Global mock meter thread handle + stop flag.
static MOCK_AUDIO_METER: Mutex<Option<(Arc<AtomicBool>, thread::JoinHandle<()>)>> =
    Mutex::new(None);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub display_name: String,
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: env!("CARGO_PKG_NAME").into(),
        version: env!("CARGO_PKG_VERSION").into(),
        display_name: "Fretflow".into(),
    }
}

/// Emits [`ipc::AUDIO_LEVEL`] ~20×/s with a sine-shaped fake level in `0.0..=1.0` (Phase 0 demo).
#[tauri::command]
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

#[tauri::command]
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
