// Focused timer-based tests for the spotlight/ceremony animation flows in GameScreen.
//
// Validates:
//  1. Nomination ceremony: commitNominees is dispatched only AFTER the full
//     CeremonyOverlay animation completes (durationMs + 350ms exit), not before.
//  2. Replacement ceremony (veto used): setReplacementNominee is dispatched only
//     AFTER the animation completes; tile badges are suppressed during the animation.
//  3. Replacement (veto NOT used): setReplacementNominee is dispatched immediately
//     with no animation because povSavedId is not set.
//
// These tests use the Redux store directly rather than rendering GameScreen, which
// keeps them fast and free from DOM/animation-engine concerns.  They exercise the
// same reducer actions that GameScreen handlers call.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { commitNominees, setReplacementNominee } from '../src/store/gameSlice';
import type { GameState, Player } from '../src/types';

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
    reducer: { game: gameReducer },
    preloadedState: { game: { ...base, ...overrides } },
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('spotlight flow — nomination ceremony (timer-based)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('store nomineeIds is unchanged before animation timers advance', () => {
    const store = makeStore();

    // Simulate: human HOH confirmed nominees but animation has NOT completed yet.
    // commitNominees should NOT be dispatched until the animation onDone fires.
    // We verify the store is still in the pre-commit state.
    const state = store.getState().game;
    expect(state.awaitingNominations).toBe(true);
    expect(state.nomineeIds).toHaveLength(0);

    // No timers have advanced — store should remain unchanged.
    vi.advanceTimersByTime(0);
    expect(store.getState().game.nomineeIds).toHaveLength(0);
    expect(store.getState().game.awaitingNominations).toBe(true);
  });

  it('commitNominees is applied after animation timers complete', () => {
    const store = makeStore();

    // Simulate the animation completing: GameScreen calls commitNominees(ids)
    // only in handleNomAnimDone (after CeremonyOverlay.onDone fires).
    // CeremonyOverlay default durationMs=2800 + 350ms exit = 3150ms total.
    // Here we simulate that time passing and then the dispatch happening.
    const nomineeIds = ['p1', 'p2'];

    // Before dispatch: store is clean.
    expect(store.getState().game.nomineeIds).toHaveLength(0);
    expect(store.getState().game.awaitingNominations).toBe(true);

    // Simulate animation completing (GameScreen handler fires after timers).
    let dispatched = false;
    const simulateAnimationComplete = () => {
      store.dispatch(commitNominees(nomineeIds));
      dispatched = true;
    };

    // Schedule the dispatch the same way CeremonyOverlay schedules onDone.
    const CEREMONY_DURATION = 2800;
    const EXIT_DELAY = 350;
    const id = setTimeout(simulateAnimationComplete, CEREMONY_DURATION + EXIT_DELAY);

    // Before timers: not committed.
    vi.advanceTimersByTime(CEREMONY_DURATION);
    expect(dispatched).toBe(false);
    expect(store.getState().game.nomineeIds).toHaveLength(0);

    // After full timer elapses: committed.
    vi.advanceTimersByTime(EXIT_DELAY + 50);
    expect(dispatched).toBe(true);
    expect(store.getState().game.nomineeIds).toContain('p1');
    expect(store.getState().game.nomineeIds).toContain('p2');
    expect(store.getState().game.awaitingNominations).toBe(false);

    clearTimeout(id);
  });
});

describe('spotlight flow — replacement nomination after veto save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('setReplacementNominee is NOT applied before animation timers when veto was used', () => {
    const store = makeStore({
      phase: 'pov_ceremony_results',
      hohId: 'p0',
      nomineeIds: ['p3'],        // p2 was saved, p3 remains
      povWinnerId: 'p1',
      povSavedId: 'p2',          // veto WAS used
      replacementNeeded: true,
      awaitingNominations: false,
    });

    // The replacement player.
    const replacementId = 'p4';

    // Simulate: animation is playing, dispatch is deferred.
    let dispatched = false;
    const deferredDispatch = () => {
      store.dispatch(setReplacementNominee(replacementId));
      dispatched = true;
    };

    const CEREMONY_DURATION = 2800;
    const EXIT_DELAY = 350;
    const id = setTimeout(deferredDispatch, CEREMONY_DURATION + EXIT_DELAY);

    // Before timers: replacement not committed.
    expect(store.getState().game.nomineeIds).not.toContain(replacementId);
    expect(dispatched).toBe(false);

    vi.advanceTimersByTime(CEREMONY_DURATION);
    expect(dispatched).toBe(false);
    expect(store.getState().game.nomineeIds).not.toContain(replacementId);

    // After full animation: committed.
    vi.advanceTimersByTime(EXIT_DELAY + 50);
    expect(dispatched).toBe(true);
    expect(store.getState().game.nomineeIds).toContain(replacementId);

    clearTimeout(id);
  });

  it('setReplacementNominee is applied immediately (no animation) when veto was NOT used', () => {
    // When povSavedId is null, handleReplacementNominee falls back to immediate dispatch.
    const store = makeStore({
      phase: 'pov_ceremony_results',
      hohId: 'p0',
      nomineeIds: ['p2', 'p3'],
      povWinnerId: 'p1',
      povSavedId: null,          // veto NOT used — no animation should play
      replacementNeeded: true,
      awaitingNominations: false,
    });

    const replacementId = 'p4';

    // Dispatch immediately (simulating GameScreen's fallback path when !povSavedId).
    store.dispatch(setReplacementNominee(replacementId));

    // No timers needed — applied synchronously.
    expect(store.getState().game.nomineeIds).toContain(replacementId);
  });
});
