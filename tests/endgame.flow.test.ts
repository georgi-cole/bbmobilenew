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
 *  5. Final 4: pov_comp with 4 alive → final4_eviction → correct nominees →
 *     final3 after eviction.
 *  6. Final 3: full flow from final3 through comp1/comp2/comp3 to jury.
 *  7. Regression: eviction_results never evicts when 2 or fewer players alive.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  finalizeFinal3Eviction,
  finalizeFinal4Eviction,
  applyF3MinigameWinner,
  selectNominee1,
  finalizeNominations,
  submitPovDecision,
  submitPovSaveTarget,
  setReplacementNominee,
  submitHumanVote,
  submitTieBreak,
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
      } else if (state.awaitingNominations && !state.pendingNominee1Id) {
        // Step 1: pick a valid nominee 1 (first non-HOH alive player)
        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        const pool = alive.filter((p) => p.id !== state.hohId);
        if (pool.length >= 2) {
          store.dispatch(selectNominee1(pool[0].id));
        } else {
          store.dispatch(advance());
        }
      } else if (state.awaitingNominations && state.pendingNominee1Id) {
        // Step 2: pick a valid nominee 2 (second non-HOH alive player)
        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        const pool = alive.filter((p) => p.id !== state.hohId && p.id !== state.pendingNominee1Id);
        if (pool.length >= 1) {
          store.dispatch(finalizeNominations(pool[0].id));
        } else {
          store.dispatch(advance());
        }
      } else if (state.awaitingPovDecision && state.phase === 'final4_eviction') {
        // Human is POV holder at Final 4; must choose who to evict via finalizeFinal4Eviction
        if (state.nomineeIds.length > 0) {
          store.dispatch(finalizeFinal4Eviction(state.nomineeIds[0]));
        } else {
          store.dispatch(advance());
        }
      } else if (state.awaitingPovDecision) {
        // Human POV holder decides not to use the veto
        store.dispatch(submitPovDecision(false));
      } else if (state.awaitingPovSaveTarget && state.nomineeIds.length > 0) {
        store.dispatch(submitPovSaveTarget(state.nomineeIds[0]));
      } else if (state.replacementNeeded) {
        // Human HOH picks a replacement nominee
        const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
        const pool = alive.filter(
          (p) =>
            p.id !== state.hohId &&
            p.id !== state.povWinnerId &&
            !state.nomineeIds.includes(p.id),
        );
        if (pool.length > 0) {
          store.dispatch(setReplacementNominee(pool[0].id));
        } else {
          store.dispatch(advance());
        }
      } else if (state.awaitingHumanVote && state.nomineeIds.length > 0) {
        store.dispatch(submitHumanVote(state.nomineeIds[0]));
      } else if (state.awaitingTieBreak) {
        const tied = state.tiedNomineeIds ?? state.nomineeIds;
        if (tied.length > 0) {
          store.dispatch(submitTieBreak(tied[0]));
        } else {
          store.dispatch(advance());
        }
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

// ── Final 4 flow tests ────────────────────────────────────────────────────────

describe('Final 4 flow — pov_comp → final4_eviction → final3', () => {
  /**
   * Build a 4-player state ready for the POV competition.
   * All players are AI (no isUser) so no minigame is launched and
   * advance() can proceed without TapRace interaction.
   */
  function makeFinal4Store(options: { withHumanPovWinner?: boolean } = {}) {
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'hoh' },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'nominated' },
      { id: 'p2', name: 'Carol', avatar: '👩', status: 'nominated' },
      { id: 'p3', name: 'Dave', avatar: '🧑', status: 'active' },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];

    const base: GameState = {
      season: 1,
      week: 9,
      phase: 'pov_comp',
      seed: 42,
      hohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      povWinnerId: null,
      replacementNeeded: false,
      awaitingFinal3Eviction: false,
      f3Part1WinnerId: null,
      f3Part2WinnerId: null,
      players,
      tvFeed: [],
      isLive: false,
    };

    if (options.withHumanPovWinner) {
      // Pre-set the POV winner to the human player (p3 as human, already won POV)
      // Use final4_eviction phase directly to test the blocking behavior
      const humanPlayers = players.map((p) =>
        p.id === 'p3' ? { ...p, isUser: true, status: 'pov' as const } : p,
      );
      return configureStore({
        reducer: { game: gameReducer },
        preloadedState: {
          game: {
            ...base,
            phase: 'final4_eviction' as const,
            povWinnerId: 'p3',
            nomineeIds: ['p1', 'p2'],
            players: humanPlayers,
          },
        },
      });
    }

    return configureStore({
      reducer: { game: gameReducer },
      preloadedState: { game: base },
    });
  }

  it('transitions from pov_comp to final4_eviction when 4 players are alive', () => {
    const store = makeFinal4Store();

    // advance() from pov_comp: arrives at pov_results → picks POV winner → Final 4 detected
    store.dispatch(advance());

    const state = store.getState().game;
    expect(state.phase).toBe('final4_eviction');
  });

  it('sets exactly 2 nominees (non-HOH, non-POV) at final4_eviction', () => {
    const store = makeFinal4Store();
    store.dispatch(advance()); // pov_comp → final4_eviction

    const state = store.getState().game;
    expect(state.phase).toBe('final4_eviction');

    // There must be exactly 2 nominees
    expect(state.nomineeIds).toHaveLength(2);

    // Neither nominee is the HOH
    expect(state.nomineeIds).not.toContain(state.hohId);
    // Neither nominee is the POV winner
    expect(state.nomineeIds).not.toContain(state.povWinnerId);
  });

  it('AI POV holder evicts a nominee and transitions to final3', () => {
    const store = makeFinal4Store();
    store.dispatch(advance()); // pov_comp → final4_eviction

    // Confirm we are at final4_eviction with an AI POV holder
    const midState = store.getState().game;
    expect(midState.phase).toBe('final4_eviction');
    const povHolder = midState.players.find((p) => p.id === midState.povWinnerId);
    expect(povHolder?.isUser).toBeFalsy();

    // advance() again: AI POV holder casts sole vote
    store.dispatch(advance());

    const endState = store.getState().game;
    expect(endState.phase).toBe('final3');

    // Exactly 3 players should remain alive
    const alive = endState.players.filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury',
    );
    expect(alive).toHaveLength(3);
  });

  it('human POV holder blocks advance() at final4_eviction', () => {
    // State: phase=final4_eviction, POV winner is human (p3)
    const store = makeFinal4Store({ withHumanPovWinner: true });

    // advance() must be a no-op when human is POV holder
    store.dispatch(advance());
    expect(store.getState().game.phase).toBe('final4_eviction');

    // Calling it again must still be a no-op
    store.dispatch(advance());
    expect(store.getState().game.phase).toBe('final4_eviction');
  });

  it('finalizeFinal4Eviction() by human POV holder evicts nominee and transitions to final3', () => {
    const store = makeFinal4Store({ withHumanPovWinner: true });

    expect(store.getState().game.phase).toBe('final4_eviction');
    const { nomineeIds } = store.getState().game;
    expect(nomineeIds).toHaveLength(2);

    // Human POV holder chooses to evict the first nominee
    store.dispatch(finalizeFinal4Eviction(nomineeIds[0]));

    const state = store.getState().game;
    expect(state.phase).toBe('final3');

    // Exactly 3 players alive after eviction
    const alive = state.players.filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury',
    );
    expect(alive).toHaveLength(3);
  });

  it('Final 4 is not bypassed even when cfg.multiEviction is true', () => {
    // Ensure that setting multiEviction:true does not disable Final 4 special handling
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'hoh' },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'nominated' },
      { id: 'p2', name: 'Carol', avatar: '👩', status: 'nominated' },
      { id: 'p3', name: 'Dave', avatar: '🧑', status: 'active' },
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];
    const store = configureStore({
      reducer: { game: gameReducer },
      preloadedState: {
        game: {
          season: 1,
          week: 9,
          phase: 'pov_comp' as const,
          seed: 42,
          hohId: 'p0',
          nomineeIds: ['p1', 'p2'],
          povWinnerId: null,
          replacementNeeded: false,
          awaitingFinal3Eviction: false,
          f3Part1WinnerId: null,
          f3Part2WinnerId: null,
          players,
          tvFeed: [],
          isLive: false,
          cfg: { multiEviction: true }, // should NOT disable Final 4
        },
      },
    });

    store.dispatch(advance()); // pov_comp → should still reach final4_eviction

    expect(store.getState().game.phase).toBe('final4_eviction');
  });
});

// ── Final 3 flow tests ────────────────────────────────────────────────────────

describe('Final 3 flow — final3 through comp1/comp2/comp3 to jury', () => {
  function makeFinal3Store(overrides: Partial<GameState> = {}) {
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'active' },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'active' },
      { id: 'p2', name: 'Carol', avatar: '👩', status: 'active' },
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];
    const base: GameState = {
      season: 1,
      week: 10,
      phase: 'final3',
      seed: 99,
      hohId: null,
      nomineeIds: [],
      povWinnerId: null,
      replacementNeeded: false,
      awaitingFinal3Eviction: false,
      f3Part1WinnerId: null,
      f3Part2WinnerId: null,
      players,
      tvFeed: [],
      isLive: false,
    };
    return configureStore({
      reducer: { game: gameReducer },
      preloadedState: { game: { ...base, ...overrides } },
    });
  }

  it('final3 → final3_comp1 on advance()', () => {
    const store = makeFinal3Store();
    store.dispatch(advance());
    expect(store.getState().game.phase).toBe('final3_comp1');
  });

  it('final3_comp1 → final3_comp2 and sets f3Part1WinnerId', () => {
    const store = makeFinal3Store({ phase: 'final3_comp1' });
    store.dispatch(advance());
    const state = store.getState().game;
    expect(state.phase).toBe('final3_comp2');
    expect(state.f3Part1WinnerId).not.toBeNull();
  });

  it('final3_comp2 → final3_comp3 and sets f3Part2WinnerId (different from Part 1 winner)', () => {
    const store = makeFinal3Store({ phase: 'final3_comp1' });
    store.dispatch(advance()); // → comp2, f3Part1WinnerId set
    store.dispatch(advance()); // → comp3, f3Part2WinnerId set
    const state = store.getState().game;
    expect(state.phase).toBe('final3_comp3');
    expect(state.f3Part2WinnerId).not.toBeNull();
    // Part 1 and Part 2 winners must be different players
    expect(state.f3Part1WinnerId).not.toBe(state.f3Part2WinnerId);
  });

  it('final3_comp3 advances to week_end or final3_decision (never stays at comp3)', () => {
    const store = makeFinal3Store({ phase: 'final3_comp1', seed: 7 });
    store.dispatch(advance()); // → comp2
    store.dispatch(advance()); // → comp3
    store.dispatch(advance()); // → week_end (AI Final HOH) or final3_decision (human)
    const state = store.getState().game;
    expect(['week_end', 'final3_decision']).toContain(state.phase);
  });

  it('phases proceed in correct order: comp1 → comp2 → comp3 → (decision or week_end)', () => {
    const store = makeFinal3Store({ seed: 42 });
    store.dispatch(advance()); // final3 → final3_comp1
    expect(store.getState().game.phase).toBe('final3_comp1');
    store.dispatch(advance()); // final3_comp1 → final3_comp2
    expect(store.getState().game.phase).toBe('final3_comp2');
    store.dispatch(advance()); // final3_comp2 → final3_comp3
    expect(store.getState().game.phase).toBe('final3_comp3');
    store.dispatch(advance()); // final3_comp3 → week_end or final3_decision
    expect(['week_end', 'final3_decision']).toContain(store.getState().game.phase);
  });

  it('full Final 3 flow reaches jury from final3 within 10 advance() calls', () => {
    const store = makeFinal3Store({ seed: 7 });

    let steps = 0;
    const MAX = 10;
    while (store.getState().game.phase !== 'jury' && steps < MAX) {
      const state = store.getState().game;
      if (
        state.phase === 'final3_decision' &&
        state.awaitingFinal3Eviction &&
        state.nomineeIds.length > 0
      ) {
        store.dispatch(finalizeFinal3Eviction(state.nomineeIds[0]));
      } else {
        store.dispatch(advance());
      }
      steps++;
    }

    expect(store.getState().game.phase).toBe('jury');
    expect(steps).toBeLessThan(MAX);

    // Exactly 2 finalists remain
    const alive = store
      .getState()
      .game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
    expect(alive).toHaveLength(2);
  });
});

// ── Final 3 flow tests — human player present ─────────────────────────────────

describe('Final 3 flow — human player participating in minigame', () => {
  function makeFinal3HumanStore(overrides: Partial<GameState> = {}) {
    const players: Player[] = [
      { id: 'user', name: 'You', avatar: '👤', status: 'active', isUser: true },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'active' },
      { id: 'p2', name: 'Carol', avatar: '👩', status: 'active' },
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];
    const base: GameState = {
      season: 1,
      week: 10,
      phase: 'final3_comp1',
      seed: 99,
      hohId: null,
      nomineeIds: [],
      povWinnerId: null,
      replacementNeeded: false,
      awaitingFinal3Eviction: false,
      f3Part1WinnerId: null,
      f3Part2WinnerId: null,
      players,
      tvFeed: [],
      isLive: false,
    };
    return configureStore({
      reducer: { game: gameReducer },
      preloadedState: { game: { ...base, ...overrides } },
    });
  }

  it('final3_comp1 with human player → phase becomes final3_comp1_minigame (not comp2)', () => {
    const store = makeFinal3HumanStore();
    store.dispatch(advance());
    const state = store.getState().game;
    expect(state.phase).toBe('final3_comp1_minigame');
    expect(state.f3Part1WinnerId).toBeNull(); // winner not yet set
    expect(state.minigameContext).toBeTruthy();
    expect(state.minigameContext?.phaseKey).toBe('final3_comp1');
    expect(state.minigameContext?.participants).toContain('user');
  });

  it('applyF3MinigameWinner for comp1 → sets f3Part1WinnerId and phase becomes final3_comp2', () => {
    const store = makeFinal3HumanStore();
    store.dispatch(advance()); // → final3_comp1_minigame
    store.dispatch(applyF3MinigameWinner('user'));
    const state = store.getState().game;
    expect(state.phase).toBe('final3_comp2');
    expect(state.f3Part1WinnerId).toBe('user');
    expect(state.minigameContext).toBeNull();
  });

  it('final3_comp2 with human as Part-1 loser → phase becomes final3_comp2_minigame', () => {
    // user did NOT win Part 1 (p1 won), so user competes in Part 2
    const store = makeFinal3HumanStore({ phase: 'final3_comp2', f3Part1WinnerId: 'p1' });
    store.dispatch(advance());
    const state = store.getState().game;
    expect(state.phase).toBe('final3_comp2_minigame');
    expect(state.minigameContext?.phaseKey).toBe('final3_comp2');
    expect(state.minigameContext?.participants).toContain('user');
    expect(state.minigameContext?.participants).not.toContain('p1'); // Part 1 winner excluded
  });

  it('final3_comp2 with human as Part-1 winner → deterministic AI path (no minigame)', () => {
    // user won Part 1, so they sit out Part 2; losers (p1, p2) are AI-only → deterministic
    const store = makeFinal3HumanStore({ phase: 'final3_comp2', f3Part1WinnerId: 'user' });
    store.dispatch(advance());
    const state = store.getState().game;
    expect(state.phase).toBe('final3_comp3');
    expect(state.f3Part2WinnerId).not.toBeNull();
    expect(state.minigameContext).toBeFalsy();
  });

  it('applyF3MinigameWinner for comp2 → sets f3Part2WinnerId and phase becomes final3_comp3', () => {
    const store = makeFinal3HumanStore({ phase: 'final3_comp2_minigame', f3Part1WinnerId: 'p1', minigameContext: { phaseKey: 'final3_comp2', participants: ['user', 'p2'], seed: 99 } });
    store.dispatch(applyF3MinigameWinner('user'));
    const state = store.getState().game;
    expect(state.phase).toBe('final3_comp3');
    expect(state.f3Part2WinnerId).toBe('user');
    expect(state.minigameContext).toBeNull();
  });

  it('final3_comp3 with human as finalist → phase becomes final3_comp3_minigame', () => {
    const store = makeFinal3HumanStore({ phase: 'final3_comp3', f3Part1WinnerId: 'user', f3Part2WinnerId: 'p2' });
    store.dispatch(advance());
    const state = store.getState().game;
    expect(state.phase).toBe('final3_comp3_minigame');
    expect(state.minigameContext?.phaseKey).toBe('final3_comp3');
    expect(state.minigameContext?.participants).toContain('user');
  });

  it('applyF3MinigameWinner with human winning Part 3 → sets HOH, awaitingFinal3Eviction, phase final3_decision', () => {
    const store = makeFinal3HumanStore({
      phase: 'final3_comp3_minigame',
      f3Part1WinnerId: 'user',
      f3Part2WinnerId: 'p2',
      minigameContext: { phaseKey: 'final3_comp3', participants: ['user', 'p2'], seed: 99 },
    });
    store.dispatch(applyF3MinigameWinner('user'));
    const state = store.getState().game;
    expect(state.hohId).toBe('user');
    expect(state.awaitingFinal3Eviction).toBe(true);
    expect(state.phase).toBe('final3_decision');
    expect(state.minigameContext).toBeNull();
    // Nominees should be set for the eviction decision
    expect(state.nomineeIds.length).toBeGreaterThan(0);
    expect(state.nomineeIds).not.toContain('user');
  });

  it('applyF3MinigameWinner with AI winning Part 3 → AI evicts, phase becomes week_end', () => {
    const store = makeFinal3HumanStore({
      phase: 'final3_comp3_minigame',
      f3Part1WinnerId: 'p1',
      f3Part2WinnerId: 'user',
      minigameContext: { phaseKey: 'final3_comp3', participants: ['p1', 'user'], seed: 99 },
    });
    store.dispatch(applyF3MinigameWinner('p1')); // AI wins Part 3
    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.phase).toBe('week_end');
    expect(state.minigameContext).toBeNull();
    // AI already evicted someone; exactly 2 alive players should remain
    const alive = state.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury');
    expect(alive).toHaveLength(2);
  });
});

// ── Regression: eviction_results never evicts to 1 player ────────────────────

describe('Regression — eviction never drops alive count below 2', () => {
  it('eviction_results with exactly 2 alive players does NOT evict either', () => {
    // Defensive guard: eviction_results must not evict when only 2 players alive
    // (should not happen via correct endgame routing).
    const players: Player[] = [
      { id: 'p0', name: 'Alice', avatar: '👩', status: 'nominated', isUser: true },
      { id: 'p1', name: 'Bob', avatar: '🧑', status: 'nominated' },
      ...Array.from({ length: 10 }, (_, i) => ({
        id: `j${i}`,
        name: `Juror ${i}`,
        avatar: '🧑',
        status: 'jury' as const,
      })),
    ];

    const store = configureStore({
      reducer: { game: gameReducer },
      preloadedState: {
        game: {
          season: 1,
          week: 10,
          phase: 'live_vote' as const,
          seed: 42,
          hohId: null,
          nomineeIds: ['p0', 'p1'],
          povWinnerId: null,
          replacementNeeded: false,
          awaitingFinal3Eviction: false,
          f3Part1WinnerId: null,
          f3Part2WinnerId: null,
          players,
          tvFeed: [],
          isLive: false,
        },
      },
    });

    store.dispatch(advance()); // live_vote → eviction_results

    const state = store.getState().game;
    // Guard should have fired: neither player should have been evicted
    const p0 = state.players.find((p) => p.id === 'p0');
    const p1 = state.players.find((p) => p.id === 'p1');
    expect(p0?.status).not.toBe('evicted');
    expect(p0?.status).not.toBe('jury');
    expect(p1?.status).not.toBe('evicted');
    expect(p1?.status).not.toBe('jury');
  });

  it('week_end with 2 alive transitions to jury, never back to week_start', () => {
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

    const store = configureStore({
      reducer: { game: gameReducer },
      preloadedState: {
        game: {
          season: 1,
          week: 10,
          phase: 'week_end' as const,
          seed: 42,
          hohId: null,
          nomineeIds: [],
          povWinnerId: null,
          replacementNeeded: false,
          awaitingFinal3Eviction: false,
          f3Part1WinnerId: null,
          f3Part2WinnerId: null,
          players,
          tvFeed: [],
          isLive: false,
        },
      },
    });

    store.dispatch(advance());
    expect(store.getState().game.phase).toBe('jury');
    // Further advance() calls are no-ops
    store.dispatch(advance());
    expect(store.getState().game.phase).toBe('jury');
  });
});
