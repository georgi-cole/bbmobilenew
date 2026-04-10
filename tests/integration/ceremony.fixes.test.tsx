// Integration tests validating the minimal ceremony-animation fixes.
//
// Validates:
//  1. When the veto was NOT used (povSavedId = null), no AI replacement
//     animation is shown (aiReplacementKey returns '').
//  2. When the veto WAS used (povSavedId set), the AI replacement animation
//     is triggered.
//  3. AI LOH tiebreak choreography: AnimatedVoteResultsModal fires
//     onTiebreakerRequired → 3 s overlay → vote results dismissed → eviction splash.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import challengeReducer from '../../src/store/challengeSlice';
import socialReducer from '../../src/social/socialSlice';
import uiReducer from '../../src/store/uiSlice';
import settingsReducer from '../../src/store/settingsSlice';
import publicOpinionReducer from '../../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player } from '../../src/types';
import GameScreen, { POST_VOTE_ANNOUNCEMENT_DELAY_MS } from '../../src/screens/GameScreen/GameScreen';
import { loadEvictionVoteBreakdownUnlock } from '../../src/features/evictionVoteBreakdownStorage';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}));

vi.mock('../../src/components/ui/TvZone', () => ({
  default: ({
    voteResultsReveal,
    externalAnnouncement,
    onExternalAnnouncementDismiss,
  }: {
    voteResultsReveal?: {
      onTiebreakerRequired?: (ids: string[]) => void;
      onDone: () => void;
    } | null;
    externalAnnouncement?: {
      title: string;
      subtitle?: string;
    } | null;
    onExternalAnnouncementDismiss?: () => void;
  }) => {
    capturedOnTiebreakerRequired = voteResultsReveal?.onTiebreakerRequired ?? null;
    capturedOnExternalAnnouncementDismiss = onExternalAnnouncementDismiss ?? null;
    return (
      <div data-testid="tv-zone">
        {voteResultsReveal && (
          <div data-testid="vote-results-modal">
            <button onClick={voteResultsReveal.onDone}>Done</button>
          </div>
        )}
        {externalAnnouncement && (
          <div data-testid="external-announcement">
            <div>{externalAnnouncement.title}</div>
            {externalAnnouncement.subtitle && <div>{externalAnnouncement.subtitle}</div>}
          </div>
        )}
      </div>
    );
  },
}));

vi.mock('../../src/components/Eviction/SpotlightEvictionOverlay', () => ({
  default: ({ onDone }: { onDone: () => void }) => {
    capturedEvictionSplashDone = onDone;
    return <div data-testid="eviction-overlay" />;
  },
}));

// Module-level captured callbacks so the TV vote reveal / eviction can be triggered.
let capturedOnTiebreakerRequired: ((tiedIds: string[]) => void) | null = null;
let capturedOnExternalAnnouncementDismiss: (() => void) | null = null;
let capturedEvictionSplashDone: (() => void) | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayers(count: number, userIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 1,
    phase: 'pos_ceremony_results',
    seed: 42,
    lohId: 'p1',            // AI LOH
    prevHohId: null,
    nomineeIds: ['p2', 'p3'],
    posWinnerId: 'p2',
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    pendingMinigame: null,
    minigameResult: null,
    twistActive: false,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    voteResults: null,
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    evictionSplashId: null,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
  };
  return configureStore({
    reducer: {
      game: gameReducer,
      challenge: challengeReducer,
      social: socialReducer,
      ui: uiReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: { game: { ...base, ...overrides } },
  });
}

function renderWithStore(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <GameScreen />
      </MemoryRouter>
    </Provider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Ceremony fix: replacement animation gated on veto being used', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 50, y: 100, width: 60, height: 80,
      top: 100, left: 50, bottom: 180, right: 110,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does NOT show replacement animation when veto was not used (povSavedId = null)', async () => {
    // pos_ceremony_results phase, AI LOH, no awaitingPovDecision/SaveTarget,
    // but povSavedId is null/absent → veto was not used → no animation.
    const store = makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      posWinnerId: 'p2',
      awaitingPovDecision: false,
      awaitingPovSaveTarget: false,
      replacementNeeded: false,
      // povSavedId intentionally absent/null → veto not used
    });
    renderWithStore(store);
    await act(async () => {});

    // The CeremonyOverlay for replacement should NOT render.
    // (If it did, it would have role="status" with "Replacement nominee" label.)
    const statusEl = screen.queryByRole('status');
    expect(statusEl).toBeNull();
  });

  it('DOES show replacement animation when veto was used (povSavedId set)', async () => {
    // povSavedId is set → veto was used → replacement animation should fire.
    const store = makeStore({
      phase: 'pos_ceremony_results',
      lohId: 'p1',
      nomineeIds: ['p3', 'p4'], // p2 was saved, p4 is the replacement
      posWinnerId: 'p2',
      povSavedId: 'p2',         // veto WAS used
      awaitingPovDecision: false,
      awaitingPovSaveTarget: false,
      replacementNeeded: false,
    });
    renderWithStore(store);
    await act(async () => {});

    // CeremonyOverlay with replacement label should be visible.
    const statusEl = screen.getByRole('status');
    expect(statusEl.getAttribute('aria-label')).toContain('Backup nominee ceremony');
  });
});

describe('Ceremony fix: AI LOH tiebreak choreography', () => {
  beforeEach(() => {
    capturedOnTiebreakerRequired = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows AI thinking overlay when onTiebreakerRequired fires with non-human LOH', async () => {
    // AI LOH (p1) — human is p0.
    // Vote results show a tie, pendingEviction set (AI already picked).
    const store = makeStore({
      phase: 'eviction_results',
      lohId: 'p1',             // AI is LOH
      nomineeIds: ['p2', 'p3'],
      voteResults: { p2: 1, p3: 1 }, // tie
      pendingEviction: { evicteeId: 'p3', evictionMessage: 'LOH breaks the tie, evicting Player 3. 🗳️' }, // AI chose p3
      awaitingTieBreak: false,
    });
    renderWithStore(store);
    await act(async () => {});

    // Vote results modal should be rendered (mocked).
    expect(screen.getByTestId('vote-results-modal')).toBeTruthy();
    expect(capturedOnTiebreakerRequired).not.toBeNull();

    // Simulate the tie being detected → onTiebreakerRequired fires.
    await act(async () => {
      capturedOnTiebreakerRequired!(['p2', 'p3']);
    });

    // "LOH is breaking the tie" overlay should appear.
    expect(screen.getByText(/LOH is breaking the tie/i)).toBeTruthy();
    // Vote results modal should still be visible (not dismissed yet).
    expect(store.getState().game.voteResults).not.toBeNull();
  });

  it('dismisses vote results after the 3 s choreography completes', async () => {
    const store = makeStore({
      phase: 'eviction_results',
      lohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      voteResults: { p2: 1, p3: 1 },
      pendingEviction: { evicteeId: 'p3', evictionMessage: 'LOH breaks the tie, evicting Player 3. 🗳️' },
      awaitingTieBreak: false,
    });
    renderWithStore(store);
    await act(async () => {});

    await act(async () => {
      capturedOnTiebreakerRequired!(['p2', 'p3']);
    });

    // Before 3 s: voteResults still set.
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(store.getState().game.voteResults).not.toBeNull();

    // After 3 s: voteResults dismissed.
    await act(async () => { vi.advanceTimersByTime(1500); });
    expect(store.getState().game.voteResults).toBeNull();
  });
});

describe('Ceremony follow-up: eviction vote breakdown reward prompt', () => {
  beforeEach(() => {
    capturedOnExternalAnnouncementDismiss = null;
    capturedEvictionSplashDone = null;
    sessionStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('offers the rewarded vote breakdown reveal after the eviction animation', async () => {
    const store = makeStore({
      phase: 'eviction_results',
      nomineeIds: ['p2', 'p3'],
      voteResults: { p2: 5, p3: 4 },
      votes: { p1: 'p2', p4: 'p2', p5: 'p3' },
      pendingEviction: { evicteeId: 'p2', evictionMessage: 'Player 2 has been eliminated. 🚪' },
    });

    renderWithStore(store);
    await act(async () => {});

    screen.getByTestId('vote-results-modal');
    act(() => {
      screen.getByText('Done').click();
    });

    expect(screen.getByTestId('external-announcement')).toHaveTextContent('By a vote of 5 to 4');

    // Dismiss the post-vote announcement on the main TV.
    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.();
    });

    // The eviction animation starts only after the extra post-announcement delay.
    expect(screen.queryByTestId('eviction-overlay')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(POST_VOTE_ANNOUNCEMENT_DELAY_MS - 1);
    });
    expect(screen.queryByTestId('eviction-overlay')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('eviction-overlay')).toBeTruthy();
    await act(async () => {
      capturedEvictionSplashDone?.();
    });

    expect(screen.getByRole('dialog', { name: /peek behind the curtain/i })).toBeTruthy();
  });

  it('unlocks the confessional vote breakdown when the ad is accepted in dev/web', async () => {
    const store = makeStore({
      phase: 'eviction_results',
      week: 3,
      nomineeIds: ['p2', 'p3'],
      voteResults: { p2: 5, p3: 4 },
      votes: { p1: 'p2', p4: 'p2', p5: 'p3' },
      pendingEviction: { evicteeId: 'p2', evictionMessage: 'Player 2 has been eliminated. 🚪' },
    });

    renderWithStore(store);
    await act(async () => {});

    act(() => {
      screen.getByText('Done').click();
    });

    expect(screen.getByTestId('external-announcement')).toHaveTextContent('By a vote of 5 to 4');

    // Dismiss post-vote announcement then complete eviction animation.
    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.();
    });
    await act(async () => {
      vi.advanceTimersByTime(POST_VOTE_ANNOUNCEMENT_DELAY_MS);
    });
    await act(async () => {
      capturedEvictionSplashDone?.();
    });

    act(() => {
      screen.getByRole('button', { name: /watch ad to unlock vote reveal/i }).click();
    });

    expect(loadEvictionVoteBreakdownUnlock()).toMatchObject({
      week: 3,
      phase: 'eviction_results',
      evicteeId: 'p2',
      status: 'available',
    });
    expect(store.getState().game.voteResults).toBeNull();
  });

  it('uses vote-count wording instead of X-to-Y copy when more than two nominees are present', async () => {
    const store = makeStore({
      phase: 'eviction_results',
      nomineeIds: ['p2', 'p3', 'p4'],
      voteResults: { p2: 5, p3: 3, p4: 1 },
      votes: { p1: 'p2', p5: 'p2' },
      pendingEviction: { evicteeId: 'p2', evictionMessage: 'Player 2 has been eliminated. 🚪' },
    });

    renderWithStore(store);
    await act(async () => {});

    act(() => {
      screen.getByText('Done').click();
    });

    expect(screen.getByTestId('external-announcement')).toHaveTextContent('With 5 votes');
    expect(screen.getByTestId('external-announcement')).toHaveTextContent('Player 2, your game ends here.');
    await act(async () => {
      capturedOnExternalAnnouncementDismiss?.();
    });
    expect(screen.queryByTestId('eviction-overlay')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(POST_VOTE_ANNOUNCEMENT_DELAY_MS);
    });
    expect(screen.getByTestId('eviction-overlay')).toBeTruthy();
  });
});
