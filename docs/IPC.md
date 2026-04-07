# Fretflow IPC conventions

Rust and TypeScript use the same **event names** and **command** strings. When you add one side, update the other and this doc.

## Commands (`invoke`)

Use **snake_case** Rust symbols; Tauri exposes them with the same names to the frontend.

| Command | Payload | Returns | Notes |
|--------|---------|---------|--------|
| `get_app_info` | — | `{ name, version, displayName }` | Crate + product label |
| `start_mock_audio_meter` | — | `()` | Phase 0 demo; emits `audio:level` |
| `stop_mock_audio_meter` | — | `()` | Stops demo thread |
| `list_audio_input_devices` | — | `{ id, label }[]` | cpal enumeration |
| `get_default_audio_input_device` | — | `{ id, label } \| null` | OS default input |

Future (plan): `start_audio_capture`, `set_input_device`, MIDI listing, catalog fetch, etc.

## Events (Rust → frontend)

Emit with `AppHandle::emit`. Listen with `@tauri-apps/api/event` `listen()`.

Throttle UI updates (e.g. **30–60 Hz**) for meters and playhead-style traffic.

| Event | Payload | Purpose |
|-------|---------|---------|
| `audio:level` | `number` (`0..1`) | Input / demo level meter |
| `input:midi_note` | TBD | Phase 2 MIDI |
| `practice:tick` | TBD | Phase 3+ scoring / playhead sync |

## Source of truth

- Rust constants: `src-tauri/src/ipc.rs`
- TS constants: `src/lib/ipc.ts`
