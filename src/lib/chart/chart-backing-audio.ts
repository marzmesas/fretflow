/**
 * File-backed audio for Practice — loads an audio file (mp3/wav/ogg) via Web Audio
 * and plays it in sync with the chart timeline, respecting speed changes.
 */

let ctx: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let sourceNode: AudioBufferSourceNode | null = null;
let gainNode: GainNode | null = null;
let loadedUrl: string | null = null;
let isPlaying = false;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof AudioContext === "undefined") return null;
  if (ctx?.state === "closed") {
    ctx = null;
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

export async function loadBackingAudio(url: string): Promise<boolean> {
  if (loadedUrl === url && buffer) return true;
  disposeBackingAudio();
  const audioCtx = ensureContext();
  if (!audioCtx) return false;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return false;
    const arrayBuf = await resp.arrayBuffer();
    buffer = await audioCtx.decodeAudioData(arrayBuf);
    loadedUrl = url;
    return true;
  } catch {
    buffer = null;
    loadedUrl = null;
    return false;
  }
}

export function playBackingAudio(opts: {
  offsetSec: number;
  speed: number;
  volume: number;
}): void {
  stopBackingAudio();
  if (!buffer) return;
  const audioCtx = ensureContext();
  if (!audioCtx) return;
  void audioCtx.resume();

  const g = audioCtx.createGain();
  g.gain.value = Math.max(0, Math.min(1, opts.volume));
  g.connect(audioCtx.destination);

  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = opts.speed;
  src.connect(g);
  src.onended = () => {
    if (sourceNode === src) {
      isPlaying = false;
      sourceNode = null;
    }
  };

  const offset = Math.max(0, Math.min(opts.offsetSec, buffer.duration - 0.01));
  src.start(0, offset);
  sourceNode = src;
  gainNode = g;
  isPlaying = true;
}

export function stopBackingAudio(): void {
  if (sourceNode) {
    try {
      sourceNode.stop();
    } catch {
      /* already stopped */
    }
    sourceNode = null;
  }
  gainNode = null;
  isPlaying = false;
}

export function setBackingAudioVolume(vol: number): void {
  if (gainNode && ctx) {
    gainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, vol)), ctx.currentTime, 0.03);
  }
}

export function setBackingAudioSpeed(speed: number): void {
  if (sourceNode) {
    sourceNode.playbackRate.value = speed;
  }
}

export function isBackingAudioLoaded(): boolean {
  return buffer != null;
}

export function isBackingAudioPlaying(): boolean {
  return isPlaying;
}

export function disposeBackingAudio(): void {
  stopBackingAudio();
  buffer = null;
  loadedUrl = null;
  void ctx?.close();
  ctx = null;
}
