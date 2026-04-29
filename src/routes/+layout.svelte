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
    { href: "/", label: "Home", eyebrow: "Overview" },
    { href: "/library", label: "Library", eyebrow: "Browse" },
    { href: "/practice", label: "Practice", eyebrow: "Play" },
    { href: "/settings", label: "Settings", eyebrow: "Setup" },
  ];

  type ShellMeta = {
    kicker: string;
    title: string;
    subtitle: string;
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
        kicker: "Catalog and routing",
        title: "Shape your next set list",
        subtitle:
          "Browse bundled drills, collections, imports, and recommendations without losing the thread of what to practice next.",
        wide: true,
      };
    }
    if (pathname.startsWith("/practice")) {
      return {
        kicker: "Deliberate repetition",
        title: "Keep the chart in the spotlight",
        subtitle:
          "Use looping, scoring, coaching, and saved presets as support systems around the playing surface, not distractions from it.",
        wide: true,
      };
    }
    if (pathname.startsWith("/settings")) {
      return {
        kicker: "Studio setup",
        title: "Tune the room before the run",
        subtitle:
          "Input monitoring, tuning, and calibration should feel like a guided soundcheck instead of a diagnostic console.",
        wide: true,
      };
    }
    if (pathname.startsWith("/account")) {
      return {
        kicker: "Profile and access",
        title: "Keep identity separate from plumbing",
        subtitle:
          "Subscription, profile, and continuity should read like product value, while rollout diagnostics stay secondary.",
        wide: true,
      };
    }
    return {
      kicker: "Desktop practice studio",
      title: "Build momentum, not menu fatigue",
      subtitle:
        "Fretflow should feel like a rehearsal environment with clear next actions, expressive visual rhythm, and a stronger sense of flow.",
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
      <div class="app-sidebar__content">
        <a class="app-brand" href="/">
          <span class="app-brand__mark" aria-hidden="true">FF</span>
          <span>
            <span class="app-brand__eyebrow">Practice Studio</span>
            <span class="app-brand__name">Fretflow</span>
          </span>
        </a>

        <p class="app-sidebar__tagline">
          A desktop-first rehearsal space for guitar players who want stronger timing, repeatable loops, and guided momentum.
        </p>

        <nav class="app-nav" aria-label="Main">
          {#each nav as item}
            <a
              class="app-nav__link"
              href={item.href}
              aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
            >
              <span class="app-nav__eyebrow">{item.eyebrow}</span>
              <span class="app-nav__label">{item.label}</span>
            </a>
          {/each}
        </nav>
      </div>

      <div class="app-sidebar__footer">
        <span class="app-sidebar__footer-label">Design direction</span>
        <p class="app-sidebar__footer-copy">
          The shell now prioritizes musical atmosphere, clearer hierarchy, and stronger separation between primary workflow and supporting diagnostics.
        </p>
      </div>
    </div>
  </aside>

  <div class="app-frame">
    <header class="app-masthead">
      <div>
        <p class="app-kicker">{shell.kicker}</p>
        <h1>{shell.title}</h1>
        <p>{shell.subtitle}</p>
      </div>

      <div class="app-masthead__utilities">
        {#if isTauri()}
          {@const shellIdentity = getShellIdentityRollout(session)}
          <div class="app-utility-card">
            <span class="app-utility-card__label">
              {shellIdentity.source === "remote_auth" ? "Connected account" : "Shell identity"}
            </span>
            <a
              href="/account"
              class="session-account-pill"
              class:connection-pill--on={profile?.auth.signedIn ?? false}
              aria-current={pathname === "/account" ? "page" : undefined}
              title={shellIdentity.detail}
            >
              {#if profile?.auth.signedIn}
                {shellAccountLabel()}
              {:else}
                Sign in to sync later
              {/if}
            </a>
            <span class="app-sidebar__footer-copy">
              {remoteProfile != null ? "Connected profile is now active in the shell." : shellIdentity.summary}
            </span>
          </div>
        {/if}

        {#if isTauri() && connectionStatus}
          <div class="app-utility-card" role="status" aria-label="Input connections">
            <span class="app-utility-card__label">Studio status</span>
            <div class="app-connection-status">
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
          </div>
        {/if}
      </div>
    </header>

    <main class="app-main" class:app-main--wide={shell.wide}>
      {@render children?.()}
    </main>
  </div>
</div>
