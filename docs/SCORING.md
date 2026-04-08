# Fretflow scoring (Phase 4)

## Modes

| Mode            | Early / late window | Use case        |
|-----------------|---------------------|-----------------|
| **Practice**    | 140 ms / 200 ms     | Learning        |
| **Performance** | 50 ms / 70 ms     | Stricter “Pro” timing |

Windows are measured from each **chart note start** (same timebase as the highway).

## Latency offset (Settings)

**`latencyOffsetMs`** (Settings → Latency) shifts the **judged** note start time for **scoring only**:

- **Positive** values move the expected hit **later** on the wall-clock chart timeline (if you tend to register **early** vs the visual, try a positive offset).
- The **scrolling highway** does not shift — only MIDI/mic hit and miss detection use the offset.
- Practice reloads this value on load and when the **window regains focus** (e.g. after changing Settings).

## MIDI

- Standard tuning at **concert pitch**; chart `stringIndex` + `fret` → expected MIDI note (`src/lib/chart/guitar.ts`).
- Requires **Settings → MIDI → Start listening** and the **desktop** app.

## Mic rhythm (beta)

- Uses **`audio:level`** peaks (input monitor must be running in Settings).
- **No pitch detection** — only **timing**: registers a hit for the chart note whose start is closest inside the window.
- Poor with **chords** or overlapping notes; best on sparse lines.

## Session summary

When a chart **finishes** (no loop, reached end), the app stores **hits, misses, accuracy %, max combo** in `localStorage` under `fretflow.lastSession.v1` and shows it under **Last session**.

## Chart format

See `docs/CHART_SCHEMA.md` for note data.
