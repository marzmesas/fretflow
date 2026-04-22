<script lang="ts">
  import { afterNavigate, goto } from "$app/navigation";
  import { onMount } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import type { AppInfo } from "$lib/ipc";
  import { getLearningPathProgress, type LearningPathProgress } from "$lib/catalog/learning-paths";
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

  function refreshHomeState() {
    onboarding = getOnboardingSnapshot();
    lastSession = loadLastSession();
    const history = loadSessionHistory();
    recentSessions = getRecentSessions(history, 4);
    recommendedTracks = getRecommendedTracks(history, 3);
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
    const trackId = path.nextStep?.track.id ?? path.path.steps[0]?.track.id;
    if (!trackId) {
      void goto("/library");
      return;
    }
    void goto(`/practice?track=${encodeURIComponent(trackId)}`);
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
    } catch (e) {
      loadError = String(e);
    }
  });

  afterNavigate(() => {
    refreshHomeState();
  });
</script>

<div class="home">
  <div class="home-hero">
    <h1 class="home-title">Fretflow</h1>
    <p class="home-subtitle">
      Play-along practice with scrolling tab, real-time scoring, and mic or MIDI input.
    </p>
    <div class="home-actions">
      <a href="/library" class="btn btn-primary btn-lg">Browse Library</a>
      <a href="/practice" class="btn btn-lg">Open Practice</a>
    </div>
  </div>

  {#if loadError}
    <div class="panel">
      <p class="muted">{loadError}</p>
    </div>
  {/if}

  {#if onboarding && !onboarding.hidden}
    {@const nextStep = nextOnboardingStep()}
    <div class="panel onboarding-panel">
      <div class="onboarding-panel__header">
        <div>
          <p class="onboarding-panel__eyebrow">First run</p>
          <h2>Setup guide</h2>
        </div>
        <button type="button" class="btn" onclick={dismissSetupGuide}>Dismiss</button>
      </div>
      <p class="onboarding-panel__body">
        Fretflow works best once your input is configured and you have completed one full practice run.
      </p>
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
        </div>
      {/if}
    </div>
  {/if}

  {#if lastSession}
    <div class="panel continue-panel">
      <div>
        <h2>Continue practicing</h2>
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

  {#if recentSessions.length > 1}
    <div class="panel recent-panel">
      <div class="recent-panel__header">
        <div>
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
      <div class="recent-panel__header">
        <div>
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

  {#if learningPaths.length > 0}
    <div class="panel path-panel">
      <div class="recent-panel__header">
        <div>
          <h2>Learning paths</h2>
          <p class="muted">Structured bundled-chart sequences that give the app a clearer progression than free browsing alone.</p>
        </div>
        <a href="/library" class="btn">Browse Library</a>
      </div>
      <div class="path-grid">
        {#each learningPaths as item (item.path.id)}
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

  <div class="panel goal-panel">
    <div class="recent-panel__header">
      <div>
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

  <div class="home-cards">
    <div class="panel home-card">
      <h2>Get started</h2>
      <ol class="home-steps">
        <li>Pick a chart from the <a href="/library">Library</a> or import your own MIDI / JSON file</li>
        <li>Connect your guitar via <strong>MIDI</strong> or use the built-in <strong>mic</strong> (configure in <a href="/settings">Settings</a>)</li>
        <li>Hit <strong>Play</strong> and follow the scrolling highway — aim for <strong>Perfect</strong> timing</li>
      </ol>
    </div>

    <div class="panel home-card">
      <h2>Features</h2>
      <ul class="home-features">
        <li>14 bundled exercises from beginner to advanced</li>
        <li>Import your own MIDI or chart JSON files</li>
        <li>MIDI scoring with latency calibration</li>
        <li>Mic pitch detection (YIN) with adaptive onset</li>
        <li>Practice and Performance timing modes</li>
        <li>Loop A–B, metronome, speed control</li>
        <li>Session history with accuracy tracking</li>
      </ul>
    </div>
  </div>

  {#if appInfo}
    <p class="home-version muted">
      {appInfo.displayName} v{appInfo.version}
    </p>
  {/if}
</div>

<style>
  .home {
    max-width: 44rem;
  }
  .home-hero {
    margin-bottom: 1.5rem;
  }
  .home-title {
    margin: 0 0 0.35rem;
    font-size: 2rem;
    letter-spacing: -0.03em;
    font-weight: 800;
  }
  .home-subtitle {
    margin: 0 0 1.25rem;
    font-size: 1.05rem;
    color: var(--ff-muted);
    line-height: 1.5;
  }
  .home-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }
  .btn-lg {
    padding: 0.6rem 1.3rem;
    font-size: 0.95rem;
  }
  .home-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .home-card h2 {
    margin: 0 0 0.6rem;
  }
  .home-steps {
    margin: 0;
    padding-left: 1.3rem;
    font-size: 0.92rem;
    color: var(--ff-text);
    line-height: 1.65;
  }
  .home-features {
    margin: 0;
    padding-left: 1.3rem;
    font-size: 0.88rem;
    color: var(--ff-muted);
    line-height: 1.65;
  }
  .home-version {
    font-size: 0.8rem;
    margin-top: 0.5rem;
  }
  .onboarding-panel {
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--ff-accent) 18%, transparent), transparent 35%),
      linear-gradient(180deg, color-mix(in srgb, var(--ff-surface) 92%, #09101d), var(--ff-surface));
  }
  .onboarding-panel__header,
  .continue-panel {
    display: flex;
    gap: 1rem;
    align-items: start;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .recent-panel__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem 1rem;
    flex-wrap: wrap;
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
    padding: 0.85rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--ff-border);
    background: color-mix(in srgb, var(--ff-bg) 78%, transparent);
    color: var(--ff-text);
    cursor: pointer;
  }
  .recent-card:hover {
    border-color: color-mix(in srgb, var(--ff-accent) 55%, var(--ff-border));
    background: color-mix(in srgb, var(--ff-accent) 10%, var(--ff-bg));
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
    padding: 0.95rem;
    border-radius: 12px;
    border: 1px solid var(--ff-border);
    background:
      radial-gradient(circle at top right, color-mix(in srgb, var(--ff-accent) 8%, transparent), transparent 38%),
      color-mix(in srgb, var(--ff-bg) 82%, transparent);
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
    padding: 0.85rem 0.9rem;
    border-radius: 10px;
    border: 1px solid var(--ff-border);
    background: color-mix(in srgb, var(--ff-bg) 78%, transparent);
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
    margin: 0 0 0.2rem;
    color: var(--ff-accent);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.74rem;
  }
  .onboarding-panel__body {
    max-width: 42rem;
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
    padding: 0.75rem 0.85rem;
    border: 1px solid var(--ff-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--ff-bg) 72%, transparent);
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
    .onboarding-step {
      grid-template-columns: 1fr;
    }
  }
</style>
