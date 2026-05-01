<script lang="ts">
  import { afterNavigate, goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { AppInfo, AppSession, SubscriptionState } from "$lib/ipc";
  import { loadRemoteUserProfile, type RemoteUserProfileV1 } from "$lib/account/remote-profile";
  import { loadRemoteProgressState } from "$lib/account/remote-progress";
  import { getRemoteProfileRole } from "$lib/account/remote-profile-gate";
  import { getRemoteProfileSurfaceRollout } from "$lib/account/remote-profile-surface-rollout";
  import { getRemoteProgressSurfaceRollout } from "$lib/account/remote-progress-surface-rollout";
  import {
    findTrackInSnapshot,
    loadActiveCatalogSnapshot,
  } from "$lib/catalog/active-catalog";
  import {
    LEARNING_PATHS,
    getLearningPathById,
    getLearningPathProgress,
    recommendLearningPathSeed,
    type LearningPathProgress,
  } from "$lib/catalog/learning-paths";
  import { getCatalogSnapshot, type CatalogSnapshot } from "$lib/catalog/catalog-service";
  import { getRecommendedTracks, type RecommendedTrack } from "$lib/catalog/recommendations";
  import {
    getRecentSessions,
    loadLastSession,
    loadSessionHistory,
    type SessionSummaryV1,
  } from "$lib/chart/session-storage";
  import {
    dismissOnboarding,
    getOnboardingSnapshot,
    saveOnboardingAssessment,
    type OnboardingExperienceLevel,
    type OnboardingPracticeGoal,
    type OnboardingSnapshot,
    type OnboardingStepId,
  } from "$lib/onboarding-storage";
  import { loadPracticeGoals, toPracticeGoalsSnapshot, type PracticeGoalsSnapshot } from "$lib/practice-goals-storage";
  import { isTauri } from "$lib/tauri-env";

  let appInfo = $state<AppInfo | null>(null);
  let loadError = $state<string | null>(null);
  let onboarding = $state<OnboardingSnapshot | null>(null);
  let lastSession = $state<SessionSummaryV1 | null>(null);
  let recentSessions = $state<SessionSummaryV1[]>([]);
  let recommendedTracks = $state<RecommendedTrack[]>([]);
  let learningPaths = $state<LearningPathProgress[]>([]);
  let practiceGoals = $state<PracticeGoalsSnapshot>(toPracticeGoalsSnapshot(loadPracticeGoals()));
  let remoteProfile = $state<RemoteUserProfileV1 | null>(null);
  let progressSource = $state<"local" | "cloud">("local");
  let catalogSnapshot = $state<CatalogSnapshot>(getCatalogSnapshot());
  let assessmentExperience = $state<OnboardingExperienceLevel>("brand_new");
  let assessmentGoal = $state<OnboardingPracticeGoal>("fundamentals");
  let heroPath = $derived(activeRecommendedPath());

  const STEP_COPY: Record<OnboardingStepId, { title: string; detail: string; href: string }> = {
    settings: {
      title: "Set up your input",
      detail: "Choose a mic or MIDI source, then verify monitoring before scoring.",
      href: "/settings",
    },
    library: {
      title: "Pick a chart",
      detail: "Start with a bundled drill or import your own MIDI/JSON chart.",
      href: "/library",
    },
    practice: {
      title: "Finish your first run",
      detail: "Open Practice, play through a chart, and save your first session summary.",
      href: "/practice",
    },
  };

  function refreshHomeState(history: SessionSummaryV1[] = loadSessionHistory()) {
    onboarding = getOnboardingSnapshot();
    if (onboarding.assessment) {
      assessmentExperience = onboarding.assessment.experienceLevel;
      assessmentGoal = onboarding.assessment.practiceGoal;
    }
    lastSession = history[0] ?? loadLastSession();
    recentSessions = getRecentSessions(history, 4);
    recommendedTracks = getRecommendedTracks(history, 3, catalogSnapshot.playableBundledTracks);
    learningPaths = getLearningPathProgress(history);
    practiceGoals = toPracticeGoalsSnapshot(loadPracticeGoals());
  }

  function nextOnboardingStep(): (typeof STEP_COPY)[OnboardingStepId] | null {
    const nextId = onboarding?.remainingSteps[0] ?? null;
    return nextId ? STEP_COPY[nextId] : null;
  }

  function dismissSetupGuide() {
    onboarding = dismissOnboarding();
  }

  function activeRecommendedTrack() {
    const trackId = remoteProfile?.fields.recommendedTrackId ?? onboarding?.assessment?.recommendedTrackId;
    if (!trackId) return null;
    return findTrackInSnapshot(catalogSnapshot, trackId);
  }

  function activeRecommendedPath() {
    const pathId = remoteProfile?.fields.recommendedPathId ?? onboarding?.assessment?.recommendedPathId;
    if (!pathId) return null;
    return LEARNING_PATHS.find((path) => path.id === pathId) ?? null;
  }

  function saveAssessment() {
    const recommendation = recommendLearningPathSeed(assessmentExperience, assessmentGoal);
    onboarding = saveOnboardingAssessment({
      experienceLevel: assessmentExperience,
      practiceGoal: assessmentGoal,
      recommendedPathId: recommendation.pathId,
      recommendedTrackId: recommendation.trackId,
    });
  }

  function openAssessmentRecommendation() {
    const trackId = activeRecommendedTrack()?.id;
    if (!trackId) {
      void goto("/practice");
      return;
    }
    void goto(`/practice?track=${encodeURIComponent(trackId)}`);
  }

  function recommendedSetupAction() {
    const assessment = onboarding?.assessment;
    if (!assessment) return null;
    if (assessment.experienceLevel === "brand_new") {
      return {
        title: "Use the chromatic tuner",
        detail: "Brand-new players should verify a clean note first so mic scoring feels trustworthy before the first run.",
        href: "/settings#audio-input-section",
      };
    }
    return {
      title: "Run latency calibration",
      detail: "Returning or comfortable players usually get more value from tightening timing alignment before serious scored practice.",
      href: "/settings#latency-section",
    };
  }

  function openLastSession() {
    const trackId = lastSession?.practiceTrackId?.trim();
    if (trackId) {
      void goto(`/practice?track=${encodeURIComponent(trackId)}`);
      return;
    }
    void goto("/practice");
  }

  function openSession(session: SessionSummaryV1) {
    const trackId = session.practiceTrackId?.trim();
    if (trackId) {
      void goto(`/practice?track=${encodeURIComponent(trackId)}`);
      return;
    }
    void goto("/practice");
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

  function openLearningPathStep(path: LearningPathProgress) {
    const trackId =
      onboarding?.assessment?.recommendedPathId === path.path.id && onboarding.assessment.recommendedTrackId
        ? onboarding.assessment.recommendedTrackId
        : path.nextStep?.track.id ?? path.path.steps[0]?.track.id;
    if (!trackId) {
      void goto("/library");
      return;
    }
    void goto(`/practice?track=${encodeURIComponent(trackId)}`);
  }

  function isActivationMode(): boolean {
    return Boolean(onboarding && !onboarding.hidden);
  }

  function hasReturningDashboard(): boolean {
    return (
      !isActivationMode() ||
      Boolean(lastSession || recentSessions.length > 1 || recommendedTracks.length > 0 || learningPaths.length > 0)
    );
  }

  async function refreshRemoteSurfaceProfile() {
    if (!isTauri()) {
      remoteProfile = null;
      return;
    }
    try {
      const session = await invoke<AppSession>("get_session");
      const subscription = await invoke<SubscriptionState>("get_subscription_state");
      const rollout = getRemoteProfileSurfaceRollout({
        apiBaseUrl: subscription.apiBaseUrl,
        remoteProfileRole: getRemoteProfileRole(session),
      });
      if (!rollout.ready) {
        remoteProfile = null;
        return;
      }
      remoteProfile = await loadRemoteUserProfile({
        apiBaseUrl: subscription.apiBaseUrl,
        accountId: session.accountId ?? "",
        email: session.email ?? "",
      });
    } catch {
      remoteProfile = null;
    }
  }

  async function refreshProgressSurfaceState() {
    const localHistory = loadSessionHistory();
    progressSource = "local";
    if (!isTauri()) {
      refreshHomeState(localHistory);
      return;
    }
    try {
      const session = await invoke<AppSession>("get_session");
      const subscription = await invoke<SubscriptionState>("get_subscription_state");
      const rollout = getRemoteProgressSurfaceRollout({
        apiBaseUrl: subscription.apiBaseUrl,
        remoteProfileRole: getRemoteProfileRole(session),
      });
      if (!rollout.ready) {
        refreshHomeState(localHistory);
        return;
      }
      const remoteProgress = await loadRemoteProgressState({
        apiBaseUrl: subscription.apiBaseUrl,
        accountId: session.accountId ?? "",
        email: session.email ?? "",
      });
      progressSource = "cloud";
      refreshHomeState(remoteProgress.sessionHistory);
    } catch {
      refreshHomeState(localHistory);
    }
  }

  async function refreshActiveCatalogSnapshot() {
    if (!isTauri()) {
      catalogSnapshot = getCatalogSnapshot();
      return;
    }
    try {
      const session = await invoke<AppSession>("get_session");
      const subscription = await invoke<SubscriptionState>("get_subscription_state");
      catalogSnapshot = await loadActiveCatalogSnapshot({
        session,
        subscription,
      });
    } catch {
      catalogSnapshot = getCatalogSnapshot();
    }
  }

  onMount(async () => {
    refreshHomeState();
    if (!isTauri()) {
      loadError =
        "Run with `npm run tauri dev` for the full desktop experience.";
      return;
    }
    try {
      appInfo = await invoke<AppInfo>("get_app_info");
      await refreshActiveCatalogSnapshot();
      await refreshRemoteSurfaceProfile();
      await refreshProgressSurfaceState();
    } catch (e) {
      loadError = String(e);
    }
  });

  afterNavigate(() => {
    void (async () => {
      await refreshActiveCatalogSnapshot();
      await refreshRemoteSurfaceProfile();
      await refreshProgressSurfaceState();
    })();
  });
</script>

<div class="home">
  <section class="panel home-hero ff-page-hero">
    <div class="home-hero__copy">
      <p class="ff-page-hero__eyebrow">Stage-ready practice flow</p>
      <h2 class="home-title ff-page-hero__title">Train with the feel of a rehearsal room, not a spreadsheet dashboard.</h2>
      <p class="home-subtitle ff-page-hero__body">
        Play-along practice with scrolling tab, real-time scoring, loopable repetition, and mic or MIDI input that feels guided instead of clinical.
      </p>
      <div class="home-actions">
        <a href="/library" class="btn btn-primary btn-lg">Browse Library</a>
        <a href="/practice" class="btn btn-lg">Open Practice</a>
      </div>
    </div>

    <div class="ff-page-hero__stats" aria-label="Practice overview">
      <div class="ff-page-hero__stat">
        <span class="ff-page-hero__stat-label">Momentum</span>
        <strong>{practiceGoals.streakDays > 0 ? `${practiceGoals.streakDays}-day streak` : "Start your streak"}</strong>
        <span class="home-hero__stat-detail">
          {practiceGoals.goalMetToday ? "Today's target is already cleared." : "Today's goal is still in reach."}
        </span>
      </div>
      <div class="ff-page-hero__stat">
        <span class="ff-page-hero__stat-label">Recent runs</span>
        <strong>{recentSessions.length > 0 ? `${recentSessions.length} charts tracked` : "No sessions yet"}</strong>
        <span class="home-hero__stat-detail">
          {recentSessions.length > 0
            ? `Resume from the queue or pivot into a recommendation. Source: ${progressSource === "cloud" ? "cloud progress" : "this device"}.`
            : "Complete one full run to seed your queue."}
        </span>
      </div>
      <div class="ff-page-hero__stat">
        <span class="ff-page-hero__stat-label">Seeded path</span>
        <strong>{heroPath?.title ?? "Assessment not set"}</strong>
        <span class="home-hero__stat-detail">
          {heroPath ? "Your onboarding recommendation can drive the next chart automatically." : "Answer the two onboarding questions to seed the right first path."}
        </span>
      </div>
    </div>
  </section>

  {#if loadError}
    <div class="panel">
      <p class="muted">{loadError}</p>
    </div>
  {/if}

  {#if onboarding && !onboarding.hidden}
    {@const nextStep = nextOnboardingStep()}
    {@const seededTrack = activeRecommendedTrack()}
    {@const seededPath = activeRecommendedPath()}
      {@const setupAction = recommendedSetupAction()}
    <section class="home-activation">
      <div class="panel onboarding-panel">
        <div class="ff-section-header onboarding-panel__header">
          <div>
            <p class="ff-section-eyebrow onboarding-panel__eyebrow">First run</p>
            <h2>Setup guide</h2>
          </div>
          <button type="button" class="btn" onclick={dismissSetupGuide}>Dismiss</button>
        </div>
        <p class="onboarding-panel__body">
          Fretflow works best once your input is configured and you have completed one full practice run.
        </p>
        <div class="assessment-panel">
          <div class="assessment-panel__copy">
            <strong>Starting point</strong>
            <p>Answer two questions so Fretflow can seed the right path and first chart instead of dropping you into the full catalog.</p>
          </div>
          <div class="assessment-panel__controls">
            <label class="assessment-field">
              <span>Experience</span>
              <select bind:value={assessmentExperience}>
                <option value="brand_new">Brand new</option>
                <option value="returning">Returning player</option>
                <option value="comfortable">Comfortable already</option>
              </select>
            </label>
            <label class="assessment-field">
              <span>Focus</span>
              <select bind:value={assessmentGoal}>
                <option value="fundamentals">Fundamentals</option>
                <option value="rhythm">Rhythm</option>
                <option value="technique">Technique</option>
              </select>
            </label>
            <button type="button" class="btn" onclick={saveAssessment}>
              {onboarding.assessment ? "Update recommendation" : "Save recommendation"}
            </button>
          </div>
          {#if onboarding.assessment && seededTrack && seededPath}
            <p class="assessment-panel__result">
              Recommended path: <strong>{seededPath.title}</strong> · Start with <strong>{seededTrack.title}</strong>.
            </p>
          {/if}
          {#if setupAction}
            <div class="assessment-setup">
              <div>
                <strong>{setupAction.title}</strong>
                <p>{setupAction.detail}</p>
              </div>
              <a href={setupAction.href} class="btn">Open in Settings</a>
            </div>
          {/if}
        </div>
        <div class="onboarding-panel__progress" role="list" aria-label="Setup steps">
          {#each Object.entries(STEP_COPY) as [stepId, meta] (stepId)}
            <div class="onboarding-step" role="listitem">
              <span class:completed={!onboarding.remainingSteps.includes(stepId as OnboardingStepId)}>
                {!onboarding.remainingSteps.includes(stepId as OnboardingStepId) ? "Done" : "Next"}
              </span>
              <div>
                <strong>{meta.title}</strong>
                <p>{meta.detail}</p>
              </div>
            </div>
          {/each}
        </div>
        {#if nextStep}
          <div class="onboarding-panel__actions">
            <a href={nextStep.href} class="btn btn-primary">{nextStep.title}</a>
            {#if onboarding.assessment && seededTrack}
              <button type="button" class="btn" onclick={openAssessmentRecommendation}>
                Open recommended first chart
              </button>
            {/if}
          </div>
        {/if}
      </div>

      <aside class="home-activation__rail">
        <div class="panel home-note-card">
          <p class="home-note-card__eyebrow">First session target</p>
          <h2>Get one clean run recorded.</h2>
          <p>
            The first completed chart unlocks recent practice, smarter recommendations, and a more useful return-to-practice dashboard.
          </p>
          <ol class="home-steps">
            <li>Verify your mic or MIDI setup in <a href="/settings">Settings</a>.</li>
            <li>Choose a bundled chart from <a href="/library">Library</a>.</li>
            <li>Finish one full run in <a href="/practice">Practice</a> to seed progress.</li>
          </ol>
        </div>

      {#if seededPath}
        <div class="panel home-note-card home-note-card--accent">
            <p class="home-note-card__eyebrow">{remoteProfile ? "Connected profile" : "Seeded recommendation"}</p>
            <h2>{seededPath.title}</h2>
            <p>
              {#if remoteProfile?.fields.practiceGoal}
                Focus: <strong>{remoteProfile.fields.practiceGoal}</strong>.{/if}
              {seededPath.description}
              {#if seededTrack}
                Start with <strong>{seededTrack.title}</strong> for the cleanest first step.
              {/if}
            </p>
            {#if seededTrack}
              <button type="button" class="btn btn-primary" onclick={openAssessmentRecommendation}>
                Open recommended chart
              </button>
            {/if}
          </div>
        {/if}

        <div class="panel home-note-card">
          <p class="home-note-card__eyebrow">Core tools</p>
          <h2>Built for repetition that actually compounds.</h2>
          <ul class="home-features">
            <li>Scrolling tab with real-time accuracy and combo feedback</li>
            <li>Loop A-B, metronome, speed control, and saved practice state</li>
            <li>Mic pitch detection or MIDI input with local scoring</li>
            <li>Recent runs, path guidance, and recommendation continuity</li>
          </ul>
        </div>
      </aside>
    </section>
  {/if}

  {#if hasReturningDashboard()}
    <section class="home-dashboard">
      <div class="home-dashboard__top">
        {#if lastSession}
          <div class="panel continue-panel home-dashboard__hero-card">
            <div>
              <p class="home-note-card__eyebrow">Continue practicing</p>
              <h2>Pick up where the last run ended.</h2>
              <p>
                Last session: <strong>{lastSession.chartTitle}</strong> · {lastSession.accuracyPercent}% accuracy ·
                combo {lastSession.maxCombo}
              </p>
            </div>
            <button type="button" class="btn btn-primary" onclick={openLastSession}>
              {lastSession.practiceTrackId ? "Resume last track" : "Open practice"}
            </button>
          </div>
        {/if}

        <div class="panel goal-panel home-dashboard__goal-card">
          <div class="ff-section-header recent-panel__header">
            <div>
              <p class="ff-section-eyebrow home-note-card__eyebrow">Daily rhythm</p>
              <h2>Daily goal &amp; streak</h2>
              <p class="muted">Consistency is stored locally and updates after each completed chart run.</p>
            </div>
            <a href="/practice" class="btn">Open Practice</a>
          </div>
          <div class="goal-panel__grid">
            <div class="goal-panel__stat">
              <span class="goal-panel__label">Today</span>
              <strong>{practiceGoals.progressToday}</strong>
              <span class="muted">sessions complete</span>
            </div>
            <div class="goal-panel__stat">
              <span class="goal-panel__label">Streak</span>
              <strong>{practiceGoals.streakDays}</strong>
              <span class="muted">day{practiceGoals.streakDays === 1 ? "" : "s"} in a row</span>
            </div>
            <div class="goal-panel__stat">
              <span class="goal-panel__label">Target</span>
              <strong>{practiceGoals.dailyGoalSessions}</strong>
              <span class="muted">session{practiceGoals.dailyGoalSessions === 1 ? "" : "s"} per day</span>
            </div>
          </div>
          <p class="goal-panel__message">
            {#if practiceGoals.goalMetToday}
              Goal met today. Another full run still counts toward recent history and recommendations.
            {:else}
              {@const remaining = practiceGoals.dailyGoalSessions - Math.min(practiceGoals.sessionsToday, practiceGoals.dailyGoalSessions)}
              {remaining} more full run{remaining === 1 ? "" : "s"} to hit today's target.
            {/if}
          </p>
        </div>
      </div>

      <div class="home-dashboard__grid">
        {#if recentSessions.length > 1}
          <div class="panel recent-panel">
            <div class="ff-section-header recent-panel__header">
              <div>
                <p class="ff-section-eyebrow home-note-card__eyebrow">Quick return</p>
                <h2>Recent practice queue</h2>
                <p class="muted">Jump back into charts you have touched recently without digging through Library.</p>
              </div>
              <a href="/library?filter=recent" class="btn">Open recent in Library</a>
            </div>
            <div class="recent-grid">
              {#each recentSessions.slice(0, 4) as session (session.practiceTrackId ?? session.at)}
                <button type="button" class="recent-card" onclick={() => openSession(session)}>
                  <span class="recent-card__title">{session.chartTitle}</span>
                  <span class="recent-card__meta">
                    {session.accuracyPercent}% · combo {session.maxCombo} · {formatSessionRecency(session.at)}
                  </span>
                  <span class="recent-card__cta">{session.practiceTrackId ? "Resume track" : "Open practice"}</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if recommendedTracks.length > 0}
          <div class="panel recent-panel">
            <div class="ff-section-header recent-panel__header">
              <div>
                <p class="ff-section-eyebrow home-note-card__eyebrow">Momentum picks</p>
                <h2>Suggested next charts</h2>
                <p class="muted">Recommendations are based on your recent bundled-chart runs and current accuracy.</p>
              </div>
              <a href="/library" class="btn">Browse all charts</a>
            </div>
            <div class="recent-grid">
              {#each recommendedTracks as item (item.track.id)}
                <button
                  type="button"
                  class="recent-card"
                  onclick={() => void goto(`/practice?track=${encodeURIComponent(item.track.id)}`)}
                >
                  <span class="recent-card__title">{item.track.title}</span>
                  <span class="recent-card__meta">
                    {item.track.artist}
                    {#if item.track.difficulty} · {item.track.difficulty}{/if}
                  </span>
                  <span class="recent-card__detail">{item.reason}</span>
                  <span class="recent-card__cta">Practice this chart</span>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>

      {#if learningPaths.length > 0}
        <div class="panel path-panel">
          <div class="ff-section-header recent-panel__header">
            <div>
              <p class="ff-section-eyebrow home-note-card__eyebrow">Structured progression</p>
              <h2>Learning paths</h2>
              <p class="muted">Structured bundled-chart sequences that give the app a clearer progression than free browsing alone.</p>
            </div>
            <a href="/library" class="btn">Browse Library</a>
          </div>
          <div class="path-grid">
            {#each learningPaths as item (item.path.id)}
              {@const isSeeded = onboarding?.assessment?.recommendedPathId === item.path.id}
              <div class="path-card">
                <div class="path-card__header">
                  <div>
                    <h3>{item.path.title}</h3>
                    <p>{item.path.description}</p>
                  </div>
                  <span class={`path-status path-status--${item.status}`}>
                    {item.status === "completed"
                      ? "Completed"
                      : item.status === "in_progress"
                        ? "In progress"
                        : "Ready"}
                  </span>
                </div>
                {#if isSeeded}
                  <p class="path-card__seeded">Recommended from onboarding assessment</p>
                {/if}
                <div class="path-card__progress">
                  <div class="path-card__progress-bar">
                    <span style={`width: ${item.completionPercent}%`}></span>
                  </div>
                  <span class="path-card__progress-copy">
                    {item.completedSteps}/{item.totalSteps} steps complete
                  </span>
                </div>
                {#if item.nextStep}
                  <p class="path-card__next">
                    Next: <strong>{item.nextStep.track.title}</strong> · {item.nextStep.note}
                    {#if item.nextStep.track.targetBpm != null}
                      · target {item.nextStep.track.targetBpm} BPM
                    {/if}
                    {#if item.nextStep.track.masteryAccuracyThreshold != null}
                      · clear at {item.nextStep.track.masteryAccuracyThreshold}%+
                    {/if}
                  </p>
                  <button type="button" class="btn btn-primary" onclick={() => openLearningPathStep(item)}>
                    {item.status === "not_started" ? "Start path" : "Continue path"}
                  </button>
                {:else}
                  <p class="path-card__next">
                    All steps cleared at the local completion threshold. Use Library recommendations to step up further.
                  </p>
                  <button type="button" class="btn" onclick={() => void goto("/library?filter=recent")}>
                    Review recent charts
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  {#if appInfo}
    <p class="home-version muted">
      {appInfo.displayName} v{appInfo.version}
    </p>
  {/if}
</div>

<style>
  .home {
    max-width: none;
    display: grid;
    gap: 1rem;
  }
  .home-hero {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 1fr);
    gap: 1.25rem;
    margin-bottom: 0;
    padding: 1.4rem;
    background:
      radial-gradient(circle at top right, rgba(63, 208, 195, 0.18), transparent 30%),
      radial-gradient(circle at left center, rgba(213, 138, 84, 0.2), transparent 30%),
      linear-gradient(145deg, rgba(33, 24, 29, 0.96), rgba(18, 15, 19, 0.96));
  }
  .home-hero__copy {
    display: grid;
    align-content: start;
  }
  .home-title {
    max-width: 14ch;
    font-size: clamp(2rem, 3vw, 3.2rem);
  }
  .home-subtitle {
    margin-bottom: 1.4rem;
    max-width: 42rem;
    font-size: 1.02rem;
  }
  .home-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }
  .btn-lg {
    min-height: 48px;
    padding: 0.78rem 1.4rem;
    font-size: 0.96rem;
  }
  .home-hero__stat-detail {
    color: var(--ff-muted);
    font-size: 0.84rem;
    line-height: 1.55;
  }
  .home-activation {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1.5fr) minmax(18rem, 0.9fr);
  }
  .home-activation__rail {
    display: grid;
    gap: 1rem;
    align-content: start;
  }
  .home-dashboard {
    display: grid;
    gap: 1rem;
  }
  .home-dashboard__top,
  .home-dashboard__grid {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .home-dashboard__hero-card,
  .home-dashboard__goal-card {
    margin-bottom: 0;
  }
  .home-note-card {
    display: grid;
    gap: 0.7rem;
  }
  .home-note-card__eyebrow {
    margin: 0;
    color: var(--ff-highlight-strong);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .home-note-card h2 {
    margin: 0;
    font-size: 1.35rem;
  }
  .home-note-card p {
    margin: 0;
    color: var(--ff-muted);
    line-height: 1.6;
  }
  .home-note-card--accent {
    background:
      radial-gradient(circle at top right, rgba(63, 208, 195, 0.14), transparent 35%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 26%),
      linear-gradient(180deg, rgba(30, 24, 29, 0.94), rgba(18, 15, 19, 0.94));
  }
  .home-steps {
    margin: 0;
    padding-left: 1.3rem;
    font-size: 0.92rem;
    color: var(--ff-text);
    line-height: 1.65;
  }
  .home-steps li + li,
  .home-features li + li {
    margin-top: 0.35rem;
  }
  .home-features {
    margin: 0;
    padding-left: 1.3rem;
    font-size: 0.9rem;
    color: var(--ff-muted-strong);
    line-height: 1.65;
  }
  .home-version {
    font-size: 0.8rem;
    margin: 0.2rem 0 0;
  }
  .onboarding-panel {
    background:
      radial-gradient(circle at top right, rgba(63, 208, 195, 0.16), transparent 32%),
      linear-gradient(180deg, rgba(34, 25, 30, 0.96), rgba(18, 15, 19, 0.96));
  }
  .continue-panel {
    display: flex;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .recent-panel__header,
  .onboarding-panel__header {
    margin-bottom: 0.85rem;
  }
  .recent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0.75rem;
  }
  .recent-card {
    display: grid;
    gap: 0.3rem;
    text-align: left;
    padding: 0.95rem 1rem;
    border-radius: 18px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 36%),
      rgba(9, 8, 10, 0.26);
    color: var(--ff-text);
    cursor: pointer;
  }
  .recent-card:hover {
    border-color: color-mix(in srgb, var(--ff-accent) 52%, var(--ff-border));
    background:
      linear-gradient(180deg, rgba(63, 208, 195, 0.08), transparent 36%),
      rgba(9, 8, 10, 0.3);
    transform: translateY(-1px);
  }
  .recent-card__title {
    font-size: 0.94rem;
    font-weight: 600;
  }
  .recent-card__meta {
    font-size: 0.82rem;
    color: var(--ff-muted);
  }
  .recent-card__cta {
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--ff-accent);
    font-weight: 700;
    margin-top: 0.1rem;
  }
  .recent-card__detail {
    font-size: 0.82rem;
    color: var(--ff-text);
    line-height: 1.45;
  }
  .path-panel {
    display: grid;
    gap: 0.9rem;
  }
  .path-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 0.85rem;
  }
  .path-card {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 18px;
    border: 1px solid var(--ff-border);
    background:
      radial-gradient(circle at top right, rgba(63, 208, 195, 0.1), transparent 38%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 30%),
      rgba(9, 8, 10, 0.24);
  }
  .path-card h3 {
    margin: 0 0 0.25rem;
    font-size: 0.98rem;
  }
  .path-card p {
    margin: 0;
    color: var(--ff-muted);
    font-size: 0.84rem;
    line-height: 1.5;
  }
  .path-card__header {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-start;
  }
  .path-status {
    display: inline-flex;
    align-items: center;
    min-height: 1.9rem;
    padding: 0 0.65rem;
    border-radius: 999px;
    border: 1px solid var(--ff-border);
    font-size: 0.74rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }
  .path-status--completed {
    color: var(--ff-success);
    border-color: color-mix(in srgb, var(--ff-success) 45%, var(--ff-border));
  }
  .path-status--in_progress {
    color: var(--ff-accent);
    border-color: color-mix(in srgb, var(--ff-accent) 45%, var(--ff-border));
  }
  .path-status--not_started {
    color: var(--ff-muted);
  }
  .path-card__progress {
    display: grid;
    gap: 0.35rem;
  }
  .path-card__progress-bar {
    height: 0.45rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--ff-border) 75%, transparent);
    overflow: hidden;
  }
  .path-card__progress-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, color-mix(in srgb, var(--ff-accent) 85%, white 15%), var(--ff-accent));
  }
  .path-card__progress-copy {
    font-size: 0.78rem;
    color: var(--ff-muted);
  }
  .path-card__seeded {
    color: var(--ff-accent);
    font-size: 0.78rem;
    font-weight: 600;
  }
  .path-card__next strong {
    color: var(--ff-text);
  }
  .goal-panel {
    display: grid;
    gap: 1rem;
  }
  .goal-panel__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
  }
  .goal-panel__stat {
    display: grid;
    gap: 0.15rem;
    padding: 0.95rem 1rem;
    border-radius: 18px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 36%),
      rgba(9, 8, 10, 0.24);
  }
  .goal-panel__label {
    font-size: 0.76rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ff-muted);
  }
  .goal-panel__stat strong {
    font-size: 1.35rem;
  }
  .goal-panel__message {
    margin: 0;
    color: var(--ff-muted);
    line-height: 1.5;
  }
  .onboarding-panel__eyebrow {
    color: var(--ff-accent);
  }
  .onboarding-panel__body {
    max-width: 42rem;
  }
  .assessment-panel {
    display: grid;
    gap: 0.8rem;
    margin-top: 1rem;
    padding: 0.95rem 1rem;
    border-radius: 18px;
    border: 1px solid var(--ff-border);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 36%),
      rgba(9, 8, 10, 0.24);
  }
  .assessment-panel__copy p,
  .assessment-panel__result {
    margin: 0.25rem 0 0;
    color: var(--ff-muted);
    line-height: 1.5;
  }
  .assessment-panel__controls {
    display: flex;
    gap: 0.65rem;
    flex-wrap: wrap;
    align-items: end;
  }
  .assessment-setup {
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    padding-top: 0.75rem;
    border-top: 1px solid color-mix(in srgb, var(--ff-border) 70%, transparent);
  }
  .assessment-setup p {
    margin: 0.25rem 0 0;
    color: var(--ff-muted);
    line-height: 1.5;
  }
  .assessment-field {
    display: grid;
    gap: 0.25rem;
    min-width: 11rem;
    flex: 1 1 11rem;
  }
  .assessment-field span {
    font-size: 0.8rem;
    color: var(--ff-muted);
  }
  .assessment-field select {
    padding: 0.42rem 0.55rem;
    border-radius: 8px;
    border: 1px solid var(--ff-border);
    background: var(--ff-bg);
    color: var(--ff-text);
    font: inherit;
  }
  .onboarding-panel__progress {
    display: grid;
    gap: 0.75rem;
    margin: 0.9rem 0 0;
  }
  .onboarding-step {
    display: grid;
    grid-template-columns: 3.25rem 1fr;
    gap: 0.75rem;
    align-items: start;
    padding: 0.85rem 0.95rem;
    border: 1px solid var(--ff-border);
    border-radius: 18px;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 34%),
      rgba(9, 8, 10, 0.22);
  }
  .onboarding-step span {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    min-height: 2rem;
    border-radius: 999px;
    border: 1px solid var(--ff-border);
    color: var(--ff-muted);
    font-size: 0.78rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .onboarding-step span.completed {
    color: var(--ff-success);
    border-color: color-mix(in srgb, var(--ff-success) 50%, var(--ff-border));
  }
  .onboarding-step p {
    margin: 0.2rem 0 0;
  }
  .onboarding-panel__actions {
    margin-top: 1rem;
  }
  @media (max-width: 640px) {
    .home-hero {
      grid-template-columns: 1fr;
    }
    .home-activation,
    .home-dashboard__top,
    .home-dashboard__grid {
      grid-template-columns: 1fr;
    }
    .onboarding-step {
      grid-template-columns: 1fr;
    }
  }
</style>
