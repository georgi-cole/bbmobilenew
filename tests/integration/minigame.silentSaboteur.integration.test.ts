/**
 * Integration smoke tests — Silent Saboteur minigame.
 *
 * Verifies:
 *  1. Registry entry exists with correct metadata.
 *  2. Slice initialises correctly.
 *  3. 2-player path: resolves to complete with exactly one winner.
 *  4. 3-player path: Final-3 Victim Override Rule works correctly.
 *  5. 5-player full simulation resolves to exactly one winner.
 *  6. resolveSilentSaboteurOutcome dispatches applyMinigameWinner exactly once.
 *  7. Outcome thunk is idempotent (outcomeResolved guard).
 *  8. Same seed + same participants always produces the same winner.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import silentSaboteurReducer, {
  initSilentSaboteur,
  advanceIntro,
  selectVictim,
  submitVote,
  endVotingPhase,
  advanceReveal,
  startNextRound,
  submitJuryVote,
  advanceWinner,
  markSilentSaboteurOutcomeResolved,
} from '../../src/features/silentSaboteur/silentSaboteurSlice';
import type { SilentSaboteurState } from '../../src/features/silentSaboteur/silentSaboteurSlice';
import { resolveSilentSaboteurOutcome } from '../../src/features/silentSaboteur/thunks';
import { getGame } from '../../src/minigames/registry';
import {
  pickVictimForAi,
  buildAiVotes,
  buildAiJuryVotes,
  resolveFinal2,
  resolveRoundWithAbstentions,
  noJuryFallbackWinner,
} from '../../src/features/silentSaboteur/helpers';

// ─── Store factory ────────────────────────────────────────────────────────────

function makeIntegrationStore(initialGamePhase = 'hoh_comp') {
  const gameReducer = (
    state = {
      phase: initialGamePhase,
      hohId: null as string | null,
      povWinnerId: null as string | null,
      applyCount: 0,
    },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'game/applyMinigameWinner') {
      const p = action.payload as { winnerId: string };
      if (initialGamePhase === 'hoh_comp') {
        return { ...state, hohId: p.winnerId, phase: 'hoh_results', applyCount: state.applyCount + 1 };
      }
      return { ...state, povWinnerId: p.winnerId, phase: 'pov_results', applyCount: state.applyCount + 1 };
    }
    return state;
  };
  return configureStore({
    reducer: { silentSaboteur: silentSaboteurReducer, game: gameReducer },
  });
}

type TestStore = ReturnType<typeof makeIntegrationStore>;

function ss(store: TestStore): SilentSaboteurState {
  return store.getState().silentSaboteur;
}

/** Run one complete round deterministically (all AI, no human). */
function runAiRound(store: TestStore) {
  const state = ss(store);
  if (state.phase !== 'select_victim') return;

  const { saboteurId, activeIds, seed, round } = state;
  if (!saboteurId) return;

  // Saboteur picks victim
  const victim = pickVictimForAi(seed, round, saboteurId, activeIds);
  store.dispatch(selectVictim({ victimId: victim }));

  // All players vote — victim excluded from valid suspect targets
  const votes = buildAiVotes(seed, round, activeIds, activeIds, victim);
  for (const [voterId, accusedId] of Object.entries(votes)) {
    store.dispatch(submitVote({ voterId, accusedId }));
  }

  // If not all votes triggered auto-advance (abstentions), end voting phase
  if (ss(store).phase === 'voting') {
    store.dispatch(endVotingPhase());
  }
}

/** Run the Final-2 jury phase deterministically. */
function runAiFinal2(store: TestStore) {
  const state = ss(store);
  if (state.phase !== 'final2_jury') return;

  const { final2SaboteurId, final2VictimId, eliminatedIds, seed, juryVotes } = state;
  if (!final2SaboteurId || !final2VictimId) return;

  const humanJurors = eliminatedIds.filter(
    (id) => juryVotes[id] === undefined,
  );
  // Submit AI jury votes for any remaining
  const aiVotes = buildAiJuryVotes(seed, humanJurors, final2SaboteurId, final2VictimId);
  for (const [jurorId, accusedId] of Object.entries(aiVotes)) {
    store.dispatch(submitJuryVote({ jurorId, accusedId }));
  }
}

/** Full simulation loop for all-AI game. */
function simulateFull(store: TestStore, maxRounds = 50): string | null {
  let guard = 0;
  while (ss(store).phase !== 'complete' && guard < maxRounds) {
    guard++;
    const phase = ss(store).phase;

    if (phase === 'intro') store.dispatch(advanceIntro());
    else if (phase === 'select_victim') runAiRound(store);
    else if (phase === 'reveal') store.dispatch(advanceReveal());
    else if (phase === 'round_transition') store.dispatch(startNextRound());
    else if (phase === 'final2_jury') runAiFinal2(store);
    else if (phase === 'winner') store.dispatch(advanceWinner());
    else break;
  }
  return ss(store).winnerId;
}

function initStore(
  store: TestStore,
  ids: string[],
  type: 'HOH' | 'POV' = 'HOH',
  seed = 42,
) {
  store.dispatch(
    initSilentSaboteur({
      participantIds: ids,
      prizeType: type,
      seed,
      humanPlayerId: null,
    }),
  );
}

// ─── Registry ─────────────────────────────────────────────────────────────────

describe('Registry — silentSaboteur entry', () => {
  it('exists in the registry', () => {
    expect(getGame('silentSaboteur')).toBeDefined();
  });

  it('uses implementation="react"', () => {
    const entry = getGame('silentSaboteur');
    expect(entry?.implementation).toBe('react');
    expect(entry?.legacy).toBe(false);
  });

  it('uses reactComponentKey="SilentSaboteur"', () => {
    const entry = getGame('silentSaboteur');
    expect(entry?.reactComponentKey).toBe('SilentSaboteur');
  });

  it('has authoritative=true and scoringAdapter="authoritative"', () => {
    const entry = getGame('silentSaboteur');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
  });

  it('has category="logic"', () => {
    expect(getGame('silentSaboteur')?.category).toBe('logic');
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

describe('Integration — initSilentSaboteur', () => {
  it('transitions to intro phase', () => {
    const store = makeIntegrationStore();
    initStore(store, ['p1', 'p2', 'p3', 'p4', 'p5']);
    expect(ss(store).phase).toBe('intro');
  });

  it('sets activeIds correctly', () => {
    const store = makeIntegrationStore();
    const ids = ['p1', 'p2', 'p3'];
    initStore(store, ids);
    expect(ss(store).activeIds).toEqual(ids);
  });
});

// ─── 2-player path ────────────────────────────────────────────────────────────

describe('Integration — 2-player game resolves to one winner', () => {
  it('resolves to complete with one winner', () => {
    const store = makeIntegrationStore();
    initStore(store, ['p1', 'p2']);
    const winner = simulateFull(store);
    expect(ss(store).phase).toBe('complete');
    expect(['p1', 'p2']).toContain(winner);
  });
});

// ─── 3-player path ────────────────────────────────────────────────────────────

describe('Integration — 3-player game Final-3 rule', () => {
  it('resolves to complete with one winner', () => {
    const store = makeIntegrationStore();
    initStore(store, ['p1', 'p2', 'p3']);
    const winner = simulateFull(store);
    expect(ss(store).phase).toBe('complete');
    expect(['p1', 'p2', 'p3']).toContain(winner);
  });

  it('Final-3 Victim Override is applied for 1-1-1 tie', () => {
    // Build a scenario where we know it's a 3-player final with 1-1-1 votes
    // alice=saboteur, bob=victim, carol=neutral
    // For 1-1-1: alice→carol, bob→alice, carol→bob
    // victim (bob) votes for alice (saboteur) → victim override → saboteur (alice) caught
    const votes = { alice: 'carol', bob: 'alice', carol: 'bob' };
    const outcome = resolveRoundWithAbstentions(votes, ['alice', 'bob', 'carol'], 'alice', 'bob');
    expect(outcome.victimOverride).toBe(true);
    expect(outcome.eliminatedId).toBe('alice'); // saboteur caught
  });
});

// ─── 5-player full simulation ─────────────────────────────────────────────────

describe('Integration — 5-player full game resolves to one winner', () => {
  it('always crowns exactly one winner', () => {
    const store = makeIntegrationStore();
    initStore(store, ['p1', 'p2', 'p3', 'p4', 'p5']);
    const winner = simulateFull(store);
    expect(ss(store).phase).toBe('complete');
    expect(['p1', 'p2', 'p3', 'p4', 'p5']).toContain(winner);
    expect(ss(store).activeIds.length + ss(store).eliminatedIds.length).toBe(5);
  });

  it('never eliminates all players', () => {
    const store = makeIntegrationStore();
    initStore(store, ['p1', 'p2', 'p3', 'p4', 'p5']);
    simulateFull(store);
    expect(ss(store).activeIds.length).toBeGreaterThanOrEqual(0);
    // activeIds is 0 only at complete (winnerId moves last player out)
    // total should still be 5
    const total = ss(store).activeIds.length + ss(store).eliminatedIds.length;
    expect(total).toBe(5);
  });
});

// ─── Outcome thunk — idempotency ──────────────────────────────────────────────

describe('resolveSilentSaboteurOutcome — idempotency', () => {
  function reachComplete(type: 'HOH' | 'POV' = 'HOH') {
    const store = makeIntegrationStore(type === 'HOH' ? 'hoh_comp' : 'pov_comp');
    initStore(store, ['p1', 'p2', 'p3', 'p4', 'p5'], type);
    simulateFull(store);
    expect(ss(store).phase).toBe('complete');
    return store;
  }

  it('dispatches applyMinigameWinner for HOH competition', () => {
    const store = reachComplete('HOH');
    store.dispatch(resolveSilentSaboteurOutcome());
    expect(ss(store).outcomeResolved).toBe(true);
  });

  it('dispatches applyMinigameWinner for POV competition', () => {
    const store = reachComplete('POV');
    store.dispatch(resolveSilentSaboteurOutcome());
    expect(ss(store).outcomeResolved).toBe(true);
  });

  it('applyMinigameWinner is dispatched exactly once', () => {
    const store = reachComplete('HOH');
    store.dispatch(resolveSilentSaboteurOutcome());
    store.dispatch(resolveSilentSaboteurOutcome()); // second call — should be no-op
    expect((store.getState() as ReturnType<typeof store.getState>).game.applyCount).toBe(1);
  });

  it('is a no-op when game phase does not match competition type', () => {
    const store = makeIntegrationStore('pov_comp'); // wrong phase for HOH
    initStore(store, ['p1', 'p2', 'p3'], 'HOH');
    simulateFull(store);
    store.dispatch(resolveSilentSaboteurOutcome());
    expect(ss(store).outcomeResolved).toBe(false);
  });

  it('outcomeResolved guard prevents re-dispatch', () => {
    const store = reachComplete('HOH');
    store.dispatch(markSilentSaboteurOutcomeResolved());
    store.dispatch(resolveSilentSaboteurOutcome()); // already resolved
    expect((store.getState() as ReturnType<typeof store.getState>).game.applyCount).toBe(0);
  });
});

// ─── Determinism / reproducibility ───────────────────────────────────────────

describe('Determinism — same seed + participants → same winner', () => {
  function runWithSeed(seed: number, ids: string[]) {
    const store = makeIntegrationStore();
    store.dispatch(
      initSilentSaboteur({ participantIds: ids, prizeType: 'HOH', seed, humanPlayerId: null }),
    );
    return simulateFull(store);
  }

  it('same seed produces same winner', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const w1 = runWithSeed(42, ids);
    const w2 = runWithSeed(42, ids);
    expect(w1).toBe(w2);
  });

  it('different seed may produce different winner', () => {
    const ids = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const winners = new Set(
      [1, 2, 3, 4, 5, 100, 200, 999, 12345].map((s) => runWithSeed(s, ids)),
    );
    // With 9 different seeds, expect at least 2 distinct winners
    expect(winners.size).toBeGreaterThan(1);
  });
});

// ─── Final-2 jury vote logic (pure helpers) ───────────────────────────────────

describe('Final-2 jury logic', () => {
  it('jury correct majority → victim wins', () => {
    const votes = { j1: 'sam', j2: 'sam', j3: 'pat' };
    const outcome = resolveFinal2(votes, 'sam', 'pat');
    expect(outcome.winnerId).toBe('pat');
    expect(outcome.reason).toBe('jury_correct');
  });

  it('no jury → no_jury_fallback', () => {
    const outcome = resolveFinal2({}, 'sam', 'pat');
    expect(outcome.reason).toBe('no_jury_fallback');
  });

  it('deterministic fallback produces consistent result', () => {
    const a = noJuryFallbackWinner(42, 'sam', 'pat');
    const b = noJuryFallbackWinner(42, 'sam', 'pat');
    expect(a).toBe(b);
    expect(['sam', 'pat']).toContain(a);
  });
});
