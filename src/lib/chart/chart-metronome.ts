/**
 * Quarter-note metronome aligned to **chart time** (seconds), same as the highway.
 * Clicks once per `bpm` quarter; chart `speed` is already reflected in how fast `chartTimeSec` advances.
 */

export class ChartBeatMetronome {
  private lastBeat = -1;

  /** After loop jump, restart, or new chart — next quarter boundary triggers a click. */
  syncAfterJump(chartTimeSec: number, bpm: number) {
    this.lastBeat = Math.floor(chartTimeSec * (bpm / 60) + 1e-9) - 1;
  }

  /** After resume from pause — no click until the next quarter. */
  syncResume(chartTimeSec: number, bpm: number) {
    this.lastBeat = Math.floor(chartTimeSec * (bpm / 60) + 1e-9);
  }

  /** Returns true when a new quarter started since the last tick. */
  tick(chartTimeSec: number, bpm: number): boolean {
    const b = Math.floor(chartTimeSec * (bpm / 60) + 1e-9);
    if (b > this.lastBeat) {
      this.lastBeat = b;
      return true;
    }
    return false;
  }
}

/** Short sine burst; call after `audioContext.resume()` when needed. */
export function playMetronomeClick(audioContext: AudioContext): void {
  const t0 = audioContext.currentTime;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.type = "sine";
  osc.frequency.value = 1180;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.048);
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.start(t0);
  osc.stop(t0 + 0.055);
}

export function createMetronomeAudioContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") {
    return null;
  }
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}
