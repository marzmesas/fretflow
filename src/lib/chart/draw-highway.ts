import type { FretflowChartV1 } from "./types";
import { beatToSeconds } from "./time";

export type HighwayColors = {
  bg: string;
  laneLineLight: string;
  laneLineDark: string;
  laneAltFill: string;
  hitZoneCenter: string;
  hitZoneGlow: string;
  playhead: string;
  beatLine: string;
  halfBeatLine: string;
  noteHitFill: string;
  noteHitBorder: string;
  noteHitGlow: string;
  noteMissFill: string;
  noteMissBorder: string;
  noteMissGlow: string;
  label: string;
  labelDim: string;
  fretText: string;
  fretTextShadow: string;
};

const STRING_COLORS = [
  { fill: "#c2185b", border: "#e91e63" }, // e (high) — rose
  { fill: "#7b1fa2", border: "#ab47bc" }, // B — purple
  { fill: "#1565c0", border: "#42a5f5" }, // G — blue
  { fill: "#00838f", border: "#26c6da" }, // D — teal
  { fill: "#2e7d32", border: "#66bb6a" }, // A — green
  { fill: "#e65100", border: "#ff9800" }, // E (low) — orange
];

export const HIGHWAY_THEME_DARK: HighwayColors = {
  bg: "#0d1017",
  laneLineLight: "#1e2433",
  laneLineDark: "#2a3140",
  laneAltFill: "#111521",
  hitZoneCenter: "#3d8bfd",
  hitZoneGlow: "rgba(61,139,253,0.18)",
  playhead: "#3dd68c",
  beatLine: "rgba(255,255,255,0.08)",
  halfBeatLine: "rgba(255,255,255,0.035)",
  noteHitFill: "#15543d",
  noteHitBorder: "#3dd68c",
  noteHitGlow: "rgba(61,214,140,0.45)",
  noteMissFill: "#4a1c20",
  noteMissBorder: "#f87171",
  noteMissGlow: "rgba(248,113,113,0.4)",
  label: "#c8cdd8",
  labelDim: "#5c6478",
  fretText: "#ffffff",
  fretTextShadow: "rgba(0,0,0,0.6)",
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
  const labelW = 32;
  const hitPad = 54;
  const hitY = logicalH - hitPad;
  const laneTop = 14;
  const laneBottom = hitY - 6;
  const laneH = (laneBottom - laneTop) / laneCount;
  const gridLeft = labelW + 6;
  const gridW = logicalW - gridLeft - 10;
  const colW = gridW / laneCount;

  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, logicalW, logicalH);

  // Lane background alternation
  for (let s = 0; s < laneCount; s++) {
    if (s % 2 === 1) {
      ctx.fillStyle = colors.laneAltFill;
      ctx.fillRect(gridLeft, laneTop + s * laneH, gridW, laneH);
    }
  }

  // Beat grid lines (horizontal, scrolling with time)
  const secPerBeat = 60 / chart.bpm;
  const leadSec = (logicalH - hitPad) / pixelsPerSecond + 1;
  const firstBeat = Math.max(0, Math.floor((timeSec - 0.5) / secPerBeat));
  const lastBeat = Math.ceil((timeSec + leadSec) / secPerBeat);
  for (let b = firstBeat; b <= lastBeat; b++) {
    const bSec = b * secPerBeat;
    const by = hitY - (bSec - timeSec) * pixelsPerSecond;
    if (by < laneTop - 2 || by > laneBottom + 2) continue;

    ctx.strokeStyle = colors.beatLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gridLeft, by);
    ctx.lineTo(gridLeft + gridW, by);
    ctx.stroke();

    // Half-beat
    const halfSec = bSec + secPerBeat / 2;
    const hy = hitY - (halfSec - timeSec) * pixelsPerSecond;
    if (hy >= laneTop && hy <= laneBottom) {
      ctx.strokeStyle = colors.halfBeatLine;
      ctx.beginPath();
      ctx.moveTo(gridLeft, hy);
      ctx.lineTo(gridLeft + gridW, hy);
      ctx.stroke();
    }
  }

  // Lane divider lines (horizontal)
  for (let s = 0; s <= laneCount; s++) {
    const y = laneTop + s * laneH;
    ctx.strokeStyle = colors.laneLineDark;
    ctx.lineWidth = s === 0 || s === laneCount ? 1.5 : 0.5;
    ctx.beginPath();
    ctx.moveTo(labelW, y);
    ctx.lineTo(logicalW, y);
    ctx.stroke();
  }

  // Column dividers (vertical)
  for (let s = 0; s <= laneCount; s++) {
    const x = gridLeft + s * colW;
    ctx.strokeStyle = colors.laneLineLight;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, laneTop);
    ctx.lineTo(x, laneBottom);
    ctx.stroke();
  }

  // String labels
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let s = 0; s < laneCount; s++) {
    const cy = laneTop + s * laneH + laneH / 2;
    ctx.fillStyle = STRING_COLORS[s]!.border;
    ctx.font = "700 13px system-ui, sans-serif";
    ctx.fillText(STRING_LABELS[s]!, labelW - 5, cy);
  }

  // Hit zone — gradient band
  const hitZoneH = 8;
  const hzGrad = ctx.createLinearGradient(0, hitY - hitZoneH, 0, hitY + hitZoneH);
  hzGrad.addColorStop(0, "transparent");
  hzGrad.addColorStop(0.35, colors.hitZoneGlow);
  hzGrad.addColorStop(0.5, colors.hitZoneGlow);
  hzGrad.addColorStop(0.65, colors.hitZoneGlow);
  hzGrad.addColorStop(1, "transparent");
  ctx.fillStyle = hzGrad;
  ctx.fillRect(gridLeft, hitY - hitZoneH, gridW, hitZoneH * 2);

  // Hit line (center of zone)
  ctx.strokeStyle = colors.hitZoneCenter;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(gridLeft, hitY);
  ctx.lineTo(gridLeft + gridW, hitY);
  ctx.stroke();

  // Playhead accent line
  ctx.strokeStyle = colors.playhead;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(gridLeft, hitY + 3);
  ctx.lineTo(gridLeft + gridW, hitY + 3);
  ctx.stroke();

  // "NOW" marker on the left
  ctx.fillStyle = colors.hitZoneCenter;
  ctx.font = "700 9px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("NOW", labelW - 3, hitY);

  // Notes
  const t0 = timeSec - 0.5;
  const t1 = timeSec + leadSec;

  for (let idx = 0; idx < chart.notes.length; idx++) {
    const n = chart.notes[idx]!;
    const startSec = beatToSeconds(n.startBeat, chart.bpm);
    const endSec = beatToSeconds(n.startBeat + n.durationBeats, chart.bpm);
    if (endSec < t0 || startSec > t1) continue;

    const yStart = hitY - (startSec - timeSec) * pixelsPerSecond;
    const yEnd = hitY - (endSec - timeSec) * pixelsPerSecond;
    const top = Math.min(yStart, yEnd);
    const height = Math.max(16, Math.abs(yEnd - yStart));

    const padX = 3;
    const x0 = gridLeft + n.stringIndex * colW + padX;
    const noteW = colW - padX * 2;

    const isHit = hitNoteIndices.has(idx);
    const isMiss = missNoteIndices.has(idx);
    const pastHitLine = yStart > hitY;
    const sc = STRING_COLORS[n.stringIndex]!;

    let fill: string;
    let stroke: string;
    let lw: number;

    if (isHit) {
      fill = colors.noteHitFill;
      stroke = colors.noteHitBorder;
      lw = 2.5;
      ctx.shadowColor = colors.noteHitGlow;
      ctx.shadowBlur = 10;
    } else if (isMiss) {
      fill = colors.noteMissFill;
      stroke = colors.noteMissBorder;
      lw = 2;
      ctx.shadowColor = colors.noteMissGlow;
      ctx.shadowBlur = 8;
    } else {
      fill = sc.fill;
      stroke = sc.border;
      lw = 1.5;
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    if (pastHitLine && !isHit && !isMiss) {
      ctx.globalAlpha = 0.3;
    }

    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    const r = 6;
    roundRect(ctx, x0, top, noteW, height, r);
    ctx.fill();
    ctx.stroke();

    // Reset shadow after note body
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;

    // Fret number with text shadow for contrast
    ctx.globalAlpha = 1;
    ctx.font = "700 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const tx = x0 + noteW / 2;
    const ty = top + height / 2;
    ctx.fillStyle = colors.fretTextShadow;
    ctx.fillText(String(n.fret), tx + 0.5, ty + 0.5);
    ctx.fillStyle = colors.fretText;
    ctx.fillText(String(n.fret), tx, ty);

    if (pastHitLine && !isHit && !isMiss) {
      ctx.globalAlpha = 1;
    }
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
