<script lang="ts">
  import "../app.css";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { InputConnectionStatus } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  const nav = [
    { href: "/", label: "Home" },
    { href: "/library", label: "Library" },
    { href: "/practice", label: "Practice" },
    { href: "/settings", label: "Settings" },
  ];

  let connectionStatus = $state<InputConnectionStatus | null>(null);
  let pollId: ReturnType<typeof setInterval> | null = null;

  async function refreshConnectionStatus() {
    if (!isTauri()) {
      connectionStatus = null;
      return;
    }
    try {
      connectionStatus = await invoke<InputConnectionStatus>("get_input_connection_status");
    } catch {
      connectionStatus = null;
    }
  }

  onMount(() => {
    void refreshConnectionStatus();
    if (isTauri()) {
      pollId = setInterval(() => void refreshConnectionStatus(), 2000);
      window.addEventListener("focus", refreshConnectionStatus);
    }
  });

  onDestroy(() => {
    if (pollId != null) {
      clearInterval(pollId);
      pollId = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", refreshConnectionStatus);
    }
  });

  afterNavigate(() => {
    void refreshConnectionStatus();
  });
</script>

<div class="app-root">
  <header class="app-header">
    <a class="app-brand" href="/">Fretflow</a>
    <div class="app-header-right">
      {#if isTauri() && connectionStatus}
        <div class="connection-status" role="status" aria-label="Input connections">
          <span
            class="connection-pill"
            class:connection-pill--on={connectionStatus.inputMonitorActive}
            title="Input monitor (Settings → Start monitoring)"
          >
            <span class="connection-dot" aria-hidden="true"></span>
            Mic
          </span>
          <span
            class="connection-pill"
            class:connection-pill--on={connectionStatus.midiListenActive}
            title="MIDI listener (Settings → Start listening)"
          >
            <span class="connection-dot" aria-hidden="true"></span>
            MIDI
          </span>
        </div>
      {/if}
      <nav class="app-nav" aria-label="Main">
        {#each nav as item}
          <a
            href={item.href}
            aria-current={$page.url.pathname === item.href ? "page" : undefined}
          >
            {item.label}
          </a>
        {/each}
      </nav>
    </div>
  </header>
  <main class="app-main" class:app-main--wide={$page.url.pathname.startsWith("/practice")}>
    <slot />
  </main>
</div>
