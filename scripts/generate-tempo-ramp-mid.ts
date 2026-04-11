/**
 * Writes static/fixtures/tempo-ramp.mid — 4 beats wall time: 2 beats @120 then 2 beats @60
 * (effective BPM 80 when imported with integrated tempo map).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeMidi, type MidiData } from "midi-file";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "static", "fixtures", "tempo-ramp.mid");

const midi: MidiData = {
  header: { format: 1, numTracks: 2, ticksPerBeat: 480 },
  tracks: [
    [
      { deltaTime: 0, meta: true, type: "setTempo", microsecondsPerBeat: 500_000 },
      {
        deltaTime: 0,
        meta: true,
        type: "timeSignature",
        numerator: 4,
        denominator: 4,
        metronome: 24,
        thirtyseconds: 8,
      },
      { deltaTime: 960, meta: true, type: "setTempo", microsecondsPerBeat: 1_000_000 },
      { deltaTime: 0, meta: true, type: "endOfTrack" },
    ],
    [
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 64, velocity: 100 },
      { deltaTime: 1920, type: "noteOff", channel: 0, noteNumber: 64, velocity: 64 },
      { deltaTime: 0, meta: true, type: "endOfTrack" },
    ],
  ],
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(writeMidi(midi)));
console.error(`Wrote ${outPath}`);
