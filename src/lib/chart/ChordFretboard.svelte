<script lang="ts">
  import type { ChartNoteV1 } from "./types";

  type Props = {
    notes: ChartNoteV1[];
  };
  let { notes }: Props = $props();

  const maxFret = $derived.by(() => {
    if (notes.length === 0) return 5;
    const mx = Math.max(...notes.map((n) => n.fret));
    return Math.min(15, Math.max(5, mx + 1));
  });

  /** Unique string+fret for drawing. */
  const dots = $derived.by(() => {
    const m = new Map<string, ChartNoteV1>();
    for (const n of notes) {
      m.set(`${n.stringIndex}-${n.fret}`, n);
    }
    return [...m.values()];
  });

  const viewW = 260;
  const viewH = 168;
  const padL = 28;
  const padR = 10;
  const padT = 14;
  const padB = 22;
  const fretW = $derived((viewW - padL - padR) / (maxFret + 0.35));
  const stringGap = $derived((viewH - padT - padB) / 5);
</script>

{#if notes.length > 0}
  <div class="chord-fretboard" aria-label="Upcoming chord on fretboard">
    <p class="chord-fretboard__title">Next on fretboard</p>
    <svg
      class="chord-fretboard__svg"
      viewBox="0 0 {viewW} {viewH}"
      width="260"
      height="168"
      role="img"
    >
      <!-- Nut -->
      <rect x={padL - 4} y={padT} width="5" height={viewH - padT - padB} fill="var(--ff-text)" rx="1" />

      {#each Array.from({ length: maxFret + 1 }, (_, f) => f) as f (f)}
        <line
          x1={padL + f * fretW}
          y1={padT}
          x2={padL + f * fretW}
          y2={viewH - padB}
          stroke={f === 0 ? "transparent" : "var(--ff-border)"}
          stroke-width="1"
        />
      {/each}

      {#each [0, 1, 2, 3, 4, 5] as s (s)}
        <line
          x1={padL}
          y1={padT + s * stringGap}
          x2={viewW - padR}
          y2={padT + s * stringGap}
          stroke="color-mix(in srgb, var(--ff-muted) 55%, var(--ff-border))"
          stroke-width="1.2"
        />
      {/each}

      {#each dots as n (n.stringIndex + "-" + n.fret)}
        {@const cx = n.fret === 0 ? padL + 2 : padL + (n.fret - 0.5) * fretW}
        {@const cy = padT + n.stringIndex * stringGap}
        <circle
          cx={cx}
          cy={cy}
          r={n.fret === 0 ? 5 : 7}
          fill="color-mix(in srgb, var(--ff-accent) 35%, var(--ff-surface))"
          stroke="var(--ff-accent)"
          stroke-width="2"
        />
        <text
          x={cx}
          y={cy}
          text-anchor="middle"
          dominant-baseline="middle"
          fill="var(--ff-text)"
          font-size="10"
          font-weight="700">{n.fret}</text>
      {/each}

      <text x={padL + maxFret * fretW * 0.5} y={viewH - 6} text-anchor="middle" class="chord-fretboard__fret-nums" font-size="9" fill="var(--ff-muted)">
        frets 0–{maxFret}
      </text>
    </svg>
  </div>
{/if}

<style>
  .chord-fretboard {
    margin: 0.75rem 0 0;
    padding: 0.65rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--ff-border);
    background: color-mix(in srgb, var(--ff-surface) 92%, var(--ff-bg));
  }
  .chord-fretboard__title {
    margin: 0 0 0.4rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ff-text);
  }
  .chord-fretboard__svg {
    display: block;
    max-width: 100%;
    height: auto;
  }
</style>
