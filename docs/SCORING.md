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

### Tap calibration (rough)

Settings → Latency → **Start tap test**: eight metronome beeps; tap **Space** on each. The suggested value is the **median** of (tap time − beep time). It is a **heuristic** for exploring offset, not a calibrated impulse / round-trip measurement. **Set offset to suggested** replaces the numeric field and saves preferences.

## Backing drone (Practice)

Optional **Backing drone** is a very quiet low-E sine while **playback is running** — a stand-in until real backing tracks. **Mute backing** silences it without turning the feature off. Preferences persist in the same JSON as other audio settings. The drone does **not** affect scoring.

## MIDI

- Standard tuning at **concert pitch**; chart `stringIndex` + `fret` → expected MIDI note (`src/lib/chart/guitar.ts`).
- Requires **Settings → MIDI → Start listening** and the **desktop** app. Voice messages are delivered as **`input:event`** with `source: "midi"` (`docs/IPC.md`).
- **`pitch_bend`** events are forwarded for diagnostics but **do not** affect hit/miss scoring (only `note_on` with velocity greater than zero does).

## Metronome (Practice)

- Optional **Metronome** checkbox in Practice: **Web Audio** quarter-note clicks aligned to **chart time** (same seconds as the highway), using the chart **BPM**.
- **Playback speed** is respected: chart time advances faster or slower, so click spacing matches what you see.
- **Latency offset** does **not** affect the metronome (only scoring). **Loop A–B** resets beat sync at the wrap.

## Mic rhythm (beta)

- Uses **`audio:level`** peaks (input monitor must be running in Settings).
- **No pitch detection** — only **timing**: registers a hit for the chart note whose start is closest inside the window.
- Poor with **chords** or overlapping notes; best on sparse lines.
- Mutually exclusive in Practice with **Mic pitch (beta)**.

## Mic pitch (beta)

- Rust **YIN** on the live monitor buffer; **onset** from a short-term level rise, then `input:event` with `source: "mic"`, `kind: "note_on"`, mapped **pitch → MIDI note** (same chart matching as MIDI).
- Enable **Mic pitch (beta)** in Practice; keep **Start monitoring** on in Settings. Tuning and noise sensitivity are heuristic (cooldown, clarity threshold).

## Session summary

When a chart **finishes** (no loop, reached end), the app stores **hits, misses, accuracy %, max combo** in `localStorage` under `fretflow.lastSession.v1` and shows it under **Last session**.

## Chart format

See `docs/CHART_SCHEMA.md` for note data.
