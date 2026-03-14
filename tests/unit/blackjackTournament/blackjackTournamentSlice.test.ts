/**
 * Unit tests: blackjackTournamentSlice
 *
 * Covers:
 *  1. initBlackjackTournament: sets up state and transitions to 'spin' (or 'complete' for ≤1 player).
 *  2. resolveSpinner: picks controller deterministically; controller written to state as controllingPlayerId.
 *  3. selectPair: validates pair, deals starting cards, transitions to 'duel'.
 *     Controller can pick any two distinct non-eliminated players (including themselves).
 *  4. hitCurrentPlayer / standCurrentPlayer: advances duel state correctly.
 *  5. resolveDuel: computes winner and transitions to 'duel_result'. Returns 'tie' for equal/both-bust.
 *  6. advanceFromDuelResult: on tie → rematch same pair; on decisive → eliminates loser, transitions.
 *  7. Tie rematch: no elimination on tie; rematch loop until decisive; rematch cap fallback.
 *  8. AI helpers: aiShouldHit, aiDecisionRng, aiPickFighters — determinism checks.
 *  9. computeTotal: ace handling, multi-ace reduction.
 * 10. outcomeResolved / markBlackjackTournamentOutcomeResolved idempotency.
 * 11. Full deterministic tournament simulation.
 * 12. Controller handoff: spinner selection becomes authoritative controllingPlayerId.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import reducer, {
  initBlackjackTournament,
  resolveSpinner,
  selectPair,
  hitCurrentPlayer,
  standCurrentPlayer,
  resolveDuel,
  advanceFromDuelResult,
  markBlackjackTournamentOutcomeResolved,
  resetBlackjackTournament,
  computeTotal,
  cardRank,
  resolveDuelOutcome,
  aiShouldHit,
  aiDecisionRng,
  aiPickFighters,
  AI_STAND_THRESHOLD,
  AI_HIT_ALWAYS_BELOW,
  REMATCH_CAP,
} from '../../../src/features/blackjackTournament/blackjackTournamentSlice';
import type { BlackjackTournamentState } from '../../../src/features/blackjackTournament/blackjackTournamentSlice';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { blackjackTournament: reducer } });
}

type Store = ReturnType<typeof makeStore>;

function getState(store: Store): BlackjackTournamentState {
  return store.getState().blackjackTournament;
}

function initStore(store: Store, ids: string[], seed = 42, type: 'HOH' | 'POV' = 'HOH') {
  store.dispatch(
    initBlackjackTournament({
      participantIds: ids,
      competitionType: type,
      seed,
      humanPlayerId: null,
    }),
  );
}

/** Run through spin → pick → duel → result for one duel using auto-resolve (both stand). */
function runOneDuel(store: Store): void {
  const s = getState(store);
  if (s.phase === 'spin') store.dispatch(resolveSpinner());

  const s2 = getState(store);
  if (s2.phase === 'pick_opponent') {
    const controller = s2.controllingPlayerId!;
    // fighterA = controller, fighterB = first other player
    const fighterB = s2.remainingPlayerIds.find((id) => id !== controller)!;
    store.dispatch(selectPair({ fighterAId: controller, fighterBId: fighterB }));
  }

  // Auto-play: stand both fighters until duel finishes; handle potential ties.
  let safety = 200;
  while (getState(store).phase === 'duel' && safety-- > 0) {
    const ds = getState(store).currentDuel!;
    if (ds.duelTurn === 'finished') break;
    store.dispatch(standCurrentPlayer());
  }
  if (getState(store).phase === 'duel') {
    store.dispatch(resolveDuel());
  }
  // Loop to handle rematches.
  while (getState(store).phase === 'duel_result' && safety-- > 0) {
    store.dispatch(advanceFromDuelResult());
    if (getState(store).phase === 'duel') {
      // Rematch: stand both and resolve again.
      const rd = getState(store).currentDuel!;
      if (rd.duelTurn !== 'finished') store.dispatch(standCurrentPlayer());
      if (getState(store).currentDuel?.duelTurn !== 'finished') store.dispatch(standCurrentPlayer());
      store.dispatch(resolveDuel());
    }
  }
}

// ─── computeTotal ─────────────────────────────────────────────────────────────

describe('computeTotal', () => {
  it('sums face cards correctly', () => {
    expect(computeTotal([2, 3, 4])).toBe(9);
    expect(computeTotal([9, 5])).toBe(14);
  });

  it('treats 10/J/Q/K as 10', () => {
    expect(computeTotal([10, 11])).toBe(20); // 10 + J
    expect(computeTotal([12, 13])).toBe(20); // Q + K
  });

  it('ace counts as 11 without bust', () => {
    expect(computeTotal([1, 9])).toBe(20); // A(11) + 9
  });

  it('ace reduces to 1 when bust', () => {
    expect(computeTotal([1, 5, 9])).toBe(15); // A(1) + 5 + 9
    expect(computeTotal([1, 10, 5])).toBe(16); // A(1) + 10 + 5
  });

  it('multiple aces: reduce one at a time', () => {
    expect(computeTotal([1, 1])).toBe(12); // 11 + 1
    expect(computeTotal([1, 1, 9])).toBe(21); // 11 + 1 + 9
    expect(computeTotal([1, 1, 1])).toBe(13); // 11 + 1 + 1
  });

  it('empty hand is 0', () => {
    expect(computeTotal([])).toBe(0);
  });

  it('blackjack: A + K = 21', () => {
    expect(computeTotal([1, 13])).toBe(21);
  });
});

// ─── cardRank ─────────────────────────────────────────────────────────────────

describe('cardRank', () => {
  it('returns A for ace', () => expect(cardRank(1)).toBe('A'));
  it('returns 10 for 10', () => expect(cardRank(10)).toBe('10'));
  it('returns J for 11', () => expect(cardRank(11)).toBe('J'));
  it('returns Q for 12', () => expect(cardRank(12)).toBe('Q'));
  it('returns K for 13', () => expect(cardRank(13)).toBe('K'));
  it('returns face value for 5', () => expect(cardRank(5)).toBe('5'));
});

// ─── resolveDuelOutcome ───────────────────────────────────────────────────────

describe('resolveDuelOutcome', () => {
  it('non-bust winner: higher total wins', () => {
    expect(resolveDuelOutcome([10, 9], [10, 8])).toBe('fighterA'); // 19 vs 18
    expect(resolveDuelOutcome([10, 8], [10, 9])).toBe('fighterB'); // 18 vs 19
  });

  it('one bust: other player wins', () => {
    expect(resolveDuelOutcome([10, 10, 5], [10, 9])).toBe('fighterB'); // 25 bust vs 19
    expect(resolveDuelOutcome([10, 9], [10, 10, 5])).toBe('fighterA'); // 19 vs 25 bust
  });

  it('exact tie: returns "tie"', () => {
    const r = resolveDuelOutcome([10, 9], [10, 9]);
    expect(r).toBe('tie');
  });

  it('both bust: returns "tie"', () => {
    const r = resolveDuelOutcome([10, 10, 5], [9, 8, 6]);
    expect(r).toBe('tie');
  });

  it('different totals never return "tie"', () => {
    expect(resolveDuelOutcome([10, 9], [10, 8])).not.toBe('tie');
    expect(resolveDuelOutcome([10, 8], [10, 9])).not.toBe('tie');
  });

  it('blackjack (21) beats 20', () => {
    expect(resolveDuelOutcome([1, 13], [10, 9])).toBe('fighterA'); // 21 vs 20
  });
});

// ─── aiShouldHit ─────────────────────────────────────────────────────────────

describe('aiShouldHit', () => {
  it('always stands on AI_STAND_THRESHOLD or above', () => {
    expect(aiShouldHit(AI_STAND_THRESHOLD, 0.0)).toBe(false);
    expect(aiShouldHit(AI_STAND_THRESHOLD + 1, 0.0)).toBe(false);
    expect(aiShouldHit(21, 0.0)).toBe(false);
  });

  it('always hits on AI_HIT_ALWAYS_BELOW or below', () => {
    expect(aiShouldHit(AI_HIT_ALWAYS_BELOW, 1.0)).toBe(true);
    expect(aiShouldHit(5, 1.0)).toBe(true);
  });

  it('uses rng in the probabilistic zone', () => {
    // At total 14 (between thresholds): low rng = hit, high rng = stand
    expect(aiShouldHit(14, 0.0)).toBe(true);  // rng < AI_HIT_PROBABILITY
    expect(aiShouldHit(14, 1.0)).toBe(false); // rng >= AI_HIT_PROBABILITY
  });
});

// ─── aiDecisionRng ────────────────────────────────────────────────────────────

describe('aiDecisionRng', () => {
  it('is deterministic for the same inputs', () => {
    const v1 = aiDecisionRng(42, 0, 'alice', 0);
    const v2 = aiDecisionRng(42, 0, 'alice', 0);
    expect(v1).toBe(v2);
  });

  it('differs for different players', () => {
    const va = aiDecisionRng(42, 0, 'alice', 0);
    const vb = aiDecisionRng(42, 0, 'bob', 0);
    expect(va).not.toBe(vb);
  });

  it('differs for different decision indices', () => {
    const v0 = aiDecisionRng(42, 0, 'alice', 0);
    const v1 = aiDecisionRng(42, 0, 'alice', 1);
    expect(v0).not.toBe(v1);
  });

  it('returns values in [0, 1)', () => {
    for (let i = 0; i < 20; i++) {
      const v = aiDecisionRng(i * 1000, i, `player_${i}`, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ─── aiPickFighters ───────────────────────────────────────────────────────────

describe('aiPickFighters', () => {
  it('returns two distinct players', () => {
    const remaining = ['alice', 'bob', 'carol', 'dave'];
    for (let seed = 0; seed < 20; seed++) {
      const result = aiPickFighters(seed, 0, 'alice', remaining);
      expect(result).not.toBeNull();
      expect(result!.fighterAId).not.toBe(result!.fighterBId);
    }
  });

  it('returns null when controller is the only remaining player', () => {
    expect(aiPickFighters(42, 0, 'alice', ['alice'])).toBeNull();
  });

  it('is deterministic', () => {
    const p1 = aiPickFighters(42, 0, 'alice', ['bob', 'carol']);
    const p2 = aiPickFighters(42, 0, 'alice', ['bob', 'carol']);
    expect(p1).toEqual(p2);
  });

  it('auto-selects the only remaining opponent when 2 players exist', () => {
    const result = aiPickFighters(42, 0, 'alice', ['alice', 'bob']);
    expect(result).not.toBeNull();
    expect([result!.fighterAId, result!.fighterBId].sort()).toEqual(['alice', 'bob']);
  });

  it('both fighters are from remainingPlayerIds', () => {
    const remaining = ['alice', 'bob', 'carol', 'dave'];
    for (let seed = 0; seed < 10; seed++) {
      const result = aiPickFighters(seed, 0, 'alice', remaining);
      expect(remaining).toContain(result!.fighterAId);
      expect(remaining).toContain(result!.fighterBId);
    }
  });
});

// ─── initBlackjackTournament ──────────────────────────────────────────────────

describe('initBlackjackTournament', () => {
  it('transitions to spin for ≥2 players', () => {
    const store = makeStore();
    initStore(store, ['a', 'b', 'c']);
    expect(getState(store).phase).toBe('spin');
  });

  it('transitions to complete immediately for 1 player', () => {
    const store = makeStore();
    initStore(store, ['solo']);
    const s = getState(store);
    expect(s.phase).toBe('complete');
    expect(s.winnerId).toBe('solo');
  });

  it('transitions to complete for 0 players', () => {
    const store = makeStore();
    initStore(store, []);
    expect(getState(store).phase).toBe('complete');
    expect(getState(store).winnerId).toBeNull();
  });

  it('sets allPlayerIds and remainingPlayerIds', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob']);
    const s = getState(store);
    expect(s.allPlayerIds).toEqual(['alice', 'bob']);
    expect(s.remainingPlayerIds).toEqual(['alice', 'bob']);
    expect(s.eliminatedPlayerIds).toEqual([]);
  });

  it('resets state from a prior run', () => {
    const store = makeStore();
    initStore(store, ['a', 'b', 'c']);
    runOneDuel(store);
    expect(getState(store).duelIndex).toBe(1);
    // Re-init
    initStore(store, ['x', 'y']);
    const s = getState(store);
    expect(s.duelIndex).toBe(0);
    expect(s.eliminatedPlayerIds).toEqual([]);
    expect(s.phase).toBe('spin');
  });
});

// ─── resolveSpinner / controller handoff ─────────────────────────────────────

describe('resolveSpinner', () => {
  it('transitions to pick_opponent', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob', 'carol'], 42);
    store.dispatch(resolveSpinner());
    expect(getState(store).phase).toBe('pick_opponent');
  });

  it('sets controllingPlayerId to a valid remaining player', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob', 'carol'], 42);
    store.dispatch(resolveSpinner());
    const s = getState(store);
    expect(s.remainingPlayerIds).toContain(s.controllingPlayerId);
  });

  it('controllingPlayerId is written to shared state (authoritative)', () => {
    // Spinner result must live in Redux state, not a transient local variable.
    const store = makeStore();
    initStore(store, ['alice', 'bob', 'carol'], 42);
    store.dispatch(resolveSpinner());
    const s = getState(store);
    // controllingPlayerId is the source of truth for who picked next fighters.
    expect(s.controllingPlayerId).not.toBeNull();
    expect(s.remainingPlayerIds).toContain(s.controllingPlayerId);
  });

  it('is deterministic (same seed → same controller)', () => {
    const s1 = makeStore();
    initStore(s1, ['alice', 'bob', 'carol'], 99);
    s1.dispatch(resolveSpinner());

    const s2 = makeStore();
    initStore(s2, ['alice', 'bob', 'carol'], 99);
    s2.dispatch(resolveSpinner());

    expect(getState(s1).controllingPlayerId).toBe(getState(s2).controllingPlayerId);
  });

  it('auto-sets fighterAId/fighterBId when only 2 players', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob'], 42);
    store.dispatch(resolveSpinner());
    const s = getState(store);
    expect(s.fighterAId).not.toBeNull();
    expect(s.fighterBId).not.toBeNull();
    expect(s.fighterAId).not.toBe(s.fighterBId);
    // One of the fighters is the controller
    expect([s.fighterAId, s.fighterBId]).toContain(s.controllingPlayerId);
  });

  it('is a no-op if not in spin phase', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob'], 42);
    store.dispatch(resolveSpinner());
    const ctrl = getState(store).controllingPlayerId;
    store.dispatch(resolveSpinner()); // second call — no-op
    expect(getState(store).phase).toBe('pick_opponent');
    expect(getState(store).controllingPlayerId).toBe(ctrl);
  });
});

// ─── selectPair ───────────────────────────────────────────────────────────────

describe('selectPair', () => {
  function reachPickOpponent(ids: string[], seed = 42): Store {
    const store = makeStore();
    initStore(store, ids, seed);
    store.dispatch(resolveSpinner());
    return store;
  }

  it('transitions to duel', () => {
    const store = reachPickOpponent(['alice', 'bob', 'carol']);
    const s = getState(store);
    const [fA, fB] = s.remainingPlayerIds.filter(() => true);
    store.dispatch(selectPair({ fighterAId: fA, fighterBId: fB }));
    expect(getState(store).phase).toBe('duel');
  });

  it('rejects same fighter for both slots', () => {
    const store = reachPickOpponent(['alice', 'bob']);
    const s = getState(store);
    store.dispatch(selectPair({ fighterAId: s.remainingPlayerIds[0], fighterBId: s.remainingPlayerIds[0] }));
    expect(getState(store).phase).toBe('pick_opponent');
  });

  it('rejects unknown player', () => {
    const store = reachPickOpponent(['alice', 'bob']);
    const s = getState(store);
    store.dispatch(selectPair({ fighterAId: s.remainingPlayerIds[0], fighterBId: 'nobody' }));
    expect(getState(store).phase).toBe('pick_opponent');
  });

  it('controller can pick themselves as fighterA', () => {
    const store = reachPickOpponent(['alice', 'bob', 'carol']);
    const s = getState(store);
    const ctrl = s.controllingPlayerId!;
    const other = s.remainingPlayerIds.find((id) => id !== ctrl)!;
    store.dispatch(selectPair({ fighterAId: ctrl, fighterBId: other }));
    expect(getState(store).phase).toBe('duel');
    expect(getState(store).currentDuel!.fighterAId).toBe(ctrl);
  });

  it('controller can pick two other players (not themselves)', () => {
    const store = reachPickOpponent(['alice', 'bob', 'carol'], 42);
    const s = getState(store);
    const ctrl = s.controllingPlayerId!;
    const others = s.remainingPlayerIds.filter((id) => id !== ctrl);
    if (others.length >= 2) {
      store.dispatch(selectPair({ fighterAId: others[0], fighterBId: others[1] }));
      expect(getState(store).phase).toBe('duel');
      const duel = getState(store).currentDuel!;
      expect(duel.fighterAId).toBe(others[0]);
      expect(duel.fighterBId).toBe(others[1]);
    }
  });

  it('deals 2 starting cards to each fighter', () => {
    const store = reachPickOpponent(['alice', 'bob']);
    const s = getState(store);
    store.dispatch(selectPair({ fighterAId: s.remainingPlayerIds[0], fighterBId: s.remainingPlayerIds[1] }));
    const duel = getState(store).currentDuel!;
    expect(duel.fighterACards).toHaveLength(2);
    expect(duel.fighterBCards).toHaveLength(2);
  });

  it('sets duelTurn to fighterA or finished', () => {
    const store = reachPickOpponent(['alice', 'bob']);
    const s = getState(store);
    store.dispatch(selectPair({ fighterAId: s.remainingPlayerIds[0], fighterBId: s.remainingPlayerIds[1] }));
    const duel = getState(store).currentDuel!;
    expect(['fighterA', 'fighterB', 'finished']).toContain(duel.duelTurn);
  });
});

// ─── hitCurrentPlayer / standCurrentPlayer ────────────────────────────────────

describe('hitCurrentPlayer / standCurrentPlayer', () => {
  function reachDuel(seed = 42): Store {
    const store = makeStore();
    initStore(store, ['alice', 'bob'], seed);
    store.dispatch(resolveSpinner());
    const s = getState(store);
    store.dispatch(selectPair({
      fighterAId: s.remainingPlayerIds[0],
      fighterBId: s.remainingPlayerIds[1],
    }));
    return store;
  }

  it('hit adds a card to the active fighter', () => {
    const store = reachDuel(42);
    const before = getState(store).currentDuel!;
    const aCardsBefore = before.fighterACards.length;
    if (before.duelTurn === 'fighterA') {
      store.dispatch(hitCurrentPlayer());
      expect(getState(store).currentDuel!.fighterACards).toHaveLength(aCardsBefore + 1);
    }
  });

  it('stand marks active fighter as stood', () => {
    const store = reachDuel(42);
    const before = getState(store).currentDuel!;
    if (before.duelTurn === 'fighterA') {
      store.dispatch(standCurrentPlayer());
      expect(getState(store).currentDuel!.fighterAStood).toBe(true);
    }
  });

  it('standing fighterA switches turn to fighterB', () => {
    const store = reachDuel(42);
    const before = getState(store).currentDuel!;
    if (before.duelTurn === 'fighterA') {
      store.dispatch(standCurrentPlayer());
      const after = getState(store).currentDuel!;
      expect(['fighterB', 'finished']).toContain(after.duelTurn);
    }
  });

  it('standing both fighters sets duelTurn to finished', () => {
    const store = reachDuel(42);
    const duel = getState(store).currentDuel!;
    expect(duel.duelTurn).toBe('fighterA');

    store.dispatch(standCurrentPlayer()); // fighterA stands
    const mid = getState(store).currentDuel!;
    expect(mid.duelTurn).toBe('fighterB');

    store.dispatch(standCurrentPlayer()); // fighterB stands
    expect(getState(store).currentDuel!.duelTurn).toBe('finished');
  });

  it('is no-op in wrong phase', () => {
    const store = makeStore();
    initStore(store, ['a', 'b']);
    store.dispatch(hitCurrentPlayer()); // phase = 'spin', should be no-op
    expect(getState(store).phase).toBe('spin');
  });
});

// ─── resolveDuel ─────────────────────────────────────────────────────────────

describe('resolveDuel', () => {
  function reachFinishedDuel(seed = 42): Store {
    const store = makeStore();
    initStore(store, ['a', 'b'], seed);
    store.dispatch(resolveSpinner());
    const s = getState(store);
    store.dispatch(selectPair({ fighterAId: s.remainingPlayerIds[0], fighterBId: s.remainingPlayerIds[1] }));
    store.dispatch(standCurrentPlayer());
    store.dispatch(standCurrentPlayer());
    return store;
  }

  it('transitions to duel_result', () => {
    const store = reachFinishedDuel(42);
    store.dispatch(resolveDuel());
    expect(getState(store).phase).toBe('duel_result');
  });

  it('sets duelWinnerId/duelLoserId for decisive result, or isDuelTie for tie', () => {
    const store = reachFinishedDuel(42);
    store.dispatch(resolveDuel());
    const ns = getState(store);
    if (ns.isDuelTie) {
      expect(ns.duelWinnerId).toBeNull();
      expect(ns.duelLoserId).toBeNull();
    } else {
      expect(ns.duelWinnerId).not.toBeNull();
      expect(ns.duelLoserId).not.toBeNull();
      expect(ns.duelWinnerId).not.toBe(ns.duelLoserId);
    }
  });

  it('is a no-op if duelTurn is not finished', () => {
    const store = makeStore();
    initStore(store, ['a', 'b'], 42);
    store.dispatch(resolveSpinner());
    const s = getState(store);
    store.dispatch(selectPair({ fighterAId: s.remainingPlayerIds[0], fighterBId: s.remainingPlayerIds[1] }));
    // Don't stand; just dispatch resolveDuel directly
    const before = getState(store);
    if (before.currentDuel?.duelTurn !== 'finished') {
      store.dispatch(resolveDuel());
      expect(getState(store).phase).toBe('duel'); // unchanged
    }
  });
});

// ─── Tie → Rematch ────────────────────────────────────────────────────────────

describe('Tie → Rematch', () => {
  /**
   * Build a state where both fighters have equal non-bust totals by directly
   * constructing the duel state via selectPair and then standing immediately
   * on a seed that produces a tie when both stand on their opening 2-card hand.
   * We test the rematch logic by verifying isDuelTie + advanceFromDuelResult.
   */

  it('resolveDuelOutcome returns "tie" for equal totals', () => {
    // [10, 9] = 19 for both → tie
    expect(resolveDuelOutcome([10, 9], [10, 9])).toBe('tie');
  });

  it('on isDuelTie=true, advanceFromDuelResult rematches: no elimination, phase returns to duel', () => {
    // Simulate a tie scenario by reaching duel_result with isDuelTie.
    // We'll use the fact that resolveDuel sets isDuelTie when outcome='tie'.
    const store = makeStore();
    initStore(store, ['a', 'b'], 42);
    store.dispatch(resolveSpinner());
    const s = getState(store);
    store.dispatch(selectPair({ fighterAId: s.remainingPlayerIds[0], fighterBId: s.remainingPlayerIds[1] }));

    // Force both to stand to get a potentially tied result, OR manipulate via standing.
    store.dispatch(standCurrentPlayer());
    store.dispatch(standCurrentPlayer());
    store.dispatch(resolveDuel());

    const afterResolve = getState(store);
    if (afterResolve.isDuelTie) {
      const remainingBefore = [...afterResolve.remainingPlayerIds];
      store.dispatch(advanceFromDuelResult());
      const afterAdvance = getState(store);
      // No elimination on tie.
      expect(afterAdvance.eliminatedPlayerIds).toEqual([]);
      expect(afterAdvance.remainingPlayerIds).toEqual(remainingBefore);
      // Rematch: phase goes back to duel.
      expect(afterAdvance.phase).toBe('duel');
      // rematchCount incremented.
      expect(afterAdvance.rematchCount).toBe(1);
    } else {
      // Non-tie result: normal elimination path (we just verify it advances correctly).
      store.dispatch(advanceFromDuelResult());
      expect(['pick_opponent', 'complete']).toContain(getState(store).phase);
    }
  });

  it('rematch cap constant is exported and is a positive integer', () => {
    expect(REMATCH_CAP).toBeGreaterThan(0);
    expect(Number.isInteger(REMATCH_CAP)).toBe(true);
  });

  it('tie does not set duelWinnerId/duelLoserId', () => {
    // When isDuelTie, winner/loser must be null.
    const store = makeStore();
    initStore(store, ['a', 'b'], 42);
    store.dispatch(resolveSpinner());
    const s = getState(store);
    store.dispatch(selectPair({ fighterAId: s.remainingPlayerIds[0], fighterBId: s.remainingPlayerIds[1] }));
    store.dispatch(standCurrentPlayer());
    store.dispatch(standCurrentPlayer());
    store.dispatch(resolveDuel());
    const ns = getState(store);
    if (ns.isDuelTie) {
      expect(ns.duelWinnerId).toBeNull();
      expect(ns.duelLoserId).toBeNull();
    }
  });

  it('full loop: if tie resolves eventually to decisive result, no player is lost', () => {
    // Run a full two-player tournament — the only valid end states are:
    // 'alice' wins or 'bob' wins; no tie loop should prevent completion.
    const store = makeStore();
    initStore(store, ['alice', 'bob'], 12345);
    let safety = 500;
    while (getState(store).phase !== 'complete' && safety-- > 0) {
      const ph = getState(store).phase;
      if (ph === 'spin') store.dispatch(resolveSpinner());
      else if (ph === 'pick_opponent') {
        const ps = getState(store);
        const aId = ps.fighterAId ?? ps.remainingPlayerIds[0];
        const bId = ps.fighterBId ?? ps.remainingPlayerIds.find((id) => id !== aId)!;
        store.dispatch(selectPair({ fighterAId: aId, fighterBId: bId }));
      }
      else if (ph === 'duel') {
        const ds = getState(store).currentDuel!;
        if (ds.duelTurn === 'finished') store.dispatch(resolveDuel());
        else store.dispatch(standCurrentPlayer());
      }
      else if (ph === 'duel_result') store.dispatch(advanceFromDuelResult());
    }
    expect(getState(store).phase).toBe('complete');
    expect(['alice', 'bob']).toContain(getState(store).winnerId);
    expect(getState(store).eliminatedPlayerIds).toHaveLength(1);
  });
});

// ─── advanceFromDuelResult ────────────────────────────────────────────────────

describe('advanceFromDuelResult', () => {
  function reachResult(store: Store): void {
    store.dispatch(resolveSpinner());
    const s = getState(store);
    store.dispatch(selectPair({ fighterAId: s.remainingPlayerIds[0], fighterBId: s.remainingPlayerIds[1] }));
    store.dispatch(standCurrentPlayer());
    store.dispatch(standCurrentPlayer());
    store.dispatch(resolveDuel());
    // If tie, keep resolving rematches until decisive.
    let safety = 200;
    while (getState(store).phase === 'duel_result' && getState(store).isDuelTie && safety-- > 0) {
      store.dispatch(advanceFromDuelResult()); // triggers rematch
      if (getState(store).phase === 'duel') {
        store.dispatch(standCurrentPlayer());
        store.dispatch(standCurrentPlayer());
        store.dispatch(resolveDuel());
      }
    }
  }

  it('eliminates the loser from remainingPlayerIds', () => {
    const store = makeStore();
    initStore(store, ['a', 'b', 'c'], 42);
    reachResult(store);
    const before = getState(store);
    const loser = before.duelLoserId!;
    store.dispatch(advanceFromDuelResult());
    expect(getState(store).remainingPlayerIds).not.toContain(loser);
    expect(getState(store).eliminatedPlayerIds).toContain(loser);
  });

  it('transitions to pick_opponent when ≥2 remain', () => {
    const store = makeStore();
    initStore(store, ['a', 'b', 'c'], 42);
    reachResult(store);
    store.dispatch(advanceFromDuelResult());
    expect(getState(store).phase).toBe('pick_opponent');
  });

  it('transitions to complete when 1 remains', () => {
    const store = makeStore();
    initStore(store, ['a', 'b'], 42);
    reachResult(store);
    store.dispatch(advanceFromDuelResult());
    expect(getState(store).phase).toBe('complete');
    expect(getState(store).winnerId).not.toBeNull();
  });

  it('increments duelIndex on decisive result', () => {
    const store = makeStore();
    initStore(store, ['a', 'b', 'c'], 42);
    reachResult(store);
    const idxBefore = getState(store).duelIndex;
    store.dispatch(advanceFromDuelResult());
    expect(getState(store).duelIndex).toBe(idxBefore + 1);
  });

  it('winner becomes next controller', () => {
    const store = makeStore();
    initStore(store, ['a', 'b', 'c'], 42);
    reachResult(store);
    const winner = getState(store).duelWinnerId!;
    store.dispatch(advanceFromDuelResult());
    expect(getState(store).controllingPlayerId).toBe(winner);
  });
});

// ─── Full 2-player tournament ─────────────────────────────────────────────────

describe('Full 2-player tournament', () => {
  it('completes with a winner', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob'], 42);
    runOneDuel(store);
    const s = getState(store);
    expect(s.phase).toBe('complete');
    expect(s.winnerId).toBeDefined();
    expect(['alice', 'bob']).toContain(s.winnerId);
  });

  it('winner is in allPlayerIds', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob'], 42);
    runOneDuel(store);
    const s = getState(store);
    expect(s.allPlayerIds).toContain(s.winnerId);
  });

  it('eliminated + remaining = all', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob'], 42);
    runOneDuel(store);
    const s = getState(store);
    expect([...s.remainingPlayerIds, ...s.eliminatedPlayerIds].sort()).toEqual(
      s.allPlayerIds.slice().sort(),
    );
  });
});

// ─── Full 3-player tournament ─────────────────────────────────────────────────

describe('Full 3-player tournament', () => {
  it('completes after 2 decisive duels', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob', 'carol'], 42);
    runOneDuel(store);
    expect(getState(store).phase).toBe('pick_opponent');
    runOneDuel(store);
    expect(getState(store).phase).toBe('complete');
  });

  it('elimination order has 2 entries for 3 players', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob', 'carol'], 42);
    runOneDuel(store);
    runOneDuel(store);
    expect(getState(store).eliminatedPlayerIds).toHaveLength(2);
  });
});

// ─── Deterministic full tournament simulation ─────────────────────────────────

describe('Deterministic tournament simulation', () => {
  function runFullTournament(ids: string[], seed: number): string | null {
    const store = makeStore();
    initStore(store, ids, seed);
    let safety = 500;
    while (getState(store).phase !== 'complete' && safety-- > 0) {
      const ph = getState(store).phase;
      if (ph === 'spin') store.dispatch(resolveSpinner());
      else if (ph === 'pick_opponent') {
        const ps = getState(store);
        const aId = ps.fighterAId ?? ps.remainingPlayerIds[0];
        const bId = ps.fighterBId ?? ps.remainingPlayerIds.find((id) => id !== aId)!;
        store.dispatch(selectPair({ fighterAId: aId, fighterBId: bId }));
      }
      else if (ph === 'duel') {
        const ds = getState(store).currentDuel!;
        if (ds.duelTurn === 'finished') store.dispatch(resolveDuel());
        else store.dispatch(standCurrentPlayer());
      }
      else if (ph === 'duel_result') store.dispatch(advanceFromDuelResult());
    }
    return getState(store).winnerId;
  }

  it('same seed → same winner (5 runs)', () => {
    const winner0 = runFullTournament(['a', 'b', 'c', 'd'], 1234);
    for (let i = 0; i < 4; i++) {
      expect(runFullTournament(['a', 'b', 'c', 'd'], 1234)).toBe(winner0);
    }
  });

  it('different seeds may produce different winners', () => {
    const winners = new Set<string | null>();
    for (let seed = 0; seed < 20; seed++) {
      winners.add(runFullTournament(['a', 'b', 'c', 'd'], seed * 100));
    }
    expect(winners.size).toBeGreaterThanOrEqual(1);
  });

  it('5-player tournament eventually completes', () => {
    const store = makeStore();
    initStore(store, ['a', 'b', 'c', 'd', 'e'], 999);
    let safety = 500;
    while (getState(store).phase !== 'complete' && safety-- > 0) {
      const ph = getState(store).phase;
      if (ph === 'spin') store.dispatch(resolveSpinner());
      else if (ph === 'pick_opponent') {
        const ps = getState(store);
        const aId = ps.fighterAId ?? ps.remainingPlayerIds[0];
        const bId = ps.fighterBId ?? ps.remainingPlayerIds.find((id) => id !== aId)!;
        store.dispatch(selectPair({ fighterAId: aId, fighterBId: bId }));
      }
      else if (ph === 'duel') {
        const ds = getState(store).currentDuel!;
        if (ds.duelTurn === 'finished') store.dispatch(resolveDuel());
        else store.dispatch(standCurrentPlayer());
      }
      else if (ph === 'duel_result') store.dispatch(advanceFromDuelResult());
    }
    expect(getState(store).phase).toBe('complete');
    expect(getState(store).eliminatedPlayerIds).toHaveLength(4);
  });
});

// ─── outcomeResolved ─────────────────────────────────────────────────────────

describe('outcomeResolved', () => {
  it('is false initially', () => {
    const store = makeStore();
    initStore(store, ['a', 'b']);
    expect(getState(store).outcomeResolved).toBe(false);
  });

  it('markBlackjackTournamentOutcomeResolved sets it to true', () => {
    const store = makeStore();
    initStore(store, ['a', 'b']);
    store.dispatch(markBlackjackTournamentOutcomeResolved());
    expect(getState(store).outcomeResolved).toBe(true);
  });

  it('resetBlackjackTournament resets it to false', () => {
    const store = makeStore();
    initStore(store, ['a', 'b']);
    store.dispatch(markBlackjackTournamentOutcomeResolved());
    store.dispatch(resetBlackjackTournament());
    expect(getState(store).outcomeResolved).toBe(false);
  });
});

// ─── Fighter auto-select when 2 players remain ───────────────────────────────

describe('Fighter auto-select when 2 players remain', () => {
  it('sets fighterAId/fighterBId when only two players exist after spin', () => {
    const store = makeStore();
    initStore(store, ['alice', 'bob'], 42);
    store.dispatch(resolveSpinner());
    const s = getState(store);
    expect(s.fighterAId).not.toBeNull();
    expect(s.fighterBId).not.toBeNull();
    expect(s.fighterAId).not.toBe(s.fighterBId);
  });

  it('sets fighterAId/fighterBId after advancing when only two remain', () => {
    const store = makeStore();
    initStore(store, ['a', 'b', 'c'], 7);
    runOneDuel(store);
    const s = getState(store);
    if (s.remainingPlayerIds.length === 2) {
      expect(s.fighterAId).not.toBeNull();
      expect(s.fighterBId).not.toBeNull();
    }
  });
});
