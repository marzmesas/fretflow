<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import {
    findCatalogTrackById,
    getCatalogSnapshot,
    loadCatalogSnapshot,
  } from "$lib/catalog/catalog-service";
  import { getCatalogSourceMode } from "$lib/catalog/catalog-source";
  import {
    LEARNING_PATHS,
    getLearningPathById,
    getLearningPathTrackIds,
    type LearningPathId,
  } from "$lib/catalog/learning-paths";
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
  import { midiBufferToChart } from "$lib/catalog/midi-import";
  import { getRecommendedTracks, type RecommendedTrack } from "$lib/catalog/recommendations";
  import { addUserChart, getUserCharts, removeUserChart, type UserChartEntry } from "$lib/catalog/user-charts";
  import { getLatestSessionsByTrackId, loadSessionHistory, type SessionSummaryV1 } from "$lib/chart/session-storage";
  import { markOnboardingStepCompleted } from "$lib/onboarding-storage";
  import type { SubscriptionState } from "$lib/ipc";
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
  let collections = $state<ChartCollectionV1[]>(initialCollections);
  let subscription = $state<SubscriptionState | null>(null);
  let activeCollectionId = $state<string | null>(initialCollections[0]?.id ?? null);
  let activePathId = $state<PathFilter>("all");
  let activeSkillTag = $state<CatalogSkillTag | null>(null);
  let activeTechniqueTag = $state<CatalogTechniqueTag | null>(null);
  let newCollectionName = $state("");
  let importError = $state<string | null>(null);
  let importWarnings = $state<string[]>([]);
  let skillTags = $state<CatalogSkillTag[]>(initialCatalog.skillTags);
  let techniqueTags = $state<CatalogTechniqueTag[]>(initialCatalog.techniqueTags);

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

  function toggleFavorite(trackId: string) {
    favoriteTrackIds = toggleFavoriteTrackId(trackId);
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

  function prerequisiteTracks(track: CatalogTrackStub): CatalogTrackStub[] {
    return (track.prerequisiteTrackIds ?? [])
      .map((trackId) => findCatalogTrackById(trackId))
      .filter((entry): entry is CatalogTrackStub => entry != null);
  }

  onMount(() => {
    void (async () => {
      const snapshot = await loadCatalogSnapshot();
      catalogTracks = snapshot.tracks;
      skillTags = snapshot.skillTags;
      techniqueTags = snapshot.techniqueTags;
      if (isTauri()) {
        try {
          subscription = await invoke<SubscriptionState>("get_subscription_state");
        } catch {
          subscription = null;
        }
      }
      const sourceMode = getCatalogSourceMode();
      const refreshedSnapshot = await loadCatalogSnapshot({
        sourceMode,
        apiBaseUrl: subscription?.apiBaseUrl ?? "",
      });
      catalogTracks = refreshedSnapshot.tracks;
      skillTags = refreshedSnapshot.skillTags;
      techniqueTags = refreshedSnapshot.techniqueTags;
    })();
  });

  function trackIsInActiveCollection(trackId: string): boolean {
    return activeCollection?.trackIds.includes(trackId) ?? false;
  }

  function toggleTrackInActiveCollection(trackId: string) {
    if (activeCollectionId == null) return;
    collections = toggleTrackInCollection(activeCollectionId, trackId);
  }

  function createCollectionFromInput() {
    if (newCollectionName.trim() === "") return;
    const nextCollections = createCollection(newCollectionName);
    collections = nextCollections;
    setActiveCollection(nextCollections[0]?.id ?? null);
    newCollectionName = "";
  }

  function removeActiveCollection() {
    if (activeCollectionId == null) return;
    const nextCollections = deleteCollection(activeCollectionId);
    collections = nextCollections;
    setActiveCollection(nextCollections[0]?.id ?? null);
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

<h1 style="margin: 0 0 0.5rem; font-size: 1.5rem">Library</h1>
<p class="muted" style="margin: 0 0 1rem">
  Browse bundled exercises or import your own charts (JSON or MIDI files).
</p>

<div class="panel">
  <h2>Browse</h2>

  {#if recommendedTracks.length > 0}
    <div class="recommended-strip">
      <div class="recommended-strip__header">
        <div>
          <h3>Suggested for you</h3>
          <p class="muted">Quick picks based on your recent bundled-chart runs.</p>
        </div>
      </div>
      <div class="recommended-strip__grid">
        {#each recommendedTracks as item (item.track.id)}
          <button
            type="button"
            class="recommended-card"
            onclick={() => openInPractice(item.track)}
          >
            <span class="recommended-card__title">{item.track.title}</span>
            <span class="recommended-card__meta">
              {item.track.artist}
              {#if item.track.difficulty} · {item.track.difficulty}{/if}
            </span>
            <span class="recommended-card__reason">{item.reason}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="collection-toolbar">
    <div class="collection-toolbar__controls">
      <input
        type="text"
        bind:value={newCollectionName}
        placeholder="New collection name"
        class="collection-toolbar__input"
      />
      <button type="button" class="btn" onclick={createCollectionFromInput}>Create collection</button>
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
    {/if}
  </div>

  <div class="row catalog-filters" style="margin-bottom: 1rem">
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

  <div class="path-toolbar">
    <div class="path-toolbar__group">
      <span class="muted path-toolbar__label">Learning paths</span>
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

    <div class="path-toolbar__group">
      <span class="muted path-toolbar__label">Skills</span>
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
  </div>

  {#if filter === "premium"}
    <div class="premium-note">
      <strong>Premium catalog is preview-only in this build.</strong>
      <span class="muted">
        Subscription sync and entitlement state live in Account, but premium chart delivery is not wired yet.
      </span>
      <button type="button" class="btn" onclick={openAccount}>Open Account</button>
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
                {row.kind === "catalog" ? row.track.title : row.entry.title}
                <span class="recent-badge">Recent</span>
                {#if suggested}
                  <span class="suggested-badge">Suggested</span>
                {/if}
              </div>
              <div class="catalog-meta">
                <span class="muted">{row.kind === "catalog" ? row.track.artist : row.entry.artist}</span>
                <span class="resume-pill">
                  {row.recentSession.accuracyPercent}% last run · {formatSessionRecency(row.recentSession.at)}
                </span>
                <span class="muted">combo {row.recentSession.maxCombo}</span>
                {#if row.kind === "catalog" && row.track.difficulty}
                  <span class="difficulty-pill difficulty-pill--{row.track.difficulty}">{row.track.difficulty}</span>
                {/if}
                {#if row.kind === "catalog" && trackFocusLabel(row.track)}
                  <span class="skill-pill">{trackFocusLabel(row.track)}</span>
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
                {row.kind === "catalog" ? row.track.title : row.entry.title}
                <span class="favorite-badge">Favorite</span>
                {#if suggested}
                  <span class="suggested-badge">Suggested</span>
                {/if}
              </div>
              <div class="catalog-meta">
                <span class="muted">{row.kind === "catalog" ? row.track.artist : row.entry.artist}</span>
                {#if row.kind === "catalog"}
                  {#if row.track.difficulty}
                    <span class="difficulty-pill difficulty-pill--{row.track.difficulty}">{row.track.difficulty}</span>
                  {/if}
                  {#if trackFocusLabel(row.track)}
                    <span class="skill-pill">{trackFocusLabel(row.track)}</span>
                  {/if}
                  {#if row.track.durationSec != null}
                    <span class="muted">{row.track.durationSec < 60 ? `${row.track.durationSec}s` : `${Math.floor(row.track.durationSec / 60)}m ${row.track.durationSec % 60}s`}</span>
                  {/if}
                {:else}
                  <span class="muted">{new Date(row.entry.addedAt).toLocaleDateString()}</span>
                {/if}
                {#if recent}
                  <span class="resume-pill">
                    {recent.accuracyPercent}% last run · {formatSessionRecency(recent.at)}
                  </span>
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
                {row.kind === "catalog" ? row.track.title : row.entry.title}
                <span class="collection-badge">{activeCollection.name}</span>
                {#if suggested}
                  <span class="suggested-badge">Suggested</span>
                {/if}
              </div>
              <div class="catalog-meta">
                <span class="muted">{row.kind === "catalog" ? row.track.artist : row.entry.artist}</span>
                {#if row.kind === "catalog" && trackFocusLabel(row.track)}
                  <span class="skill-pill">{trackFocusLabel(row.track)}</span>
                {/if}
                {#if recent}
                  <span class="resume-pill">
                    {recent.accuracyPercent}% last run · {formatSessionRecency(recent.at)}
                  </span>
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
                {entry.title}
                {#if suggested}
                  <span class="suggested-badge">Suggested</span>
                {/if}
              </div>
              <div class="catalog-meta">
                <span class="muted">{entry.artist}</span>
                <span class="muted">{new Date(entry.addedAt).toLocaleDateString()}</span>
                {#if recent}
                  <span class="resume-pill">
                    {recent.accuracyPercent}% last run · {formatSessionRecency(recent.at)}
                  </span>
                {/if}
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
              {t.title}
              {#if suggested}
                <span class="suggested-badge">Suggested</span>
              {/if}
            </div>
            <div class="catalog-meta">
              <span class="muted">{t.artist}</span>
              {#if t.difficulty}
                <span class="difficulty-pill difficulty-pill--{t.difficulty}">{t.difficulty}</span>
              {/if}
              {#if trackFocusLabel(t)}
                <span class="skill-pill">{trackFocusLabel(t)}</span>
              {/if}
              {#if t.durationSec != null}
                <span class="muted">{t.durationSec < 60 ? `${t.durationSec}s` : `${Math.floor(t.durationSec / 60)}m ${t.durationSec % 60}s`}</span>
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
              {#if recent}
                <span class="resume-pill">
                  {recent.accuracyPercent}% last run · {formatSessionRecency(recent.at)}
                </span>
              {/if}
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

<div class="panel">
  <h2>Import chart</h2>
  <p class="muted" style="margin: 0 0 0.75rem">
    Add a <strong>.json</strong> (Fretflow chart v1) or <strong>.mid</strong> (Standard MIDI) file.
    MIDI files are converted to chart format automatically using the same voicing engine as the CLI importer.
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
  .recommended-strip {
    margin-bottom: 1rem;
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--ff-border);
    border-radius: 10px;
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--ff-accent) 10%, transparent), transparent 36%),
      color-mix(in srgb, var(--ff-bg) 72%, transparent);
  }
  .recommended-strip__header h3 {
    margin: 0 0 0.2rem;
    font-size: 0.98rem;
  }
  .recommended-strip__header p {
    margin: 0 0 0.75rem;
    font-size: 0.82rem;
  }
  .recommended-strip__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }
  .recommended-card {
    display: grid;
    gap: 0.28rem;
    text-align: left;
    padding: 0.8rem 0.85rem;
    border-radius: 10px;
    border: 1px solid var(--ff-border);
    background: color-mix(in srgb, var(--ff-bg) 82%, transparent);
    color: var(--ff-text);
    cursor: pointer;
  }
  .recommended-card:hover {
    border-color: color-mix(in srgb, var(--ff-accent) 55%, var(--ff-border));
    background: color-mix(in srgb, var(--ff-accent) 10%, var(--ff-bg));
  }
  .recommended-card__title {
    font-size: 0.92rem;
    font-weight: 600;
  }
  .recommended-card__meta {
    font-size: 0.8rem;
    color: var(--ff-muted);
  }
  .recommended-card__reason {
    font-size: 0.82rem;
    line-height: 1.45;
  }
  .collection-toolbar {
    margin-bottom: 1rem;
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--ff-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--ff-bg) 72%, transparent);
  }
  .collection-toolbar__controls {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }
  .collection-toolbar__input,
  .collection-toolbar__select {
    padding: 0.4rem 0.55rem;
    border-radius: 8px;
    border: 1px solid var(--ff-border);
    background: var(--ff-bg);
    color: var(--ff-text);
    font: inherit;
  }
  .collection-toolbar__input {
    min-width: 12rem;
    flex: 1 1 12rem;
  }
  .collection-toolbar__summary {
    margin: 0.55rem 0 0;
    font-size: 0.82rem;
  }
  .path-toolbar {
    margin-bottom: 1rem;
    display: grid;
    gap: 0.65rem;
  }
  .path-toolbar__group {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .path-toolbar__label {
    font-size: 0.8rem;
    min-width: 5.5rem;
  }
  .path-toolbar__summary {
    margin: 0;
    font-size: 0.82rem;
  }
  .catalog-filters .btn.btn-primary {
    border-color: var(--ff-accent);
    background: var(--ff-accent-dim);
    color: #fff;
  }
  .catalog-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .premium-note {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-wrap: wrap;
    margin: 0 0 1rem;
    padding: 0.8rem 0.9rem;
    border-radius: 10px;
    border: 1px solid color-mix(in srgb, var(--ff-accent) 40%, var(--ff-border));
    background: color-mix(in srgb, var(--ff-accent) 8%, var(--ff-bg));
  }
  .catalog-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.65rem 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--ff-border);
  }
  .catalog-row:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .catalog-row:first-child {
    padding-top: 0;
  }
  .catalog-title {
    font-weight: 600;
    color: var(--ff-text);
    font-size: 0.95rem;
  }
  .catalog-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.65rem;
    margin-top: 0.2rem;
    font-size: 0.82rem;
  }
  .catalog-prereq {
    margin: 0.35rem 0 0;
    font-size: 0.8rem;
    color: var(--ff-muted);
    line-height: 1.45;
  }
  .catalog-action {
    display: flex;
    gap: 0.5rem;
    align-items: center;
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
    margin-left: 0.45rem;
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
    margin-left: 0.45rem;
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
  .locked-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.88rem;
    color: var(--ff-muted);
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
    font-size: 0.85rem;
    color: #fbbf24;
  }
</style>
