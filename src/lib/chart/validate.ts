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

/** Human-readable validation messages (dev / Chart QA). */
export function getChartValidationIssues(data: unknown): string[] {
  const issues: string[] = [];
  if (data == null || typeof data !== "object") {
    issues.push("Root value must be a JSON object.");
    return issues;
  }
  const o = data as Record<string, unknown>;
  if (o.schemaVersion !== 1) {
    issues.push(`schemaVersion must be exactly 1 (got ${JSON.stringify(o.schemaVersion)}).`);
  }
  if (typeof o.title !== "string") {
    issues.push("title must be a string.");
  }
  if (typeof o.bpm !== "number" || o.bpm <= 0 || o.bpm > 400) {
    issues.push("bpm must be a number strictly between 0 and 400.");
  }
  if (!isTimeSignature(o.timeSignature)) {
    issues.push("timeSignature must be a pair of positive numbers, e.g. [4, 4].");
  }
  if (o.lengthBeats != null && (typeof o.lengthBeats !== "number" || o.lengthBeats <= 0)) {
    issues.push("lengthBeats, when set, must be a positive number.");
  }
  if (!Array.isArray(o.notes)) {
    issues.push("notes must be an array.");
    return issues;
  }
  o.notes.forEach((n, i) => {
    const prefix = `notes[${i}]`;
    if (n == null || typeof n !== "object") {
      issues.push(`${prefix}: each note must be an object.`);
      return;
    }
    const note = n as Record<string, unknown>;
    if (typeof note.startBeat !== "number" || note.startBeat < 0) {
      issues.push(`${prefix}: startBeat must be a number ≥ 0.`);
    }
    if (typeof note.durationBeats !== "number" || note.durationBeats <= 0) {
      issues.push(`${prefix}: durationBeats must be a number > 0.`);
    }
    if (
      typeof note.stringIndex !== "number" ||
      note.stringIndex < 0 ||
      note.stringIndex > 5 ||
      !Number.isInteger(note.stringIndex)
    ) {
      issues.push(`${prefix}: stringIndex must be an integer from 0 (high e) through 5 (low E).`);
    }
    if (typeof note.fret !== "number" || note.fret < 0 || note.fret > 24 || !Number.isInteger(note.fret)) {
      issues.push(`${prefix}: fret must be an integer from 0 through 24.`);
    }
  });
  return issues;
}

export function validateChart(data: unknown): data is FretflowChartV1 {
  return getChartValidationIssues(data).length === 0;
}
