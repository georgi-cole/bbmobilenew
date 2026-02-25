// Integration tests for the NominationAnimator wiring in GameScreen.
//
// Validates:
//  1. After the human HOH selects nominees, the NominationAnimator overlay
//     appears (game state is NOT yet committed — awaitingNominations remains true).
//  2. After the animation's onDone fires, commitNominees is dispatched and
//     the game state reflects the two nominated players.
//  3. A fallback path: if nominees array is empty the animator is not shown.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
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
    phase: 'nomination_results',
    seed: 42,
    hohId: 'p0',
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    replacementNeeded: false,
    awaitingNominations: true,
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

describe('NominationAnimator wiring in GameScreen', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the NominationAnimator overlay after nominees are confirmed', async () => {
    const store = makeStore();
    renderWithStore(store);

    // Multi-select modal should be visible (human is HOH, awaitingNominations true)
    expect(screen.getByText('Nomination Ceremony')).toBeTruthy();

    // Select two eligible players (p1 and p2) and confirm.
    // getAllByText because the houseguest grid also renders player names.
    await act(async () => {
      fireEvent.click(screen.getAllByText('Player 1')[0]);
      fireEvent.click(screen.getAllByText('Player 2')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Nominees'));
    });

    // The stinger plays and then onConfirm fires — advance past it (default 900 ms)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // The NominationAnimator should now be visible with a status role
    const animStatus = screen.getByRole('status');
    expect(animStatus).toBeTruthy();
    expect(animStatus.getAttribute('aria-label')).toContain('Nomination ceremony');

    // Game state should NOT yet be committed (animation hasn't completed)
    expect(store.getState().game.awaitingNominations).toBe(true);
    expect(store.getState().game.nomineeIds).toHaveLength(0);
  });

  it('commits nominees to game state after the animation completes (onDone)', async () => {
    const store = makeStore();
    renderWithStore(store);

    await act(async () => {
      fireEvent.click(screen.getAllByText('Player 1')[0]);
      fireEvent.click(screen.getAllByText('Player 2')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm Nominees'));
    });

    // Advance past stinger (default 900 ms)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // After the stinger, nominations should not yet be committed.
    let state = store.getState().game;
    expect(state.awaitingNominations).toBe(true);
    expect(state.nomineeIds).toHaveLength(0);
    expect(state.players.find((p) => p.id === 'p1')?.status).not.toBe('nominated');
    expect(state.players.find((p) => p.id === 'p2')?.status).not.toBe('nominated');

    // Advance past the full NominationAnimator lifecycle in steps to allow
    // React state updates to process between each phase transition:
    //   600 ms (entering → holding)
    await act(async () => { vi.advanceTimersByTime(600); });
    state = store.getState().game;
    // Still in animation; nominations are not yet committed.
    expect(state.awaitingNominations).toBe(true);
    expect(state.nomineeIds).toHaveLength(0);

    //   2000 ms (hold)
    await act(async () => { vi.advanceTimersByTime(2000); });
    state = store.getState().game;
    // Still holding; nominations remain uncommitted.
    expect(state.awaitingNominations).toBe(true);
    expect(state.nomineeIds).toHaveLength(0);

    //   500 ms (exiting → done → dispatch commitNominees)
    await act(async () => { vi.advanceTimersByTime(500 + 100); });

    state = store.getState().game;
    expect(state.awaitingNominations).toBe(false);
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toHaveLength(2);
    expect(state.players.find((p) => p.id === 'p1')?.status).toBe('nominated');
    expect(state.players.find((p) => p.id === 'p2')?.status).toBe('nominated');
  });

  it('does not show NominationAnimator when human is not HOH', () => {
    // p1 is HOH (not the human player p0)
    const store = makeStore({ hohId: 'p1' });
    renderWithStore(store);

    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Nomination Ceremony')).toBeNull();
  });

  it('shows NominationAnimator for AI HOH nominations (nominees already in store)', async () => {
    // AI HOH (p1) has already nominated p2 and p3 — awaitingNominations is false.
    // GameScreen should detect this and trigger the animation automatically.
    const store = makeStore({
      hohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      awaitingNominations: false,
    });
    renderWithStore(store);

    // The AI nomination detection effect should fire and show the animator.
    await act(async () => {});

    const animStatus = screen.getByRole('status');
    expect(animStatus).toBeTruthy();
    expect(animStatus.getAttribute('aria-label')).toContain('Nomination ceremony');

    // Store state is already committed (AI nominated directly); game retains nominees.
    expect(store.getState().game.nomineeIds).toContain('p2');
    expect(store.getState().game.nomineeIds).toContain('p3');
  });

  it('does not double-animate AI HOH nominees after the animation completes', async () => {
    const store = makeStore({
      hohId: 'p1',
      nomineeIds: ['p2', 'p3'],
      awaitingNominations: false,
    });
    renderWithStore(store);

    await act(async () => {});

    // Animation is visible.
    expect(screen.getByRole('status')).toBeTruthy();

    // Advance through full NominationAnimator lifecycle.
    await act(async () => { vi.advanceTimersByTime(600); });
    await act(async () => { vi.advanceTimersByTime(2000); });
    await act(async () => { vi.advanceTimersByTime(500 + 100); });

    // Animation done — no duplicate animator should appear.
    expect(screen.queryByRole('status')).toBeNull();

    // Nominees remain committed (commitNominees no-op when awaitingNominations=false).
    expect(store.getState().game.nomineeIds).toHaveLength(2);
  });
});
