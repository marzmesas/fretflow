/**
 * Generate simple backing audio (.wav) for bundled charts.
 * Uses raw PCM generation — no Web Audio API needed (runs in Node).
 *
 * Run: npx tsx scripts/generate-backing-tracks.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHARTS_DIR = join(__dirname, "..", "static", "charts");
const AUDIO_DIR = join(CHARTS_DIR, "audio");

const SAMPLE_RATE = 44100;
const BIT_DEPTH = 16;

interface ChartJson {
  title: string;
  bpm: number;
  timeSignature: [number, number];
  notes: { startBeat: number; durationBeats: number; stringIndex: number; fret: number }[];
  lengthBeats?: number;
}

const OPEN_MIDI = [64, 59, 55, 50, 45, 40];

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function chartLengthBeats(c: ChartJson): number {
  if (c.lengthBeats && c.lengthBeats > 0) return c.lengthBeats;
  let end = 0;
  for (const n of c.notes) end = Math.max(end, n.startBeat + n.durationBeats);
  return Math.max(end, 4);
}

function generateSine(samples: Float32Array, startSample: number, durationSamples: number, freq: number, gain: number) {
  const fadeIn = Math.min(200, durationSamples / 4);
  const fadeOut = Math.min(400, durationSamples / 4);
  for (let i = 0; i < durationSamples && startSample + i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    let env = 1;
    if (i < fadeIn) env = i / fadeIn;
    if (i > durationSamples - fadeOut) env = (durationSamples - i) / fadeOut;
    samples[startSample + i] += Math.sin(2 * Math.PI * freq * t) * gain * env;
  }
}

function generateClick(samples: Float32Array, startSample: number, freq: number, gain: number) {
  const dur = Math.floor(SAMPLE_RATE * 0.03);
  for (let i = 0; i < dur && startSample + i < samples.length; i++) {
    const t = i / SAMPLE_RATE;
    const env = 1 - i / dur;
    samples[startSample + i] += Math.sin(2 * Math.PI * freq * t) * gain * env * env;
  }
}

function generateBackingForChart(chart: ChartJson): Float32Array {
  const totalBeats = chartLengthBeats(chart) + 2;
  const secPerBeat = 60 / chart.bpm;
  const totalSamples = Math.ceil(totalBeats * secPerBeat * SAMPLE_RATE);
  const samples = new Float32Array(totalSamples);

  // Click track on each beat
  for (let b = 0; b < totalBeats; b++) {
    const sampleIdx = Math.floor(b * secPerBeat * SAMPLE_RATE);
    const isDownbeat = b % chart.timeSignature[0] === 0;
    generateClick(samples, sampleIdx, isDownbeat ? 1200 : 800, isDownbeat ? 0.15 : 0.08);
  }

  // Bass root: low sine on downbeats based on first note of each bar
  const beatsPerBar = chart.timeSignature[0];
  for (let bar = 0; bar * beatsPerBar < totalBeats; bar++) {
    const barStartBeat = bar * beatsPerBar;
    const closestNote = chart.notes.find(n => n.startBeat >= barStartBeat && n.startBeat < barStartBeat + beatsPerBar);
    if (closestNote) {
      const midi = OPEN_MIDI[closestNote.stringIndex]! + closestNote.fret;
      const rootHz = midiToHz(midi - 12);
      const sampleIdx = Math.floor(barStartBeat * secPerBeat * SAMPLE_RATE);
      const dur = Math.floor(beatsPerBar * secPerBeat * SAMPLE_RATE * 0.8);
      generateSine(samples, sampleIdx, dur, rootHz, 0.06);
    }
  }

  // Normalize
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]!));
  if (peak > 0.9) {
    const scale = 0.85 / peak;
    for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  }

  return samples;
}

function floatToWav(samples: Float32Array): Buffer {
  const numSamples = samples.length;
  const bytesPerSample = BIT_DEPTH / 8;
  const dataSize = numSamples * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(BIT_DEPTH, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    const val = Math.floor(s * 32767);
    buffer.writeInt16LE(val, 44 + i * 2);
  }

  return buffer;
}

const CHART_FILES = [
  "chromatic-warmup.json",
  "pentatonic-am.json",
  "major-scale-e.json",
  "open-chords.json",
  "single-string-eighths.json",
  "arpeggio-c-em.json",
  "blues-shuffle.json",
  "spider-exercise.json",
  "power-chords.json",
  "sustained-melody.json",
  "hammer-pull-drill.json",
  "string-skipping.json",
];

if (!existsSync(AUDIO_DIR)) mkdirSync(AUDIO_DIR, { recursive: true });

console.log("Generating backing tracks:");
for (const file of CHART_FILES) {
  const chartPath = join(CHARTS_DIR, file);
  const chart: ChartJson = JSON.parse(readFileSync(chartPath, "utf8"));
  const samples = generateBackingForChart(chart);
  const wav = floatToWav(samples);
  const audioFile = file.replace(".json", ".wav");
  const audioPath = join(AUDIO_DIR, audioFile);
  writeFileSync(audioPath, wav);
  const sizeMb = (wav.length / 1024 / 1024).toFixed(2);
  console.log(`  ${audioFile}: ${sizeMb} MB (${chart.bpm} BPM, ${(samples.length / SAMPLE_RATE).toFixed(1)}s)`);
}
console.log("Done.");
