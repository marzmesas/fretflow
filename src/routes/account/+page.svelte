<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import {
    loadLocalFrontendUserProfile,
    type FrontendUserProfile,
  } from "$lib/account/profile";
  import {
    CONTENT_PACK_OFFERS,
    PLAN_OFFERS,
  } from "$lib/account/plan-offers";
  import { getShellIdentityRollout } from "$lib/account/shell-identity";
  import { getSubscriptionLifecycle } from "$lib/account/subscription-lifecycle";
  import {
    buildRemoteUserProfileSeed,
    loadRemoteUserProfile,
    previewRemoteUserProfileSeed,
    saveRemoteUserProfile,
    type RemoteUserProfileV1,
  } from "$lib/account/remote-profile";
  import { getRemoteProfileRole } from "$lib/account/remote-profile-gate";
  import { getProfileWriteRollout } from "$lib/account/profile-write-rollout";
  import {
    listProfileFieldPoliciesByOwnership,
    type ProfileFieldPolicy,
    type ProfileFieldOwnership,
  } from "$lib/account/profile-field-policies";
  import {
    listMutationPoliciesByOwnership,
    type CatalogMutationPolicy,
    type MutationOwnership,
  } from "$lib/catalog/mutation-policies";
  import {
    getCatalogMigrationTarget,
    getCatalogSnapshot,
    invalidateCatalogSnapshot,
  } from "$lib/catalog/catalog-service";
  import {
    getCatalogSourcePreference,
    setCatalogSourcePreference,
    type CatalogSourcePreference,
  } from "$lib/catalog/catalog-source";
  import { getCatalogSourceRollout, resolveCatalogSourceMode } from "$lib/catalog/catalog-rollout";
  import {
    getAnalyticsDeliveryStatus,
    getPendingAnalyticsEventCount,
    maybeSendScheduledAnalyticsBatch,
    sendPendingAnalyticsBatch,
  } from "$lib/analytics/delivery";
  import type { RemoteCatalogMigrationTarget } from "$lib/catalog/remote-catalog";
  import type { AppSession, SubscriptionState } from "$lib/ipc";
  import { isTauri } from "$lib/tauri-env";

  let session = $state<AppSession | null>(null);
  let subscription = $state<SubscriptionState | null>(null);
  let profile = $state<FrontendUserProfile | null>(null);
  let displayName = $state("");
  let subscriptionApiBase = $state("");
  let catalogSourcePreference = $state<CatalogSourcePreference>("system");
  let busy = $state(false);
  let syncingSubscription = $state(false);
  let savingApiBase = $state(false);
  let sendingAnalytics = $state(false);
  let error = $state<string | null>(null);
  let subscriptionError = $state<string | null>(null);
  let analyticsError = $state<string | null>(null);
  let analyticsStatus = $state<string | null>(null);
  let pendingAnalyticsEvents = $state(0);
  let analyticsRetryAt = $state<string | null>(null);
  let planSelectionStatus = $state<string | null>(null);
  let remoteProfile = $state<RemoteUserProfileV1 | null>(null);
  let remoteProfileError = $state<string | null>(null);
  let loadingRemoteProfile = $state(false);
  let savingRemoteProfile = $state(false);
  let remoteProfileWriteStatus = $state<string | null>(null);
  const catalogMigrationTarget = getCatalogMigrationTarget();
  const catalogSnapshot = getCatalogSnapshot();
  const premiumPreviewTrackCount = catalogSnapshot.tracks.filter((track) => track.tier === "premium").length;
  const subscriptionLifecycle = $derived(getSubscriptionLifecycle(subscription));

  const syncCandidatePolicies = listMutationPoliciesByOwnership("sync_candidate");
  const localOnlyPolicies = listMutationPoliciesByOwnership("local_only");
  const laterPolicies = listMutationPoliciesByOwnership("server_backed_later");
  const remoteFirstProfilePolicies = listProfileFieldPoliciesByOwnership("remote_first");
  const localOnlyProfilePolicies = listProfileFieldPoliciesByOwnership("local_only");

  function refreshProfile(
    nextSession: AppSession | null = session,
    nextSubscription: SubscriptionState | null = subscription,
  ): void {
    if (!isTauri()) {
      profile = null;
      return;
    }
    profile = loadLocalFrontendUserProfile(nextSession, nextSubscription);
    pendingAnalyticsEvents = profile.analytics.pendingEvents;
  }

  async function refreshSession() {
    if (!isTauri()) {
      session = null;
      profile = null;
      return;
    }
    try {
      session = await invoke<AppSession>("get_session");
      error = null;
      refreshProfile(session, subscription);
      void refreshRemoteProfile();
    } catch (e) {
      session = null;
      error = e instanceof Error ? e.message : String(e);
      refreshProfile(null, subscription);
    }
  }

  async function refreshSubscription() {
    if (!isTauri()) {
      subscription = null;
      subscriptionApiBase = "";
      profile = null;
      return;
    }
    try {
      subscription = await invoke<SubscriptionState>("get_subscription_state");
      subscriptionApiBase = subscription.apiBaseUrl;
      subscriptionError = null;
      refreshProfile(session, subscription);
      void maybeSendScheduledAnalyticsNow();
      void refreshRemoteProfile();
    } catch (e) {
      subscription = null;
      subscriptionError = e instanceof Error ? e.message : String(e);
      refreshProfile(session, null);
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
      refreshProfile(session, subscription);
      void refreshRemoteProfile();
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
      refreshProfile(session, subscription);
      void refreshRemoteProfile();
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
      refreshProfile(session, subscription);
      void maybeSendScheduledAnalyticsNow();
      void refreshRemoteProfile();
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
      refreshProfile(session, subscription);
      void maybeSendScheduledAnalyticsNow();
      void refreshRemoteProfile();
    } catch (e) {
      subscriptionError = e instanceof Error ? e.message : String(e);
    } finally {
      savingApiBase = false;
    }
  }

  async function refreshRemoteProfile() {
    if (!isTauri()) {
      remoteProfile = null;
      return;
    }
    const apiBaseUrl = subscriptionApiBase.trim();
    if (apiBaseUrl === "") {
      remoteProfile = null;
      remoteProfileError = null;
      return;
    }
    loadingRemoteProfile = true;
    remoteProfileError = null;
    try {
      const remoteProfileRole = getRemoteProfileRole(session);
      if (remoteProfileRole === "preview_only" && profile != null) {
        remoteProfile = await previewRemoteUserProfileSeed({
          apiBaseUrl,
          seed: buildRemoteUserProfileSeed(profile),
        });
      } else {
        remoteProfile = await loadRemoteUserProfile({ apiBaseUrl });
      }
    } catch (e) {
      remoteProfile = null;
      remoteProfileError = e instanceof Error ? e.message : String(e);
    } finally {
      loadingRemoteProfile = false;
    }
  }

  async function saveRemoteProfileNow(seed: RemoteUserProfileV1) {
    const writeRollout = getProfileWriteRollout({
      apiBaseUrl: subscriptionApiBase,
      remoteProfileRole: getRemoteProfileRole(session),
    });
    if (!writeRollout.ready) {
      remoteProfileWriteStatus = writeRollout.summary;
      return;
    }
    savingRemoteProfile = true;
    remoteProfileError = null;
    remoteProfileWriteStatus = null;
    try {
      remoteProfile = await saveRemoteUserProfile({
        apiBaseUrl: subscriptionApiBase,
        profile: seed,
      });
      remoteProfileWriteStatus = "Saved the current online profile fields to the server scaffold.";
    } catch (e) {
      remoteProfileError = e instanceof Error ? e.message : String(e);
    } finally {
      savingRemoteProfile = false;
    }
  }

  function getCurrentCatalogRollout() {
    return getCatalogSourceRollout({
      session,
      apiBaseUrl: subscriptionApiBase,
      remoteProfileRole: getRemoteProfileRole(session),
    });
  }

  function getCurrentCatalogSourceMode() {
    return resolveCatalogSourceMode(catalogSourcePreference, getCurrentCatalogRollout());
  }

  function saveCatalogSourcePreference(preference: CatalogSourcePreference): void {
    catalogSourcePreference = setCatalogSourcePreference(preference);
    invalidateCatalogSnapshot();
  }

  function refreshAnalyticsState(): void {
    pendingAnalyticsEvents = getPendingAnalyticsEventCount();
    analyticsRetryAt = getAnalyticsDeliveryStatus().nextRetryAt;
    refreshProfile(session, subscription);
  }

  async function sendAnalyticsBatchNow() {
    sendingAnalytics = true;
    analyticsError = null;
    analyticsStatus = null;
    try {
      const result = await sendPendingAnalyticsBatch({
        apiBaseUrl: subscriptionApiBase,
      });
      switch (result.status) {
        case "skipped":
          analyticsStatus =
            result.reason === "missing_api_base"
              ? "Set the API base before sending analytics."
              : "No pending analytics events to send.";
          break;
        case "sent":
          analyticsStatus = `Sent ${result.acceptedEvents} analytics event${
            result.acceptedEvents === 1 ? "" : "s"
          }.`;
          break;
        default: {
          const exhaustiveCheck: never = result;
          throw new Error(`Unhandled analytics send result: ${exhaustiveCheck}`);
        }
      }
    } catch (e) {
      analyticsError = e instanceof Error ? e.message : String(e);
    } finally {
      refreshAnalyticsState();
      sendingAnalytics = false;
    }
  }

  async function maybeSendScheduledAnalyticsNow() {
    analyticsError = null;
    try {
      const result = await maybeSendScheduledAnalyticsBatch({
        apiBaseUrl: subscriptionApiBase,
      });
      if (result.status === "sent") {
        analyticsStatus = `Sent ${result.acceptedEvents} analytics event${
          result.acceptedEvents === 1 ? "" : "s"
        } after retry scheduling.`;
      }
    } catch (e) {
      analyticsError = e instanceof Error ? e.message : String(e);
    } finally {
      refreshAnalyticsState();
    }
  }

  function formatTimestamp(unixMs: number | null): string {
    if (unixMs == null || unixMs <= 0) return "Never";
    return new Date(unixMs).toLocaleString();
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

  function migrationTargetChecklist(
    target: RemoteCatalogMigrationTarget,
  ): Array<{ label: string; included: boolean }> {
    return [
      { label: "Bundled and preview metadata", included: true },
      { label: "Playable premium tracks", included: target.includesPlayablePremiumTracks },
      { label: "Entitlement checks", included: target.includesEntitlements },
      { label: "Imported charts", included: target.includesImportedCharts },
      { label: "Practice asset delivery", included: target.includesPracticeAssets },
    ];
  }

  function profileOwnershipLabel(ownership: ProfileFieldOwnership): string {
    return ownership === "remote_first" ? "Remote first" : "Local only";
  }

  function effectivePlanId(): "free" | "pro" {
    return subscription?.tier === "pro" || subscription?.entitled ? "pro" : "free";
  }

  function previewPlanIntent(planId: "free" | "pro") {
    planSelectionStatus =
      planId === "pro"
        ? "Checkout is not live yet. Use the plan sync controls below to test entitlement-aware UI."
        : "Free remains the default local-first plan until checkout and entitlement delivery are live.";
  }

  function previewPackIntent(packId: (typeof CONTENT_PACK_OFFERS)[number]["id"]): void {
    const pack = CONTENT_PACK_OFFERS.find((offer) => offer.id === packId);
    if (pack == null) {
      planSelectionStatus = "Pack preview is unavailable.";
      return;
    }
    planSelectionStatus = `${pack.name} is a packaging preview for one-off purchases. Checkout is not live yet, but the premium library can already explain how this pack differs from Pro.`;
  }

  function profileAuthStateLabel(state: FrontendUserProfile["auth"]["state"]): string {
    switch (state) {
      case "guest":
        return "Guest";
      case "local_dev":
        return "Local preview";
      case "remote_auth":
        return "Connected account";
      default: {
        const exhaustiveCheck: never = state;
        throw new Error(`Unhandled auth state: ${exhaustiveCheck}`);
      }
    }
  }

  function profilePolicyGroups(): Array<{ title: string; policies: ProfileFieldPolicy[] }> {
    return [
      { title: "Remote-backed after auth", policies: remoteFirstProfilePolicies },
      { title: "Stay on device", policies: localOnlyProfilePolicies },
    ];
  }

  onMount(() => {
    catalogSourcePreference = getCatalogSourcePreference();
    void refreshSession();
    void refreshSubscription();
    refreshAnalyticsState();
    void maybeSendScheduledAnalyticsNow();
    void refreshRemoteProfile();
  });
</script>
<section class="panel account-hero ff-page-hero">
  <div class="account-hero__copy">
    <p class="ff-page-hero__eyebrow">Your account</p>
    <h1 class="ff-page-hero__title">See your profile, plan, and continuity without digging through diagnostics.</h1>
    <p class="muted ff-page-hero__body">
      Account should feel like a player summary first: who is signed in, which plan is active, what should happen next, and which device-side activity is still waiting to sync.
    </p>
  </div>
  <div class="ff-page-hero__stats">
    <div class="ff-page-hero__stat">
      <span class="ff-page-hero__stat-label">Identity</span>
      <strong>{profile?.auth.accountLabel ?? "Loading"}</strong>
      <span class="muted">{getShellIdentityRollout(session).summary}</span>
    </div>
    <div class="ff-page-hero__stat">
      <span class="ff-page-hero__stat-label">Plan</span>
      <strong>{profile?.subscription.tier ?? subscription?.tier ?? "Unknown"}</strong>
      <span class="muted">{subscriptionLifecycle.badgeLabel} · {subscriptionLifecycle.billingMomentValue}</span>
    </div>
    <div class="ff-page-hero__stat">
      <span class="ff-page-hero__stat-label">Queued activity</span>
      <strong>{profile?.analytics.pendingEvents ?? pendingAnalyticsEvents}</strong>
      <span class="muted">Local activity still waiting for delivery.</span>
    </div>
  </div>
</section>

{#if !isTauri()}
  <p class="muted">Open the desktop app to use account features.</p>
{:else}
  {#if error}
    <p style="color: #f87171; margin: 0 0 1rem">{error}</p>
  {/if}

  <div class="account-layout">
    <div class="account-layout__main">
      <div class="panel account-panel">
        <div class="ff-section-header account-panel__header">
          <div>
            <p class="ff-section-eyebrow">Player profile</p>
            <h2>Profile</h2>
            <p class="muted ff-section-intro account-panel__intro">
              The stable user-facing summary: identity, recommended path, and current daily-goal context.
            </p>
          </div>
        </div>

        {#if profile}
          <div class="subscription-grid">
            <div class="subscription-stat">
              <span class="muted">Identity</span>
              <strong>{profile.auth.accountLabel}</strong>
            </div>
            <div class="subscription-stat">
              <span class="muted">Auth state</span>
              <strong>{profileAuthStateLabel(profile.auth.state)}</strong>
            </div>
            <div class="subscription-stat">
              <span class="muted">Recommended path</span>
              <strong>{profile.learning.recommendedPathTitle ?? "Not set"}</strong>
            </div>
            <div class="subscription-stat">
              <span class="muted">Daily goal</span>
              <strong>{profile.practice.goalProgress}</strong>
            </div>
          </div>

          <p class="muted account-footnote">
            {#if profile.learning.recommendedTrackTitle}
              Next seeded chart: {profile.learning.recommendedTrackTitle}.
            {:else}
              No onboarding seed saved yet.
            {/if}
            Pending analytics events: {profile.analytics.pendingEvents}.
          </p>
        {:else}
          <p class="muted" style="margin: 0">Loading profile…</p>
        {/if}
      </div>

      <div class="panel account-panel">
        <div class="ff-section-header account-panel__header">
          <div>
            <p class="ff-section-eyebrow">Sign-in</p>
            <h2>Session</h2>
            <p class="muted ff-section-intro account-panel__intro">
              Sign in, sign out, and confirm which identity is currently active on this device.
            </p>
          </div>
        </div>

        {#if session && profile}
          {#if profile.auth.signedIn}
            <p style="margin: 0 0 0.5rem">
              Signed in as <strong>{profile.auth.authKind ?? "?"}</strong>
              {#if profile.auth.displayName}
                · {profile.auth.displayName}
              {/if}
            </p>
            {#if profile.auth.signedInAtUnixMs != null}
              <p class="muted" style="margin: 0 0 0.75rem; font-size: 0.88rem">
                Since {new Date(profile.auth.signedInAtUnixMs).toLocaleString()}
              </p>
            {/if}
            {#if profile.auth.entitlements.length > 0}
              <p class="muted" style="margin: 0 0 0.5rem; font-size: 0.85rem">Capabilities</p>
              <ul class="account-list">
                {#each profile.auth.entitlements as e (e)}
                  <li><code>{e}</code></li>
                {/each}
              </ul>
            {/if}
            <button type="button" class="btn" onclick={signOut} disabled={busy}>Sign out</button>
          {:else}
            <label class="account-field">
              <span class="muted">Display name (optional)</span>
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
        <div class="ff-section-header account-panel__header">
          <div>
            <p class="ff-section-eyebrow">Plan and delivery</p>
            <h2>Subscription</h2>
            <p class="muted ff-section-intro account-panel__intro">
              Plan status, billing connectivity, and pending activity delivery all live here because they affect the real account experience.
            </p>
          </div>
          <span class={`status-pill status-pill--${subscriptionLifecycle.tone}`}>
            {subscriptionLifecycle.badgeLabel}
          </span>
        </div>

        {#if subscriptionError}
          <p class="account-error">{subscriptionError}</p>
        {/if}

        {#if subscription}
          <div class="subscription-grid">
            <div class="subscription-stat">
              <span class="muted">Plan</span>
              <strong>{profile?.subscription.tier ?? subscription.tier ?? "None"}</strong>
            </div>
            <div class="subscription-stat">
              <span class="muted">Status</span>
              <strong>{profile?.subscription.status ?? subscription.subscriptionStatus}</strong>
            </div>
            <div class="subscription-stat">
              <span class="muted">Valid until</span>
              <strong>{formatTimestamp(subscription.validUntilUnixMs)}</strong>
            </div>
            <div class="subscription-stat">
              <span class="muted">Last plan check</span>
              <strong>{formatTimestamp(subscription.lastSyncOkUnixMs)}</strong>
            </div>
          </div>

          <div class="lifecycle-strip">
            <div class={`lifecycle-card lifecycle-card--${subscriptionLifecycle.tone}`}>
              <span class="lifecycle-card__label">Right now</span>
              <strong>{subscriptionLifecycle.headline}</strong>
              <p>{subscriptionLifecycle.summary}</p>
            </div>
            <div class="lifecycle-card">
              <span class="lifecycle-card__label">{subscriptionLifecycle.billingMomentLabel}</span>
              <strong>{subscriptionLifecycle.billingMomentValue}</strong>
              <p>
                {#if subscription.lastSyncSucceeded}
                  Last plan check succeeded.
                {:else if subscription.lastSyncError}
                  Last plan check failed: {subscription.lastSyncError}
                {:else}
                  No plan check has been run yet.
                {/if}
              </p>
            </div>
            <div class="lifecycle-card">
              <span class="lifecycle-card__label">Next UX move</span>
              <strong>What the app should do next</strong>
              <p>{subscriptionLifecycle.nextStep}</p>
            </div>
          </div>

          <p class="muted account-footnote">
            Offline grace window: {subscription.graceDays} day{subscription.graceDays === 1 ? "" : "s"}.
            This account currently sees {premiumPreviewTrackCount} premium preview row{premiumPreviewTrackCount === 1 ? "" : "s"} across plans and packs.
          </p>

          <div class="plan-grid">
            {#each PLAN_OFFERS as offer (offer.id)}
              {@const isCurrentPlan = effectivePlanId() === offer.id}
              <div class={`plan-card plan-card--${offer.accent}`}>
                <div class="plan-card__header">
                  <div>
                    <h3>{offer.name}</h3>
                    <p class="muted plan-card__cadence">{offer.cadence}</p>
                  </div>
                  {#if isCurrentPlan}
                    <span class="status-pill status-pill--active">Current</span>
                  {/if}
                </div>
                <div class="plan-card__price">{offer.priceLabel}</div>
                <p class="muted plan-card__summary">{offer.summary}</p>
                <ul class="plan-card__features">
                  {#each offer.features as feature (feature)}
                    <li>{feature}</li>
                  {/each}
                </ul>
                <button
                  type="button"
                  class="btn"
                  class:btn-primary={!isCurrentPlan && offer.id === "pro"}
                  onclick={() => previewPlanIntent(offer.id)}
                  disabled={isCurrentPlan}
                >
                  {isCurrentPlan ? "Current plan" : offer.id === "pro" ? "Preview upgrade" : "Keep free"}
                </button>
              </div>
            {/each}
          </div>

          <div class="content-pack-section">
            <div class="ff-section-header account-panel__header">
              <div>
                <p class="ff-section-eyebrow">Optional packaging</p>
                <h3>Preview content packs</h3>
                <p class="muted ff-section-intro account-panel__intro">
                  These one-off packs keep premium from being a single all-or-nothing wall. Pro stays the broadest offer, while packs target focused techniques or styles.
                </p>
              </div>
            </div>
            <div class="pack-grid">
              {#each CONTENT_PACK_OFFERS as pack (pack.id)}
                <div class="plan-card plan-card--pack">
                  <div class="plan-card__header">
                    <div>
                      <h3>{pack.name}</h3>
                      <p class="muted plan-card__cadence">{pack.focus}</p>
                    </div>
                    <span class="status-pill status-pill--warning">Preview</span>
                  </div>
                  <div class="plan-card__price">{pack.priceLabel}</div>
                  <p class="muted plan-card__summary">{pack.summary}</p>
                  <p class="account-footnote">
                    Includes {pack.includedTrackIds.length} premium preview track{pack.includedTrackIds.length === 1 ? "" : "s"} in the current scaffold.
                  </p>
                  <button type="button" class="btn" onclick={() => previewPackIntent(pack.id)}>
                    Preview pack
                  </button>
                </div>
              {/each}
            </div>
          </div>

          {#if planSelectionStatus}
            <p class="muted account-footnote">{planSelectionStatus}</p>
          {/if}

          <label class="account-field">
            <span class="muted">Service URL</span>
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
              {savingApiBase ? "Saving…" : "Save service URL"}
            </button>
            <button
              type="button"
              class="btn btn-primary"
              onclick={syncSubscription}
              disabled={syncingSubscription || savingApiBase}
            >
              {syncingSubscription ? "Checking…" : "Check plan now"}
            </button>
          </div>

          <div class="account-divider"></div>

          <div class="policy-group">
            <h3>Analytics delivery</h3>
            <p class="muted ff-section-intro account-panel__intro">
              Uses the same API base and sends the current batch of local activity to the server.
            </p>
            <div class="subscription-grid">
              <div class="subscription-stat">
                <span class="muted">Pending events</span>
                <strong>{profile?.analytics.pendingEvents ?? pendingAnalyticsEvents}</strong>
              </div>
            </div>
            {#if analyticsError}
              <p class="account-error">{analyticsError}</p>
            {/if}
            {#if analyticsStatus}
              <p class="muted account-footnote">{analyticsStatus}</p>
            {/if}
            {#if analyticsRetryAt}
              <p class="muted account-footnote">
                Next retry window: {new Date(analyticsRetryAt).toLocaleString()}
              </p>
            {/if}
            <div class="account-actions">
              <button
                type="button"
                class="btn"
                onclick={sendAnalyticsBatchNow}
                disabled={sendingAnalytics || savingApiBase || syncingSubscription}
              >
                {sendingAnalytics ? "Sending…" : "Send analytics batch"}
              </button>
            </div>
          </div>
        {:else}
          <p class="muted" style="margin: 0">Loading subscription state…</p>
        {/if}
      </div>
    </div>

    <aside class="account-layout__side">
      <div class="panel account-panel account-panel--diagnostics">
        <div class="ff-section-header account-panel__header">
          <div>
            <p class="ff-section-eyebrow">Diagnostics</p>
            <h2>Rollout preview</h2>
            <p class="muted ff-section-intro account-panel__intro">
              These controls still matter while the product is taking shape, but they are intentionally kept behind a secondary layer now.
            </p>
          </div>
        </div>

        <details class="account-disclosure ff-disclosure">
          <summary>Shell identity rollout</summary>
          <div class="account-disclosure__body ff-disclosure__body">
            <div class="policy-group">
              <div class="policy-item">
                <div class="policy-item__header">
                  <strong>Current shell identity source</strong>
                  <span class={`status-pill status-pill--${getShellIdentityRollout(session).source === "remote_auth" ? "active" : getShellIdentityRollout(session).source === "local_session_stub" ? "warning" : "inactive"}`}>
                    {getShellIdentityRollout(session).source === "remote_auth"
                      ? "Connected account"
                      : getShellIdentityRollout(session).source === "local_session_stub"
                        ? "Local preview"
                        : "Guest"}
                  </span>
                </div>
                <p class="muted">{getShellIdentityRollout(session).summary}</p>
                <p class="muted account-panel__intro">{getShellIdentityRollout(session).detail}</p>
              </div>
            </div>
          </div>
        </details>

        <details class="account-disclosure ff-disclosure">
          <summary>Catalog rollout</summary>
          <div class="account-disclosure__body ff-disclosure__body">
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

            <div class="policy-group">
              <h3>First online catalog slice</h3>
              <p class="muted ff-section-intro account-panel__intro">
                {catalogMigrationTarget.label} is the first online catalog target. It keeps the first step focused on chart listings before asset delivery, premium unlocks, or user uploads.
              </p>
              <ul class="policy-list">
                {#each migrationTargetChecklist(catalogMigrationTarget) as item (item.label)}
                  <li class="policy-item policy-item--compact">
                    <div class="policy-item__header">
                      <strong>{item.label}</strong>
                      <span class={`status-pill status-pill--${item.included ? "active" : "inactive"}`}>
                        {item.included ? "Included" : "Later"}
                      </span>
                    </div>
                  </li>
                {/each}
              </ul>
            </div>

            <div class="policy-group">
              <h3>Catalog source preview</h3>
              <p class="muted ff-section-intro account-panel__intro">
                The online catalog stays behind a local preview switch so Library can test it without replacing the built-in catalog for everyone.
              </p>
              <div class="account-actions">
                <button
                  type="button"
                  class="btn"
                  class:btn-primary={catalogSourcePreference === "system"}
                  onclick={() => saveCatalogSourcePreference("system")}
                >
                  System default
                </button>
                <button
                  type="button"
                  class="btn"
                  class:btn-primary={catalogSourcePreference === "local_seed"}
                  onclick={() => saveCatalogSourcePreference("local_seed")}
                >
                  Built-in catalog
                </button>
                <button
                  type="button"
                  class="btn"
                  class:btn-primary={catalogSourcePreference === "remote_api"}
                  onclick={() => saveCatalogSourcePreference("remote_api")}
                >
                  Online preview
                </button>
              </div>
              <p class="muted account-footnote">
                Preference: <strong>{catalogSourcePreference === "system"
                  ? "System default"
                  : catalogSourcePreference === "remote_api"
                    ? "Online preview"
                    : "Built-in catalog"}</strong>.
                Current source: <strong>{getCurrentCatalogSourceMode() === "remote_api" ? "Online preview" : "Built-in catalog"}</strong>.
              </p>
              <p class="muted account-footnote">
                {getCurrentCatalogRollout().summary} {getCurrentCatalogRollout().detail}
              </p>
            </div>
          </div>
        </details>

        {#if profile}
          {@const remoteProfileSeed = buildRemoteUserProfileSeed(profile)}
          <details class="account-disclosure ff-disclosure">
            <summary>Profile rollout preview</summary>
            <div class="account-disclosure__body ff-disclosure__body">
              <div class="policy-group">
                <h3>First online profile fields</h3>
                <p class="muted ff-section-intro account-panel__intro">
                  These are the first non-billing profile fields that should move online once real auth exists.
                </p>
                <ul class="policy-list">
                  <li class="policy-item policy-item--compact">
                    <div class="policy-item__header">
                      <strong>Display name</strong>
                      <span class="status-pill status-pill--active">
                        {remoteProfileSeed.fields.displayName ?? "Not set"}
                      </span>
                    </div>
                  </li>
                  <li class="policy-item policy-item--compact">
                    <div class="policy-item__header">
                      <strong>Practice goal</strong>
                      <span class="status-pill status-pill--active">
                        {remoteProfileSeed.fields.practiceGoal ?? "Not set"}
                      </span>
                    </div>
                  </li>
                  <li class="policy-item policy-item--compact">
                    <div class="policy-item__header">
                      <strong>Seeded path / chart</strong>
                      <span class="status-pill status-pill--active">
                        {remoteProfileSeed.fields.recommendedPathId ?? "Not set"} / {remoteProfileSeed.fields.recommendedTrackId ?? "Not set"}
                      </span>
                    </div>
                  </li>
                  <li class="policy-item policy-item--compact">
                    <div class="policy-item__header">
                      <strong>Daily goal target</strong>
                      <span class="status-pill status-pill--active">
                        {remoteProfileSeed.fields.dailyGoalSessions}
                      </span>
                    </div>
                  </li>
                </ul>
              </div>

              <div class="policy-group">
                <div class="policy-item">
                  <div class="policy-item__header">
                    <strong>Online profile preview</strong>
                    <div class="account-actions">
                      <button type="button" class="btn" onclick={refreshRemoteProfile} disabled={loadingRemoteProfile || savingRemoteProfile}>
                        {loadingRemoteProfile ? "Loading…" : "Refresh"}
                      </button>
                      <button
                        type="button"
                        class="btn"
                        onclick={() => void saveRemoteProfileNow(remoteProfileSeed)}
                        disabled={!getProfileWriteRollout({
                          apiBaseUrl: subscriptionApiBase,
                          remoteProfileRole: getRemoteProfileRole(session),
                        }).ready || savingRemoteProfile || loadingRemoteProfile}
                      >
                        {savingRemoteProfile ? "Saving…" : "Save online profile"}
                      </button>
                    </div>
                  </div>
                  <p class="muted">
                    Current role:
                    <strong>{getRemoteProfileRole(session) === "preview_only" ? "Preview only" : "Primary source"}</strong>
                  </p>
                  <p class="muted account-panel__intro">
                    {getProfileWriteRollout({
                      apiBaseUrl: subscriptionApiBase,
                      remoteProfileRole: getRemoteProfileRole(session),
                    }).summary}
                  </p>
                  <p class="muted account-panel__intro">
                    {getProfileWriteRollout({
                      apiBaseUrl: subscriptionApiBase,
                      remoteProfileRole: getRemoteProfileRole(session),
                    }).detail}
                  </p>
                  {#if remoteProfileWriteStatus}
                    <p class="muted account-footnote">{remoteProfileWriteStatus}</p>
                  {/if}
                  {#if remoteProfileError}
                    <p class="account-error">{remoteProfileError}</p>
                  {:else if remoteProfile}
                    <p class="muted">
                      Preview source: <strong>{remoteProfile.seedSource === "frontend_preview" ? "Current device seed" : "Static mock seed"}</strong><br />
                      Online display name: <strong>{remoteProfile.fields.displayName ?? "Not set"}</strong><br />
                      Online practice goal: <strong>{remoteProfile.fields.practiceGoal ?? "Not set"}</strong><br />
                      Online seeded path: <strong>{remoteProfile.fields.recommendedPathId ?? "Not set"}</strong><br />
                      Online daily goal target: <strong>{remoteProfile.fields.dailyGoalSessions}</strong>
                    </p>
                  {:else}
                    <p class="muted">No online profile loaded yet. Set the service URL and refresh to preview `/api/v1/profile`.</p>
                  {/if}
                </div>
              </div>

              {#each profilePolicyGroups() as group (group.title)}
                <div class="policy-group">
                  <h3>{group.title}</h3>
                  <ul class="policy-list">
                    {#each group.policies as policy (policy.key)}
                      <li class="policy-item">
                        <div class="policy-item__header">
                          <strong>{policy.label}</strong>
                          <span class={`status-pill status-pill--${policy.ownership === "remote_first" ? "active" : "inactive"}`}>
                            {profileOwnershipLabel(policy.ownership)}
                          </span>
                        </div>
                        <p class="muted">{policy.rationale}</p>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/each}
            </div>
          </details>
        {/if}
      </div>
    </aside>
  </div>
{/if}

<style>
  .account-hero {
    background:
      radial-gradient(circle at top right, rgba(63, 208, 195, 0.14), transparent 28%),
      radial-gradient(circle at left center, rgba(213, 138, 84, 0.18), transparent 24%),
      linear-gradient(145deg, rgba(33, 24, 29, 0.96), rgba(18, 15, 19, 0.96));
  }
  .account-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(20rem, 0.85fr);
    gap: 1rem;
    align-items: start;
  }
  .account-layout__main,
  .account-layout__side {
    display: grid;
    gap: 1rem;
  }
  .account-panel {
    display: grid;
    gap: 0.9rem;
  }
  .account-panel--diagnostics {
    align-content: start;
  }
  .account-panel h2 {
    margin: 0;
    font-size: 1.1rem;
  }
  .account-panel h3 {
    margin: 0;
    font-size: 0.95rem;
  }
  .account-panel__intro {
    max-width: 44rem;
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
    padding: 0.9rem 1rem;
    border-radius: 16px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.2);
  }
  .policy-item--compact {
    padding-block: 0.75rem;
  }
  .policy-item p {
    margin: 0;
    font-size: 0.9rem;
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
  }
  .account-actions {
    display: flex;
    gap: 0.65rem;
    flex-wrap: wrap;
  }
  .account-divider {
    border-top: 1px solid color-mix(in srgb, var(--ff-border) 65%, transparent);
  }
  .subscription-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
  }
  .subscription-stat {
    display: grid;
    gap: 0.15rem;
    padding: 0.9rem 1rem;
    border-radius: 16px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.2);
  }
  .subscription-stat strong {
    font-size: 0.95rem;
    line-height: 1.45;
  }
  .lifecycle-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.75rem;
  }
  .lifecycle-card {
    display: grid;
    gap: 0.35rem;
    padding: 1rem;
    border-radius: 18px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.2);
  }
  .lifecycle-card--active {
    border-color: color-mix(in srgb, var(--ff-success) 42%, var(--ff-border));
  }
  .lifecycle-card--grace,
  .lifecycle-card--warning {
    border-color: color-mix(in srgb, var(--ff-accent) 42%, var(--ff-border));
  }
  .lifecycle-card__label {
    font-size: 0.76rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ff-muted);
  }
  .lifecycle-card strong {
    font-size: 1rem;
    line-height: 1.4;
  }
  .lifecycle-card p {
    margin: 0;
    color: var(--ff-muted-strong);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .plan-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.85rem;
  }
  .pack-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
    gap: 0.85rem;
  }
  .plan-card {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
    border-radius: 18px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.2);
  }
  .plan-card--premium {
    background:
      radial-gradient(circle at top right, rgba(63, 208, 195, 0.12), transparent 38%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.2);
    border-color: color-mix(in srgb, var(--ff-accent) 42%, var(--ff-border));
  }
  .plan-card--pack {
    background:
      radial-gradient(circle at top right, rgba(213, 138, 84, 0.14), transparent 36%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.2);
    border-color: color-mix(in srgb, var(--ff-warm) 44%, var(--ff-border));
  }
  .plan-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .plan-card h3 {
    margin: 0;
    font-size: 1.05rem;
  }
  .plan-card__cadence {
    margin: 0.2rem 0 0;
  }
  .plan-card__summary {
    margin: 0;
    line-height: 1.5;
  }
  .plan-card__price {
    font-family: var(--ff-font-display);
    font-size: 1.8rem;
    line-height: 1;
    letter-spacing: -0.04em;
    color: var(--ff-text);
  }
  .plan-card__features {
    margin: 0;
    padding-left: 1.15rem;
    display: grid;
    gap: 0.45rem;
    color: var(--ff-muted-strong);
    font-size: 0.9rem;
    line-height: 1.5;
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
  .account-disclosure__body {
    gap: 1rem;
  }
  .account-error {
    margin: 0;
    color: #f87171;
  }
  .account-footnote {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.5;
  }
  .content-pack-section {
    display: grid;
    gap: 0.85rem;
  }
  @media (max-width: 900px) {
    .account-hero,
    .account-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
