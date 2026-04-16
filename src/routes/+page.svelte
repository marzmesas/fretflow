<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import type { AppInfo } from "$lib/ipc";
  import { EVENT_AUDIO_LEVEL } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  let appInfo = $state<AppInfo | null>(null);
  let loadError = $state<string | null>(null);
  let audioLevel = $state(0);
  let demoRunning = $state(false);
  let unlistenLevel: UnlistenFn | null = null;

  onMount(async () => {
    if (!isTauri()) {
      loadError =
        "Run with `npm run tauri dev` for Rust IPC, device list, and the demo meter.";
      return;
    }
    try {
      appInfo = await invoke<AppInfo>("get_app_info");
    } catch (e) {
      loadError = String(e);
    }
    unlistenLevel = await listen<number>(EVENT_AUDIO_LEVEL, (ev) => {
      audioLevel = Math.min(1, Math.max(0, ev.payload));
    });
  });

  onDestroy(() => {
    unlistenLevel?.();
    if (isTauri()) {
      invoke("stop_mock_audio_meter").catch(() => {});
      invoke("stop_input_monitor").catch(() => {});
    }
  });

  async function startDemo() {
    if (!isTauri()) return;
    await invoke("start_mock_audio_meter");
    demoRunning = true;
  }

  async function stopDemo() {
    if (!isTauri()) return;
    await invoke("stop_mock_audio_meter");
    demoRunning = false;
    audioLevel = 0;
  }
</script>

<h1 style="margin: 0 0 0.35rem; font-size: 1.65rem; letter-spacing: -0.03em">
  Play-along practice
</h1>
<p class="muted" style="margin: 0 0 1.25rem">
  Learn songs with scrolling tab, timing feedback, mic and MIDI input.
</p>

{#if loadError}
  <div class="panel">
    <h2>Desktop shell</h2>
    <p>{loadError}</p>
  </div>
{:else if appInfo}
  <div class="panel">
    <h2>About</h2>
    <p style="color: var(--ff-text)">
      <strong>{appInfo.displayName}</strong>
      <span class="muted"> — v{appInfo.version}</span>
    </p>
    <p class="muted" style="margin-bottom: 0">
      Signed installers and in-app updates will show here once release builds are wired up.
    </p>
  </div>

  <div class="panel">
    <h2>IPC demo</h2>
    <p>
      Event <code style="color: var(--ff-accent)">{EVENT_AUDIO_LEVEL}</code> — sine demo here; use
      <strong>Settings → Start monitoring</strong> for real mic level (cpal).
    </p>
    <div class="row">
      <button type="button" class="btn btn-primary" onclick={startDemo} disabled={demoRunning}>
        Start demo meter
      </button>
      <button type="button" class="btn" onclick={stopDemo} disabled={!demoRunning}>
        Stop
      </button>
    </div>
    <div class="meter" aria-label="Mock input level">
      <div class="meter-fill" style="width: {audioLevel * 100}%"></div>
    </div>
  </div>
{/if}
