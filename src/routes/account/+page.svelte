<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import type { AppSession } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  let session = $state<AppSession | null>(null);
  let displayName = $state("");
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function refreshSession() {
    if (!isTauri()) {
      session = null;
      return;
    }
    try {
      session = await invoke<AppSession>("get_session");
      error = null;
    } catch (e) {
      session = null;
      error = e instanceof Error ? e.message : String(e);
    }
  }

  async function devSignIn() {
    if (!isTauri()) return;
    busy = true;
    error = null;
    try {
      const name = displayName.trim();
      session = await invoke<AppSession>("dev_sign_in", {
        payload: { displayName: name || null },
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function signOut() {
    if (!isTauri()) return;
    busy = true;
    error = null;
    try {
      session = await invoke<AppSession>("sign_out");
      displayName = "";
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    void refreshSession();
  });
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Account</h1>
<p class="muted" style="margin: 0 0 1rem">
  Local session stored in the app config directory. Sign in for dev testing; cloud accounts and
  subscriptions are not part of the current release.
</p>

{#if !isTauri()}
  <p class="muted">Open the desktop app to use account features.</p>
{:else}
  {#if error}
    <p style="color: #f87171; margin: 0 0 1rem">{error}</p>
  {/if}

  <div class="panel" style="max-width: 28rem">
    {#if session}
      {#if session.signedIn}
        <p style="margin: 0 0 0.5rem">
          Signed in as <strong>{session.authKind ?? "?"}</strong>
          {#if session.displayName}
            · {session.displayName}
          {/if}
        </p>
        {#if session.signedInAtUnixMs != null}
          <p class="muted" style="margin: 0 0 0.75rem; font-size: 0.88rem">
            Since {new Date(session.signedInAtUnixMs).toLocaleString()}
          </p>
        {/if}
        {#if session.entitlements.length > 0}
          <p class="muted" style="margin: 0 0 0.5rem; font-size: 0.85rem">Capabilities</p>
          <ul style="margin: 0 0 1rem; padding-left: 1.25rem; font-size: 0.88rem">
            {#each session.entitlements as e (e)}
              <li><code>{e}</code></li>
            {/each}
          </ul>
        {/if}
        <button type="button" class="btn" onclick={signOut} disabled={busy}>Sign out</button>
      {:else}
        <label style="display: block; margin-bottom: 0.5rem">
          <span class="muted" style="display: block; margin-bottom: 0.25rem; font-size: 0.88rem"
            >Display name (optional)</span
          >
          <input
            type="text"
            bind:value={displayName}
            placeholder="e.g. Local dev"
            disabled={busy}
            style="width: 100%; max-width: 20rem; padding: 0.4rem 0.55rem; border-radius: 6px; border: 1px solid var(--ff-border); background: var(--ff-bg); color: var(--ff-text)"
          />
        </label>
        <button type="button" class="btn btn-primary" onclick={devSignIn} disabled={busy}>
          {busy ? "…" : "Sign in as dev"}
        </button>
      {/if}
    {:else}
      <p class="muted" style="margin: 0">Loading session…</p>
    {/if}
  </div>
{/if}
