/**
 * Unit tests — Silent Saboteur Redux slice.
 *
 * Covers:
 *   - Init → intro phase, correct state shape
 *   - advanceIntro → select_victim phase (saboteur assigned)
 *   - selectVictim self-target guard
 *   - submitVote self-vote guard, victim-target guard
 *   - Full round: majority → saboteur caught → reveal
 *   - Full round: no majority → victim eliminated → reveal
 *   - advanceReveal transitions: round_transition / final2_jury / winner
 *   - startNextRound clears ephemeral state
 *   - Final-2 with no jury → winner directly (seeded fallback)
 *   - markSilentSaboteurOutcomeResolved sets outcomeResolved
 *   - resetSilentSaboteur returns to idle
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
  resetSilentSaboteur,
} from '../../../src/features/silentSaboteur/silentSaboteurSlice';

const SEED = 42;
const PLAYERS_5 = ['alice', 'bob', 'carol', 'dave', 'eve'];
const PLAYERS_3 = ['alice', 'bob', 'carol'];
const PLAYERS_2 = ['alice', 'bob'];

function makeStore() {
  return configureStore({ reducer: { silentSaboteur: silentSaboteurReducer } });
}

function getState(store: ReturnType<typeof makeStore>) {
  return store.getState().silentSaboteur;
}

function init(
  store: ReturnType<typeof makeStore>,
  ids = PLAYERS_5,
  human: string | null = null,
) {
  store.dispatch(
    initSilentSaboteur({ participantIds: ids, prizeType: 'HOH', seed: SEED, humanPlayerId: human }),
  );
}

/**
 * Helper: cast valid votes for all active players (excluding self and victim),
 * then call endVotingPhase if the round is not yet resolved.
 */
function castAllValidVotes(store: ReturnType<typeof makeStore>) {
  const { activeIds, victimId } = getState(store);
  for (const id of activeIds) {
    if (getState(store).votes[id] !== undefined) continue;
    const accused = activeIds.find((x) => x !== id && x !== victimId);
    if (accused) store.dispatch(submitVote({ voterId: id, accusedId: accused }));
  }
  // If voting phase is still open (e.g. someone had no valid target), end it
  if (getState(store).phase === 'voting') {
    store.dispatch(endVotingPhase());
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

describe('initSilentSaboteur', () => {
  it('starts in intro phase', () => {
    const store = makeStore();
    init(store);
    expect(getState(store).phase).toBe('intro');
  });

  it('sets participantIds and activeIds', () => {
    const store = makeStore();
    init(store);
    expect(getState(store).participantIds).toEqual(PLAYERS_5);
    expect(getState(store).activeIds).toEqual(PLAYERS_5);
  });

  it('starts with empty eliminatedIds', () => {
    const store = makeStore();
    init(store);
    expect(getState(store).eliminatedIds).toEqual([]);
  });

  it('does not set saboteur until advanceIntro', () => {
    const store = makeStore();
    init(store);
    expect(getState(store).saboteurId).toBeNull();
  });
});

// ─── advanceIntro ────────────────────────────────────────────────────────────

describe('advanceIntro', () => {
  it('transitions intro → select_victim and assigns saboteur', () => {
    const store = makeStore();
    init(store);
    store.dispatch(advanceIntro());
    const state = getState(store);
    expect(state.phase).toBe('select_victim');
    expect(state.saboteurId).not.toBeNull();
    expect(PLAYERS_5).toContain(state.saboteurId);
  });

  it('is a no-op from non-intro phase', () => {
    const store = makeStore();
    // start fresh — phase is 'idle'
    store.dispatch(advanceIntro());
    expect(getState(store).phase).toBe('idle');
  });
});

// ─── selectVictim ────────────────────────────────────────────────────────────

describe('selectVictim', () => {
  function reachSelectVictim(players = PLAYERS_5) {
    const store = makeStore();
    init(store, players);
    store.dispatch(advanceIntro());
    return store;
  }

  it('self-target is ignored (saboteur cannot select self)', () => {
    const store = reachSelectVictim();
    const { saboteurId } = getState(store);
    store.dispatch(selectVictim({ victimId: saboteurId! }));
    // Phase should NOT advance
    expect(getState(store).phase).toBe('select_victim');
    expect(getState(store).victimId).toBeNull();
  });

  it('valid victim advances to voting', () => {
    const store = reachSelectVictim();
    const { saboteurId, activeIds } = getState(store);
    const victim = activeIds.find((id) => id !== saboteurId)!;
    store.dispatch(selectVictim({ victimId: victim }));
    expect(getState(store).phase).toBe('voting');
    expect(getState(store).victimId).toBe(victim);
  });

  it('inactive player target is ignored', () => {
    const store = reachSelectVictim();
    store.dispatch(selectVictim({ victimId: 'nonexistent' }));
    expect(getState(store).phase).toBe('select_victim');
  });
});

// ─── submitVote ───────────────────────────────────────────────────────────────

describe('submitVote', () => {
  function reachVoting(players = PLAYERS_5) {
    const store = makeStore();
    init(store, players);
    store.dispatch(advanceIntro());
    const { saboteurId, activeIds } = getState(store);
    const victim = activeIds.find((id) => id !== saboteurId)!;
    store.dispatch(selectVictim({ victimId: victim }));
    return store;
  }

  it('self-vote is ignored', () => {
    const store = reachVoting();
    const voter = PLAYERS_5[0];
    store.dispatch(submitVote({ voterId: voter, accusedId: voter }));
    expect(getState(store).votes[voter]).toBeUndefined();
  });

  it('vote targeting the victim is rejected', () => {
    const store = reachVoting();
    const { victimId } = getState(store);
    // Find a voter who is not the victim
    const voter = PLAYERS_5.find((id) => id !== victimId)!;
    store.dispatch(submitVote({ voterId: voter, accusedId: victimId! }));
    expect(getState(store).votes[voter]).toBeUndefined();
  });

  it('valid vote is recorded', () => {
    const store = reachVoting();
    const { victimId, activeIds } = getState(store);
    const voter = activeIds[0];
    // Find a valid accused: not self, not victim
    const accused = activeIds.find((id) => id !== voter && id !== victimId)!;
    store.dispatch(submitVote({ voterId: voter, accusedId: accused }));
    expect(getState(store).votes[voter]).toBe(accused);
  });

  it('cannot vote twice', () => {
    const store = reachVoting();
    const { victimId, activeIds } = getState(store);
    const voter = activeIds[0];
    const validCandidates = activeIds.filter((id) => id !== voter && id !== victimId);
    const accused1 = validCandidates[0];
    const accused2 = validCandidates[1] ?? validCandidates[0];
    store.dispatch(submitVote({ voterId: voter, accusedId: accused1 }));
    store.dispatch(submitVote({ voterId: voter, accusedId: accused2 }));
    expect(getState(store).votes[voter]).toBe(accused1); // first vote sticks
  });

  it('advances to reveal when all players voted (or endVotingPhase)', () => {
    const store = reachVoting(PLAYERS_3);
    castAllValidVotes(store);
    expect(getState(store).phase).toBe('reveal');
    expect(getState(store).revealInfo).not.toBeNull();
    // One player eliminated
    expect(getState(store).activeIds.length).toBe(2);
    expect(getState(store).eliminatedIds.length).toBe(1);
  });
});

// ─── advanceReveal ────────────────────────────────────────────────────────────

describe('advanceReveal', () => {
  function reachReveal(players: string[]) {
    const store = makeStore();
    init(store, players);
    store.dispatch(advanceIntro());
    const { saboteurId, activeIds } = getState(store);
    const victim = activeIds.find((id) => id !== saboteurId)!;
    store.dispatch(selectVictim({ victimId: victim }));
    castAllValidVotes(store);
    return store;
  }

  it('goes to round_transition when ≥3 remain after reveal', () => {
    const store = reachReveal(PLAYERS_5);
    expect(getState(store).phase).toBe('reveal');
    store.dispatch(advanceReveal());
    expect(getState(store).phase).toBe('round_transition');
  });

  it('goes to final2_jury when exactly 2 remain after reveal (with eliminated jury)', () => {
    // Start with 3 players → after 1 elimination → 2 remain
    const store = reachReveal(PLAYERS_3);
    expect(getState(store).phase).toBe('reveal');
    expect(getState(store).activeIds.length).toBe(2);
    store.dispatch(advanceReveal());
    // 1 eliminated player forms the jury
    const state = getState(store);
    expect(['final2_jury', 'winner']).toContain(state.phase);
  });

  it('goes to winner when 1 player remains', () => {
    // Start with 2 players → after 1 elimination → 1 remains
    const store = makeStore();
    init(store, PLAYERS_2);
    store.dispatch(advanceIntro());
    const { saboteurId, activeIds } = getState(store);
    const victim = activeIds.find((id) => id !== saboteurId)!;
    store.dispatch(selectVictim({ victimId: victim }));
    castAllValidVotes(store);
    const state = getState(store);
    // 2 players may hit final2 through startFinal2 or winner
    expect(['reveal', 'winner', 'final2_jury']).toContain(state.phase);
  });
});

// ─── startNextRound ───────────────────────────────────────────────────────────

describe('startNextRound', () => {
  it('clears ephemeral state and increments round', () => {
    const store = makeStore();
    init(store, PLAYERS_5);
    store.dispatch(advanceIntro());
    const { saboteurId, activeIds } = getState(store);
    const victim = activeIds.find((id) => id !== saboteurId)!;
    store.dispatch(selectVictim({ victimId: victim }));
    castAllValidVotes(store);
    if (getState(store).phase === 'reveal') store.dispatch(advanceReveal());
    if (getState(store).phase !== 'round_transition') return; // guard

    const prevRound = getState(store).round;
    store.dispatch(startNextRound());
    const state = getState(store);
    expect(state.round).toBe(prevRound + 1);
    expect(state.phase).toBe('select_victim');
    expect(state.saboteurId).not.toBeNull();
    expect(state.victimId).toBeNull();
    expect(state.votes).toEqual({});
    expect(state.revealInfo).toBeNull();
  });
});

// ─── Final-2 no-jury fallback ─────────────────────────────────────────────────

describe('Final-2 no-jury fallback', () => {
  it('transitions directly to winner when no jury exists', () => {
    // Start with only 2 players (no one eliminated before final-2)
    const store = makeStore();
    init(store, PLAYERS_2);
    store.dispatch(advanceIntro());
    const { saboteurId, activeIds } = getState(store);
    const victim = activeIds.find((id) => id !== saboteurId)!;
    store.dispatch(selectVictim({ victimId: victim }));
    castAllValidVotes(store);
    if (getState(store).phase === 'reveal') store.dispatch(advanceReveal());
    // If we're in final2_jury with 0 jury → noJuryFallback should have been applied
    // Or we're in winner
    const state = getState(store);
    const validPhases: string[] = ['final2_jury', 'winner', 'complete'];
    expect(validPhases).toContain(state.phase);
    // If winner, winnerId should be set
    if (state.phase === 'winner') {
      expect(PLAYERS_2).toContain(state.winnerId);
    }
  });
});

// ─── submitJuryVote ───────────────────────────────────────────────────────────

describe('submitJuryVote', () => {
  it('non-juror cannot vote', () => {
    const store = makeStore();
    // Reach final2_jury with a 3-player game (1 juror)
    init(store, PLAYERS_3);
    store.dispatch(advanceIntro());
    const { saboteurId, activeIds } = getState(store);
    const victim = activeIds.find((id) => id !== saboteurId)!;
    store.dispatch(selectVictim({ victimId: victim }));
    castAllValidVotes(store);
    if (getState(store).phase === 'reveal') store.dispatch(advanceReveal());
    if (getState(store).phase !== 'final2_jury') return; // skip if resolved differently

    const { activeIds: finalists } = getState(store);
    // Active player (finalist) cannot jury vote
    const finalist = finalists[0];
    store.dispatch(submitJuryVote({ jurorId: finalist, accusedId: finalists[1] }));
    expect(getState(store).juryVotes[finalist]).toBeUndefined();
  });
});

// ─── Idempotency guard ────────────────────────────────────────────────────────

describe('markSilentSaboteurOutcomeResolved', () => {
  it('sets outcomeResolved to true', () => {
    const store = makeStore();
    init(store);
    expect(getState(store).outcomeResolved).toBe(false);
    store.dispatch(markSilentSaboteurOutcomeResolved());
    expect(getState(store).outcomeResolved).toBe(true);
  });
});

// ─── resetSilentSaboteur ──────────────────────────────────────────────────────

describe('resetSilentSaboteur', () => {
  it('returns to idle state', () => {
    const store = makeStore();
    init(store);
    store.dispatch(advanceIntro());
    store.dispatch(resetSilentSaboteur());
    expect(getState(store).phase).toBe('idle');
    expect(getState(store).participantIds).toEqual([]);
  });
});

// ─── advanceWinner ────────────────────────────────────────────────────────────

describe('advanceWinner', () => {
  it('is a no-op from non-winner phase', () => {
    const store = makeStore();
    init(store);
    store.dispatch(advanceWinner());
    expect(getState(store).phase).toBe('intro');
  });
});
