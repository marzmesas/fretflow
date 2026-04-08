import type { FretflowChartV1 } from "./types";

function isTimeSignature(x: unknown): x is [number, number] {
  return (
    Array.isArray(x) &&
    x.length === 2 &&
    typeof x[0] === "number" &&
    typeof x[1] === "number" &&
    x[0] > 0 &&
    x[1] > 0
  );
}

export function validateChart(data: unknown): data is FretflowChartV1 {
  if (data == null || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  if (o.schemaVersion !== 1) return false;
  if (typeof o.title !== "string") return false;
  if (typeof o.bpm !== "number" || o.bpm <= 0 || o.bpm > 400) return false;
  if (!isTimeSignature(o.timeSignature)) return false;
  if (o.lengthBeats != null && (typeof o.lengthBeats !== "number" || o.lengthBeats <= 0)) {
    return false;
  }
  if (!Array.isArray(o.notes)) return false;
  for (const n of o.notes) {
    if (n == null || typeof n !== "object") return false;
    const note = n as Record<string, unknown>;
    if (typeof note.startBeat !== "number" || note.startBeat < 0) return false;
    if (typeof note.durationBeats !== "number" || note.durationBeats <= 0) return false;
    if (
      typeof note.stringIndex !== "number" ||
      note.stringIndex < 0 ||
      note.stringIndex > 5 ||
      !Number.isInteger(note.stringIndex)
    ) {
      return false;
    }
    if (typeof note.fret !== "number" || note.fret < 0 || note.fret > 24 || !Number.isInteger(note.fret)) {
      return false;
    }
  }
  return true;
}
