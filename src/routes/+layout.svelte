<script lang="ts">
  import "../app.css";
  import { afterNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import { onDestroy, onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    loadLocalFrontendUserProfile,
    type FrontendUserProfile,
  } from "$lib/account/profile";
  import { loadRemoteUserProfile, type RemoteUserProfileV1 } from "$lib/account/remote-profile";
  import { getRemoteProfileRole } from "$lib/account/remote-profile-gate";
  import { getRemoteProfileSurfaceRollout } from "$lib/account/remote-profile-surface-rollout";
  import { getShellIdentityRollout } from "$lib/account/shell-identity";
  import type { AppSession, InputConnectionStatus, SubscriptionState } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  let { children } = $props();

  const nav = [
    { href: "/", label: "Home", hint: "Launch pad" },
    { href: "/library", label: "Library", hint: "Charts & sets" },
    { href: "/practice", label: "Practice", hint: "Play view" },
    { href: "/settings", label: "Settings", hint: "Inputs & tuning" },
    { href: "/account", label: "Account", hint: "Plan & sync" },
  ];

  type ShellMeta = {
    title: string;
    modeLabel: string;
    wide: boolean;
  };

  let connectionStatus = $state<InputConnectionStatus | null>(null);
  let session = $state<AppSession | null>(null);
  let subscription = $state<SubscriptionState | null>(null);
  let profile = $state<FrontendUserProfile | null>(null);
  let remoteProfile = $state<RemoteUserProfileV1 | null>(null);
  let pollId: ReturnType<typeof setInterval> | null = null;
  let pathname = $derived($page.url.pathname);
  let shell = $derived(getShellMeta(pathname));

  function isActivePath(pathname: string, href: string): boolean {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  function getShellMeta(pathname: string): ShellMeta {
    if (pathname.startsWith("/library")) {
      return {
        title: "Library",
        modeLabel: "Browse workbench",
        wide: true,
      };
    }
    if (pathname.startsWith("/practice")) {
      return {
        title: "Practice",
        modeLabel: "Stage view",
        wide: true,
      };
    }
    if (pathname.startsWith("/settings")) {
      return {
        title: "Settings",
        modeLabel: "Setup utility",
        wide: true,
      };
    }
    if (pathname.startsWith("/account")) {
      return {
        title: "Account",
        modeLabel: "Plan & sync",
        wide: true,
      };
    }
    return {
      title: "Home",
      modeLabel: "Launch pad",
      wide: false,
    };
  }

  function refreshProfile(nextSession: AppSession | null): void {
    if (!isTauri()) {
      profile = null;
      return;
    }
    profile = loadLocalFrontendUserProfile(nextSession, subscription);
  }

  function shellAccountLabel(): string {
    if (remoteProfile?.fields.displayName?.trim()) {
      return remoteProfile.fields.displayName;
    }
    return profile?.auth.accountLabel ?? "Guest";
  }

  async function refreshShellState() {
    if (!isTauri()) {
      connectionStatus = null;
      session = null;
      profile = null;
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
    try {
      subscription = await invoke<SubscriptionState>("get_subscription_state");
    } catch {
      subscription = null;
    }
    refreshProfile(session);
    const remoteProfileRollout = getRemoteProfileSurfaceRollout({
      apiBaseUrl: subscription?.apiBaseUrl ?? "",
      remoteProfileRole: getRemoteProfileRole(session),
    });
    if (remoteProfileRollout.ready) {
      try {
        remoteProfile = await loadRemoteUserProfile({
          apiBaseUrl: subscription?.apiBaseUrl ?? "",
          accountId: session?.accountId ?? "",
          email: session?.email ?? "",
        });
      } catch {
        remoteProfile = null;
      }
    } else {
      remoteProfile = null;
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

<div class="app-shell">
  <aside class="app-sidebar">
    <div class="app-sidebar__inner">
      <a class="app-brand" href="/">
        <span class="app-brand__mark" aria-hidden="true">FF</span>
        <span>
          <span class="app-brand__eyebrow">Desktop Practice</span>
          <span class="app-brand__name">Fretflow</span>
        </span>
      </a>

      <div class="app-sidebar__section-label">Workspace</div>
      <nav class="app-nav" aria-label="Main">
        {#each nav as item}
          <a
            class="app-nav__link"
            href={item.href}
            aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
          >
            <span class="app-nav__label">{item.label}</span>
            <span class="app-nav__hint">{item.hint}</span>
          </a>
        {/each}
      </nav>
      <div class="app-sidebar__footer">
        <a href="/account" class="btn app-sidebar__footer-action">Account &amp; billing</a>
        <p class="app-sidebar__footer-copy">Sign-in, plans, and recovery.</p>
      </div>
    </div>
  </aside>

  <div class="app-frame">
    <header class="app-toolbar">
      <div class="app-toolbar__route">
        <span class="app-toolbar__mode">{shell.modeLabel}</span>
        <h1>{shell.title}</h1>
      </div>

      <div class="app-toolbar__utilities">
        {#if isTauri()}
          {@const shellIdentity = getShellIdentityRollout(session)}
          <div class="app-toolbar-chip-group">
            <span class="app-toolbar-chip-label">Account</span>
            <a
              href="/account"
              class="app-toolbar-chip session-account-pill"
              class:connection-pill--on={profile?.auth.signedIn ?? false}
              aria-current={pathname === "/account" ? "page" : undefined}
              title={shellIdentity.detail}
            >
              {#if profile?.auth.signedIn}
                {shellAccountLabel()}
              {:else}
                Sign in
              {/if}
            </a>
            <span class="app-toolbar-chip-hint">
              {remoteProfile != null ? "Synced profile active" : shellIdentity.summary}
            </span>
          </div>
        {/if}

        {#if isTauri() && connectionStatus}
          <div class="app-toolbar-chip-group" role="status" aria-label="Input connections">
            <span class="app-toolbar-chip-label">Inputs</span>
            <div class="app-connection-status">
              <span
                class="app-toolbar-chip connection-pill"
                class:connection-pill--on={connectionStatus.inputMonitorActive}
                title="Input monitor (Settings → Start monitoring)"
              >
                <span class="connection-dot" aria-hidden="true"></span>
                Mic
              </span>
              <span
                class="app-toolbar-chip connection-pill"
                class:connection-pill--on={connectionStatus.midiListenActive}
                title="MIDI listener (Settings → Start listening)"
              >
                <span class="connection-dot" aria-hidden="true"></span>
                MIDI
              </span>
            </div>
            <span class="app-toolbar-chip-hint">Check levels and calibration in Settings.</span>
          </div>
        {/if}
      </div>
    </header>

    <main class="app-main" class:app-main--wide={shell.wide}>
      {@render children?.()}
    </main>
  </div>
</div>
