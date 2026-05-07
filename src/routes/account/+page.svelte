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
  import {
    requestBillingPortalSession,
    requestCheckoutSession,
    type BillingOfferId,
  } from "$lib/account/billing-flow";
  import { getShellIdentityRollout } from "$lib/account/shell-identity";
  import { getSubscriptionLifecycle } from "$lib/account/subscription-lifecycle";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import {
    buildRemoteUserProfileSeed,
    loadRemoteUserProfile,
    previewRemoteUserProfileSeed,
    saveRemoteUserProfile,
    type RemoteUserProfileV1,
  } from "$lib/account/remote-profile";
  import { getRemoteProfileRole } from "$lib/account/remote-profile-gate";
  import { getRemoteProfileWritePolicy } from "$lib/account/remote-profile-write-policy";
  import { getProfileWriteRollout } from "$lib/account/profile-write-rollout";
  import {
    compareRemoteProgressStates,
    mergeRemoteProgressStates,
  } from "$lib/account/remote-progress-conflicts";
  import { getPracticeProgressSourcePolicy } from "$lib/account/remote-progress-practice-policy";
  import {
    applyRemoteProgressState,
    buildLocalRemoteProgressState,
    loadRemoteProgressState,
    saveRemoteProgressState,
    type RemoteProgressStateV1,
  } from "$lib/account/remote-progress";
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
    applyRemoteLibraryState,
    buildLocalRemoteLibraryState,
    loadRemoteLibraryState,
    RemoteLibraryWriteConflictError,
    saveRemoteLibraryState,
    type RemoteLibraryStateV1,
  } from "$lib/catalog/remote-library";
  import { getRemoteLibrarySyncPolicy } from "$lib/catalog/remote-library-sync-policy";
  import { getRemoteLibraryRecoveryPolicy } from "$lib/catalog/remote-library-recovery-policy";
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
  let authEmail = $state("");
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
  let billingActionStatus = $state<string | null>(null);
  let activeBillingOfferId = $state<BillingOfferId | null>(null);
  let billingRecoveryBusy = $state(false);
  let remoteProfile = $state<RemoteUserProfileV1 | null>(null);
  let remoteProfileError = $state<string | null>(null);
  let loadingRemoteProfile = $state(false);
  let savingRemoteProfile = $state(false);
  let remoteProfileWriteStatus = $state<string | null>(null);
  let remoteLibrary = $state<RemoteLibraryStateV1 | null>(null);
  let remoteLibraryError = $state<string | null>(null);
  let remoteLibraryStatus = $state<string | null>(null);
  let loadingRemoteLibrary = $state(false);
  let savingRemoteLibrary = $state(false);
  let remoteProgress = $state<RemoteProgressStateV1 | null>(null);
  let remoteProgressError = $state<string | null>(null);
  let remoteProgressStatus = $state<string | null>(null);
  let loadingRemoteProgress = $state(false);
  let savingRemoteProgress = $state(false);
  const localProgressSnapshot = $derived(buildLocalRemoteProgressState());
  const progressConflict = $derived(
    remoteProgress == null
      ? null
      : compareRemoteProgressStates(localProgressSnapshot, remoteProgress),
  );
  const remoteLibrarySyncPolicy = getRemoteLibrarySyncPolicy();
  const remoteLibraryRecoveryPolicy = getRemoteLibraryRecoveryPolicy();
  const practiceProgressPolicy = $derived(
    getPracticeProgressSourcePolicy({
      apiBaseUrl: subscription?.apiBaseUrl ?? "",
      remoteProfileRole: getRemoteProfileRole(session),
    }),
  );
  const remoteProfileWritePolicy = getRemoteProfileWritePolicy();
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
      void refreshRemoteLibrary();
      void refreshRemoteProgress();
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
      void refreshRemoteLibrary();
      void refreshRemoteProgress();
    } catch (e) {
      subscription = null;
      subscriptionError = e instanceof Error ? e.message : String(e);
      refreshProfile(session, null);
    }
  }

  async function remoteSignIn() {
    if (!isTauri()) return;
    busy = true;
    error = null;
    try {
      session = await invoke<AppSession>("remote_sign_in", {
        payload: {
          apiBaseUrl: subscriptionApiBase.trim(),
          email: authEmail.trim(),
          displayName: displayName.trim() || null,
        },
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
      authEmail = "";
      refreshProfile(session, subscription);
      void refreshRemoteProfile();
      void refreshRemoteLibrary();
      void refreshRemoteProgress();
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
      void refreshRemoteLibrary();
      void refreshRemoteProgress();
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
      void refreshRemoteLibrary();
      void refreshRemoteProgress();
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
        remoteProfile = await loadRemoteUserProfile({
          apiBaseUrl,
          accountId: session?.accountId ?? "",
          email: session?.email ?? "",
        });
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
        accountId: session?.accountId ?? "",
        email: session?.email ?? "",
        profile: seed,
      });
      remoteProfileWriteStatus = "Saved the current online profile fields to the signed-in cloud profile.";
    } catch (e) {
      remoteProfileError = e instanceof Error ? e.message : String(e);
    } finally {
      savingRemoteProfile = false;
    }
  }

  async function refreshRemoteLibrary() {
    if (!isTauri()) {
      remoteLibrary = null;
      return;
    }
    const apiBaseUrl = subscriptionApiBase.trim();
    if (apiBaseUrl === "" || !session?.accountId || !session.email) {
      remoteLibrary = null;
      remoteLibraryError = null;
      return;
    }
    loadingRemoteLibrary = true;
    remoteLibraryError = null;
    try {
      remoteLibrary = await loadRemoteLibraryState({
        apiBaseUrl,
        accountId: session.accountId,
        email: session.email,
      });
    } catch (e) {
      remoteLibrary = null;
      remoteLibraryError = e instanceof Error ? e.message : String(e);
    } finally {
      loadingRemoteLibrary = false;
    }
  }

  async function saveRemoteLibraryNow() {
    const apiBaseUrl = subscriptionApiBase.trim();
    if (apiBaseUrl === "" || !session?.accountId || !session.email) {
      remoteLibraryStatus = "Sign in with your email account and set a service URL before saving cloud library state.";
      return;
    }
    savingRemoteLibrary = true;
    remoteLibraryError = null;
    remoteLibraryStatus = null;
    try {
      remoteLibrary = await saveRemoteLibraryState({
        apiBaseUrl,
        accountId: session.accountId,
        email: session.email,
        state: {
          ...buildLocalRemoteLibraryState(),
          revision: remoteLibrary?.revision ?? 0,
        },
      });
      remoteLibraryStatus = "Saved favorites and collections to the signed-in cloud library.";
    } catch (e) {
      if (e instanceof RemoteLibraryWriteConflictError) {
        remoteLibrary = e.currentState;
        remoteLibraryError = null;
        remoteLibraryStatus =
          "Cloud library changed on another device. Review the latest cloud snapshot before saving again.";
        return;
      }
      remoteLibraryError = e instanceof Error ? e.message : String(e);
    } finally {
      savingRemoteLibrary = false;
    }
  }

  function applyRemoteLibraryNow() {
    if (remoteLibrary == null) {
      remoteLibraryStatus = "Load cloud library state before applying it to this device.";
      return;
    }
    const applied = applyRemoteLibraryState(remoteLibrary);
    remoteLibrary = applied;
    remoteLibraryStatus = `Applied ${applied.favorites.length} favorite${
      applied.favorites.length === 1 ? "" : "s"
    } and ${applied.collections.length} collection${applied.collections.length === 1 ? "" : "s"} to this device.`;
  }

  async function refreshRemoteProgress() {
    if (!isTauri()) {
      remoteProgress = null;
      return;
    }
    const apiBaseUrl = subscriptionApiBase.trim();
    if (apiBaseUrl === "" || !session?.accountId || !session.email) {
      remoteProgress = null;
      remoteProgressError = null;
      return;
    }
    loadingRemoteProgress = true;
    remoteProgressError = null;
    try {
      remoteProgress = await loadRemoteProgressState({
        apiBaseUrl,
        accountId: session.accountId,
        email: session.email,
      });
    } catch (e) {
      remoteProgress = null;
      remoteProgressError = e instanceof Error ? e.message : String(e);
    } finally {
      loadingRemoteProgress = false;
    }
  }

  async function saveRemoteProgressNow() {
    const apiBaseUrl = subscriptionApiBase.trim();
    if (apiBaseUrl === "" || !session?.accountId || !session.email) {
      remoteProgressStatus = "Sign in with your email account and set a service URL before saving cloud progress.";
      return;
    }
    savingRemoteProgress = true;
    remoteProgressError = null;
    remoteProgressStatus = null;
    try {
      remoteProgress = await saveRemoteProgressState({
        apiBaseUrl,
        accountId: session.accountId,
        email: session.email,
        state: buildLocalRemoteProgressState(),
      });
      remoteProgressStatus = "Saved recent sessions and path progress to the signed-in cloud account.";
    } catch (e) {
      remoteProgressError = e instanceof Error ? e.message : String(e);
    } finally {
      savingRemoteProgress = false;
    }
  }

  function applyRemoteProgressNow() {
    if (remoteProgress == null) {
      remoteProgressStatus = "Load cloud progress before applying it to this device.";
      return;
    }
    const applied = applyRemoteProgressState(remoteProgress);
    remoteProgress = applied;
    remoteProgressStatus = `Applied ${applied.sessionHistory.length} session${
      applied.sessionHistory.length === 1 ? "" : "s"
    } and ${applied.learningPathProgress.length} path progress snapshot${
      applied.learningPathProgress.length === 1 ? "" : "s"
    } to this device.`;
  }

  async function mergeRemoteProgressNow() {
    const apiBaseUrl = subscriptionApiBase.trim();
    if (remoteProgress == null) {
      remoteProgressStatus = "Load cloud progress before merging.";
      return;
    }
    if (apiBaseUrl === "" || !session?.accountId || !session.email) {
      remoteProgressStatus = "Sign in with your email account and set a service URL before merging cloud progress.";
      return;
    }
    savingRemoteProgress = true;
    remoteProgressError = null;
    remoteProgressStatus = null;
    try {
      const mergedState = mergeRemoteProgressStates(localProgressSnapshot, remoteProgress);
      const savedState = await saveRemoteProgressState({
        apiBaseUrl,
        accountId: session.accountId,
        email: session.email,
        state: mergedState,
      });
      const applied = applyRemoteProgressState(savedState);
      remoteProgress = savedState;
      remoteProgressStatus = `Merged local and cloud progress into ${applied.sessionHistory.length} total session${
        applied.sessionHistory.length === 1 ? "" : "s"
      } and saved the unified snapshot online.`;
    } catch (e) {
      remoteProgressError = e instanceof Error ? e.message : String(e);
    } finally {
      savingRemoteProgress = false;
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

  async function previewPlanIntent(planId: "free" | "pro") {
    if (planId === "free") {
      planSelectionStatus =
        "Free remains the default local-first plan until checkout and entitlement delivery are live.";
      return;
    }
    await startCheckout(planId);
  }

  async function previewPackIntent(packId: (typeof CONTENT_PACK_OFFERS)[number]["id"]): Promise<void> {
    await startCheckout(packId);
  }

  async function openBillingUrl(url: string): Promise<void> {
    if (isTauri()) {
      await openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function startCheckout(offerId: BillingOfferId): Promise<void> {
    const apiBaseUrl = subscriptionApiBase.trim();
    if (apiBaseUrl === "") {
      billingActionStatus = "Set a service URL first so Account can request a checkout session.";
      return;
    }
    if (!session?.signedIn || !session.accountId || !session.email) {
      billingActionStatus = "Sign in with your email account before starting checkout.";
      return;
    }
    activeBillingOfferId = offerId;
    billingActionStatus = null;
    try {
      const result = await requestCheckoutSession({
        apiBaseUrl,
        offerId,
        accountId: session.accountId,
        email: session.email,
        accountLabel: profile?.auth.accountLabel ?? session?.displayName ?? null,
      });
      if (result.status === "blocked") {
        billingActionStatus = `${result.summary} ${result.detail}`;
        return;
      }
      await openBillingUrl(result.launchUrl);
      billingActionStatus = `${result.summary} Opened in your browser.`;
    } catch (e) {
      billingActionStatus = e instanceof Error ? e.message : String(e);
    } finally {
      activeBillingOfferId = null;
    }
  }

  function canOpenBillingRecovery(): boolean {
    return (
      subscriptionLifecycle.status === "past_due" ||
      subscriptionLifecycle.status === "canceling" ||
      subscriptionLifecycle.status === "active" ||
      subscriptionLifecycle.status === "trialing"
    );
  }

  function billingRecoveryLabel(): string {
    switch (subscriptionLifecycle.status) {
      case "past_due":
        return "Recover billing";
      case "canceling":
        return "Manage cancellation";
      case "active":
      case "trialing":
        return "Manage billing";
      default:
        return "Open billing portal";
    }
  }

  async function openBillingRecovery(): Promise<void> {
    const apiBaseUrl = subscriptionApiBase.trim();
    if (apiBaseUrl === "") {
      billingActionStatus = "Set a service URL first so Account can request billing recovery.";
      return;
    }
    if (!session?.signedIn || !session.accountId || !session.email) {
      billingActionStatus = "Sign in with your email account before opening billing recovery.";
      return;
    }
    billingRecoveryBusy = true;
    billingActionStatus = null;
    try {
      const result = await requestBillingPortalSession({
        apiBaseUrl,
        lifecycleStatus: subscriptionLifecycle.status,
        accountId: session.accountId,
        email: session.email,
      });
      if (result.status === "blocked") {
        billingActionStatus = `${result.summary} ${result.detail}`;
        return;
      }
      await openBillingUrl(result.launchUrl);
      billingActionStatus = `${result.summary} Opened in your browser.`;
    } catch (e) {
      billingActionStatus = e instanceof Error ? e.message : String(e);
    } finally {
      billingRecoveryBusy = false;
    }
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

  function authKindLabel(authKind: string | null | undefined): string {
    if (authKind === "email") return "Email sign-in";
    if (authKind === "dev") return "Local preview";
    return authKind?.trim() || "Unknown";
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
<section class="panel panel--admin account-overview">
  <div class="account-overview__identity">
    <p class="account-overview__eyebrow">Administration</p>
    <h1>Account, billing, and sync</h1>
    <p class="muted">Identity, plan state, cloud continuity, and recovery tools live here.</p>
  </div>
  <div class="account-overview__stats">
    <div class="account-overview__stat">
      <span class="account-overview__stat-label">Identity</span>
      <strong>{profile?.auth.accountLabel ?? "Loading"}</strong>
      <span class="muted">{getShellIdentityRollout(session).summary}</span>
    </div>
    <div class="account-overview__stat">
      <span class="account-overview__stat-label">Plan</span>
      <strong>{profile?.subscription.tier ?? subscription?.tier ?? "Unknown"}</strong>
      <span class="muted">{subscriptionLifecycle.badgeLabel} · {subscriptionLifecycle.billingMomentValue}</span>
    </div>
    <div class="account-overview__stat">
      <span class="account-overview__stat-label">Queued activity</span>
      <strong>{profile?.analytics.pendingEvents ?? pendingAnalyticsEvents}</strong>
      <span class="muted">Local activity still waiting for delivery.</span>
    </div>
    <div class="account-overview__stat">
      <span class="account-overview__stat-label">Cloud role</span>
      <strong>{getRemoteProfileRole(session) === "primary_profile_source" ? "Primary" : "Preview"}</strong>
      <span class="muted">{getRemoteProfileRole(session) === "primary_profile_source" ? "Remote profile can drive product surfaces." : "Cloud profile remains secondary until auth is authoritative."}</span>
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
      <div class="panel panel--admin account-panel">
        <div class="ff-section-header account-panel__header">
          <div>
            <p class="ff-section-eyebrow">Player profile</p>
            <h2>Profile</h2>
            <p class="muted ff-section-intro account-panel__intro">Identity, recommended path, and daily-goal context.</p>
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

      <div class="panel panel--admin account-panel">
        <div class="ff-section-header account-panel__header">
          <div>
            <p class="ff-section-eyebrow">Sign-in</p>
            <h2>Session</h2>
            <p class="muted ff-section-intro account-panel__intro">Sign in, sign out, and confirm which identity is active on this device.</p>
          </div>
        </div>

        {#if session && profile}
          {#if profile.auth.signedIn}
            <p style="margin: 0 0 0.5rem">
              Signed in through <strong>{authKindLabel(profile.auth.authKind)}</strong>
              {#if profile.auth.displayName}
                · {profile.auth.displayName}
              {/if}
            </p>
            {#if session.email}
              <p class="muted" style="margin: 0 0 0.5rem; font-size: 0.88rem">
                {session.email}
              </p>
            {/if}
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
            <p class="muted account-footnote">
              This uses the same service URL configured below and creates a non-dev account session so profile, catalog, and billing rollout decisions can follow a real identity.
            </p>
            <label class="account-field">
              <span class="muted">Email</span>
              <input
                type="email"
                bind:value={authEmail}
                placeholder="you@example.com"
                disabled={busy}
                class="account-input"
              />
            </label>
            <label class="account-field">
              <span class="muted">Display name (optional)</span>
              <input
                type="text"
                bind:value={displayName}
                placeholder="e.g. Mario"
                disabled={busy}
                class="account-input"
              />
            </label>
            <button
              type="button"
              class="btn btn-primary"
              onclick={remoteSignIn}
              disabled={busy || subscriptionApiBase.trim() === "" || authEmail.trim() === ""}
            >
              {busy ? "Connecting…" : "Sign in with email"}
            </button>
            {#if subscriptionApiBase.trim() === ""}
              <p class="muted account-footnote">Set a service URL below before signing in.</p>
            {/if}
          {/if}
        {:else}
          <p class="muted" style="margin: 0">Loading session…</p>
        {/if}
      </div>

      <div class="panel panel--admin account-panel">
        <div class="ff-section-header account-panel__header">
          <div>
            <p class="ff-section-eyebrow">Plan and delivery</p>
            <h2>Subscription</h2>
            <p class="muted ff-section-intro account-panel__intro">Plan status, billing connectivity, and pending activity delivery.</p>
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

          {#if canOpenBillingRecovery()}
            <div class="account-actions">
              <button
                type="button"
                class="btn"
                class:btn-primary={subscriptionLifecycle.status === "past_due"}
                onclick={() => void openBillingRecovery()}
                disabled={billingRecoveryBusy}
              >
                {billingRecoveryBusy ? "Opening…" : billingRecoveryLabel()}
              </button>
            </div>
          {/if}

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
                  onclick={() => void previewPlanIntent(offer.id)}
                  disabled={isCurrentPlan || activeBillingOfferId === offer.id}
                >
                  {#if isCurrentPlan}
                    Current plan
                  {:else if activeBillingOfferId === offer.id}
                    Opening…
                  {:else if offer.id === "pro"}
                    Start checkout
                  {:else}
                    Keep free
                  {/if}
                </button>
              </div>
            {/each}
          </div>

          <div class="content-pack-section">
            <div class="ff-section-header account-panel__header">
              <div>
                <p class="ff-section-eyebrow">Optional packaging</p>
                <h3>Optional content packs</h3>
                <p class="muted ff-section-intro account-panel__intro">One-off packs keep premium from becoming a single all-or-nothing wall.</p>
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
                    <span class="status-pill status-pill--warning">One-off</span>
                  </div>
                  <div class="plan-card__price">{pack.priceLabel}</div>
                  <p class="muted plan-card__summary">{pack.summary}</p>
                  <p class="account-footnote">
                    Includes {pack.includedTrackIds.length} premium preview track{pack.includedTrackIds.length === 1 ? "" : "s"} in the current scaffold.
                  </p>
                  <button
                    type="button"
                    class="btn"
                    onclick={() => void previewPackIntent(pack.id)}
                    disabled={activeBillingOfferId === pack.id}
                  >
                    {activeBillingOfferId === pack.id ? "Opening…" : "Start checkout"}
                  </button>
                </div>
              {/each}
            </div>
          </div>

          {#if planSelectionStatus}
            <p class="muted account-footnote">{planSelectionStatus}</p>
          {/if}
          {#if billingActionStatus}
            <p class="muted account-footnote">{billingActionStatus}</p>
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
      <div class="panel panel--quiet account-panel account-panel--diagnostics">
        <div class="ff-section-header account-panel__header">
          <div>
            <p class="ff-section-eyebrow">Diagnostics</p>
            <h2>Rollout preview</h2>
            <p class="muted ff-section-intro account-panel__intro">Secondary rollout and recovery controls stay here.</p>
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
                  These are the only cloud-editable profile fields for now. The online profile is intentionally staying narrow while auth, billing, and conflict handling continue to settle.
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
                  <p class="muted account-footnote">
                    <strong>{remoteProfileWritePolicy.summary}</strong><br />
                    {remoteProfileWritePolicy.detail}<br />
                    Next: {remoteProfileWritePolicy.nextRequirement}
                  </p>
                  {#if remoteProfileWriteStatus}
                    <p class="muted account-footnote">{remoteProfileWriteStatus}</p>
                  {/if}
                  {#if remoteProfileError}
                    <p class="account-error">{remoteProfileError}</p>
                  {:else if remoteProfile}
                    <p class="muted">
                      Preview source: <strong>{remoteProfile.seedSource === "frontend_preview" ? "Current device seed" : remoteProfile.seedSource === "backend_persisted" ? "Saved cloud profile" : "Account seed"}</strong><br />
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

              <div class="policy-group">
                <div class="policy-item">
                  <div class="policy-item__header">
                    <strong>Cloud library sync</strong>
                  </div>
                  <p class="muted account-panel__intro">
                    Favorites and collections now sync automatically from Library when a real signed-in cloud identity is active. Imported-chart organization stays local to this device.
                  </p>
                  <p class="muted account-footnote">
                    <strong>{remoteLibrarySyncPolicy.summary}</strong><br />
                    {remoteLibrarySyncPolicy.detail}<br />
                    Next: {remoteLibrarySyncPolicy.nextRequirement}
                  </p>
                  <p class="muted account-footnote">
                    <strong>{remoteLibraryRecoveryPolicy.summary}</strong><br />
                    {remoteLibraryRecoveryPolicy.detail}<br />
                    Use when: {remoteLibraryRecoveryPolicy.whenToUse}
                  </p>
                  {#if remoteLibraryStatus}
                    <p class="muted account-footnote">{remoteLibraryStatus}</p>
                  {/if}
                  {#if remoteLibraryError}
                    <p class="account-error">{remoteLibraryError}</p>
                  {:else if remoteLibrary}
                    <p class="muted">
                      Cloud revision: <strong>{remoteLibrary.revision}</strong><br />
                      Cloud favorites: <strong>{remoteLibrary.favorites.length}</strong><br />
                      Cloud collections: <strong>{remoteLibrary.collections.length}</strong>
                    </p>
                  {:else}
                    <p class="muted">No cloud library snapshot loaded yet.</p>
                  {/if}
                  <details class="account-disclosure ff-disclosure" style="margin-top: 1rem">
                    <summary>Manual recovery tools</summary>
                    <div class="account-disclosure__body ff-disclosure__body">
                      <div class="account-actions">
                        <button
                          type="button"
                          class="btn"
                          onclick={refreshRemoteLibrary}
                          disabled={loadingRemoteLibrary || savingRemoteLibrary}
                        >
                          {loadingRemoteLibrary ? "Loading…" : "Load cloud snapshot"}
                        </button>
                        <button
                          type="button"
                          class="btn"
                          onclick={() => void saveRemoteLibraryNow()}
                          disabled={savingRemoteLibrary || loadingRemoteLibrary}
                        >
                          {savingRemoteLibrary ? "Saving…" : "Save this device snapshot"}
                        </button>
                        <button
                          type="button"
                          class="btn"
                          onclick={applyRemoteLibraryNow}
                          disabled={remoteLibrary == null || loadingRemoteLibrary || savingRemoteLibrary}
                        >
                          Restore cloud snapshot here
                        </button>
                      </div>
                      <p class="muted account-panel__intro">
                        These controls are intentionally secondary now. Use them to inspect the server copy, force-push the current device state, or restore the latest cloud snapshot after a conflict.
                      </p>
                    </div>
                  </details>
                </div>
              </div>

              <div class="policy-group">
                <div class="policy-item">
                  <div class="policy-item__header">
                    <strong>Cloud progress state</strong>
                    <div class="account-actions">
                      <button
                        type="button"
                        class="btn"
                        onclick={refreshRemoteProgress}
                        disabled={loadingRemoteProgress || savingRemoteProgress}
                      >
                        {loadingRemoteProgress ? "Loading…" : "Load cloud progress"}
                      </button>
                      <button
                        type="button"
                        class="btn"
                        onclick={() => void saveRemoteProgressNow()}
                        disabled={savingRemoteProgress || loadingRemoteProgress}
                      >
                        {savingRemoteProgress ? "Saving…" : "Save cloud progress"}
                      </button>
                      <button
                        type="button"
                        class="btn"
                        onclick={() => void mergeRemoteProgressNow()}
                        disabled={remoteProgress == null || savingRemoteProgress || loadingRemoteProgress}
                      >
                        {savingRemoteProgress ? "Saving…" : "Merge and save"}
                      </button>
                      <button
                        type="button"
                        class="btn"
                        onclick={applyRemoteProgressNow}
                        disabled={remoteProgress == null || loadingRemoteProgress || savingRemoteProgress}
                      >
                        Apply to this device
                      </button>
                    </div>
                  </div>
                  <p class="muted account-panel__intro">
                    Practice history and guided path progress are the first cloud continuity layer after profile and library state. This keeps cross-device momentum visible without yet moving every practice preset online.
                  </p>
                  <p class="muted account-footnote">
                    <strong>{practiceProgressPolicy.summary}</strong><br />
                    {practiceProgressPolicy.detail}
                  </p>
                  {#if remoteProgressStatus}
                    <p class="muted account-footnote">{remoteProgressStatus}</p>
                  {/if}
                  {#if remoteProgressError}
                    <p class="account-error">{remoteProgressError}</p>
                  {:else if remoteProgress}
                    {#if progressConflict}
                      <p class="muted account-footnote">
                        <strong>{progressConflict.summary}</strong><br />
                        {progressConflict.detail}
                      </p>
                      <p class="muted account-footnote">
                        Local sessions: <strong>{progressConflict.localSessionCount}</strong>
                        · Cloud sessions: <strong>{progressConflict.remoteSessionCount}</strong>
                        · Local only: <strong>{progressConflict.localOnlySessions}</strong>
                        · Cloud only: <strong>{progressConflict.remoteOnlySessions}</strong>
                      </p>
                    {/if}
                    <p class="muted">
                      Cloud sessions: <strong>{remoteProgress.sessionHistory.length}</strong><br />
                      Cloud path summaries: <strong>{remoteProgress.learningPathProgress.length}</strong><br />
                      Cloud revision: <strong>{remoteProgress.revision}</strong><br />
                      Last cloud update: <strong>{remoteProgress.lastUpdatedAt === new Date(0).toISOString() ? "Never" : new Date(remoteProgress.lastUpdatedAt).toLocaleString()}</strong>
                    </p>
                  {:else}
                    <p class="muted">No cloud progress snapshot loaded yet.</p>
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
  .account-overview {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(24rem, 1fr);
    gap: 1rem;
    align-items: start;
    padding: 1rem 1.1rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 34%),
      linear-gradient(180deg, rgba(20, 18, 22, 0.96), rgba(12, 10, 13, 0.98));
  }
  .account-overview__identity {
    display: grid;
    gap: 0.3rem;
    align-content: start;
  }
  .account-overview__eyebrow {
    margin: 0;
    color: var(--ff-highlight-strong);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .account-overview__identity h1 {
    margin: 0;
    font-size: clamp(1.4rem, 2.2vw, 1.9rem);
    line-height: 1.02;
    letter-spacing: -0.03em;
  }
  .account-overview__identity p {
    margin: 0;
    max-width: 42rem;
  }
  .account-overview__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
  }
  .account-overview__stat {
    display: grid;
    gap: 0.22rem;
    padding: 0.85rem 0.95rem;
    border-radius: 16px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 36%),
      rgba(7, 7, 9, 0.22);
  }
  .account-overview__stat-label {
    color: var(--ff-muted);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .account-overview__stat strong {
    font-size: 0.98rem;
    line-height: 1.25;
  }
  .account-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(19rem, 0.78fr);
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
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.022), transparent 34%),
      linear-gradient(180deg, rgba(18, 16, 20, 0.96), rgba(11, 10, 13, 0.98));
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
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
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
    .account-overview,
    .account-layout {
      grid-template-columns: 1fr;
    }
    .account-overview__stats {
      grid-template-columns: 1fr;
    }
  }
</style>
