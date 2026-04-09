/** Optional low sine drone for Practice (placeholder “backing” until stems). */

export const BACKING_DRONE_FREQ_HZ = 82.41; // ~low E
const RAMP_S = 0.05;

let ctx: AudioContext | null = null;
let osc: OscillatorNode | null = null;
let gainNode: GainNode | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (ctx?.state === "closed") {
    ctx = null;
    osc = null;
    gainNode = null;
  }
  if (!ctx) {
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  return ctx;
}

/**
 * Start or update drone while `playing`; tear down when off or gain 0.
 */
export function syncBackingDrone(opts: {
  playing: boolean;
  enabled: boolean;
  muted: boolean;
  /** Linear gain when unmuted (keep small; ~0.02–0.08). */
  linearGain: number;
  frequencyHz?: number;
}): void {
  const freq = opts.frequencyHz ?? BACKING_DRONE_FREQ_HZ;
  const want =
    opts.playing && opts.enabled && !opts.muted && opts.linearGain > 1e-4;

  if (!want) {
    if (osc && ctx) {
      try {
        gainNode?.gain.setTargetAtTime(0.0001, ctx.currentTime, RAMP_S);
        osc.stop(ctx.currentTime + RAMP_S * 3);
      } catch {
        /* already stopped */
      }
    }
    osc = null;
    gainNode = null;
    return;
  }

  const audioCtx = ensureContext();
  if (!audioCtx) return;
  void audioCtx.resume();

  if (!osc || !gainNode) {
    const g = audioCtx.createGain();
    g.gain.value = 0.0001;
    const o = audioCtx.createOscillator();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(opts.linearGain, audioCtx.currentTime + RAMP_S);
    osc = o;
    gainNode = g;
  } else {
    osc.frequency.setTargetAtTime(freq, audioCtx.currentTime, RAMP_S);
    gainNode.gain.setTargetAtTime(opts.linearGain, audioCtx.currentTime, RAMP_S);
  }
}

export function disposeBackingDrone(): void {
  try {
    osc?.stop();
  } catch {
    /* ignore */
  }
  osc = null;
  gainNode = null;
  void ctx?.close();
  ctx = null;
}
