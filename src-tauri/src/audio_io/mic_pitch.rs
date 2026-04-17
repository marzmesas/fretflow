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

const ONSET_LOW_BASE: f32 = 0.055;
const ONSET_HIGH_BASE: f32 = 0.10;
const POWER_THRESHOLD: f32 = 1.42;
const CLARITY_THRESHOLD: f32 = 0.62;
const EMIT_COOLDOWN: Duration = Duration::from_millis(68);

/// Ambient RMS exponential-average decay per callback (~23ms at 44.1kHz/1024).
const AMBIENT_ALPHA: f32 = 0.005;
/// Minimum multiplier on onset thresholds from ambient floor.
const AMBIENT_ONSET_SCALE_MIN: f32 = 1.0;
/// Maximum multiplier — noisy rooms raise thresholds but not unboundedly.
const AMBIENT_ONSET_SCALE_MAX: f32 = 4.0;

/// Below this RMS for SILENCE_POLLS consecutive monitor polls → note_off.
const SILENCE_RMS_THRESHOLD: f32 = 0.012;
const SILENCE_POLLS: u32 = 5; // ~165ms at 33ms poll

/// Require N consecutive YIN frames agreeing on a *different* note before emitting.
const STABILITY_FRAMES: u32 = 2;

/// Cents dead-zone around last emitted note to suppress vibrato jitter.
const VIBRATO_HYSTERESIS_CENTS: f32 = 50.0;

#[inline]
fn hz_to_midi_note(hz: f32) -> u8 {
    if hz <= 0.0 || !hz.is_finite() {
        return 0;
    }
    let v = 12.0 * (hz / 440.0).log2() + 69.0;
    v.round().clamp(0.0, 127.0) as u8
}

#[inline]
fn hz_to_midi_float(hz: f32) -> f32 {
    12.0 * (hz / 440.0).log2() + 69.0
}

/// Check if `hz` is within ±`cents` of `reference_note` (MIDI integer).
#[inline]
fn within_cents(hz: f32, reference_note: u8, cents: f32) -> bool {
    let midi_f = hz_to_midi_float(hz);
    let diff = (midi_f - reference_note as f32).abs() * 100.0; // semitones → cents
    diff <= cents
}

fn ring_copy_chronological(ring: &[f32; WINDOW], write: usize, out: &mut [f32]) {
    debug_assert_eq!(out.len(), WINDOW);
    let w = write;
    out[..WINDOW - w].copy_from_slice(&ring[w..]);
    out[WINDOW - w..].copy_from_slice(&ring[..w]);
}

/// Compute RMS of a buffer.
fn compute_rms(buf: &[f32]) -> f32 {
    if buf.is_empty() {
        return 0.0;
    }
    let sum_sq: f32 = buf.iter().map(|s| s * s).sum();
    (sum_sq / buf.len() as f32).sqrt()
}

/// Shared between cpal callback (writer) and monitor thread (reader for YIN).
pub struct MicCaptureState {
    ring: [f32; WINDOW],
    write: usize,
    samples_seen: u32,
    prev_block_peak: f32,
    /// Slow-moving ambient RMS for adaptive onset.
    ambient_rms: f32,
}

impl MicCaptureState {
    #[must_use]
    pub fn new() -> Self {
        Self {
            ring: [0.0; WINDOW],
            write: 0,
            samples_seen: 0,
            prev_block_peak: 0.0,
            ambient_rms: 0.0,
        }
    }

    pub fn feed_mono_sample(&mut self, s: f32) {
        self.ring[self.write] = s;
        self.write = (self.write + 1) % WINDOW;
        self.samples_seen = self.samples_seen.saturating_add(1);
    }

    /// After processing a full cpal buffer: update onset history, ambient RMS, and return
    /// whether to run YIN.
    pub fn note_buffer_end(&mut self, block_peak: f32, block_rms: f32) -> bool {
        self.ambient_rms = self.ambient_rms * (1.0 - AMBIENT_ALPHA) + block_rms * AMBIENT_ALPHA;

        let scale =
            (self.ambient_rms * 15.0).clamp(AMBIENT_ONSET_SCALE_MIN, AMBIENT_ONSET_SCALE_MAX);
        let onset_low = ONSET_LOW_BASE * scale;
        let onset_high = ONSET_HIGH_BASE * scale;

        let rising = self.prev_block_peak < onset_low && block_peak >= onset_high;
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

pub fn mic_capture_lock(mic: &Mutex<MicCaptureState>) -> MutexGuard<'_, MicCaptureState> {
    mic.lock().unwrap_or_else(|e| e.into_inner())
}

/// YIN + cooldown + stability + silence tracking — owned by the input monitor thread only.
pub struct MicPitchThreadState {
    pub yin: YINDetector<f32>,
    pub scratch: [f32; WINDOW],
    pub last_emit: Option<Instant>,
    pub last_sounded_note: Option<u8>,
    /// Pending trigger that arrived during cooldown.
    pending_retrigger: bool,
    /// Candidate note for stability filter (must see STABILITY_FRAMES before emitting a *change*).
    candidate_note: Option<u8>,
    candidate_count: u32,
    /// Consecutive monitor polls with RMS below silence threshold.
    silence_count: u32,
}

impl MicPitchThreadState {
    #[must_use]
    pub fn new() -> Self {
        Self {
            yin: new_yin_detector(),
            scratch: [0.0f32; WINDOW],
            last_emit: None,
            last_sounded_note: None,
            pending_retrigger: false,
            candidate_note: None,
            candidate_count: 0,
            silence_count: 0,
        }
    }
}

impl Default for MicPitchThreadState {
    fn default() -> Self {
        Self::new()
    }
}

/// Called every ~33ms from the monitor loop. Handles silence detection and pitch triggers.
pub fn process_mic_pitch_trigger(
    trigger: &AtomicBool,
    capture: &Mutex<MicCaptureState>,
    sample_rate: u32,
    state: &mut MicPitchThreadState,
    app: &AppHandle,
) {
    let triggered = trigger.swap(false, Ordering::AcqRel);

    // Silence-based note_off: compute RMS and track silence duration.
    {
        let cap = mic_capture_lock(capture);
        if cap.samples_seen >= WINDOW as u32 {
            let rms = compute_rms(&cap.ring);
            if rms < SILENCE_RMS_THRESHOLD {
                state.silence_count = state.silence_count.saturating_add(1);
            } else {
                state.silence_count = 0;
            }
        }
    }

    if state.silence_count >= SILENCE_POLLS {
        if let Some(n) = state.last_sounded_note.take() {
            let off = InputEvent::from_mic_note_off(n);
            let _ = app.emit(ipc::INPUT_EVENT, &off);
        }
        state.candidate_note = None;
        state.candidate_count = 0;
        return;
    }

    // Trigger buffering: if in cooldown, save the trigger for after cooldown expires.
    if triggered {
        state.pending_retrigger = true;
    }

    let now = Instant::now();
    if let Some(t) = state.last_emit {
        if now.duration_since(t) < EMIT_COOLDOWN {
            return;
        }
    }

    if !state.pending_retrigger {
        return;
    }
    state.pending_retrigger = false;

    {
        let cap = mic_capture_lock(capture);
        if !cap.copy_ring_chronological(&mut state.scratch) {
            return;
        }
    }

    let Some(pitch) = state.yin.get_pitch(
        state.scratch.as_slice(),
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

    // Vibrato hysteresis: if we have a sounded note and detected Hz is close, keep it.
    if let Some(prev) = state.last_sounded_note {
        if prev == note || within_cents(hz, prev, VIBRATO_HYSTERESIS_CENTS) {
            // Same note or vibrato wobble — refresh timing but don't emit new events.
            state.last_emit = Some(now);
            state.candidate_note = None;
            state.candidate_count = 0;
            return;
        }
    }

    // Octave stability filter: require STABILITY_FRAMES consecutive detections of the
    // same *new* note before accepting a pitch change.
    if state.last_sounded_note.is_some() {
        match state.candidate_note {
            Some(cn) if cn == note => {
                state.candidate_count += 1;
                if state.candidate_count < STABILITY_FRAMES {
                    return;
                }
                // Passed stability check — fall through to emit.
            }
            _ => {
                state.candidate_note = Some(note);
                state.candidate_count = 1;
                if STABILITY_FRAMES > 1 {
                    return;
                }
            }
        }
    }

    state.candidate_note = None;
    state.candidate_count = 0;

    let block_peak = {
        let cap = mic_capture_lock(capture);
        cap.prev_block_peak
    };
    let vel = (block_peak * 220.0).clamp(1.0, 127.0) as u8;

    if let Some(prev) = state.last_sounded_note {
        if prev != note {
            let off = InputEvent::from_mic_note_off(prev);
            let _ = app.emit(ipc::INPUT_EVENT, &off);
        }
    }

    let ev = InputEvent::from_mic_note_on(note, vel, hz, conf);
    let _ = app.emit(ipc::INPUT_EVENT, &ev);
    state.last_emit = Some(now);
    state.last_sounded_note = Some(note);
}

/// Build a YIN detector sized for [`WINDOW`].
#[must_use]
pub fn new_yin_detector() -> YINDetector<f32> {
    YINDetector::new(WINDOW, PADDING)
}
