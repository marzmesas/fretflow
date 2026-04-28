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
| `get_input_device_stream_info` | `{ deviceId?: string \| null }` | `{ defaultSampleRate, defaultChannels, sampleFormat, supportedSampleRates, bufferFramesMin, bufferFramesMax }` | Subset of standard rates + buffer hints for the selected or default input device |
| `start_input_monitor` | `{ deviceId?: string \| null }` | `()` | Live mic level → `audio:level` ~30/s; pluck/onset + YIN pitch → `input:event` `source: "mic"`; `null` = OS default; uses prefs stream fields; stops mock first |
| `stop_input_monitor` | — | `()` | Stops cpal stream thread |
| `list_midi_input_ports` | — | `{ id, name }[]` | `id` is an opaque backend identifier (persist, don’t parse) |
| `start_midi_input_listen` | `{ portId }` | `()` | Opens selected MIDI input; voice messages → `input:event` (see below) |
| `stop_midi_input_listen` | — | `()` | Closes the active MIDI input connection |
| `get_session` | — | `AppSession` | Reads `session.json` in app config dir |
| `remote_sign_in` | `{ payload: { apiBaseUrl: string, email: string, displayName?: string \| null } }` | `AppSession` | Calls `POST {apiBaseUrl}/api/v1/auth/sign-in` and persists the returned non-dev session |
| `dev_sign_in` | `{ payload: { displayName?: string \| null } }` | `AppSession` | Preview-only local session stub for diagnostics / fallback |
| `sign_out` | — | `AppSession` | Removes `session.json` |

**`AudioPreferences`:** `preferredInputDeviceId`, `preferredInputDeviceLabel?` (cpal device name for hotplug remapping), `latencyOffsetMs`, `preferredMidiInputPortId`, `preferredMidiInputPortName?` (MIDI port name for remapping when opaque ids change), `backingDroneEnabled?`, `backingDroneMuted?` (Practice reference drone), `inputStreamSampleRateHz?` (`null` = device default), `inputStreamBufferFrames?` (`null` = cpal default buffer). Label/name fields omit or `null` when unset; older prefs files deserialize with missing keys.

**`AppSession`:** `schemaVersion`, `signedIn`, `authKind`, `accountId?`, `email?`, `displayName`, `signedInAtUnixMs`, `entitlements`.

### Subscription / billing (deferred — not in product UI)

These commands exist for future monetization work; the app does **not** surface checkout or plans at launch.

| Command | Payload | Returns | Notes |
|--------|---------|---------|--------|
| `get_subscription_state` | — | `SubscriptionState` | Reads `subscription_cache.json` |
| `sync_subscription_now` | — | `SubscriptionState` | `GET {apiBaseUrl}/api/v1/subscription` (blocking HTTP) |
| `set_subscription_api_base` | `{ payload: { url: string } }` | `SubscriptionState` | Persists API base (`http://` or `https://`) |

**`SubscriptionState`:** `schemaVersion`, `apiBaseUrl`, `graceDays`, `subscriptionStatus`, `tier`, `validUntilUnixMs`, `lastSyncOkUnixMs`, `lastSyncError`, `lastSyncSucceeded`, `offlineGraceActive`, `entitled`.

Future (plan): exclusive mode, catalog fetch, real OAuth; Stripe only when subscription model is intentional.

## Events (Rust → frontend)

Emit with `AppHandle::emit`. Listen with `@tauri-apps/api/event` `listen()`.

Throttle UI updates (e.g. **30–60 Hz**) for meters and playhead-style traffic.

| Event | Payload | Purpose |
|-------|---------|---------|
| `audio:level` | `number` (`0..1`) | Mock sine, **or** live input RMS/peak (monitoring) |
| `audio:input_error` | `string` | Live monitor setup failure or cpal stream error (throttled ~2/s) |
| `input:event` | `InputEvent` (see below) | Unified realtime playing input: **MIDI** (`source: "midi"`) and **mic** (`source: "mic"`, monitor running). |
| `practice:tick` | TBD | Phase 3+ scoring / playhead sync |

**`input:event` payload (`schemaVersion` 1):** `schemaVersion`, `source` (`"midi"` \| `"mic"`), `kind`, `channel`, `note`, `velocity`, `timestampUs` (midir µs for MIDI; `0` for mic). **MIDI voice:** `kind` is `note_on`, `note_off`, or `pitch_bend`. For **`pitch_bend`**, `note` is the 7-bit LSB and `velocity` the 7-bit MSB of the 14-bit value (`raw14 = note \| (velocity << 7)`, center `8192`). Practice scoring listens to **`note_on`** only; pitch bend is for diagnostics / future pitch-aware scoring. **MIDI:** `pitchHz` / `confidence` omitted. **Mic:** `note_on` includes `pitchHz` and `confidence` (YIN, onset). **`note_off`** is emitted when the detected pitch **changes** to another MIDI note (pairs the previous `note_on`) and when the **input monitor thread stops** (so the last sounded note is released). Mic `note_off` omits `pitchHz` / `confidence`.

## Chart data (frontend)

Charts are JSON v1 (see `docs/CHART_SCHEMA.md`). Loaded in the Practice UI; no Tauri command required for Phase 3.

**Practice scoring:** With the monitor on, optional **mic rhythm (beta)** uses `audio:level`; **mic pitch (beta)** uses `input:event` `source: "mic"` (`docs/SCORING.md`).

## Source of truth

- Rust constants: `src-tauri/src/ipc.rs`
- TS constants: `src/lib/ipc.ts`
