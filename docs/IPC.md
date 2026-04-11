# Fretflow IPC conventions

Rust and TypeScript use the same **event names** and **command** strings. When you add one side, update the other and this doc.

## Commands (`invoke`)

Use **snake_case** Rust symbols; Tauri exposes them with the same names to the frontend. From JavaScript, object fields for arguments typically use **camelCase** (e.g. `deviceId` → `device_id`).

| Command | Payload | Returns | Notes |
|--------|---------|---------|--------|
| `get_app_info` | — | `{ name, version, displayName }` | Crate + product label |
| `get_input_connection_status` | — | `{ inputMonitorActive, midiListenActive }` | Shell indicator; reflects cpal monitor + MIDI listener threads |
| `start_mock_audio_meter` | — | `()` | Sine demo; emits `audio:level` ~20/s; stops live monitor first |
| `stop_mock_audio_meter` | — | `()` | Stops demo thread |
| `list_audio_input_devices` | — | `{ id, label }[]` | cpal enumeration (`id` is `0`, `1`, …) |
| `get_default_audio_input_device` | — | `{ id, label } \| null` | `id` is `"default"` when present |
| `get_audio_preferences` | — | prefs object (see below) | JSON file under app config dir |
| `set_audio_preferences` | `{ prefs }` | `()` | Same shape as `get_audio_preferences` |

**`AudioPreferences`:** `preferredInputDeviceId`, `preferredInputDeviceLabel?` (cpal device name for hotplug remapping), `latencyOffsetMs`, `preferredMidiInputPortId`, `preferredMidiInputPortName?` (MIDI port name for remapping when opaque ids change), `backingDroneEnabled?`, `backingDroneMuted?` (Practice reference drone), `inputStreamSampleRateHz?` (`null` = device default), `inputStreamBufferFrames?` (`null` = cpal default buffer). Label/name fields omit or `null` when unset; older prefs files deserialize with missing keys.
| `get_input_device_stream_info` | `{ deviceId?: string \| null }` | `{ defaultSampleRate, defaultChannels, sampleFormat, supportedSampleRates, bufferFramesMin, bufferFramesMax }` | Subset of standard rates + buffer hints for the selected or default input device |
| `start_input_monitor` | `{ deviceId?: string \| null }` | `()` | Live mic level → `audio:level` ~30/s; pluck/onset + YIN pitch → `input:event` `source: "mic"`; `null` = OS default; uses prefs stream fields; stops mock first |
| `stop_input_monitor` | — | `()` | Stops cpal stream thread |
| `list_midi_input_ports` | — | `{ id, name }[]` | `id` is an opaque backend identifier (persist, don’t parse) |
| `start_midi_input_listen` | `{ portId }` | `()` | Opens selected MIDI input; voice messages → `input:event` (see below) |
| `stop_midi_input_listen` | — | `()` | Closes the active MIDI input connection |
| `get_session` | — | `AppSession` | Local stub: reads `session.json` in app config dir |
| `dev_sign_in` | `{ payload: { displayName?: string \| null } }` | `AppSession` | Writes dev session + placeholder entitlements (`local:*`) |
| `sign_out` | — | `AppSession` | Removes `session.json` |
| `get_subscription_state` | — | `SubscriptionState` | Reads `subscription_cache.json`; uses last successful sync + grace rules |
| `sync_subscription_now` | — | `SubscriptionState` | `GET {apiBaseUrl}/api/v1/subscription` (blocking HTTP); updates cache |
| `set_subscription_api_base` | `{ payload: { url: string } }` | `SubscriptionState` | Persists API base in cache (must be `http://` or `https://`) |

**`AppSession`:** `schemaVersion`, `signedIn`, `authKind` (`"dev"` when signed in, else `null`), `displayName`, `signedInAtUnixMs`, `entitlements` (string array — stub until backend).

**`SubscriptionState`:** `schemaVersion`, `apiBaseUrl`, `graceDays`, `subscriptionStatus`, `tier`, `validUntilUnixMs`, `lastSyncOkUnixMs`, `lastSyncError`, `lastSyncSucceeded`, `offlineGraceActive`, `entitled`. Offline grace applies when the last sync attempt failed but a prior sync had `active`/`trialing` and `lastSyncOkUnixMs` is within `graceDays`.

Future (plan): exclusive mode, catalog fetch, real OAuth, Stripe-backed subscription rows, etc.

## Events (Rust → frontend)

Emit with `AppHandle::emit`. Listen with `@tauri-apps/api/event` `listen()`.

Throttle UI updates (e.g. **30–60 Hz**) for meters and playhead-style traffic.

| Event | Payload | Purpose |
|-------|---------|---------|
| `audio:level` | `number` (`0..1`) | Mock sine, **or** live input RMS/peak (monitoring) |
| `audio:input_error` | `string` | Live monitor setup failure or cpal stream error (throttled ~2/s) |
| `input:event` | `InputEvent` (see below) | Unified realtime playing input: **MIDI** (`source: "midi"`) and **mic** (`source: "mic"`, monitor running). |
| `practice:tick` | TBD | Phase 3+ scoring / playhead sync |

**`input:event` payload (`schemaVersion` 1):** `schemaVersion`, `source` (`"midi"` \| `"mic"`), `kind` (`note_on` \| `note_off`), `channel`, `note`, `velocity`, `timestampUs` (midir µs for MIDI; `0` for mic). **MIDI:** `pitchHz` / `confidence` omitted. **Mic:** `note_on` only today; includes `pitchHz` and `confidence` (YIN); emitted on level onset while the input monitor is active.

## Chart data (frontend)

Charts are JSON v1 (see `docs/CHART_SCHEMA.md`). Loaded in the Practice UI; no Tauri command required for Phase 3.

**Practice scoring:** With the monitor on, optional **mic rhythm (beta)** uses `audio:level`; **mic pitch (beta)** uses `input:event` `source: "mic"` (`docs/SCORING.md`).

## Source of truth

- Rust constants: `src-tauri/src/ipc.rs`
- TS constants: `src/lib/ipc.ts`
