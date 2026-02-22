/**
 * HOH eligibility tests.
 *
 * Validates that:
 *  1. The outgoing HOH (prevHohId) is excluded from the HOH competition
 *     the following week.
 *  2. prevHohId is set correctly when transitioning from week_end to week_start.
 *  3. The outgoing HOH CAN compete in the Final 3 (prevHohId cleared on final3).
 *  4. Week 1 has no outgoing HOH (prevHohId is null).
 *  5. When prevHohId is the only alive player, the fallback allows anyone to win.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { advance, applyMinigameWinner } from '../src/store/gameSlice';
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
    week: 1,
    phase: 'week_start',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
  };
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: { ...base, ...overrides } },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HOH eligibility — prevHohId tracking', () => {
  it('prevHohId is null in week 1 (no outgoing HOH)', () => {
    const store = makeStore({ phase: 'week_start', week: 1, hohId: null });
    expect(store.getState().game.prevHohId).toBeNull();
  });

  it('prevHohId is set to the outgoing HOH when advancing from week_end to week_start', () => {
    // Start at week_end with an HOH set
    const store = makeStore({ phase: 'week_end', week: 2, hohId: 'p1' });
    store.dispatch(advance()); // week_end → week_start
    const state = store.getState().game;
    expect(state.phase).toBe('week_start');
    expect(state.prevHohId).toBe('p1');
    // hohId cleared at week_start
    expect(state.hohId).toBeNull();
  });

  it('prevHohId persists through hoh_comp phase', () => {
    const store = makeStore({ phase: 'week_start', week: 2, hohId: null, prevHohId: 'p1' });
    store.dispatch(advance()); // week_start → hoh_comp
    const state = store.getState().game;
    expect(state.phase).toBe('hoh_comp');
    expect(state.prevHohId).toBe('p1');
  });

  it('outgoing HOH is never selected as new HOH in hoh_results', () => {
    // Run many seeds to confirm the outgoing HOH is never picked
    const outgoingHohId = 'p1';
    const wonAsHoh = new Set<string>();

    for (let seed = 0; seed < 50; seed++) {
      const store = makeStore({
        phase: 'hoh_comp',
        week: 2,
        hohId: null,
        prevHohId: outgoingHohId,
        seed,
      });
      store.dispatch(advance()); // hoh_comp → hoh_results (picks new HOH)
      const state = store.getState().game;
      expect(state.phase).toBe('hoh_results');
      wonAsHoh.add(state.hohId ?? '');
      expect(state.hohId).not.toBe(outgoingHohId);
    }
    // Other players can win HOH
    expect(wonAsHoh.size).toBeGreaterThan(1);
  });

  it('outgoing HOH fallback: if only one other player is alive, they win (not the outgoing HOH)', () => {
    // Edge case: only 2 alive players, one is outgoing HOH → fallback allows them
    const players: Player[] = [
      { id: 'p0', name: 'Player 0', avatar: '🧑', status: 'active', isUser: true },
      { id: 'p1', name: 'Player 1', avatar: '🧑', status: 'active' },
    ];
    const store = makeStore({
      phase: 'hoh_comp',
      week: 2,
      hohId: null,
      prevHohId: 'p0',
      players,
      seed: 10,
    });
    store.dispatch(advance()); // hoh_comp → hoh_results
    const state = store.getState().game;
    // With prevHohId = p0, pool is [p1]. p1 should win.
    expect(state.hohId).toBe('p1');
  });

  it('prevHohId is cleared when entering Final 3 (no restriction in Final 3 comps)', () => {
    const store = makeStore({
      phase: 'final3',
      week: 4,
      hohId: null,
      prevHohId: 'p1',
      players: makePlayers(3),
    });
    store.dispatch(advance()); // final3 → final3_comp1
    const state = store.getState().game;
    expect(state.phase).toBe('final3_comp1');
    expect(state.prevHohId).toBeNull();
  });

  it('applyMinigameWinner respects prevHohId exclusion in the challenge flow', () => {
    // When MinigameHost completes, applyMinigameWinner is called with the winner ID.
    // The winner should be someone other than the outgoing HOH.
    // (Note: the challenge participant filtering in GameScreen already excludes
    //  prevHohId from candidates, so the winner from the challenge is always eligible.)
    const store = makeStore({
      phase: 'hoh_comp',
      week: 2,
      hohId: null,
      prevHohId: 'p1',
      seed: 42,
    });
    // Simulate MinigameHost declaring p2 as winner (p1 was excluded from participants)
    store.dispatch(applyMinigameWinner('p2'));
    const state = store.getState().game;
    expect(state.phase).toBe('hoh_results');
    expect(state.hohId).toBe('p2');
    // p1 (outgoing HOH) is NOT the new HOH
    expect(state.hohId).not.toBe('p1');
  });

  it('week counter advances and prevHohId updates each week', () => {
    // Simulate 2 complete weeks and verify prevHohId is tracked correctly
    const store = makeStore({
      phase: 'week_end',
      week: 2,
      hohId: 'p2',
      prevHohId: 'p1',
    });

    // End of week 2 → start of week 3
    store.dispatch(advance()); // week_end → week_start
    let state = store.getState().game;
    expect(state.week).toBe(3);
    expect(state.prevHohId).toBe('p2'); // p2 was week 2 HOH
    expect(state.hohId).toBeNull();

    // Advance through HOH comp and results to set a new HOH
    store.dispatch(advance()); // week_start → hoh_comp
    store.dispatch(advance()); // hoh_comp → hoh_results (picks new HOH, not p2)
    state = store.getState().game;
    expect(state.hohId).not.toBeNull();
    expect(state.hohId).not.toBe('p2'); // p2 (outgoing HOH) should not win again
  });
});
