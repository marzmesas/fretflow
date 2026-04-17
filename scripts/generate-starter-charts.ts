/**
 * Generate bundled starter charts for the Fretflow library.
 * Run: npx tsx scripts/generate-starter-charts.ts
 */
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

type Note = { startBeat: number; durationBeats: number; stringIndex: number; fret: number };
type Chart = {
  schemaVersion: 1;
  title: string;
  bpm: number;
  timeSignature: [number, number];
  lengthBeats?: number;
  notes: Note[];
};

function writeChart(filename: string, chart: Chart) {
  const path = join(__dirname, "..", "static", "charts", filename);
  writeFileSync(path, JSON.stringify(chart, null, 2) + "\n");
  console.log(`  ${filename}: ${chart.notes.length} notes, ${chart.bpm} BPM`);
}

// --- Chart generators ---

function chromaticWarmup(): Chart {
  const notes: Note[] = [];
  let beat = 0;
  for (let s = 5; s >= 0; s--) {
    for (let f = 0; f <= 4; f++) {
      notes.push({ startBeat: beat, durationBeats: 0.5, stringIndex: s, fret: f });
      beat += 0.5;
    }
  }
  return { schemaVersion: 1, title: "Chromatic warm-up (0–4)", bpm: 80, timeSignature: [4, 4], notes };
}

function pentatonicMinor(): Chart {
  const pattern = [
    [5, 0], [5, 3], [4, 0], [4, 2], [3, 0], [3, 2],
    [2, 0], [2, 3], [1, 0], [1, 3], [0, 0], [0, 3],
    [0, 3], [0, 0], [1, 3], [1, 0], [2, 3], [2, 0],
    [3, 2], [3, 0], [4, 2], [4, 0], [5, 3], [5, 0],
  ];
  const notes = pattern.map(([s, f], i) => ({
    startBeat: i * 0.5,
    durationBeats: 0.5,
    stringIndex: s!,
    fret: f!,
  }));
  return { schemaVersion: 1, title: "Am pentatonic — up & down", bpm: 90, timeSignature: [4, 4], notes };
}

function majorScale(): Chart {
  const pattern = [
    [5, 0], [5, 2], [4, 0], [4, 2], [4, 3],
    [3, 0], [3, 2], [2, 0],
    [2, 0], [3, 2], [3, 0], [4, 3], [4, 2], [4, 0],
    [5, 2], [5, 0],
  ];
  const notes = pattern.map(([s, f], i) => ({
    startBeat: i * 0.5,
    durationBeats: 0.5,
    stringIndex: s!,
    fret: f!,
  }));
  return { schemaVersion: 1, title: "E major scale — up & down", bpm: 100, timeSignature: [4, 4], notes };
}

function openChordProgression(): Chart {
  const chords: [number, number][][] = [
    [[4, 3], [3, 2], [2, 0], [1, 1]],   // C
    [[4, 0], [3, 2], [2, 2], [1, 0]],   // Am
    [[5, 0], [4, 2], [3, 2], [2, 1]],   // Em7-ish
    [[3, 0], [2, 2], [1, 3], [0, 2]],   // D
  ];
  const notes: Note[] = [];
  let beat = 0;
  for (let rep = 0; rep < 2; rep++) {
    for (const chord of chords) {
      for (const [s, f] of chord) {
        notes.push({ startBeat: beat, durationBeats: 2, stringIndex: s!, fret: f! });
      }
      beat += 2;
    }
  }
  return { schemaVersion: 1, title: "Open chord changes (C–Am–Em–D)", bpm: 72, timeSignature: [4, 4], notes };
}

function singleStringEighths(): Chart {
  const notes: Note[] = [];
  let beat = 0;
  for (let rep = 0; rep < 4; rep++) {
    for (const f of [5, 7, 8, 7, 5, 7, 8, 10]) {
      notes.push({ startBeat: beat, durationBeats: 0.5, stringIndex: 5, fret: f });
      beat += 0.5;
    }
  }
  return { schemaVersion: 1, title: "Single string eighths (low E)", bpm: 110, timeSignature: [4, 4], notes };
}

function arpeggioExercise(): Chart {
  const patterns: [number, number][] = [
    [5, 3], [4, 2], [3, 0], [2, 0], [1, 0], [2, 0], [3, 0], [4, 2],
    [5, 0], [4, 2], [3, 2], [2, 1], [1, 0], [2, 1], [3, 2], [4, 2],
  ];
  const notes: Note[] = [];
  let beat = 0;
  for (let rep = 0; rep < 3; rep++) {
    for (const [s, f] of patterns) {
      notes.push({ startBeat: beat, durationBeats: 0.5, stringIndex: s!, fret: f! });
      beat += 0.5;
    }
  }
  return { schemaVersion: 1, title: "Arpeggio exercise (C–Em)", bpm: 85, timeSignature: [4, 4], notes };
}

function bluesShuffleRiff(): Chart {
  const riff: [number, number, number][] = [
    [5, 0, 1], [5, 0, 0.5], [5, 2, 0.5],
    [5, 0, 1], [5, 0, 0.5], [5, 2, 0.5],
    [4, 0, 1], [4, 0, 0.5], [4, 2, 0.5],
    [5, 0, 1], [5, 0, 0.5], [5, 2, 0.5],
  ];
  const notes: Note[] = [];
  let beat = 0;
  for (let rep = 0; rep < 3; rep++) {
    for (const [s, f, d] of riff) {
      notes.push({ startBeat: beat, durationBeats: d!, stringIndex: s!, fret: f! });
      beat += d!;
    }
  }
  return { schemaVersion: 1, title: "Blues shuffle riff (E)", bpm: 100, timeSignature: [4, 4], notes };
}

function spiderExercise(): Chart {
  const notes: Note[] = [];
  let beat = 0;
  for (let s = 5; s >= 0; s--) {
    for (const f of [1, 2, 3, 4]) {
      notes.push({ startBeat: beat, durationBeats: 0.5, stringIndex: s, fret: f });
      beat += 0.5;
    }
  }
  for (let s = 0; s <= 5; s++) {
    for (const f of [4, 3, 2, 1]) {
      notes.push({ startBeat: beat, durationBeats: 0.5, stringIndex: s, fret: f });
      beat += 0.5;
    }
  }
  return { schemaVersion: 1, title: "Spider exercise (1-2-3-4)", bpm: 70, timeSignature: [4, 4], notes };
}

function powerChordRhythm(): Chart {
  const chords: [number, number][][] = [
    [[5, 0], [4, 2]],
    [[5, 3], [4, 5]],
    [[5, 5], [4, 7]],
    [[5, 3], [4, 5]],
  ];
  const notes: Note[] = [];
  let beat = 0;
  for (let rep = 0; rep < 4; rep++) {
    for (const chord of chords) {
      for (const [s, f] of chord) {
        notes.push({ startBeat: beat, durationBeats: 0.5, stringIndex: s!, fret: f! });
      }
      beat += 1;
    }
  }
  return { schemaVersion: 1, title: "Power chord rhythm (E–G–A–G)", bpm: 120, timeSignature: [4, 4], notes };
}

function sustainedMelody(): Chart {
  const melody: [number, number, number, number][] = [
    [2, 5, 0, 2], [1, 5, 2, 1], [1, 7, 3, 1],
    [1, 5, 4, 2], [2, 7, 6, 1], [2, 5, 7, 1],
    [3, 7, 8, 2], [3, 5, 10, 1], [2, 5, 11, 1],
    [2, 5, 12, 4],
  ];
  const notes = melody.map(([s, f, start, dur]) => ({
    startBeat: start!,
    durationBeats: dur!,
    stringIndex: s!,
    fret: f!,
  }));
  return { schemaVersion: 1, title: "Sustained melody (Am feel)", bpm: 65, timeSignature: [4, 4], lengthBeats: 16, notes };
}

function hammerOnPullOff(): Chart {
  const notes: Note[] = [];
  let beat = 0;
  for (let rep = 0; rep < 4; rep++) {
    for (const [s, frets] of [[5, [0, 2, 3, 2]], [4, [0, 2, 3, 2]], [3, [0, 2, 0, 2]]] as [number, number[]][]) {
      for (const f of frets) {
        notes.push({ startBeat: beat, durationBeats: 0.25, stringIndex: s, fret: f });
        beat += 0.25;
      }
    }
  }
  return { schemaVersion: 1, title: "Hammer-on / pull-off drill", bpm: 85, timeSignature: [4, 4], notes };
}

function stringSkipping(): Chart {
  const pattern: [number, number][] = [
    [5, 0], [3, 2], [4, 2], [2, 0],
    [3, 0], [1, 0], [2, 0], [0, 0],
    [0, 0], [2, 0], [1, 0], [3, 0],
    [2, 0], [4, 2], [3, 2], [5, 0],
  ];
  const notes: Note[] = [];
  let beat = 0;
  for (let rep = 0; rep < 3; rep++) {
    for (const [s, f] of pattern) {
      notes.push({ startBeat: beat, durationBeats: 0.5, stringIndex: s!, fret: f! });
      beat += 0.5;
    }
  }
  return { schemaVersion: 1, title: "String skipping (open position)", bpm: 75, timeSignature: [4, 4], notes };
}

// --- Generate all ---

console.log("Generating starter charts:");
writeChart("chromatic-warmup.json", chromaticWarmup());
writeChart("pentatonic-am.json", pentatonicMinor());
writeChart("major-scale-e.json", majorScale());
writeChart("open-chords.json", openChordProgression());
writeChart("single-string-eighths.json", singleStringEighths());
writeChart("arpeggio-c-em.json", arpeggioExercise());
writeChart("blues-shuffle.json", bluesShuffleRiff());
writeChart("spider-exercise.json", spiderExercise());
writeChart("power-chords.json", powerChordRhythm());
writeChart("sustained-melody.json", sustainedMelody());
writeChart("hammer-pull-drill.json", hammerOnPullOff());
writeChart("string-skipping.json", stringSkipping());
console.log("Done — 12 charts generated.");
