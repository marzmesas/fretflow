import type { FretflowChartV1 } from "./types";
import { beatToSeconds } from "./time";

export type HighwayColors = {
  bg: string;
  laneLine: string;
  hitLine: string;
  playhead: string;
  noteFill: string;
  noteBorder: string;
  noteHitFill: string;
  noteHitBorder: string;
  noteMissFill: string;
  noteMissBorder: string;
  label: string;
};

/** Matches `app.css` dark theme */
export const HIGHWAY_THEME_DARK: HighwayColors = {
  bg: "#12151c",
  laneLine: "#2a3140",
  hitLine: "#3d8bfd",
  playhead: "#3dd68c",
  noteFill: "#2a5cb0",
  noteBorder: "#3d8bfd",
  noteHitFill: "#1a4a3a",
  noteHitBorder: "#3dd68c",
  noteMissFill: "#3a2528",
  noteMissBorder: "#f87171",
  label: "#e8eaef",
};

const STRING_LABELS = ["e", "B", "G", "D", "A", "E"];

export function drawHighway(
  ctx: CanvasRenderingContext2D,
  chart: FretflowChartV1,
  timeSec: number,
  pixelsPerSecond: number,
  colors: HighwayColors,
  dpr: number,
  logicalW: number,
  logicalH: number,
  hitNoteIndices: ReadonlySet<number> = new Set(),
  missNoteIndices: ReadonlySet<number> = new Set(),
): void {
  const laneCount = 6;
  const labelW = 28;
  const hitPad = 48;
  const hitY = logicalH - hitPad;
  const laneTop = 12;
  const laneBottom = hitY - 4;
  const laneH = (laneBottom - laneTop) / laneCount;
  const gridLeft = labelW + 6;
  const gridW = logicalW - gridLeft - 8;
  const colW = gridW / laneCount;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, logicalW, logicalH);

  for (let s = 0; s <= laneCount; s++) {
    const y = laneTop + s * laneH;
    ctx.strokeStyle = colors.laneLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(labelW, y);
    ctx.lineTo(logicalW, y);
    ctx.stroke();
  }

  for (let s = 0; s <= laneCount; s++) {
    const x = gridLeft + s * colW;
    ctx.strokeStyle = colors.laneLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, laneTop);
    ctx.lineTo(x, laneBottom);
    ctx.stroke();
  }

  ctx.fillStyle = colors.label;
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let s = 0; s < laneCount; s++) {
    const cy = laneTop + s * laneH + laneH / 2;
    ctx.fillText(STRING_LABELS[s]!, labelW - 4, cy);
  }

  ctx.strokeStyle = colors.hitLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(labelW, hitY);
  ctx.lineTo(logicalW, hitY);
  ctx.stroke();

  ctx.strokeStyle = colors.playhead;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(labelW, hitY + 2);
  ctx.lineTo(logicalW, hitY + 2);
  ctx.stroke();

  const leadSec = hitPad / pixelsPerSecond + 2;
  const t0 = timeSec - 0.25;
  const t1 = timeSec + leadSec;

  for (let idx = 0; idx < chart.notes.length; idx++) {
    const n = chart.notes[idx]!;
    const startSec = beatToSeconds(n.startBeat, chart.bpm);
    const endSec = beatToSeconds(n.startBeat + n.durationBeats, chart.bpm);
    if (endSec < t0 || startSec > t1) continue;

    const yTop = hitY - (startSec - timeSec) * pixelsPerSecond;
    const yBottom = hitY - (endSec - timeSec) * pixelsPerSecond;
    const top = Math.min(yTop, yBottom);
    const height = Math.max(14, Math.abs(yBottom - yTop));

    const padX = 3;
    const x0 = gridLeft + n.stringIndex * colW + padX;
    const noteW = colW - padX * 2;

    const isHit = hitNoteIndices.has(idx);
    const isMiss = missNoteIndices.has(idx);
    const fill = isHit ? colors.noteHitFill : isMiss ? colors.noteMissFill : colors.noteFill;
    const stroke = isHit ? colors.noteHitBorder : isMiss ? colors.noteMissBorder : colors.noteBorder;

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = isHit || isMiss ? 2 : 1;
    const r = 5;
    roundRect(ctx, x0, top, noteW, height, r);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = colors.label;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n.fret), x0 + noteW / 2, top + height / 2);
  }

  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
