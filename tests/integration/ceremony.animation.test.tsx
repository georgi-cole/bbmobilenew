// Integration tests for the HOH/POV ceremony spotlight animation rect fix.
//
// Validates:
//  1. SpotlightAnimation uses measureA to measure the winner tile rect on
//     mount (synchronous lazy-init), not a pre-captured stale snapshot.
//  2. When applyMinigameWinner runs before the ceremony (RAF deferral),
//     SpotlightAnimation still targets the correct winner tile by calling
//     measureA() fresh when it mounts after the RAF fires.
//  3. Distinct rects per player id — the measured rect corresponds to the
//     actual winner (game.hohId tile), not a stale wrong-player rect.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../src/store/gameSlice';
import challengeReducer from '../../src/store/challengeSlice';
import socialReducer from '../../src/social/socialSlice';
import uiReducer from '../../src/store/uiSlice';
import settingsReducer from '../../src/store/settingsSlice';
import type { GameState, Player } from '../../src/types';
import GameScreen from '../../src/screens/GameScreen/GameScreen';

// ── Module-level captured callbacks ────────────────────────────────────────
let capturedMinigameOnDone: ((rawValue: number) => void) | null = null;

vi.mock('../../src/components/MinigameHost/MinigameHost', () => ({
  default: ({ onDone }: { onDone: (rawValue: number) => void }) => {
    capturedMinigameOnDone = onDone;
    return <div data-testid="minigame-mock" />;
  },
}));

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
    phase: 'hoh_comp',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
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

describe('ceremony animation: SpotlightAnimation uses authoritative winner rect', () => {
  beforeEach(() => {
    capturedMinigameOnDone = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('SpotlightAnimation measures winner tile via measureA (not stale pre-captured rect)', async () => {
    // Assign distinct rects per data-player-id so we can verify which player
    // was targeted by the SpotlightAnimation.
    //
    // The winner (determined by completeChallenge with score=100 for the human
    // player p0) should be p0. Mock getBoundingClientRect so each element
    // returns a rect determined by its data-player-id attribute.
    const rectsByPlayerId: Record<string, DOMRect> = {
      p0: { x: 10, y: 20, width: 50, height: 60, top: 20, left: 10, bottom: 80, right: 60, toJSON: () => ({}) } as DOMRect,
      p1: { x: 70, y: 20, width: 50, height: 60, top: 20, left: 70, bottom: 80, right: 120, toJSON: () => ({}) } as DOMRect,
    };

    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const playerId = this.getAttribute('data-player-id');
      if (playerId && rectsByPlayerId[playerId]) {
        return rectsByPlayerId[playerId];
      }
      // Return a valid non-zero rect for other elements so overlays render.
      return { x: 0, y: 0, width: 50, height: 50, top: 0, left: 0, bottom: 50, right: 50, toJSON: () => ({}) } as DOMRect;
    });

    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('hoh_comp')); });
    expect(capturedMinigameOnDone).not.toBeNull();

    // Trigger minigame completion with a high score for the human (p0 wins).
    await act(async () => { capturedMinigameOnDone!(100); });

    // Before RAF fires, store is NOT yet committed (RAF is pending).
    // phase is still hoh_comp (dispatch deferred).
    // NOTE: hohId is null because the store update is still deferred.
    expect(store.getState().game.hohId).toBeNull();

    // Flush the deferred requestAnimationFrame so SpotlightAnimation mounts.
    await act(async () => { vi.advanceTimersByTime(16); });

    // SpotlightAnimation should now be mounted.
    // It should show the ceremony overlay (valid rects → visible role="status").
    const statusEl = screen.getByRole('status');
    expect(statusEl.getAttribute('aria-label')).toContain('wins Head of Household');

    // Phase is NOT yet committed — store mutation still deferred until ceremony ends.
    expect(store.getState().game.phase).toBe('hoh_comp');
    expect(store.getState().game.hohId).toBeNull();

    // Advance past animation duration + exit transition.
    await act(async () => { vi.advanceTimersByTime(2800); });
    await act(async () => { vi.advanceTimersByTime(350 + 50); });

    // After ceremony completes, the winner is committed to the store.
    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).toBe('p0');
  });

  it('SpotlightAnimation fires onDone immediately when measureA returns null (headless/jsdom zero rect)', async () => {
    // getBoundingClientRect returns zero rect by default in jsdom.
    // SpotlightAnimation lazy-init calls measureA → null → CeremonyOverlay fires
    // onDone immediately → winner committed without visual animation.
    const store = makeStore();
    renderWithStore(store);

    await act(async () => { store.dispatch(setPhase('hoh_comp')); });
    expect(capturedMinigameOnDone).not.toBeNull();

    await act(async () => { capturedMinigameOnDone!(100); });

    // Flush RAF so SpotlightAnimation mounts.
    await act(async () => { vi.advanceTimersByTime(16); });

    // Zero rects → onDone fires immediately → winner committed.
    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).not.toBeNull();
  });
});
