/** Equal-temperament chromatic tuner helpers (A4 = reference Hz). */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** MIDI note number → frequency in Hz (12-TET). */
export function midiNoteToHz(midiNote: number, a4Hz = 440): number {
  return a4Hz * 2 ** ((midiNote - 69) / 12);
}

/** Signed cents from measured Hz toward `targetHz` (negative = flat). */
export function centsFromHz(measuredHz: number, targetHz: number): number {
  if (measuredHz <= 0 || targetHz <= 0) return 0;
  return (1200 * Math.log(measuredHz / targetHz)) / Math.LN2;
}

export function midiNoteName(midiNote: number): string {
  const n = Math.round(midiNote);
  const pc = ((n % 12) + 12) % 12;
  const oct = Math.floor(n / 12) - 1;
  return `${NOTE_NAMES[pc]!}${oct}`;
}

export type TunerReading = {
  midiNote: number;
  label: string;
  targetHz: number;
  cents: number;
  confidence: number;
};

/** Build a reading from backend mic pitch (MIDI note + measured Hz). */
export function readingFromMicPitch(
  midiNote: number,
  pitchHz: number,
  confidence: number,
  a4Hz = 440,
): TunerReading {
  const targetHz = midiNoteToHz(midiNote, a4Hz);
  return {
    midiNote,
    label: midiNoteName(midiNote),
    targetHz,
    cents: centsFromHz(pitchHz, targetHz),
    confidence,
  };
}
