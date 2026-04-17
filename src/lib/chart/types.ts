/** Fretflow chart interchange — v1. See docs/CHART_SCHEMA.md */

export type TimeSignature = [beatsPerBar: number, beatUnit: number];

export type ChartNoteV1 = {
  /** Quarter-note beats from chart start */
  startBeat: number;
  durationBeats: number;
  /** 0 = high E … 5 = low E (standard tuning display order) */
  stringIndex: number;
  /** Fret number; 0 = open */
  fret: number;
};

export type FretflowChartV1 = {
  schemaVersion: 1;
  title: string;
  bpm: number;
  timeSignature: TimeSignature;
  /** If omitted, length is derived from the last note end */
  lengthBeats?: number;
  notes: ChartNoteV1[];
  /** Relative URL to an audio backing track (e.g. `/charts/audio/song.mp3`). Played in sync with the highway when present. */
  backingAudioUrl?: string;
};
