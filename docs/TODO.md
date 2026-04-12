# Fretflow backlog (from implementation plan)

Source: internal phased plan. This file is the **committed** checklist; keep it in sync as work ships.

## Order of execution (dependencies first)

1. ~~**Catalog → Practice chart**~~ — Done: `?track=` from Library → `resolvePracticeChart` + `PracticePlayer` prop; invalid/locked id shows warning + demo chart.
2. ~~**Optional backing + mute**~~ — Done: low-E sine **Backing drone** + **Mute backing** in Practice; `backingDroneEnabled` / `backingDroneMuted` in prefs.
3. ~~**Chart validator in CI**~~ — Done: `npm run validate-charts` (`tsx scripts/validate-charts.ts`) in CI on `static/charts/*.json`.
4. ~~**Impulse / tap latency calibration**~~ — Done (v1): Settings **Tap calibration** eight-beat Space test → median ms hint → **Set offset to suggested** (heuristic; not lab impulse).
5. ~~**cpal buffer / sample rate**~~ — Done: prefs `inputStreamSampleRateHz` / `inputStreamBufferFrames`; Settings **Advanced (cpal stream)** + `get_input_device_stream_info`; input monitor resolves stream via `stream_config`.
6. ~~**Mic pitch + onset path**~~ — Done (v1): monitor thread YIN + onset → `input:event` `source: "mic"`; Practice **Mic pitch (beta)** shares `findHitNoteIndex` with MIDI. Rhythm vs pitch betas are mutually exclusive.
7. ~~**Auth + entitlements stub**~~ — Done (v1): `get_session` / `dev_sign_in` / `sign_out`, `session.json`, **Account** route + header link; placeholder `entitlements` for future gating. *(Real OAuth / backend: later Phase 5.)*
8. ~~**Backend + Stripe + offline grace**~~ — **Deferred (product):** not shipping a subscription or checkout model at launch; focus stays on practice, charts, and app quality. **Infra in repo (optional / dormant):** `server/` stub, `subscription.rs` + IPC — revisit only when monetization is planned.
9. **Content pipeline** — **In progress:** **Chart QA** (validate + A/B compare + canonical line diff + Practice); **`midi-to-chart`** + **`assert-midi-golden`** (`smoke`, `tempo-ramp`, `chord-smoke` fixtures). **Next:** importer v2 (pitch bend, position DP), deeper diff / golden coverage.
10. **Release hardening** — Second OS, signing, updater, a11y, profiling. *(Phase 7.)*
11. **Differentiation tracks** — Pedagogy / social / pro audio. *(Phase 8.)*

## Still open by phase (reference)

| Phase | Open items |
|-------|------------|
| 1 | — |
| 4 | Full mic+MIDI engine parity (polish, edge cases) |
| 5 | Real OAuth / production API when needed; Stripe deferred |
| 6 | `midi-to-chart`, chord fixture + golden asserts, Chart QA canonical diff; importers / preview |
| 7 | Win/Linux, signing, updater, crashes, a11y, profiling |
| 8 | Choose pedagogy / social / pro-audio tracks |

## Done recently (context)

- Unified `input:event`, shell Mic/MIDI status, persistent streams, metronome, hotplug prefs, Library mock catalog + `?track=` → Practice, chart JSON CI validation, Practice latency scoring.
- Backing drone + mute (Practice + prefs), Settings tap-to-beat latency hint, `chart-backing-drone` / `latency-tap-calibration` helpers.
- Input monitor: persisted sample rate + buffer frames, `stream_config` + `get_input_device_stream_info`, Settings Advanced section.
- Mic pitch (v1): `mic_pitch` + YIN in `monitor`, `InputEvent::from_mic_note_on`, Practice **Mic pitch (beta)** vs **Mic rhythm (beta)**.
- Session stub: `session.rs`, Account page, shell “Sign in” / dev label, `local:*` entitlements placeholder.
- Phase 5 infra (dormant): `server/` stub, `subscription.rs` + `subscription_cache.json` — no subscription UI; billing deferred.
