<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { loadActiveCatalogSnapshot } from "$lib/catalog/active-catalog";
  import {
    CONTENT_PACK_OFFERS,
    describeTrackPremiumAccess,
  } from "$lib/account/plan-offers";
  import { loadRemoteProgressState } from "$lib/account/remote-progress";
  import { selectRemoteProgressSurfaceHistory } from "$lib/account/remote-progress-surface-source";
  import { getRemoteProgressSurfaceRollout } from "$lib/account/remote-progress-surface-rollout";
  import { getSubscriptionLifecycle } from "$lib/account/subscription-lifecycle";
  import {
    findCatalogTrackById,
    getCatalogSnapshot,
    loadCatalogSnapshot,
  } from "$lib/catalog/catalog-service";
  import { getCatalogSourcePreference } from "$lib/catalog/catalog-source";
  import { getCatalogSourceRollout, resolveCatalogSourceMode } from "$lib/catalog/catalog-rollout";
  import {
    LEARNING_PATHS,
    getLearningPathById,
    getLearningPathTrackIds,
    type LearningPathId,
  } from "$lib/catalog/learning-paths";
  import { getRemoteProfileRole } from "$lib/account/remote-profile-gate";
  import { getCatalogTrackAccess } from "$lib/catalog/entitlement-overlay";
  import {
    createCollection,
    deleteCollection,
    getCollections,
    removeTrackFromCollections,
    toggleTrackInCollection,
    type ChartCollectionV1,
  } from "$lib/catalog/collections";
  import {
    getFavoriteTrackIds,
    removeFavoriteTrackId,
    toggleFavoriteTrackId,
  } from "$lib/catalog/favorites";
  import { autoSyncRemoteLibraryMutations } from "$lib/catalog/remote-library-auto-sync";
  import { getRemoteLibraryHydrationDecision } from "$lib/catalog/remote-library-hydration";
  import { getRemoteLibrarySyncRollout } from "$lib/catalog/remote-library-sync-rollout";
  import {
    applyRemoteLibraryState,
    buildLocalRemoteLibraryState,
    loadRemoteLibraryState,
    type RemoteLibraryStateV1,
  } from "$lib/catalog/remote-library";
  import { midiBufferToChart } from "$lib/catalog/midi-import";
  import { getRecommendedTracks, type RecommendedTrack } from "$lib/catalog/recommendations";
  import { addUserChart, getUserCharts, removeUserChart, type UserChartEntry } from "$lib/catalog/user-charts";
  import { getLatestSessionsByTrackId, loadSessionHistory, type SessionSummaryV1 } from "$lib/chart/session-storage";
  import { markOnboardingStepCompleted } from "$lib/onboarding-storage";
  import type { AppSession, SubscriptionState } from "$lib/ipc";
  import type { CatalogSkillTag, CatalogTechniqueTag, CatalogTrackStub } from "$lib/catalog/types";
  import { isTauri } from "$lib/tauri-env";
  import { validateChart } from "$lib/chart/validate";

  type Filter = "all" | "free" | "premium" | "recent" | "favorites" | "collections" | "mine";
  type PathFilter = LearningPathId | "all";
  type FavoriteRow =
    | { kind: "catalog"; id: string; track: CatalogTrackStub }
    | { kind: "user"; id: string; entry: UserChartEntry };
  type RecentRow = FavoriteRow & { recentSession: SessionSummaryV1 };
  type CollectionRow = FavoriteRow;
  const FILTERS = ["all", "free", "premium", "recent", "favorites", "collections", "mine"] as const;
  const initialCollections = getCollections();
  const initialCatalog = getCatalogSnapshot();

  let filter = $state<Filter>("all");
  let catalogTracks = $state<CatalogTrackStub[]>(initialCatalog.tracks);
  let userCharts = $state<UserChartEntry[]>(getUserCharts());
  let favoriteTrackIds = $state<string[]>(getFavoriteTrackIds());
  const initialHistory = loadSessionHistory();
  let latestSessionByTrackId = $state<Record<string, SessionSummaryV1>>(getLatestSessionsByTrackId(initialHistory));
  let recommendedTracks = $state<RecommendedTrack[]>(getRecommendedTracks(initialHistory, 3));
  let progressSource = $state<"local" | "cloud" | "merged">("local");
  let collections = $state<ChartCollectionV1[]>(initialCollections);
  let session = $state<AppSession | null>(null);
  let subscription = $state<SubscriptionState | null>(null);
  let remoteLibraryState = $state<RemoteLibraryStateV1 | null>(null);
  let remoteLibraryStatus = $state<string | null>(null);
  let remoteLibraryError = $state<string | null>(null);
  let hydratedRemoteLibraryAccountKey = $state<string | null>(null);
  let activeCollectionId = $state<string | null>(initialCollections[0]?.id ?? null);
  let activePathId = $state<PathFilter>("all");
  let activeSkillTag = $state<CatalogSkillTag | null>(null);
  let activeTechniqueTag = $state<CatalogTechniqueTag | null>(null);
  let newCollectionName = $state("");
  let importError = $state<string | null>(null);
  let importWarnings = $state<string[]>([]);
  let skillTags = $state<CatalogSkillTag[]>(initialCatalog.skillTags);
  let techniqueTags = $state<CatalogTechniqueTag[]>(initialCatalog.techniqueTags);
  let catalogSourceMode = $state(initialCatalog.sourceMode);
  let catalogMigrationLabel = $state(initialCatalog.migrationTarget.label);
  let onlinePremiumPlayable = $state(initialCatalog.migrationTarget.includesPlayablePremiumTracks);
  const premiumPreviewTrackCount = initialCatalog.tracks.filter((track) => track.tier === "premium").length;
  const remoteLibrarySyncRollout = $derived(
    getRemoteLibrarySyncRollout({
      apiBaseUrl: subscription?.apiBaseUrl ?? "",
      remoteProfileRole: getRemoteProfileRole(session),
    }),
  );

  function isFilter(value: string | null): value is Filter {
    return value != null && (FILTERS as readonly string[]).includes(value);
  }

  function filterFromUrl(): Filter {
    const requested = page.url.searchParams.get("filter");
    return isFilter(requested) ? requested : "all";
  }

  function collectionFromUrl(): string | null {
    const requested = page.url.searchParams.get("collection");
    if (requested == null || requested.trim() === "") return null;
    return requested;
  }

  function isPathFilter(value: string | null): value is LearningPathId {
    return value != null && LEARNING_PATHS.some((path) => path.id === value);
  }

  function pathFromUrl(): PathFilter {
    const requested = page.url.searchParams.get("path");
    return isPathFilter(requested) ? requested : "all";
  }

  function skillFromUrl(): CatalogSkillTag | null {
    const requested = page.url.searchParams.get("skill");
    const available = new Set(skillTags);
    return requested != null && available.has(requested as CatalogSkillTag) ? (requested as CatalogSkillTag) : null;
  }

  function techniqueFromUrl(): CatalogTechniqueTag | null {
    const requested = page.url.searchParams.get("technique");
    const available = new Set(techniqueTags);
    return requested != null && available.has(requested as CatalogTechniqueTag)
      ? (requested as CatalogTechniqueTag)
      : null;
  }

  function updateLibraryUrl(next: {
    filter?: Filter;
    collectionId?: string | null;
    pathId?: PathFilter;
    skillTag?: CatalogSkillTag | null;
    techniqueTag?: CatalogTechniqueTag | null;
  }) {
    const resolvedFilter = next.filter ?? filter;
    const resolvedCollectionId =
      Object.prototype.hasOwnProperty.call(next, "collectionId") ? next.collectionId ?? null : activeCollectionId;
    const resolvedPathId =
      Object.prototype.hasOwnProperty.call(next, "pathId") ? next.pathId ?? "all" : activePathId;
    const resolvedSkillTag =
      Object.prototype.hasOwnProperty.call(next, "skillTag") ? next.skillTag ?? null : activeSkillTag;
    const resolvedTechniqueTag =
      Object.prototype.hasOwnProperty.call(next, "techniqueTag") ? next.techniqueTag ?? null : activeTechniqueTag;
    const url = new URL(page.url);
    if (resolvedFilter === "all") {
      url.searchParams.delete("filter");
    } else {
      url.searchParams.set("filter", resolvedFilter);
    }
    if (resolvedCollectionId == null || resolvedCollectionId === "") {
      url.searchParams.delete("collection");
    } else {
      url.searchParams.set("collection", resolvedCollectionId);
    }
    if (resolvedPathId === "all") {
      url.searchParams.delete("path");
    } else {
      url.searchParams.set("path", resolvedPathId);
    }
    if (resolvedSkillTag == null) {
      url.searchParams.delete("skill");
    } else {
      url.searchParams.set("skill", resolvedSkillTag);
    }
    if (resolvedTechniqueTag == null) {
      url.searchParams.delete("technique");
    } else {
      url.searchParams.set("technique", resolvedTechniqueTag);
    }
    filter = resolvedFilter;
    activeCollectionId = resolvedCollectionId;
    activePathId = resolvedPathId;
    activeSkillTag = resolvedSkillTag;
    activeTechniqueTag = resolvedTechniqueTag;
    void goto(url.pathname + url.search, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function setFilter(next: Filter) {
    updateLibraryUrl({ filter: next });
  }

  function setActiveCollection(next: string | null) {
    updateLibraryUrl({ collectionId: next });
  }

  function setActivePath(next: PathFilter) {
    updateLibraryUrl({ pathId: next });
  }

  function setActiveSkillTag(next: CatalogSkillTag | null) {
    updateLibraryUrl({ skillTag: next });
  }

  function setActiveTechniqueTag(next: CatalogTechniqueTag | null) {
    updateLibraryUrl({ techniqueTag: next });
  }

  function applyHistorySurface(history: SessionSummaryV1[], source: "local" | "cloud" | "merged"): void {
    latestSessionByTrackId = getLatestSessionsByTrackId(history);
    recommendedTracks = getRecommendedTracks(
      history,
      3,
      catalogTracks.filter((track) => track.practiceChartKey === "bundled"),
    );
    progressSource = source;
  }

  function progressSourceLabel(): string {
    switch (progressSource) {
      case "cloud":
        return "Using cloud progress.";
      case "merged":
        return "Using a merged local + cloud view.";
      case "local":
        return "Using this device's local history.";
    }
  }

  function currentRemoteLibraryAccountKey(): string | null {
    if (session?.accountId == null || session.email == null) return null;
    return `${session.accountId}:${session.email.trim().toLowerCase()}`;
  }

  const filtered = $derived.by(() => {
    if (filter === "mine") return [];
    if (filter === "favorites") return [];
    if (filter === "recent") return [];
    if (filter === "collections") return [];
    const base = filter === "all" ? catalogTracks : catalogTracks.filter((t) => t.tier === filter);
    return base.filter((track) => {
      if (activePathId !== "all" && !getLearningPathTrackIds(activePathId).includes(track.id)) {
        return false;
      }
      if (activeSkillTag != null && !(track.skillTags ?? []).includes(activeSkillTag)) {
        return false;
      }
      if (activeTechniqueTag != null && !(track.techniqueTags ?? []).includes(activeTechniqueTag)) {
        return false;
      }
      return true;
    });
  });

  const favoriteRows = $derived.by<FavoriteRow[]>(() => {
    const catalogRows = favoriteTrackIds
      .map((id) => findCatalogTrackById(id))
      .filter((track): track is CatalogTrackStub => track != null)
      .map((track) => ({ kind: "catalog", id: track.id, track }) as const);
    const userRows = favoriteTrackIds
      .map((id) => userCharts.find((entry) => entry.id === id))
      .filter((entry): entry is UserChartEntry => entry != null)
      .map((entry) => ({ kind: "user", id: entry.id, entry }) as const);
    return [...catalogRows, ...userRows];
  });

  const recentRows = $derived.by<RecentRow[]>(() => {
    const rows = Object.entries(latestSessionByTrackId)
      .map(([id, recentSession]) => {
        const track = findCatalogTrackById(id);
        if (track) {
          return { kind: "catalog", id, track, recentSession } as const;
        }
        const entry = userCharts.find((userChart) => userChart.id === id);
        if (entry) {
          return { kind: "user", id, entry, recentSession } as const;
        }
        return null;
      })
      .filter((row): row is RecentRow => row != null);
    rows.sort((a, b) => Date.parse(b.recentSession.at) - Date.parse(a.recentSession.at));
    return rows;
  });

  const activeCollection = $derived(
    activeCollectionId == null
      ? null
      : collections.find((collection) => collection.id === activeCollectionId) ?? null,
  );

  function isBrowseFilter(value: Filter): boolean {
    return value === "all" || value === "free" || value === "premium";
  }

  function filterLabel(value: Filter): string {
    return value === "all"
      ? "All charts"
      : value === "free"
        ? "Free starter charts"
        : value === "premium"
          ? "Premium previews"
          : value === "recent"
            ? "Recent practice"
            : value === "favorites"
              ? "Favorites"
              : value === "collections"
                ? "Collections"
                : "My charts";
  }

  function activeNarrowingLabel(): string {
    if (activePathId !== "all") {
      return getLearningPathById(activePathId)?.title ?? "Path filter";
    }
    if (activeSkillTag != null) {
      return `Skill: ${formatTagLabel(activeSkillTag)}`;
    }
    if (activeTechniqueTag != null) {
      return `Technique: ${formatTagLabel(activeTechniqueTag)}`;
    }
    return "No curriculum narrowing";
  }

  function visibleResultCount(): number {
    switch (filter) {
      case "recent":
        return recentRows.length;
      case "favorites":
        return favoriteRows.length;
      case "collections":
        return collectionRows.length;
      case "mine":
        return userCharts.length;
      default:
        return filtered.length;
    }
  }

  const collectionRows = $derived.by<CollectionRow[]>(() => {
    const collection = activeCollection;
    if (collection == null) return [];
    return collection.trackIds
      .map((id) => {
        const track = findCatalogTrackById(id);
        if (track) {
          return { kind: "catalog", id, track } as const;
        }
        const entry = userCharts.find((userChart) => userChart.id === id);
        if (entry) {
          return { kind: "user", id, entry } as const;
        }
        return null;
      })
      .filter((row): row is CollectionRow => row != null);
  });

  function trackAccess(track: CatalogTrackStub) {
    return getCatalogTrackAccess(track, subscription);
  }

  function isLocked(t: CatalogTrackStub): boolean {
    const access = trackAccess(t);
    return access.isPremiumLocked || access.isComingSoon;
  }

  function isPremiumPreview(t: CatalogTrackStub): boolean {
    return trackAccess(t).isPremiumLocked;
  }

  function canOpenInPractice(t: CatalogTrackStub): boolean {
    return trackAccess(t).canPractice;
  }

  function openInPractice(t: CatalogTrackStub) {
    if (!canOpenInPractice(t)) return;
    markOnboardingStepCompleted("library");
    void goto(`/practice?track=${encodeURIComponent(t.id)}`);
  }

  function openAccount() {
    void goto("/account");
  }

  function premiumPreviewSummary(): string {
    const lifecycle = getSubscriptionLifecycle(subscription);
    if (catalogSourceMode === "remote_api" && onlinePremiumPlayable && subscription?.entitled) {
      return `${lifecycle.badgeLabel}: the online catalog is active and entitled premium rows can open in Practice.`;
    }
    if (catalogSourceMode === "remote_api" && onlinePremiumPlayable) {
      return `${lifecycle.badgeLabel}: the online catalog is serving playable premium rows, but this device still needs an active entitlement.`;
    }
    if (lifecycle.status === "trialing" || lifecycle.status === "active") {
      return `${lifecycle.badgeLabel}: premium rows are still previews, but this account is already in the paid-state path.`;
    }
    if (lifecycle.tone === "warning" || lifecycle.tone === "grace") {
      return `${lifecycle.badgeLabel}: premium previews are visible, but access should stay conservative until billing stabilizes.`;
    }
    return "Premium songs are still a preview in this version. Plans and packs are visible, but playable unlocks are not live yet.";
  }

  function premiumTrackAccessLabel(track: CatalogTrackStub): string | null {
    return describeTrackPremiumAccess(track);
  }

  function openUserChart(entry: UserChartEntry) {
    markOnboardingStepCompleted("library");
    void goto(`/practice?track=${encodeURIComponent(entry.id)}`);
  }

  function deleteUserChart(entry: UserChartEntry) {
    removeUserChart(entry.id);
    userCharts = getUserCharts();
    favoriteTrackIds = removeFavoriteTrackId(entry.id);
    collections = removeTrackFromCollections(entry.id);
  }

  async function syncCloudLibraryMutation(options: {
    mutations: Parameters<typeof autoSyncRemoteLibraryMutations>[0]["mutations"];
    successStatus: string;
    conflictStatus?: string;
    localOnlyStatus?: string;
  }) {
    if (
      !remoteLibrarySyncRollout.ready ||
      session?.accountId == null ||
      session.email == null
    ) {
      return;
    }
    remoteLibraryError = null;
    try {
      const result = await autoSyncRemoteLibraryMutations({
        apiBaseUrl: subscription?.apiBaseUrl ?? "",
        accountId: session.accountId,
        email: session.email,
        currentRemoteState: remoteLibraryState,
        mutations: options.mutations,
      });
      remoteLibraryState = result.state;
      if (result.status === "skipped_local_only") {
        remoteLibraryStatus =
          options.localOnlyStatus ?? "Imported-chart library changes stay on this device.";
        return;
      }
      remoteLibraryStatus =
        result.status === "replayed_after_conflict"
          ? options.conflictStatus ?? "Cloud library was refreshed and your latest change was replayed."
          : options.successStatus;
    } catch (error) {
      remoteLibraryError = error instanceof Error ? error.message : String(error);
    }
  }

  async function hydrateRemoteLibraryOnReady(): Promise<void> {
    if (
      !remoteLibrarySyncRollout.ready ||
      session?.accountId == null ||
      session.email == null
    ) {
      hydratedRemoteLibraryAccountKey = null;
      return;
    }
    const accountKey = currentRemoteLibraryAccountKey();
    if (accountKey == null || hydratedRemoteLibraryAccountKey === accountKey) {
      return;
    }
    hydratedRemoteLibraryAccountKey = accountKey;
    remoteLibraryError = null;
    try {
      const remoteState = await loadRemoteLibraryState({
        apiBaseUrl: subscription?.apiBaseUrl ?? "",
        accountId: session.accountId,
        email: session.email,
      });
      remoteLibraryState = remoteState;
      const decision = getRemoteLibraryHydrationDecision({
        localState: buildLocalRemoteLibraryState(),
        remoteState,
      });
      if (decision.action === "apply_remote") {
        const applied = applyRemoteLibraryState(remoteState);
        favoriteTrackIds = getFavoriteTrackIds();
        collections = getCollections();
        remoteLibraryState = applied;
        if (activeCollectionId != null && !collections.some((collection) => collection.id === activeCollectionId)) {
          setActiveCollection(collections[0]?.id ?? null);
        }
      }
      remoteLibraryStatus = decision.status;
    } catch (error) {
      remoteLibraryError = error instanceof Error ? error.message : String(error);
    }
  }

  function toggleFavorite(trackId: string) {
    favoriteTrackIds = toggleFavoriteTrackId(trackId);
    const nextValue = favoriteTrackIds.includes(trackId);
    void syncCloudLibraryMutation({
      mutations: [{ kind: "favorite_set", trackId, value: nextValue }],
      successStatus: nextValue
        ? "Favorite synced to your cloud library."
        : "Favorite removal synced to your cloud library.",
    });
  }

  function isFavorite(trackId: string): boolean {
    return favoriteTrackIds.includes(trackId);
  }

  function latestSessionForTrack(trackId: string): SessionSummaryV1 | null {
    return latestSessionByTrackId[trackId] ?? null;
  }

  function recommendedTrackFor(trackId: string): RecommendedTrack | null {
    return recommendedTracks.find((item) => item.track.id === trackId) ?? null;
  }

  function trackFocusLabel(track: CatalogTrackStub): string | null {
    const technique = track.techniqueTags?.[0];
    if (technique) {
      return technique.replaceAll("_", " ");
    }
    const skill = track.skillTags?.[0];
    return skill ? skill.replaceAll("_", " ") : null;
  }

  function formatTagLabel(value: string): string {
    return value.replaceAll("_", " ");
  }

  function formatDuration(durationSec: number): string {
    return durationSec < 60
      ? `${durationSec}s`
      : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;
  }

  function prerequisiteTracks(track: CatalogTrackStub): CatalogTrackStub[] {
    return (track.prerequisiteTrackIds ?? [])
      .map((trackId) => findCatalogTrackById(trackId))
      .filter((entry): entry is CatalogTrackStub => entry != null);
  }

  onMount(() => {
    void (async () => {
      applyHistorySurface(initialHistory, "local");
      if (isTauri()) {
        try {
          subscription = await invoke<SubscriptionState>("get_subscription_state");
        } catch {
          subscription = null;
        }
        try {
          session = await invoke<AppSession>("get_session");
        } catch {
          session = null;
        }
      }
      const refreshedSnapshot = await loadActiveCatalogSnapshot({
        session,
        subscription,
      });
      catalogTracks = refreshedSnapshot.tracks;
      skillTags = refreshedSnapshot.skillTags;
      techniqueTags = refreshedSnapshot.techniqueTags;
      catalogSourceMode = refreshedSnapshot.sourceMode;
      catalogMigrationLabel = refreshedSnapshot.migrationTarget.label;
      onlinePremiumPlayable = refreshedSnapshot.migrationTarget.includesPlayablePremiumTracks;
      const progressRollout = getRemoteProgressSurfaceRollout({
        apiBaseUrl: subscription?.apiBaseUrl ?? "",
        remoteProfileRole: getRemoteProfileRole(session),
      });
      if (!progressRollout.ready || session?.accountId == null || session.email == null) {
        applyHistorySurface(loadSessionHistory(), "local");
        return;
      }
      try {
        const remoteProgress = await loadRemoteProgressState({
          apiBaseUrl: subscription?.apiBaseUrl ?? "",
          accountId: session.accountId,
          email: session.email,
        });
        const localHistory = loadSessionHistory();
        const selection = selectRemoteProgressSurfaceHistory(localHistory, remoteProgress);
        applyHistorySurface(selection.history, selection.source);
      } catch {
        applyHistorySurface(loadSessionHistory(), "local");
      }
    })();
  });

  $effect(() => {
    if (
      !remoteLibrarySyncRollout.ready ||
      session?.accountId == null ||
      session.email == null
    ) {
      hydratedRemoteLibraryAccountKey = null;
      return;
    }
    void hydrateRemoteLibraryOnReady();
  });

  function trackIsInActiveCollection(trackId: string): boolean {
    return activeCollection?.trackIds.includes(trackId) ?? false;
  }

  function toggleTrackInActiveCollection(trackId: string) {
    if (activeCollectionId == null) return;
    collections = toggleTrackInCollection(activeCollectionId, trackId);
    const collection = collections.find((entry) => entry.id === activeCollectionId);
    const nextValue = collection?.trackIds.includes(trackId) ?? false;
    void syncCloudLibraryMutation({
      mutations: [{ kind: "collection_track_set", collectionId: activeCollectionId, trackId, value: nextValue }],
      successStatus: nextValue
        ? "Collection change synced to your cloud library."
        : "Collection removal synced to your cloud library.",
    });
  }

  function createCollectionFromInput() {
    if (newCollectionName.trim() === "") return;
    const nextCollections = createCollection(newCollectionName);
    const createdCollection = nextCollections[0] ?? null;
    collections = nextCollections;
    setActiveCollection(nextCollections[0]?.id ?? null);
    if (createdCollection) {
      void syncCloudLibraryMutation({
        mutations: [
          {
            kind: "collection_create",
            collectionId: createdCollection.id,
            name: createdCollection.name,
            createdAt: createdCollection.createdAt,
          },
        ],
        successStatus: "Collection synced to your cloud library.",
      });
    }
    newCollectionName = "";
  }

  function removeActiveCollection() {
    if (activeCollectionId == null) return;
    const collectionId = activeCollectionId;
    const nextCollections = deleteCollection(activeCollectionId);
    collections = nextCollections;
    setActiveCollection(nextCollections[0]?.id ?? null);
    void syncCloudLibraryMutation({
      mutations: [{ kind: "collection_delete", collectionId }],
      successStatus: "Collection removal synced to your cloud library.",
    });
  }

  function formatSessionRecency(at: string): string {
    const when = new Date(at);
    const now = new Date();
    const diffMs = now.getTime() - when.getTime();
    if (!Number.isFinite(diffMs) || diffMs < 0) return when.toLocaleDateString();
    const diffHours = Math.floor(diffMs / 3_600_000);
    if (diffHours < 1) return "just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return when.toLocaleDateString();
  }

  async function handleImportFile(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    importError = null;
    importWarnings = [];

    const name = file.name.toLowerCase();

    if (name.endsWith(".json")) {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!validateChart(data)) {
          importError = "JSON file is not a valid Fretflow chart (schema v1).";
          input.value = "";
          return;
        }
        addUserChart(data);
        userCharts = getUserCharts();
        markOnboardingStepCompleted("library");
        setFilter("mine");
      } catch {
        importError = "Could not parse the JSON file.";
      }
    } else if (name.endsWith(".mid") || name.endsWith(".midi")) {
      try {
        const buf = await file.arrayBuffer();
        const result = midiBufferToChart(buf, file.name);
        if (!result.ok) {
          importError = result.error;
          input.value = "";
          return;
        }
        if (result.warnings.length > 0) importWarnings = result.warnings;
        addUserChart(result.chart);
        userCharts = getUserCharts();
        markOnboardingStepCompleted("library");
        setFilter("mine");
      } catch (e) {
        importError = `MIDI import failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    } else {
      importError = "Unsupported file type. Use .json (chart) or .mid / .midi (Standard MIDI).";
    }

    input.value = "";
  }

  $effect(() => {
    const nextFilter = filterFromUrl();
    const requestedCollectionId = collectionFromUrl();
    const nextPathId = pathFromUrl();
    const nextSkillTag = skillFromUrl();
    const nextTechniqueTag = techniqueFromUrl();
    const nextCollectionId =
      requestedCollectionId != null && collections.some((collection) => collection.id === requestedCollectionId)
        ? requestedCollectionId
        : collections[0]?.id ?? null;
    if (filter !== nextFilter) {
      filter = nextFilter;
    }
    if (activeCollectionId !== nextCollectionId) {
      activeCollectionId = nextCollectionId;
    }
    if (activePathId !== nextPathId) {
      activePathId = nextPathId;
    }
    if (activeSkillTag !== nextSkillTag) {
      activeSkillTag = nextSkillTag;
    }
    if (activeTechniqueTag !== nextTechniqueTag) {
      activeTechniqueTag = nextTechniqueTag;
    }
  });
</script>

<section class="panel panel--utility library-overview">
  <div class="library-overview__summary">
    <h1>Find the next chart fast.</h1>
    <p class="muted">Choose a mode, narrow only when needed, and keep the list itself primary.</p>
  </div>
  <div class="library-overview__stats">
    <div class="library-overview__stat">
      <span class="library-overview__stat-label">Mode</span>
      <strong>{filterLabel(filter)}</strong>
      <span class="muted">{visibleResultCount()} visible</span>
    </div>
    <div class="library-overview__stat">
      <span class="library-overview__stat-label">Narrowing</span>
      <strong>{activeNarrowingLabel()}</strong>
      <span class="muted">Bundled rows only</span>
    </div>
    <div class="library-overview__stat">
      <span class="library-overview__stat-label">Catalog</span>
      <strong>{catalogTracks.length} bundled</strong>
      <span class="muted">{userCharts.length} imported on this device</span>
    </div>
    <a href="#import-chart" class="btn btn-primary library-overview__action">Import chart</a>
  </div>
</section>

<section class="library-workbench">
  <aside class="panel panel--utility library-rail">
    <section class="library-rail__section">
      <p class="ff-section-eyebrow">Mode</p>
      <h3>What are you trying to browse?</h3>
      <div class="catalog-filters">
        {#each FILTERS as f (f)}
          <button
            type="button"
            class="btn"
            class:btn-primary={filter === f}
            onclick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {f === "all"
              ? "All"
              : f === "free"
                ? "Free"
                : f === "premium"
                  ? "Premium"
                  : f === "recent"
                    ? `Recent (${recentRows.length})`
                  : f === "favorites"
                    ? `Favorites (${favoriteRows.length})`
                    : f === "collections"
                      ? `Collection (${collectionRows.length})`
                      : `My Charts (${userCharts.length})`}
          </button>
        {/each}
      </div>
      <p class="muted library-control-card__summary">Current mode: <strong>{filterLabel(filter)}</strong></p>
    </section>

    <section class="library-rail__section">
      <p class="ff-section-eyebrow">Collections</p>
      <h3>Keep one active set list.</h3>
      <div class="collection-toolbar__controls">
        <input
          type="text"
          bind:value={newCollectionName}
          placeholder="New collection name"
          class="collection-toolbar__input"
        />
        <button type="button" class="btn" onclick={createCollectionFromInput}>Create collection</button>
      </div>
      <div class="collection-toolbar__controls">
        <select
          value={activeCollectionId ?? ""}
          onchange={(ev) => {
            const value = (ev.currentTarget as HTMLSelectElement).value;
            setActiveCollection(value === "" ? null : value);
          }}
          class="collection-toolbar__select"
        >
          <option value="">No collection selected</option>
          {#each collections as collection (collection.id)}
            <option value={collection.id}>{collection.name} ({collection.trackIds.length})</option>
          {/each}
        </select>
        <button type="button" class="btn" onclick={removeActiveCollection} disabled={activeCollectionId == null}>
          Delete active
        </button>
      </div>
      {#if activeCollection}
        <p class="muted collection-toolbar__summary">
          Active collection: <strong>{activeCollection.name}</strong> · {activeCollection.trackIds.length} chart{activeCollection.trackIds.length === 1 ? "" : "s"}
        </p>
      {:else}
        <p class="muted collection-toolbar__summary">Select a collection to make row actions predictable.</p>
      {/if}
      {#if remoteLibraryError}
        <p class="account-error" style="margin: 0.75rem 0 0">{remoteLibraryError}</p>
      {:else if remoteLibraryStatus}
        <p class="muted collection-toolbar__summary" style="margin-top: 0.75rem">{remoteLibraryStatus}</p>
      {:else if remoteLibrarySyncRollout.ready}
        <p class="muted collection-toolbar__summary" style="margin-top: 0.75rem">
          Signed-in favorite and collection edits sync automatically. Imported-chart organization stays on this device.
        </p>
      {/if}
    </section>

    {#if isBrowseFilter(filter)}
      <section class="library-rail__section">
        <p class="ff-section-eyebrow">Curriculum filters</p>
        <h3>Narrow the bundled catalog only when you need guidance.</h3>
        <div class="path-toolbar__group">
          <button
            type="button"
            class="btn"
            class:btn-primary={activePathId === "all"}
            onclick={() => setActivePath("all")}
          >
            All paths
          </button>
          {#each LEARNING_PATHS as path (path.id)}
            <button
              type="button"
              class="btn"
              class:btn-primary={activePathId === path.id}
              onclick={() => setActivePath(path.id)}
            >
              {path.title}
            </button>
          {/each}
        </div>
        <div class="path-toolbar__selectors">
          <select
            class="collection-toolbar__select"
            value={activeSkillTag ?? ""}
            onchange={(ev) => {
              const value = (ev.currentTarget as HTMLSelectElement).value;
              setActiveSkillTag(value === "" ? null : (value as CatalogSkillTag));
            }}
          >
            <option value="">All skills</option>
            {#each skillTags as skill (skill)}
              <option value={skill}>{formatTagLabel(skill)}</option>
            {/each}
          </select>
          <select
            class="collection-toolbar__select"
            value={activeTechniqueTag ?? ""}
            onchange={(ev) => {
              const value = (ev.currentTarget as HTMLSelectElement).value;
              setActiveTechniqueTag(value === "" ? null : (value as CatalogTechniqueTag));
            }}
          >
            <option value="">All techniques</option>
            {#each techniqueTags as technique (technique)}
              <option value={technique}>{formatTagLabel(technique)}</option>
            {/each}
          </select>
        </div>

        {#if activePathId !== "all" || activeSkillTag != null || activeTechniqueTag != null}
          <p class="muted path-toolbar__summary">
            {#if activePathId !== "all"}
              Path: <strong>{getLearningPathById(activePathId)?.title}</strong>
            {/if}
            {#if activeSkillTag}
              {activePathId !== "all" ? " · " : ""}Skill: <strong>{formatTagLabel(activeSkillTag)}</strong>
            {/if}
            {#if activeTechniqueTag}
              {(activePathId !== "all" || activeSkillTag) ? " · " : ""}Technique:
              <strong>{formatTagLabel(activeTechniqueTag)}</strong>
            {/if}
          </p>
        {/if}
      </section>
    {/if}
    {#if recommendedTracks.length > 0}
      <section class="library-rail__section library-rail__section--accent">
        <p class="ff-section-eyebrow">Suggested next</p>
        <h3>Fast picks</h3>
        <p class="muted library-control-card__summary">
          Quick picks based on recent bundled-chart runs. {progressSourceLabel()}
        </p>
        <div class="library-rail__recommendations">
          {#each recommendedTracks.slice(0, 3) as item (item.track.id)}
            <button type="button" class="library-rail__recommendation" onclick={() => openInPractice(item.track)}>
              <strong>{item.track.title}</strong>
              <span>{item.reason}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </aside>

  <div class="panel panel--workspace library-results">
    <div class="ff-section-header library-results__header">
      <div>
        <p class="ff-section-eyebrow">Results</p>
        <h2>{filterLabel(filter)}</h2>
        <p class="muted">
          {visibleResultCount()} visible row{visibleResultCount() === 1 ? "" : "s"}.
          {#if filter === "all" || filter === "free" || filter === "premium"}
            {" "}Use the rail to change mode or narrow the bundled catalog.
          {:else if filter === "collections"}
            {" "}Work against the active set list.
          {:else if filter === "mine"}
            {" "}Imported charts stay device-local.
          {/if}
        </p>
      </div>
      {#if filter === "premium"}
        <button type="button" class="btn" onclick={openAccount}>View plans</button>
      {/if}
    </div>

    {#if filter === "premium"}
      <div class="premium-note">
        <strong>Premium songs are still a preview in this version.</strong>
        <span class="muted">
          {premiumPreviewSummary()} {premiumPreviewTrackCount} preview row{premiumPreviewTrackCount === 1 ? "" : "s"} currently map to {CONTENT_PACK_OFFERS.length} optional pack{CONTENT_PACK_OFFERS.length === 1 ? "" : "s"} plus Pro.
          Source: {catalogMigrationLabel}.
        </span>
      </div>
    {/if}

    {#if filter === "recent"}
    {#if recentRows.length === 0}
      <p class="muted" style="margin: 0 0 1rem">No recent practice yet. Finish a chart in Practice and it will show up here.</p>
    {:else}
      <ul class="catalog-list" aria-label="Recently practiced tracks">
        {#each recentRows as row (row.kind + row.id)}
          {@const suggested = recommendedTrackFor(row.id)}
          <li class="catalog-row">
            <div class="catalog-main">
              <div class="catalog-title">
                <span class="catalog-title__name">{row.kind === "catalog" ? row.track.title : row.entry.title}</span>
                <div class="catalog-badges">
                  <span class="recent-badge">Recent</span>
                  {#if suggested}
                    <span class="suggested-badge">Suggested</span>
                  {/if}
                </div>
              </div>
              <div class="catalog-meta">
                <div class="catalog-meta__primary">
                  <span class="catalog-artist">{row.kind === "catalog" ? row.track.artist : row.entry.artist}</span>
                  <span class="resume-pill">
                    {row.recentSession.accuracyPercent}% last run · {formatSessionRecency(row.recentSession.at)}
                  </span>
                  <span class="muted">combo {row.recentSession.maxCombo}</span>
                </div>
                {#if row.kind === "catalog" && (row.track.difficulty || trackFocusLabel(row.track))}
                  <div class="catalog-meta__secondary">
                    {#if row.track.difficulty}
                      <span class="difficulty-pill difficulty-pill--{row.track.difficulty}">{row.track.difficulty}</span>
                    {/if}
                    {#if trackFocusLabel(row.track)}
                      <span class="skill-pill">{trackFocusLabel(row.track)}</span>
                    {/if}
                    {#if premiumTrackAccessLabel(row.track)}
                      <span class="premium-access-pill">{premiumTrackAccessLabel(row.track)}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
            <div class="catalog-action">
              {#if row.kind === "catalog"}
                {#if isPremiumPreview(row.track)}
                  <button type="button" class="btn premium-link" onclick={openAccount}>
                    View access
                  </button>
                {:else if isLocked(row.track)}
                  <span class="locked-label" title="Subscription / purchase flow not wired yet">Locked</span>
                {:else if canOpenInPractice(row.track)}
                  <button type="button" class="btn btn-primary" onclick={() => openInPractice(row.track)}>
                    Resume
                  </button>
                {:else}
                  <span class="locked-label" title="No chart wired for this row">Soon</span>
                {/if}
              {:else}
                <button type="button" class="btn btn-primary" onclick={() => openUserChart(row.entry)}>
                  Resume
                </button>
              {/if}
              <button
                type="button"
                class="btn favorite-toggle"
                class:favorite-toggle--active={isFavorite(row.id)}
                onclick={() => toggleFavorite(row.id)}
                aria-pressed={isFavorite(row.id)}
                title={isFavorite(row.id) ? "Remove favorite" : "Add favorite"}
              >
                ★
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if filter === "favorites"}
    {#if favoriteRows.length === 0}
      <p class="muted" style="margin: 0 0 1rem">No favorites yet. Star any bundled or imported chart to pin it here.</p>
    {:else}
      <ul class="catalog-list" aria-label="Favorite tracks">
        {#each favoriteRows as row (row.kind + row.id)}
          {@const recent = latestSessionForTrack(row.id)}
          {@const suggested = recommendedTrackFor(row.id)}
          <li class="catalog-row">
            <div class="catalog-main">
              <div class="catalog-title">
                <span class="catalog-title__name">{row.kind === "catalog" ? row.track.title : row.entry.title}</span>
                <div class="catalog-badges">
                  <span class="favorite-badge">Favorite</span>
                  {#if suggested}
                    <span class="suggested-badge">Suggested</span>
                  {/if}
                </div>
              </div>
              <div class="catalog-meta">
                <div class="catalog-meta__primary">
                  <span class="catalog-artist">{row.kind === "catalog" ? row.track.artist : row.entry.artist}</span>
                  {#if row.kind === "user"}
                    <span class="muted">{new Date(row.entry.addedAt).toLocaleDateString()}</span>
                  {/if}
                  {#if recent}
                    <span class="resume-pill">
                      {recent.accuracyPercent}% last run · {formatSessionRecency(recent.at)}
                    </span>
                  {/if}
                </div>
                {#if row.kind === "catalog" && (row.track.difficulty || trackFocusLabel(row.track) || row.track.durationSec != null)}
                  <div class="catalog-meta__secondary">
                    {#if row.track.difficulty}
                      <span class="difficulty-pill difficulty-pill--{row.track.difficulty}">{row.track.difficulty}</span>
                    {/if}
                    {#if trackFocusLabel(row.track)}
                      <span class="skill-pill">{trackFocusLabel(row.track)}</span>
                    {/if}
                    {#if row.track.durationSec != null}
                      <span class="muted">{formatDuration(row.track.durationSec)}</span>
                    {/if}
                    {#if premiumTrackAccessLabel(row.track)}
                      <span class="premium-access-pill">{premiumTrackAccessLabel(row.track)}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
            <div class="catalog-action">
              {#if row.kind === "catalog"}
                {#if isPremiumPreview(row.track)}
                  <button type="button" class="btn premium-link" onclick={openAccount}>
                    View access
                  </button>
                {:else if isLocked(row.track)}
                  <span class="locked-label" title="Subscription / purchase flow not wired yet">Locked</span>
                {:else if canOpenInPractice(row.track)}
                  <button type="button" class="btn btn-primary" onclick={() => openInPractice(row.track)}>
                    Practice
                  </button>
                {:else}
                  <span class="locked-label" title="No chart wired for this row">Soon</span>
                {/if}
              {:else}
                <button type="button" class="btn btn-primary" onclick={() => openUserChart(row.entry)}>
                  Practice
                </button>
              {/if}
              <button
                type="button"
                class="btn favorite-toggle"
                class:favorite-toggle--active={isFavorite(row.id)}
                onclick={() => toggleFavorite(row.id)}
                aria-pressed={isFavorite(row.id)}
                title={isFavorite(row.id) ? "Remove favorite" : "Add favorite"}
              >
                ★
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if filter === "collections"}
    {#if activeCollection == null}
      <p class="muted" style="margin: 0 0 1rem">Create or select a collection above, then add charts to it from any Library row.</p>
    {:else if collectionRows.length === 0}
      <p class="muted" style="margin: 0 0 1rem">Collection is empty. Use the collection button on any chart row to add it here.</p>
    {:else}
      <ul class="catalog-list" aria-label="Collection tracks">
        {#each collectionRows as row (row.kind + row.id)}
          {@const recent = latestSessionForTrack(row.id)}
          {@const suggested = recommendedTrackFor(row.id)}
          <li class="catalog-row">
            <div class="catalog-main">
              <div class="catalog-title">
                <span class="catalog-title__name">{row.kind === "catalog" ? row.track.title : row.entry.title}</span>
                <div class="catalog-badges">
                  <span class="collection-badge">{activeCollection.name}</span>
                  {#if suggested}
                    <span class="suggested-badge">Suggested</span>
                  {/if}
                </div>
              </div>
              <div class="catalog-meta">
                <div class="catalog-meta__primary">
                  <span class="catalog-artist">{row.kind === "catalog" ? row.track.artist : row.entry.artist}</span>
                  {#if recent}
                    <span class="resume-pill">
                      {recent.accuracyPercent}% last run · {formatSessionRecency(recent.at)}
                    </span>
                  {/if}
                </div>
                {#if row.kind === "catalog" && trackFocusLabel(row.track)}
                  <div class="catalog-meta__secondary">
                    <span class="skill-pill">{trackFocusLabel(row.track)}</span>
                    {#if premiumTrackAccessLabel(row.track)}
                      <span class="premium-access-pill">{premiumTrackAccessLabel(row.track)}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
            <div class="catalog-action">
              {#if row.kind === "catalog"}
                {#if isPremiumPreview(row.track)}
                  <button type="button" class="btn premium-link" onclick={openAccount}>
                    View access
                  </button>
                {:else if isLocked(row.track)}
                  <span class="locked-label" title="Subscription / purchase flow not wired yet">Locked</span>
                {:else if canOpenInPractice(row.track)}
                  <button type="button" class="btn btn-primary" onclick={() => openInPractice(row.track)}>
                    Practice
                  </button>
                {:else}
                  <span class="locked-label" title="No chart wired for this row">Soon</span>
                {/if}
              {:else}
                <button type="button" class="btn btn-primary" onclick={() => openUserChart(row.entry)}>
                  Practice
                </button>
              {/if}
              <button
                type="button"
                class="btn collection-toggle"
                class:collection-toggle--active={trackIsInActiveCollection(row.id)}
                onclick={() => toggleTrackInActiveCollection(row.id)}
                aria-pressed={trackIsInActiveCollection(row.id)}
              >
                {trackIsInActiveCollection(row.id) ? "Remove" : "Add"}
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if filter === "mine"}
    {#if userCharts.length === 0}
      <p class="muted" style="margin: 0 0 1rem">No imported charts yet. Use the import section below to add MIDI or JSON files.</p>
    {:else}
      <ul class="catalog-list" aria-label="My imported charts">
        {#each userCharts as entry (entry.id)}
          {@const recent = latestSessionForTrack(entry.id)}
          {@const suggested = recommendedTrackFor(entry.id)}
          <li class="catalog-row">
            <div class="catalog-main">
              <div class="catalog-title">
                <span class="catalog-title__name">{entry.title}</span>
                <div class="catalog-badges">
                  {#if suggested}
                    <span class="suggested-badge">Suggested</span>
                  {/if}
                </div>
              </div>
              <div class="catalog-meta">
                <div class="catalog-meta__primary">
                  <span class="catalog-artist">{entry.artist}</span>
                  <span class="muted">{new Date(entry.addedAt).toLocaleDateString()}</span>
                  {#if recent}
                    <span class="resume-pill">
                      {recent.accuracyPercent}% last run · {formatSessionRecency(recent.at)}
                    </span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="catalog-action">
              <button
                type="button"
                class="btn collection-toggle"
                class:collection-toggle--active={trackIsInActiveCollection(entry.id)}
                onclick={() => toggleTrackInActiveCollection(entry.id)}
                aria-pressed={trackIsInActiveCollection(entry.id)}
                disabled={activeCollectionId == null}
                title={activeCollectionId == null ? "Create or select a collection first" : trackIsInActiveCollection(entry.id) ? "Remove from active collection" : "Add to active collection"}
              >
                {trackIsInActiveCollection(entry.id) ? "In collection" : "+ Collection"}
              </button>
              <button
                type="button"
                class="btn favorite-toggle"
                class:favorite-toggle--active={isFavorite(entry.id)}
                onclick={() => toggleFavorite(entry.id)}
                aria-pressed={isFavorite(entry.id)}
                title={isFavorite(entry.id) ? "Remove favorite" : "Add favorite"}
              >
                ★
              </button>
              <button type="button" class="btn btn-primary" onclick={() => openUserChart(entry)}>
                Practice
              </button>
              <button type="button" class="btn btn-danger" onclick={() => deleteUserChart(entry)}
                title="Remove this imported chart"
              >
                Remove
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {:else}
    <ul class="catalog-list" aria-label="Tracks">
      {#each filtered as t (t.id)}
        {@const recent = latestSessionForTrack(t.id)}
        {@const suggested = recommendedTrackFor(t.id)}
        {@const prerequisites = prerequisiteTracks(t)}
        <li class="catalog-row">
          <div class="catalog-main">
            <div class="catalog-title">
              <span class="catalog-title__name">{t.title}</span>
              <div class="catalog-badges">
                {#if suggested}
                  <span class="suggested-badge">Suggested</span>
                {/if}
              </div>
            </div>
              <div class="catalog-meta">
                <div class="catalog-meta__primary">
                  <span class="catalog-artist">{t.artist}</span>
                  {#if recent}
                    <span class="resume-pill">
                    {recent.accuracyPercent}% last run · {formatSessionRecency(recent.at)}
                  </span>
                {/if}
              </div>
              <div class="catalog-meta__secondary">
                {#if t.difficulty}
                  <span class="difficulty-pill difficulty-pill--{t.difficulty}">{t.difficulty}</span>
                {/if}
                {#if trackFocusLabel(t)}
                  <span class="skill-pill">{trackFocusLabel(t)}</span>
                {/if}
                {#if t.durationSec != null}
                  <span class="muted">{formatDuration(t.durationSec)}</span>
                {/if}
                {#if t.targetBpm != null}
                  <span class="muted">{t.targetBpm} BPM target</span>
                {/if}
                <span
                  class="tier-pill"
                  class:tier-pill--free={t.tier === "free"}
                  class:tier-pill--premium={t.tier === "premium"}
                >
                  {t.tier}
                </span>
                {#if premiumTrackAccessLabel(t)}
                  <span class="premium-access-pill">{premiumTrackAccessLabel(t)}</span>
                {/if}
              </div>
            </div>
            {#if prerequisites.length > 0}
              <p class="catalog-prereq">
                Build-up: {#each prerequisites as prereq, index (prereq.id)}{index > 0 ? ", " : ""}<strong>{prereq.title}</strong>{/each}
              </p>
            {/if}
          </div>
          <div class="catalog-action">
            <button
              type="button"
              class="btn collection-toggle"
              class:collection-toggle--active={trackIsInActiveCollection(t.id)}
              onclick={() => toggleTrackInActiveCollection(t.id)}
              aria-pressed={trackIsInActiveCollection(t.id)}
              disabled={activeCollectionId == null}
              title={activeCollectionId == null ? "Create or select a collection first" : trackIsInActiveCollection(t.id) ? "Remove from active collection" : "Add to active collection"}
            >
              {trackIsInActiveCollection(t.id) ? "In collection" : "+ Collection"}
            </button>
            <button
              type="button"
              class="btn favorite-toggle"
              class:favorite-toggle--active={isFavorite(t.id)}
              onclick={() => toggleFavorite(t.id)}
              aria-pressed={isFavorite(t.id)}
              title={isFavorite(t.id) ? "Remove favorite" : "Add favorite"}
            >
              ★
            </button>
            {#if isPremiumPreview(t)}
              <button type="button" class="btn premium-link" onclick={openAccount}>
                View access
              </button>
            {:else if isLocked(t)}
              <span class="locked-label" title="Subscription / purchase flow not wired yet">
                <svg
                  class="lock-icon"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.35"
                  aria-hidden="true"
                >
                  <rect x="3" y="7" width="10" height="7" rx="1" />
                  <path d="M5 7V5a3 3 0 0 1 6 0v2" />
                </svg>
                Locked
              </span>
            {:else if canOpenInPractice(t)}
              <button type="button" class="btn btn-primary" onclick={() => openInPractice(t)}>
                Practice
              </button>
            {:else}
              <span class="locked-label" title="No chart wired for this row">Soon</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
    {/if}
  </div>
</section>

<div class="panel panel--utility" id="import-chart">
  <h2>Import chart</h2>
  <p class="muted" style="margin: 0 0 0.75rem">
    Add a <strong>.json</strong> (Fretflow chart v1) or <strong>.mid</strong> (Standard MIDI) file.
    MIDI imports are converted automatically into a playable Fretflow chart.
  </p>
  <input
    type="file"
    accept=".json,.mid,.midi,application/json,audio/midi"
    onchange={handleImportFile}
    style="margin-bottom: 0.75rem"
  />
  {#if importError}
    <p class="import-error">{importError}</p>
  {/if}
  {#if importWarnings.length > 0}
    <ul class="import-warnings">
      {#each importWarnings as w}
        <li>{w}</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .library-overview {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: minmax(0, 1.1fr) minmax(24rem, 1fr);
    align-items: start;
    padding: 0.85rem 1rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.024), transparent 34%),
      linear-gradient(180deg, rgba(20, 18, 22, 0.96), rgba(12, 10, 13, 0.98));
  }
  .library-overview__summary {
    display: grid;
    gap: 0.22rem;
  }
  .library-overview__summary h1 {
    margin: 0;
    font-size: clamp(1.25rem, 2vw, 1.7rem);
    line-height: 1.02;
    letter-spacing: -0.03em;
  }
  .library-overview__summary p {
    margin: 0;
    max-width: 40rem;
  }
  .library-overview__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.7rem;
    align-items: stretch;
  }
  .library-overview__stat,
  .library-overview__action {
    min-height: 100%;
  }
  .library-overview__stat {
    display: grid;
    gap: 0.2rem;
    padding: 0.72rem 0.8rem;
    border-radius: 16px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 36%),
      rgba(7, 7, 9, 0.22);
  }
  .library-overview__stat-label {
    color: var(--ff-muted);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .library-overview__stat strong {
    font-size: 0.98rem;
    line-height: 1.25;
  }
  .library-overview__action {
    align-self: stretch;
  }
  .library-workbench {
    display: grid;
    grid-template-columns: minmax(18.5rem, 21rem) minmax(0, 1fr);
    gap: 1rem;
    align-items: start;
  }
  .library-rail {
    display: grid;
    gap: 0.9rem;
    align-content: start;
    position: sticky;
    top: 0.9rem;
  }
  .library-rail__section {
    display: grid;
    gap: 0.8rem;
    padding: 0.95rem 1rem;
    border-radius: 18px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 36%),
      rgba(9, 8, 10, 0.22);
  }
  .library-rail__section--accent {
    background:
      radial-gradient(circle at top right, rgba(63, 208, 195, 0.1), transparent 38%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 36%),
      rgba(9, 8, 10, 0.22);
  }
  .library-rail__section h3 {
    margin: 0;
    font-size: 1rem;
  }
  .library-results {
    min-width: 0;
  }
  .library-results__header {
    margin-bottom: 1rem;
  }
  .library-control-card__summary {
    margin: 0;
    line-height: 1.55;
  }
  .library-rail__recommendations {
    display: grid;
    gap: 0.65rem;
  }
  .library-rail__recommendation {
    display: grid;
    gap: 0.25rem;
    text-align: left;
    padding: 0.8rem 0.9rem;
    border-radius: 16px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 30%),
      rgba(9, 8, 10, 0.28);
    color: var(--ff-text);
    cursor: pointer;
  }
  .library-rail__recommendation:hover {
    border-color: color-mix(in srgb, var(--ff-accent) 55%, var(--ff-border));
    background:
      linear-gradient(180deg, rgba(63, 208, 195, 0.08), transparent 30%),
      rgba(9, 8, 10, 0.3);
  }
  .library-rail__recommendation strong {
    font-size: 0.92rem;
    font-weight: 600;
  }
  .library-rail__recommendation span {
    font-size: 0.82rem;
    color: var(--ff-muted);
    line-height: 1.45;
  }
  .collection-toolbar__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
  }
  .collection-toolbar__input,
  .collection-toolbar__select {
    min-height: 44px;
  }
  .collection-toolbar__input {
    min-width: 12rem;
    flex: 1 1 12rem;
  }
  .collection-toolbar__summary {
    margin: 0;
    font-size: 0.88rem;
  }
  .path-toolbar__group {
    display: flex;
    gap: 0.55rem;
    flex-wrap: wrap;
  }
  .path-toolbar__selectors {
    display: grid;
    gap: 0.6rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .path-toolbar__summary {
    margin: 0;
    font-size: 0.88rem;
  }
  .catalog-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }
  .catalog-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }
  .premium-note {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
    margin: 0 0 1rem;
    padding: 0.8rem 0.9rem;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--ff-accent) 40%, var(--ff-border));
    background: color-mix(in srgb, var(--ff-accent) 8%, var(--ff-bg));
  }
  .catalog-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.9rem 1rem;
    padding: 1rem;
    border: 1px solid var(--ff-border);
    border-radius: 18px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 30%),
      rgba(9, 8, 10, 0.2);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
  }
  .catalog-row:hover {
    border-color: color-mix(in srgb, var(--ff-accent) 24%, var(--ff-border));
    background:
      linear-gradient(180deg, rgba(63, 208, 195, 0.04), transparent 30%),
      rgba(9, 8, 10, 0.24);
  }
  .catalog-main {
    min-width: 0;
    display: grid;
    gap: 0.5rem;
  }
  .catalog-title {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 0.6rem;
    align-items: center;
    font-weight: 600;
    color: var(--ff-text);
    font-size: 1rem;
    letter-spacing: -0.01em;
  }
  .catalog-title__name {
    min-width: 0;
  }
  .catalog-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }
  .catalog-meta {
    display: grid;
    gap: 0.38rem;
    font-size: 0.88rem;
  }
  .catalog-meta__primary,
  .catalog-meta__secondary {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem 0.6rem;
  }
  .catalog-artist {
    color: var(--ff-muted-strong);
    font-weight: 600;
  }
  .catalog-prereq {
    margin: 0.35rem 0 0;
    font-size: 0.84rem;
    color: var(--ff-muted-strong);
    line-height: 1.45;
  }
  .catalog-action {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
    align-items: start;
  }
  .favorite-toggle {
    min-width: 2.5rem;
    padding-inline: 0.65rem;
    color: var(--ff-muted);
  }
  .collection-toggle {
    min-width: 5.9rem;
    color: var(--ff-muted);
  }
  .collection-toggle--active {
    color: var(--ff-accent);
    border-color: color-mix(in srgb, var(--ff-accent) 55%, var(--ff-border));
    background: color-mix(in srgb, var(--ff-accent) 10%, var(--ff-bg));
  }
  .favorite-toggle--active {
    color: #fbbf24;
    border-color: color-mix(in srgb, #fbbf24 50%, var(--ff-border));
    background: color-mix(in srgb, #fbbf24 10%, var(--ff-bg));
  }
  .favorite-badge {
    display: inline-flex;
    margin-left: 0.45rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, #fbbf24 55%, var(--ff-border));
    color: #fbbf24;
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    vertical-align: middle;
  }
  .recent-badge {
    display: inline-flex;
    margin-left: 0.45rem;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--ff-success) 45%, var(--ff-border));
    color: var(--ff-success);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    vertical-align: middle;
  }
  .collection-badge {
    display: inline-flex;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--ff-accent) 50%, var(--ff-border));
    color: var(--ff-accent);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    vertical-align: middle;
  }
  .suggested-badge {
    display: inline-flex;
    padding: 0.1rem 0.4rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--ff-accent) 55%, var(--ff-border));
    color: var(--ff-accent);
    font-size: 0.7rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    vertical-align: middle;
    background: color-mix(in srgb, var(--ff-accent) 10%, var(--ff-bg));
  }
  .resume-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--ff-accent) 35%, var(--ff-border));
    color: var(--ff-text);
    font-size: 0.72rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--ff-accent) 10%, var(--ff-bg));
  }
  .tier-pill {
    text-transform: capitalize;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--ff-border);
    color: var(--ff-muted);
  }
  .tier-pill--free {
    border-color: color-mix(in srgb, var(--ff-success) 45%, var(--ff-border));
    color: var(--ff-success);
  }
  .tier-pill--premium {
    border-color: color-mix(in srgb, var(--ff-accent) 55%, var(--ff-border));
    color: var(--ff-accent);
  }
  .skill-pill {
    text-transform: capitalize;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--ff-accent) 32%, var(--ff-border));
    color: var(--ff-text);
    background: color-mix(in srgb, var(--ff-accent) 8%, var(--ff-bg));
  }
  .premium-access-pill {
    display: inline-flex;
    align-items: center;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--ff-warm) 42%, var(--ff-border));
    color: var(--ff-warm);
    font-size: 0.72rem;
    font-weight: 600;
    background: color-mix(in srgb, var(--ff-warm) 8%, var(--ff-bg));
  }
  .locked-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.88rem;
    color: var(--ff-muted-strong);
  }
  .premium-link {
    color: var(--ff-accent);
    border-color: color-mix(in srgb, var(--ff-accent) 45%, var(--ff-border));
  }
  .lock-icon {
    flex-shrink: 0;
    opacity: 0.8;
  }
  .difficulty-pill {
    text-transform: capitalize;
    font-size: 0.72rem;
    font-weight: 600;
    padding: 0.12rem 0.45rem;
    border-radius: 999px;
    border: 1px solid var(--ff-border);
    color: var(--ff-muted);
  }
  .difficulty-pill--beginner {
    border-color: color-mix(in srgb, #4ade80 45%, var(--ff-border));
    color: #4ade80;
  }
  .difficulty-pill--easy {
    border-color: color-mix(in srgb, #38bdf8 45%, var(--ff-border));
    color: #38bdf8;
  }
  .difficulty-pill--intermediate {
    border-color: color-mix(in srgb, #fbbf24 45%, var(--ff-border));
    color: #fbbf24;
  }
  .difficulty-pill--advanced {
    border-color: color-mix(in srgb, #f87171 45%, var(--ff-border));
    color: #f87171;
  }
  .btn-danger {
    color: #f87171;
    border-color: color-mix(in srgb, #f87171 40%, var(--ff-border));
  }
  .btn-danger:hover {
    background: color-mix(in srgb, #f87171 12%, var(--ff-bg));
    border-color: #f87171;
  }
  .import-error {
    color: #f87171;
    font-size: 0.9rem;
    margin: 0 0 0.5rem;
  }
  .import-warnings {
    margin: 0 0 0.5rem;
    padding-left: 1.2rem;
    font-size: 0.88rem;
    color: #fbbf24;
  }
  @media (max-width: 720px) {
    .library-overview,
    .library-workbench {
      grid-template-columns: 1fr;
    }
    .library-overview__stats {
      grid-template-columns: 1fr;
    }
    .library-rail {
      position: static;
    }
    .path-toolbar__selectors {
      grid-template-columns: 1fr;
    }
    .catalog-row {
      grid-template-columns: 1fr;
    }
    .catalog-action {
      justify-content: flex-start;
    }
  }
</style>
