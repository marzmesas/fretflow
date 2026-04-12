/**
 * Writes static/fixtures/chord-smoke.mid — C4+E4+G4 as a one-beat chord (tests voicing).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeMidi, type MidiData } from "midi-file";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "static", "fixtures", "chord-smoke.mid");

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
      { deltaTime: 0, meta: true, type: "trackName", text: "chord-smoke" },
      { deltaTime: 0, meta: true, type: "endOfTrack" },
    ],
    [
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 64, velocity: 100 },
      { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 67, velocity: 100 },
      { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 60, velocity: 64 },
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 64, velocity: 64 },
      { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 67, velocity: 64 },
      { deltaTime: 0, meta: true, type: "endOfTrack" },
    ],
  ],
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, Buffer.from(writeMidi(midi)));
console.error(`Wrote ${outPath}`);
