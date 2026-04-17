<script lang="ts">
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { AppInfo } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  let appInfo = $state<AppInfo | null>(null);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    if (!isTauri()) {
      loadError =
        "Run with `npm run tauri dev` for the full desktop experience.";
      return;
    }
    try {
      appInfo = await invoke<AppInfo>("get_app_info");
    } catch (e) {
      loadError = String(e);
    }
  });
</script>

<div class="home">
  <div class="home-hero">
    <h1 class="home-title">Fretflow</h1>
    <p class="home-subtitle">
      Play-along practice with scrolling tab, real-time scoring, and mic or MIDI input.
    </p>
    <div class="home-actions">
      <a href="/library" class="btn btn-primary btn-lg">Browse Library</a>
      <a href="/practice" class="btn btn-lg">Open Practice</a>
    </div>
  </div>

  {#if loadError}
    <div class="panel">
      <p class="muted">{loadError}</p>
    </div>
  {/if}

  <div class="home-cards">
    <div class="panel home-card">
      <h2>Get started</h2>
      <ol class="home-steps">
        <li>Pick a chart from the <a href="/library">Library</a> or import your own MIDI / JSON file</li>
        <li>Connect your guitar via <strong>MIDI</strong> or use the built-in <strong>mic</strong> (configure in <a href="/settings">Settings</a>)</li>
        <li>Hit <strong>Play</strong> and follow the scrolling highway — aim for <strong>Perfect</strong> timing</li>
      </ol>
    </div>

    <div class="panel home-card">
      <h2>Features</h2>
      <ul class="home-features">
        <li>14 bundled exercises from beginner to advanced</li>
        <li>Import your own MIDI or chart JSON files</li>
        <li>MIDI scoring with latency calibration</li>
        <li>Mic pitch detection (YIN) with adaptive onset</li>
        <li>Practice and Performance timing modes</li>
        <li>Loop A–B, metronome, speed control</li>
        <li>Session history with accuracy tracking</li>
      </ul>
    </div>
  </div>

  {#if appInfo}
    <p class="home-version muted">
      {appInfo.displayName} v{appInfo.version}
    </p>
  {/if}
</div>

<style>
  .home {
    max-width: 44rem;
  }
  .home-hero {
    margin-bottom: 1.5rem;
  }
  .home-title {
    margin: 0 0 0.35rem;
    font-size: 2rem;
    letter-spacing: -0.03em;
    font-weight: 800;
  }
  .home-subtitle {
    margin: 0 0 1.25rem;
    font-size: 1.05rem;
    color: var(--ff-muted);
    line-height: 1.5;
  }
  .home-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }
  .btn-lg {
    padding: 0.6rem 1.3rem;
    font-size: 0.95rem;
  }
  .home-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .home-card h2 {
    margin: 0 0 0.6rem;
  }
  .home-steps {
    margin: 0;
    padding-left: 1.3rem;
    font-size: 0.92rem;
    color: var(--ff-text);
    line-height: 1.65;
  }
  .home-features {
    margin: 0;
    padding-left: 1.3rem;
    font-size: 0.88rem;
    color: var(--ff-muted);
    line-height: 1.65;
  }
  .home-version {
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }
</style>
