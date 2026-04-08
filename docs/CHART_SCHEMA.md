# Fretflow chart schema (v1)

JSON charts describe **when** and **where** notes appear for the scrolling highway (Practice). Timing is in **quarter-note beats** at the chart’s **BPM**.

## Top-level object

| Field | Type | Required | Notes |
|--------|------|----------|--------|
| `schemaVersion` | `1` | yes | Bump for breaking changes |
| `title` | string | yes | Shown in the player |
| `bpm` | number | yes | Beats per minute, &gt; 0 |
| `timeSignature` | `[number, number]` | yes | e.g. `[4, 4]` — informational for now |
| `lengthBeats` | number | no | Chart end; if omitted, derived from the last note |
| `notes` | array | yes | See below |

## Note object

| Field | Type | Notes |
|--------|------|--------|
| `startBeat` | number | ≥ 0; can be fractional (e.g. `0.5`) |
| `durationBeats` | number | &gt; 0 |
| `stringIndex` | integer 0–5 | `0` = high **e**, `5` = low **E** |
| `fret` | integer 0–24 | `0` = open string |

## Time conversion

- Seconds from start: `beat * 60 / bpm`
- The renderer scrolls so the **hit line** is “now” in that timeline.

## Validation

The app uses `validateChart()` in `src/lib/chart/validate.ts` before accepting a loaded file.

## Example

- Embedded: `src/lib/chart/demo-chart.ts`
- Static file (same content): `static/charts/demo-chart.json` — use **Load chart JSON** on Practice to test.
