# Fretflow IPC conventions

Rust and TypeScript use the same **event names** and **command** strings. When you add one side, update the other and this doc.

## Commands (`invoke`)

Use **snake_case** Rust symbols; Tauri exposes them with the same names to the frontend. From JavaScript, object fields for arguments typically use **camelCase** (e.g. `deviceId` → `device_id`).

| Command | Payload | Returns | Notes |
|--------|---------|---------|--------|
| `get_app_info` | — | `{ name, version, displayName }` | Crate + product label |
| `start_mock_audio_meter` | — | `()` | Sine demo; emits `audio:level` ~20/s; stops live monitor first |
| `stop_mock_audio_meter` | — | `()` | Stops demo thread |
| `list_audio_input_devices` | — | `{ id, label }[]` | cpal enumeration (`id` is `0`, `1`, …) |
| `get_default_audio_input_device` | — | `{ id, label } \| null` | `id` is `"default"` when present |
| `get_audio_preferences` | — | `{ preferredInputDeviceId, latencyOffsetMs, preferredMidiInputPortId? }` | JSON file under app config dir |
| `set_audio_preferences` | `{ prefs }` | `()` | Same shape as above (`preferredMidiInputPortId` optional / nullable) |
| `start_input_monitor` | `{ deviceId?: string \| null }` | `()` | Live mic level → `audio:level` ~30/s; `null` = OS default; stops mock first |
| `stop_input_monitor` | — | `()` | Stops cpal stream thread |
| `list_midi_input_ports` | — | `{ id, name }[]` | `id` is an opaque backend identifier (persist, don’t parse) |
| `start_midi_input_listen` | `{ portId }` | `()` | Opens selected MIDI input; note on/off → `input:midi_note` |
| `stop_midi_input_listen` | — | `()` | Closes the active MIDI input connection |

Future (plan): buffer size / exclusive mode, catalog fetch, etc.

## Events (Rust → frontend)

Emit with `AppHandle::emit`. Listen with `@tauri-apps/api/event` `listen()`.

Throttle UI updates (e.g. **30–60 Hz**) for meters and playhead-style traffic.

| Event | Payload | Purpose |
|-------|---------|---------|
| `audio:level` | `number` (`0..1`) | Mock sine, **or** live input RMS/peak (monitoring) |
| `audio:input_error` | `string` | Live monitor setup failure or cpal stream error (throttled ~2/s) |
| `input:midi_note` | `{ kind, channel, note, velocity, timestampUs }` | `kind`: `note_on` \| `note_off`; `timestampUs` from midir (µs, same origin for session) |
| `practice:tick` | TBD | Phase 3+ scoring / playhead sync |

## Source of truth

- Rust constants: `src-tauri/src/ipc.rs`
- TS constants: `src/lib/ipc.ts`
