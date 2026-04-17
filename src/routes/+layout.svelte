<script lang="ts">
  import "../app.css";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { AppSession, InputConnectionStatus } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  const nav = [
    { href: "/", label: "Home" },
    { href: "/library", label: "Library" },
    { href: "/practice", label: "Practice" },
    { href: "/settings", label: "Settings" },
  ];

  let connectionStatus = $state<InputConnectionStatus | null>(null);
  let session = $state<AppSession | null>(null);
  let pollId: ReturnType<typeof setInterval> | null = null;

  async function refreshShellState() {
    if (!isTauri()) {
      connectionStatus = null;
      session = null;
      return;
    }
    try {
      connectionStatus = await invoke<InputConnectionStatus>("get_input_connection_status");
    } catch {
      connectionStatus = null;
    }
    try {
      session = await invoke<AppSession>("get_session");
    } catch {
      session = null;
    }
  }

  onMount(() => {
    void refreshShellState();
    if (isTauri()) {
      pollId = setInterval(() => void refreshShellState(), 2000);
      window.addEventListener("focus", refreshShellState);
    }
  });

  onDestroy(() => {
    if (pollId != null) {
      clearInterval(pollId);
      pollId = null;
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("focus", refreshShellState);
    }
  });

  afterNavigate(() => {
    void refreshShellState();
  });
</script>

<div class="app-root">
  <header class="app-header">
    <a class="app-brand" href="/">Fretflow</a>
    <div class="app-header-right">
      {#if isTauri()}
        <a
          href="/account"
          class="connection-pill session-account-pill"
          class:connection-pill--on={session?.signedIn ?? false}
          aria-current={$page.url.pathname === "/account" ? "page" : undefined}
          title="Account"
        >
          {#if session?.signedIn}
            {session.displayName || "Dev"}
          {:else}
            Sign in
          {/if}
        </a>
      {/if}
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
