# Fretflow backlog (from implementation plan)

Source: internal phased plan. This file is the **committed** checklist; keep it in sync as work ships.

## Order of execution (dependencies first)

1. ~~**Catalog → Practice chart**~~ — Done: `?track=` from Library → `resolvePracticeChart` + `PracticePlayer` prop; invalid/locked id shows warning + demo chart.
2. ~~**Optional backing + mute**~~ — Done: low-E sine **Backing drone** + **Mute backing** in Practice; `backingDroneEnabled` / `backingDroneMuted` in prefs.
3. ~~**Chart validator in CI**~~ — Done: `npm run validate-charts` (`tsx scripts/validate-charts.ts`) in CI on `static/charts/*.json`.
4. ~~**Impulse / tap latency calibration**~~ — Done (v1): Settings **Tap calibration** eight-beat Space test → median ms hint → **Set offset to suggested** (heuristic; not lab impulse).
5. ~~**cpal buffer / sample rate**~~ — Done: prefs `inputStreamSampleRateHz` / `inputStreamBufferFrames`; Settings **Advanced (cpal stream)** + `get_input_device_stream_info`; input monitor resolves stream via `stream_config`.
6. **Mic pitch + onset path** — Rust analysis → `input:event` `source: "mic"`; share scoring with MIDI. *(Phase 4 — large.)*
7. **Auth + entitlements stub** — Local “dev login” or OAuth placeholder before real backend. *(Phase 5.)*
8. **Backend + Stripe + offline grace** — Full Phase 5 exit.
9. **Content pipeline** — Importers, dev QA tool. *(Phase 6.)*
10. **Release hardening** — Second OS, signing, updater, a11y, profiling. *(Phase 7.)*
11. **Differentiation tracks** — Pedagogy / social / pro audio. *(Phase 8.)*

## Still open by phase (reference)

| Phase | Open items |
|-------|------------|
| 1 | — |
| 4 | Mic pitch; full mic+MIDI engine parity |
| 5 | Auth, backend, Stripe, login/offline grace |
| 6 | Importers, preview tool |
| 7 | Win/Linux, signing, updater, crashes, a11y, profiling |
| 8 | Choose pedagogy / social / pro-audio tracks |

## Done recently (context)

- Unified `input:event`, shell Mic/MIDI status, persistent streams, metronome, hotplug prefs, Library mock catalog + `?track=` → Practice, chart JSON CI validation, Practice latency scoring.
- Backing drone + mute (Practice + prefs), Settings tap-to-beat latency hint, `chart-backing-drone` / `latency-tap-calibration` helpers.
- Input monitor: persisted sample rate + buffer frames, `stream_config` + `get_input_device_stream_info`, Settings Advanced section.
