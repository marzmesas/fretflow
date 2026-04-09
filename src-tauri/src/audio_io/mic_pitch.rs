//! Mono ring buffer + onset flag from the cpal callback; YIN runs on the **monitor thread**
//! ([`YINDetector`] uses internal `Rc` and is not `Send` into the cpal closure).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use pitch_detection::detector::yin::YINDetector;
use pitch_detection::detector::PitchDetector;
use tauri::{AppHandle, Emitter};

use crate::input_event::InputEvent;
use crate::ipc;

pub const WINDOW: usize = 1024;
const PADDING: usize = WINDOW / 2;

/// Raw peak thresholds (same domain as cpal samples, before meter ×5).
const ONSET_LOW: f32 = 0.055;
const ONSET_HIGH: f32 = 0.10;
const POWER_THRESHOLD: f32 = 1.5;
const CLARITY_THRESHOLD: f32 = 0.66;
const EMIT_COOLDOWN: Duration = Duration::from_millis(82);

#[inline]
fn hz_to_midi_note(hz: f32) -> u8 {
    if hz <= 0.0 || !hz.is_finite() {
        return 0;
    }
    let v = 12.0 * (hz / 440.0).log2() + 69.0;
    v.round().clamp(0.0, 127.0) as u8
}

fn ring_copy_chronological(ring: &[f32; WINDOW], write: usize, out: &mut [f32]) {
    debug_assert_eq!(out.len(), WINDOW);
    let w = write;
    out[..WINDOW - w].copy_from_slice(&ring[w..]);
    out[WINDOW - w..].copy_from_slice(&ring[..w]);
}

/// Shared between cpal callback (writer) and monitor thread (reader for YIN).
pub struct MicCaptureState {
    ring: [f32; WINDOW],
    write: usize,
    samples_seen: u32,
    prev_block_peak: f32,
}

impl MicCaptureState {
    #[must_use]
    pub fn new() -> Self {
        Self {
            ring: [0.0; WINDOW],
            write: 0,
            samples_seen: 0,
            prev_block_peak: 0.0,
        }
    }

    pub fn feed_mono_sample(&mut self, s: f32) {
        self.ring[self.write] = s;
        self.write = (self.write + 1) % WINDOW;
        self.samples_seen = self.samples_seen.saturating_add(1);
    }

    /// After processing a full cpal buffer: update onset history and return whether to run YIN.
    pub fn note_buffer_end(&mut self, block_peak: f32) -> bool {
        let rising = self.prev_block_peak < ONSET_LOW && block_peak >= ONSET_HIGH;
        self.prev_block_peak = block_peak;
        rising && self.samples_seen >= WINDOW as u32
    }

    pub fn copy_ring_chronological(&self, out: &mut [f32; WINDOW]) -> bool {
        if self.samples_seen < WINDOW as u32 {
            return false;
        }
        ring_copy_chronological(&self.ring, self.write, out.as_mut_slice());
        true
    }
}

impl Default for MicCaptureState {
    fn default() -> Self {
        Self::new()
    }
}

pub fn mic_capture_lock<'a>(mic: &'a Mutex<MicCaptureState>) -> MutexGuard<'a, MicCaptureState> {
    mic.lock().unwrap_or_else(|e| e.into_inner())
}

/// If `trigger` was set by the stream callback, run YIN and maybe emit `input:event` (`source: mic`).
pub fn process_mic_pitch_trigger(
    trigger: &AtomicBool,
    capture: &Mutex<MicCaptureState>,
    sample_rate: u32,
    yin: &mut YINDetector<f32>,
    scratch: &mut [f32; WINDOW],
    last_emit: &mut Option<Instant>,
    app: &AppHandle,
) {
    if !trigger.swap(false, Ordering::AcqRel) {
        return;
    }

    let now = Instant::now();
    if let Some(t) = *last_emit {
        if now.duration_since(t) < EMIT_COOLDOWN {
            return;
        }
    }

    {
        let cap = mic_capture_lock(capture);
        if !cap.copy_ring_chronological(scratch) {
            return;
        }
    }

    let Some(pitch) = yin.get_pitch(
        scratch.as_slice(),
        sample_rate as usize,
        POWER_THRESHOLD,
        CLARITY_THRESHOLD,
    ) else {
        return;
    };

    let hz = pitch.frequency;
    let conf = pitch.clarity;
    if !(70.0..=1600.0).contains(&hz) {
        return;
    }

    let note = hz_to_midi_note(hz);
    if note == 0 {
        return;
    }

    let block_peak = {
        let cap = mic_capture_lock(capture);
        cap.prev_block_peak
    };
    let vel = (block_peak * 220.0).clamp(1.0, 127.0) as u8;

    let ev = InputEvent::from_mic_note_on(note, vel, hz, conf);
    let _ = app.emit(ipc::INPUT_EVENT, &ev);
    *last_emit = Some(now);
}

/// Build a YIN detector sized for [`WINDOW`].
#[must_use]
pub fn new_yin_detector() -> YINDetector<f32> {
    YINDetector::new(WINDOW, PADDING)
}
