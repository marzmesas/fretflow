import type { ChartNoteV1 } from "./types";

/**
 * MIDI note numbers for open strings, standard tuning (concert pitch).
 * Index matches chart `stringIndex`: 0 = high e … 5 = low E.
 */
export const OPEN_STRING_MIDI: readonly number[] = [64, 59, 55, 50, 45, 40];

/** Expected MIDI pitch for a chart note (string + fret). */
export function chartNoteToMidi(note: ChartNoteV1): number {
  return OPEN_STRING_MIDI[note.stringIndex]! + note.fret;
}
