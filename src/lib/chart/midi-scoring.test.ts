import { describe, expect, it } from "vitest";
import type { FretflowChartV1 } from "./types";
import {
  collectMissedNoteIndices,
  findHitNoteIndex,
  findRhythmHitNoteIndex,
  judgedNoteStartSeconds,
  noteStartSeconds,
} from "./midi-scoring";

const BPM = 120;

function makeChart(
  notes: { startBeat: number; durationBeats: number; stringIndex: number; fret: number }[],
): FretflowChartV1 {
  return {
    schemaVersion: 1,
    title: "test",
    bpm: BPM,
    timeSignature: [4, 4],
    notes,
  };
}

const oneNote = makeChart([{ startBeat: 2, durationBeats: 1, stringIndex: 5, fret: 0 }]);
const noteStartSec = noteStartSeconds(oneNote.notes[0]!, BPM);

describe("noteStartSeconds", () => {
  it("converts beats to seconds at given BPM", () => {
    expect(noteStartSec).toBeCloseTo(1.0, 5);
  });
});

describe("judgedNoteStartSeconds", () => {
  it("shifts by latency offset", () => {
    const shifted = judgedNoteStartSeconds(oneNote.notes[0]!, BPM, 100);
    expect(shifted).toBeCloseTo(noteStartSec + 0.1, 5);
  });
});

describe("findHitNoteIndex", () => {
  const win = { earlyMs: 100, lateMs: 160 };
  const midiNote = 40;

  it("matches a note within the early window", () => {
    const hit = findHitNoteIndex(oneNote, noteStartSec - 0.08, midiNote, new Set(), new Set(), win);
    expect(hit).not.toBeNull();
    expect(hit!.index).toBe(0);
    expect(hit!.deltaMs).toBeLessThan(0);
  });

  it("matches a note within the late window", () => {
    const hit = findHitNoteIndex(oneNote, noteStartSec + 0.12, midiNote, new Set(), new Set(), win);
    expect(hit).not.toBeNull();
    expect(hit!.index).toBe(0);
    expect(hit!.deltaMs).toBeGreaterThan(0);
  });

  it("returns null if outside the window", () => {
    const hit = findHitNoteIndex(oneNote, noteStartSec + 0.5, midiNote, new Set(), new Set(), win);
    expect(hit).toBeNull();
  });

  it("returns null for wrong MIDI note", () => {
    const hit = findHitNoteIndex(oneNote, noteStartSec, 60, new Set(), new Set(), win);
    expect(hit).toBeNull();
  });

  it("skips consumed notes", () => {
    const hit = findHitNoteIndex(oneNote, noteStartSec, midiNote, new Set([0]), new Set(), win);
    expect(hit).toBeNull();
  });

  it("skips missed notes", () => {
    const hit = findHitNoteIndex(oneNote, noteStartSec, midiNote, new Set(), new Set([0]), win);
    expect(hit).toBeNull();
  });

  it("picks closest when multiple notes match", () => {
    const chart = makeChart([
      { startBeat: 2, durationBeats: 1, stringIndex: 5, fret: 0 },
      { startBeat: 2.1, durationBeats: 1, stringIndex: 5, fret: 0 },
    ]);
    const t = noteStartSeconds(chart.notes[1]!, BPM);
    const hit = findHitNoteIndex(chart, t, midiNote, new Set(), new Set(), win);
    expect(hit).not.toBeNull();
    expect(hit!.index).toBe(1);
  });

  it("respects latency offset", () => {
    const offsetMs = 80;
    const hit = findHitNoteIndex(
      oneNote,
      noteStartSec + offsetMs / 1000 + 0.05,
      midiNote,
      new Set(),
      new Set(),
      win,
      offsetMs,
    );
    expect(hit).not.toBeNull();
    expect(hit!.deltaMs).toBeCloseTo(50, 0);
  });
});

describe("findRhythmHitNoteIndex", () => {
  const win = { earlyMs: 140, lateMs: 200 };

  it("matches any note regardless of pitch", () => {
    const hit = findRhythmHitNoteIndex(oneNote, noteStartSec, new Set(), new Set(), win);
    expect(hit).not.toBeNull();
    expect(hit!.index).toBe(0);
  });
});

describe("collectMissedNoteIndices", () => {
  it("returns notes past the late window", () => {
    const missed = collectMissedNoteIndices(oneNote, noteStartSec + 0.5, new Set(), new Set(), 160);
    expect(missed).toEqual([0]);
  });

  it("does not count notes still within the window", () => {
    const missed = collectMissedNoteIndices(oneNote, noteStartSec + 0.1, new Set(), new Set(), 160);
    expect(missed).toEqual([]);
  });

  it("does not re-count consumed or already missed notes", () => {
    const missed = collectMissedNoteIndices(oneNote, noteStartSec + 0.5, new Set([0]), new Set(), 160);
    expect(missed).toEqual([]);
  });

  it("counts all remaining notes when time is well past chart end", () => {
    const chart = makeChart([
      { startBeat: 0, durationBeats: 1, stringIndex: 5, fret: 0 },
      { startBeat: 1, durationBeats: 1, stringIndex: 5, fret: 0 },
      { startBeat: 2, durationBeats: 1, stringIndex: 5, fret: 0 },
    ]);
    const missed = collectMissedNoteIndices(chart, 99, new Set(), new Set(), 200);
    expect(missed).toEqual([0, 1, 2]);
  });

  it("breaks early — does not include notes still in the future", () => {
    const chart = makeChart([
      { startBeat: 0, durationBeats: 1, stringIndex: 5, fret: 0 },
      { startBeat: 10, durationBeats: 1, stringIndex: 5, fret: 0 },
    ]);
    const missed = collectMissedNoteIndices(chart, 1, new Set(), new Set(), 160);
    expect(missed).toEqual([0]);
  });
});

describe("early-break optimization", () => {
  it("findHitNoteIndex still finds a note when earlier notes are consumed", () => {
    const chart = makeChart([
      { startBeat: 0, durationBeats: 1, stringIndex: 5, fret: 0 },
      { startBeat: 2, durationBeats: 1, stringIndex: 5, fret: 0 },
    ]);
    const t = noteStartSeconds(chart.notes[1]!, BPM);
    const hit = findHitNoteIndex(chart, t, 40, new Set([0]), new Set(), { earlyMs: 100, lateMs: 160 });
    expect(hit).not.toBeNull();
    expect(hit!.index).toBe(1);
  });

  it("findRhythmHitNoteIndex breaks early past the window", () => {
    const chart = makeChart([
      { startBeat: 0, durationBeats: 1, stringIndex: 5, fret: 0 },
      { startBeat: 100, durationBeats: 1, stringIndex: 5, fret: 0 },
    ]);
    const hit = findRhythmHitNoteIndex(chart, 0.5, new Set([0]), new Set(), { earlyMs: 140, lateMs: 200 });
    expect(hit).toBeNull();
  });
});
