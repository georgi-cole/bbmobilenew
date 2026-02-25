// Integration tests validating the minimal ceremony-animation fixes.
//
// Validates:
//  1. When the veto was NOT used (povSavedId = null), no AI replacement
//     animation is shown (aiReplacementKey returns '').
//  2. When the veto WAS used (povSavedId set), the AI replacement animation
//     is triggered.
//  3. AI HOH tiebreak choreography: AnimatedVoteResultsModal fires
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
import type { GameState, Player } from '../../src/types';
import GameScreen from '../../src/screens/GameScreen/GameScreen';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => null,
}));

vi.mock('../../src/components/ui/TvZone', () => ({
  default: () => <div data-testid="tv-zone" />,
}));

// Module-level captured callback so AnimatedVoteResultsModal can be called.
let capturedOnTiebreakerRequired: ((tiedIds: string[]) => void) | null = null;

vi.mock('../../src/components/AnimatedVoteResultsModal/AnimatedVoteResultsModal', () => ({
  default: ({
    onTiebreakerRequired,
    onDone,
  }: {
    onTiebreakerRequired?: (ids: string[]) => void;
    onDone: () => void;
  }) => {
    capturedOnTiebreakerRequired = onTiebreakerRequired ?? null;
    return (
      <div data-testid="vote-results-modal">
        <button onClick={onDone}>Done</button>
      </div>
    );
  },
}));

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
    phase: 'pov_ceremony_results',
    seed: 42,
    hohId: 'p1',            // AI HOH
    prevHohId: null,
    nomineeIds: ['p2', 'p3'],
    povWinnerId: 'p2',
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
    // pov_ceremony_results phase, AI HOH, no awaitingPovDecision/SaveTarget,
    // but povSavedId is null/absent → veto was not used → no animation.
    const store = makeStore({
      phase: 'pov_ceremony_results',
      hohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      povWinnerId: 'p2',
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
      phase: 'pov_ceremony_results',
      hohId: 'p1',
      nomineeIds: ['p3', 'p4'], // p2 was saved, p4 is the replacement
      povWinnerId: 'p2',
      povSavedId: 'p2',         // veto WAS used
      awaitingPovDecision: false,
      awaitingPovSaveTarget: false,
      replacementNeeded: false,
    });
    renderWithStore(store);
    await act(async () => {});

    // CeremonyOverlay with replacement label should be visible.
    const statusEl = screen.getByRole('status');
    expect(statusEl.getAttribute('aria-label')).toContain('Replacement nominee ceremony');
  });
});

describe('Ceremony fix: AI HOH tiebreak choreography', () => {
  beforeEach(() => {
    capturedOnTiebreakerRequired = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows AI thinking overlay when onTiebreakerRequired fires with non-human HOH', async () => {
    // AI HOH (p1) — human is p0.
    // Vote results show a tie, evictionSplashId set (AI already picked).
    const store = makeStore({
      phase: 'eviction_results',
      hohId: 'p1',             // AI is HOH
      nomineeIds: ['p2', 'p3'],
      voteResults: { p2: 1, p3: 1 }, // tie
      evictionSplashId: 'p3',        // AI chose p3
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

    // "HOH is breaking the tie" overlay should appear.
    expect(screen.getByText(/HOH is breaking the tie/i)).toBeTruthy();
    // Vote results modal should still be visible (not dismissed yet).
    expect(store.getState().game.voteResults).not.toBeNull();
  });

  it('dismisses vote results after the 3 s choreography completes', async () => {
    const store = makeStore({
      phase: 'eviction_results',
      hohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      voteResults: { p2: 1, p3: 1 },
      evictionSplashId: 'p3',
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
