/**
 * Endgame flow regression tests.
 *
 * Validates that:
 *  1. After the Final 3 eviction (setting phase to 'week_end') advance()
 *     transitions directly to 'jury' and never re-enters the weekly cycle.
 *  2. advance() is a no-op while in 'jury' phase.
 *  3. A deterministic simulation from a 5-player state reaches 'jury' without
 *     an infinite loop.
 *  4. nomination_results and eviction_results guards prevent processing when
 *     the alive count is too small.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  finalizeFinal3Eviction,
} from '../src/store/gameSlice';
import type { GameState, Player } from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 8,
    phase: 'week_end',
    seed: 42,
    hohId: 'p0',
    nomineeIds: [],
    povWinnerId: null,
    replacementNeeded: false,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    players: makePlayers(12),
    tvFeed: [],
    isLive: false,
  };
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: { ...base, ...overrides } },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('advance() — jury terminal guard', () => {
  it('is a no-op when phase is already "jury"', () => {
    const store = makeStore({ phase: 'jury', players: makePlayers(12) });
    const stateBefore = store.getState().game;

    store.dispatch(advance());
    store.dispatch(advance());
    store.dispatch(advance());

    const stateAfter = store.getState().game;
    expect(stateAfter.phase).toBe('jury');
    // Seed and week must not change (no state mutation when no-op fires)
    expect(stateAfter.seed).toBe(stateBefore.seed);
    expect(stateAfter.week).toBe(stateBefore.week);
    expect(stateAfter.players).toEqual(stateBefore.players);
  });
});

describe('advance() — week_end → jury transition', () => {
  it('transitions to "jury" when exactly 2 alive players are at week_end', () => {
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'active', isUser: true },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'active' },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];

    const store = makeStore({ phase: 'week_end', players });

    store.dispatch(advance());

    expect(store.getState().game.phase).toBe('jury');
  });

  it('transitions to "jury" when fewer than 2 alive players (defensive)', () => {
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'active', isUser: true },
      ...Array.from({ length: 11 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];

    const store = makeStore({ phase: 'week_end', players });

    store.dispatch(advance());

    expect(store.getState().game.phase).toBe('jury');
  });

  it('does NOT transition to "jury" when 3+ players are alive at week_end', () => {
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'active', isUser: true },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'active' },
      { id: 'p2', name: 'Carol', avatar: '👩', status: 'active' },
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];

    const store = makeStore({ phase: 'week_end', players });

    store.dispatch(advance());

    // Should go to week_start, not jury
    expect(store.getState().game.phase).toBe('week_start');
  });
});

describe('finalizeFinal3Eviction() + advance() — no infinite loop', () => {
  it('reaches "jury" after human Final HOH evicts 3rd-place houseguest', () => {
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'hoh', isUser: true },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'nominated' },
      { id: 'p2', name: 'Carol', avatar: '👩', status: 'nominated' },
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];

    const store = makeStore({
      phase: 'final3_decision',
      hohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      awaitingFinal3Eviction: true,
      players,
    });

    // Human Final HOH evicts p1
    store.dispatch(finalizeFinal3Eviction('p1'));
    expect(store.getState().game.phase).toBe('week_end');

    // advance() from week_end with 2 alive → must go to jury, never week_start
    store.dispatch(advance());
    expect(store.getState().game.phase).toBe('jury');

    // Calling advance() again must remain a no-op
    store.dispatch(advance());
    expect(store.getState().game.phase).toBe('jury');
  });
});

describe('nomination_results guard', () => {
  it('skips nomination when pool has fewer than 2 eligible players', () => {
    // Only 2 players alive: HOH + 1 other → can't nominate 2
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'hoh', isUser: true },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'active' },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];

    const store = makeStore({
      phase: 'nominations',
      hohId: 'p0',
      nomineeIds: [],
      players,
    });

    store.dispatch(advance()); // nominations → nomination_results
    const state = store.getState().game;

    // No one should be nominated (guard fired)
    expect(state.nomineeIds).toHaveLength(0);
    expect(state.phase).toBe('nomination_results');
  });
});

describe('eviction_results guard', () => {
  it('skips eviction when fewer than 2 alive players', () => {
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'nominated', isUser: true },
      ...Array.from({ length: 11 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];

    const store = makeStore({
      phase: 'live_vote',
      nomineeIds: ['p0'],
      players,
    });

    store.dispatch(advance()); // live_vote → eviction_results
    const state = store.getState().game;

    // Eviction guard should have fired; p0 must still be alive (not evicted)
    const p0 = state.players.find((p) => p.id === 'p0');
    expect(p0?.status).toBe('nominated');
  });
});

describe('endgame simulation — Final 5 through to jury', () => {
  /**
   * Deterministic fast-forward from a 5-player, week_end state.
   * We advance() at most 100 steps; the test fails if it loops.
   */
  it('reaches "jury" from a 5-player game within 100 advance() calls', () => {
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'active', isUser: true },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'active' },
      { id: 'p2', name: 'Carol', avatar: '👩', status: 'active' },
      { id: 'p3', name: 'Dave', avatar: '🧑', status: 'active' },
      { id: 'p4', name: 'Eve', avatar: '👩', status: 'active' },
      ...Array.from({ length: 7 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];

    const store = makeStore({
      phase: 'week_end',
      week: 7,
      players,
      seed: 12345,
    });

    const MAX_STEPS = 100;
    let steps = 0;
    while (store.getState().game.phase !== 'jury' && steps < MAX_STEPS) {
      const state = store.getState().game;
      // Auto-resolve human blocking states by dispatching the right action
      if (
        state.awaitingFinal3Eviction &&
        state.phase === 'final3_decision' &&
        state.nomineeIds.length > 0
      ) {
        store.dispatch(finalizeFinal3Eviction(state.nomineeIds[0]));
      } else {
        store.dispatch(advance());
      }
      steps++;
    }

    expect(store.getState().game.phase).toBe('jury');
    expect(steps).toBeLessThan(MAX_STEPS);

    // Exactly 2 players should remain alive (finalists)
    const alive = store
      .getState()
      .game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
    expect(alive).toHaveLength(2);
  });
});
