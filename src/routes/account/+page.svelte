<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import {
    listMutationPoliciesByOwnership,
    type CatalogMutationPolicy,
    type MutationOwnership,
  } from "$lib/catalog/mutation-policies";
  import type { AppSession, SubscriptionState } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  let session = $state<AppSession | null>(null);
  let subscription = $state<SubscriptionState | null>(null);
  let displayName = $state("");
  let subscriptionApiBase = $state("");
  let busy = $state(false);
  let syncingSubscription = $state(false);
  let savingApiBase = $state(false);
  let error = $state<string | null>(null);
  let subscriptionError = $state<string | null>(null);

  const syncCandidatePolicies = listMutationPoliciesByOwnership("sync_candidate");
  const localOnlyPolicies = listMutationPoliciesByOwnership("local_only");
  const laterPolicies = listMutationPoliciesByOwnership("server_backed_later");

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

  async function refreshSubscription() {
    if (!isTauri()) {
      subscription = null;
      subscriptionApiBase = "";
      return;
    }
    try {
      subscription = await invoke<SubscriptionState>("get_subscription_state");
      subscriptionApiBase = subscription.apiBaseUrl;
      subscriptionError = null;
    } catch (e) {
      subscription = null;
      subscriptionError = e instanceof Error ? e.message : String(e);
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

  async function syncSubscription() {
    if (!isTauri()) return;
    syncingSubscription = true;
    subscriptionError = null;
    try {
      subscription = await invoke<SubscriptionState>("sync_subscription_now");
      subscriptionApiBase = subscription.apiBaseUrl;
    } catch (e) {
      subscriptionError = e instanceof Error ? e.message : String(e);
    } finally {
      syncingSubscription = false;
    }
  }

  async function saveSubscriptionApiBase() {
    if (!isTauri()) return;
    savingApiBase = true;
    subscriptionError = null;
    try {
      subscription = await invoke<SubscriptionState>("set_subscription_api_base", {
        payload: { url: subscriptionApiBase.trim() },
      });
      subscriptionApiBase = subscription.apiBaseUrl;
    } catch (e) {
      subscriptionError = e instanceof Error ? e.message : String(e);
    } finally {
      savingApiBase = false;
    }
  }

  function formatTimestamp(unixMs: number | null): string {
    if (unixMs == null || unixMs <= 0) return "Never";
    return new Date(unixMs).toLocaleString();
  }

  function subscriptionTone(state: SubscriptionState | null): string {
    if (state == null) return "unknown";
    if (state.entitled) return state.offlineGraceActive ? "grace" : "active";
    if (state.subscriptionStatus === "past_due") return "warning";
    return "inactive";
  }

  function ownershipLabel(ownership: MutationOwnership): string {
    switch (ownership) {
      case "local_only":
        return "Local only";
      case "sync_candidate":
        return "Sync next";
      case "server_backed_later":
        return "Account later";
      default: {
        const exhaustiveCheck: never = ownership;
        throw new Error(`Unhandled mutation ownership: ${exhaustiveCheck}`);
      }
    }
  }

  function ownershipTone(ownership: MutationOwnership): string {
    switch (ownership) {
      case "local_only":
        return "inactive";
      case "sync_candidate":
        return "active";
      case "server_backed_later":
        return "warning";
      default: {
        const exhaustiveCheck: never = ownership;
        throw new Error(`Unhandled mutation ownership: ${exhaustiveCheck}`);
      }
    }
  }

  function policyGroups(): Array<{ title: string; policies: CatalogMutationPolicy[] }> {
    return [
      { title: "Sync first", policies: syncCandidatePolicies },
      { title: "Keep on device", policies: localOnlyPolicies },
      { title: "Account-backed later", policies: laterPolicies },
    ].filter((group) => group.policies.length > 0);
  }

  onMount(() => {
    void refreshSession();
    void refreshSubscription();
  });
</script>

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Account</h1>
<p class="muted" style="margin: 0 0 1rem">
  Local session and subscription cache are stored in the app config directory. This is still a
  desktop-local account surface, but it now exposes the current entitlement state and sync status.
</p>

{#if !isTauri()}
  <p class="muted">Open the desktop app to use account features.</p>
{:else}
  {#if error}
    <p style="color: #f87171; margin: 0 0 1rem">{error}</p>
  {/if}

  <div class="account-grid">
    <div class="panel account-panel">
      <h2>Session</h2>
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
            <ul class="account-list">
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
              class="account-input"
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

    <div class="panel account-panel">
      <div class="account-panel__header">
        <div>
          <h2>Subscription</h2>
          <p class="muted" style="margin: 0.25rem 0 0; font-size: 0.88rem">
            Reads the local subscription cache and syncs against the configured API when requested.
          </p>
        </div>
        <span class={`status-pill status-pill--${subscriptionTone(subscription)}`}>
          {#if subscription?.entitled}
            {subscription.offlineGraceActive ? "Offline grace" : "Entitled"}
          {:else if subscription}
            {subscription.subscriptionStatus}
          {:else}
            Unknown
          {/if}
        </span>
      </div>

      {#if subscriptionError}
        <p class="account-error">{subscriptionError}</p>
      {/if}

      {#if subscription}
        <div class="subscription-grid">
          <div class="subscription-stat">
            <span class="muted">Plan</span>
            <strong>{subscription.tier ?? "None"}</strong>
          </div>
          <div class="subscription-stat">
            <span class="muted">Status</span>
            <strong>{subscription.subscriptionStatus}</strong>
          </div>
          <div class="subscription-stat">
            <span class="muted">Valid until</span>
            <strong>{formatTimestamp(subscription.validUntilUnixMs)}</strong>
          </div>
          <div class="subscription-stat">
            <span class="muted">Last successful sync</span>
            <strong>{formatTimestamp(subscription.lastSyncOkUnixMs)}</strong>
          </div>
        </div>

        <p class="muted account-footnote">
          {#if subscription.lastSyncSucceeded}
            Last sync succeeded.
          {:else if subscription.lastSyncError}
            Last sync failed: {subscription.lastSyncError}
          {:else}
            No subscription sync has been run yet.
          {/if}
          Offline grace window: {subscription.graceDays} day{subscription.graceDays === 1 ? "" : "s"}.
        </p>

        <label class="account-field">
          <span class="muted">Subscription API base</span>
          <input
            type="url"
            bind:value={subscriptionApiBase}
            placeholder="http://127.0.0.1:8787"
            disabled={savingApiBase || syncingSubscription}
            class="account-input"
          />
        </label>

        <div class="account-actions">
          <button
            type="button"
            class="btn"
            onclick={saveSubscriptionApiBase}
            disabled={savingApiBase || syncingSubscription}
          >
            {savingApiBase ? "Saving…" : "Save API base"}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            onclick={syncSubscription}
            disabled={syncingSubscription || savingApiBase}
          >
            {syncingSubscription ? "Syncing…" : "Sync now"}
          </button>
        </div>
      {:else}
        <p class="muted" style="margin: 0">Loading subscription state…</p>
      {/if}
    </div>

    <div class="panel account-panel">
      <div class="account-panel__header">
        <div>
          <h2>Sync roadmap</h2>
          <p class="muted" style="margin: 0.25rem 0 0; font-size: 0.88rem">
            The catalog layer now distinguishes device-local practice state from library state that
            should sync once real accounts land.
          </p>
        </div>
      </div>

      {#each policyGroups() as group (group.title)}
        <div class="policy-group">
          <h3>{group.title}</h3>
          <ul class="policy-list">
            {#each group.policies as policy (policy.key)}
              <li class="policy-item">
                <div class="policy-item__header">
                  <strong>{policy.label}</strong>
                  <span class={`status-pill status-pill--${ownershipTone(policy.ownership)}`}>
                    {ownershipLabel(policy.ownership)}
                  </span>
                </div>
                <p class="muted">{policy.rationale}</p>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .account-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: 1rem;
    max-width: 56rem;
  }

  .account-panel {
    display: grid;
    gap: 0.9rem;
  }

  .account-panel h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .account-panel h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .account-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .account-list {
    margin: 0 0 1rem;
    padding-left: 1.25rem;
    font-size: 0.88rem;
  }

  .policy-group {
    display: grid;
    gap: 0.55rem;
  }

  .policy-list {
    list-style: none;
    display: grid;
    gap: 0.65rem;
    margin: 0;
    padding: 0;
  }

  .policy-item {
    display: grid;
    gap: 0.35rem;
    padding: 0.8rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--ff-border);
    background: color-mix(in srgb, var(--ff-bg) 82%, transparent);
  }

  .policy-item p {
    margin: 0;
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .policy-item__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .account-field {
    display: grid;
    gap: 0.35rem;
  }

  .account-input {
    width: 100%;
    max-width: 24rem;
    padding: 0.45rem 0.6rem;
    border-radius: 6px;
    border: 1px solid var(--ff-border);
    background: var(--ff-bg);
    color: var(--ff-text);
  }

  .account-actions {
    display: flex;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .subscription-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
  }

  .subscription-stat {
    display: grid;
    gap: 0.15rem;
    padding: 0.8rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--ff-border);
    background: color-mix(in srgb, var(--ff-bg) 78%, transparent);
  }

  .subscription-stat strong {
    font-size: 0.95rem;
    line-height: 1.45;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    min-height: 2rem;
    padding: 0 0.75rem;
    border-radius: 999px;
    border: 1px solid var(--ff-border);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-pill--active {
    color: var(--ff-success);
    border-color: color-mix(in srgb, var(--ff-success) 45%, var(--ff-border));
  }

  .status-pill--grace,
  .status-pill--warning {
    color: var(--ff-accent);
    border-color: color-mix(in srgb, var(--ff-accent) 45%, var(--ff-border));
  }

  .status-pill--inactive,
  .status-pill--unknown {
    color: var(--ff-muted);
  }

  .account-error {
    margin: 0;
    color: #f87171;
  }

  .account-footnote {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
  }
</style>
