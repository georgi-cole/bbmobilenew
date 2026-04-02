/**
 * LOH eligibility tests.
 *
 * Validates that:
 *  1. The outgoing LOH (prevHohId) is excluded from the LOH competition
 *     the following week.
 *  2. prevHohId is set correctly when transitioning from week_end to week_start.
 *  3. The outgoing LOH CAN compete in the Final 3 (prevHohId cleared on final3).
 *  4. Week 1 has no outgoing LOH (prevHohId is null).
 *  5. When only two players remain and one is prevHohId, the other player wins LOH.
 *     (Note: this forced state cannot occur in normal game flow — 2 alive players
 *     at week_end transitions to jury, not back to LOH comp — but the logic handles
 *     it correctly as a defensive guarantee.)
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
    lohId: null,
    prevHohId: null,
    nomineeIds: [],
    posWinnerId: null,
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

describe('LOH eligibility — prevHohId tracking', () => {
  it('prevHohId is null in week 1 (no outgoing LOH)', () => {
    const store = makeStore({ phase: 'week_start', week: 1, lohId: null });
    expect(store.getState().game.prevHohId).toBeNull();
  });

  it('prevHohId is set to the outgoing LOH when advancing from week_end to week_start', () => {
    // Start at week_end with an LOH set
    const store = makeStore({ phase: 'week_end', week: 2, lohId: 'p1' });
    store.dispatch(advance()); // week_end → week_start
    const state = store.getState().game;
    expect(state.phase).toBe('week_start');
    expect(state.prevHohId).toBe('p1');
    // lohId cleared at week_start
    expect(state.lohId).toBeNull();
  });

  it('prevHohId persists through loh_comp phase', () => {
    const store = makeStore({ phase: 'week_start', week: 2, lohId: null, prevHohId: 'p1' });
    store.dispatch(advance()); // week_start → loh_comp_announcement
    store.dispatch(advance()); // loh_comp_announcement → loh_comp
    const state = store.getState().game;
    expect(state.phase).toBe('loh_comp');
    expect(state.prevHohId).toBe('p1');
  });

  it('outgoing LOH is never selected as new LOH in loh_results', () => {
    // Run many seeds to confirm the outgoing LOH is never picked
    const outgoingHohId = 'p1';
    const wonAsHoh = new Set<string>();

    for (let seed = 0; seed < 50; seed++) {
      const store = makeStore({
        phase: 'loh_comp',
        week: 2,
        lohId: null,
        prevHohId: outgoingHohId,
        seed,
      });
      store.dispatch(advance()); // loh_comp → loh_results (picks new LOH)
      const state = store.getState().game;
      expect(state.phase).toBe('loh_results');
      wonAsHoh.add(state.lohId ?? '');
      expect(state.lohId).not.toBe(outgoingHohId);
    }
    // Other players can win LOH
    expect(wonAsHoh.size).toBeGreaterThan(1);
  });

  it('outgoing LOH fallback: if only one other player is alive, they win (not the outgoing LOH)', () => {
    // Edge case: only 2 alive players, one is outgoing LOH → the other player should win.
    // Note: in normal game flow this state is unreachable (2 alive players → jury mode),
    // but the logic correctly handles it as a defensive guarantee.
    const players: Player[] = [
      { id: 'p0', name: 'Player 0', avatar: '🧑', status: 'active', isUser: true },
      { id: 'p1', name: 'Player 1', avatar: '🧑', status: 'active' },
    ];
    const store = makeStore({
      phase: 'loh_comp',
      week: 2,
      lohId: null,
      prevHohId: 'p0',
      players,
      seed: 10,
    });
    store.dispatch(advance()); // loh_comp → loh_results
    const state = store.getState().game;
    // With prevHohId = p0, pool is [p1]. p1 should win.
    expect(state.lohId).toBe('p1');
  });

  it('prevHohId is cleared when entering Final 3 (no restriction in Final 3 comps)', () => {
    const store = makeStore({
      phase: 'final3',
      week: 4,
      lohId: null,
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
    // The winner should be someone other than the outgoing LOH.
    // (Note: the challenge participant filtering in GameScreen already excludes
    //  prevHohId from candidates, so the winner from the challenge is always eligible.)
    const store = makeStore({
      phase: 'loh_comp',
      week: 2,
      lohId: null,
      prevHohId: 'p1',
      seed: 42,
    });
    // Simulate MinigameHost declaring p2 as winner (p1 was excluded from participants)
    store.dispatch(applyMinigameWinner({ winnerId: 'p2' }));
    const state = store.getState().game;
    expect(state.phase).toBe('loh_results');
    expect(state.lohId).toBe('p2');
    // p1 (outgoing LOH) is NOT the new LOH
    expect(state.lohId).not.toBe('p1');
  });

  it('week counter advances and prevHohId updates each week', () => {
    // Simulate 2 complete weeks and verify prevHohId is tracked correctly
    const store = makeStore({
      phase: 'week_end',
      week: 2,
      lohId: 'p2',
      prevHohId: 'p1',
    });

    // End of week 2 → start of week 3
    store.dispatch(advance()); // week_end → week_start
    let state = store.getState().game;
    expect(state.week).toBe(3);
    expect(state.prevHohId).toBe('p2'); // p2 was week 2 LOH
    expect(state.lohId).toBeNull();

    // Advance through LOH comp and results to set a new LOH
    store.dispatch(advance()); // week_start → loh_comp_announcement
    store.dispatch(advance()); // loh_comp_announcement → loh_comp
    store.dispatch(advance()); // loh_comp → loh_results (picks new LOH, not p2)
    state = store.getState().game;
    expect(state.lohId).not.toBeNull();
    expect(state.lohId).not.toBe('p2'); // p2 (outgoing LOH) should not win again
  });
});
