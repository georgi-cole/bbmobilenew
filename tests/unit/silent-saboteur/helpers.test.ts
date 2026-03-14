/**
 * Unit tests — Silent Saboteur pure helpers.
 *
 * Covers:
 *   - Deterministic saboteur selection (reproducible, covers range)
 *   - Deterministic victim selection (never self)
 *   - AI vote selection (never self)
 *   - resolveStandardRound: majority → saboteur caught
 *   - resolveStandardRound: no majority → victim eliminated
 *   - resolveFinal3Round: 2-votes majority → normal resolution
 *   - resolveFinal3Round: 1-1-1 tie + victim voted saboteur → saboteur caught
 *   - resolveFinal3Round: 1-1-1 tie + victim did NOT vote saboteur → victim eliminated
 *   - resolveFinal2: jury correct (majority for saboteur)
 *   - resolveFinal2: jury incorrect (majority for victim)
 *   - resolveFinal2: jury tie → victim's tiebreak vote decides
 *   - resolveFinal2: no jury → no_jury_fallback outcome
 *   - noJuryFallbackWinner: deterministic, returns one of the two finalists
 *   - buildAiJuryVotes: all jurors vote, no self-votes
 *   - self-vote guard: pickVoteForAi never returns voterId
 *   - buildAiVotes: all AI players get a vote excluding self
 */

import { describe, it, expect } from 'vitest';
import {
  pickSaboteur,
  pickVictimForAi,
  pickVoteForAi,
  buildAiVotes,
  resolveStandardRound,
  resolveFinal3Round,
  resolveRound,
  resolveFinal2,
  noJuryFallbackWinner,
  buildAiJuryVotes,
} from '../../../src/features/silentSaboteur/helpers';

const SEED = 42;
const PLAYERS = ['alice', 'bob', 'carol', 'dave', 'eve'];

// ─── pickSaboteur ─────────────────────────────────────────────────────────────

describe('pickSaboteur', () => {
  it('returns a player from active list', () => {
    const s = pickSaboteur(SEED, 0, PLAYERS);
    expect(PLAYERS).toContain(s);
  });

  it('is deterministic for same seed+round', () => {
    expect(pickSaboteur(SEED, 0, PLAYERS)).toBe(pickSaboteur(SEED, 0, PLAYERS));
  });

  it('produces different results for different rounds', () => {
    const results = new Set(PLAYERS.map((_, i) => pickSaboteur(SEED, i, PLAYERS)));
    // With 5 rounds on 5 players, expect some variety
    expect(results.size).toBeGreaterThan(1);
  });

  it('works with a 2-player list', () => {
    const s = pickSaboteur(SEED, 0, ['x', 'y']);
    expect(['x', 'y']).toContain(s);
  });
});

// ─── pickVictimForAi ──────────────────────────────────────────────────────────

describe('pickVictimForAi', () => {
  it('never returns the saboteur ID', () => {
    for (let round = 0; round < 10; round++) {
      const saboteur = pickSaboteur(SEED, round, PLAYERS);
      const victim = pickVictimForAi(SEED, round, saboteur, PLAYERS);
      expect(victim).not.toBe(saboteur);
    }
  });

  it('returns a player from active list', () => {
    const saboteur = PLAYERS[0];
    const victim = pickVictimForAi(SEED, 0, saboteur, PLAYERS);
    expect(PLAYERS).toContain(victim);
  });

  it('is deterministic', () => {
    const a = pickVictimForAi(SEED, 0, 'alice', PLAYERS);
    const b = pickVictimForAi(SEED, 0, 'alice', PLAYERS);
    expect(a).toBe(b);
  });
});

// ─── pickVoteForAi ────────────────────────────────────────────────────────────

describe('pickVoteForAi', () => {
  it('never self-votes', () => {
    for (const voter of PLAYERS) {
      const accused = pickVoteForAi(SEED, 0, voter, PLAYERS);
      expect(accused).not.toBe(voter);
    }
  });

  it('returns an active player', () => {
    const accused = pickVoteForAi(SEED, 0, 'alice', PLAYERS);
    expect(PLAYERS).toContain(accused);
  });

  it('is deterministic', () => {
    const a = pickVoteForAi(SEED, 0, 'alice', PLAYERS);
    const b = pickVoteForAi(SEED, 0, 'alice', PLAYERS);
    expect(a).toBe(b);
  });
});

// ─── buildAiVotes ─────────────────────────────────────────────────────────────

describe('buildAiVotes', () => {
  it('every AI voter gets exactly one vote', () => {
    const aiIds = ['bob', 'carol', 'dave'];
    const votes = buildAiVotes(SEED, 0, aiIds, PLAYERS);
    expect(Object.keys(votes)).toHaveLength(aiIds.length);
  });

  it('no voter votes for themselves', () => {
    const votes = buildAiVotes(SEED, 0, PLAYERS, PLAYERS);
    for (const [voterId, accusedId] of Object.entries(votes)) {
      expect(voterId).not.toBe(accusedId);
    }
  });
});

// ─── resolveStandardRound ─────────────────────────────────────────────────────

describe('resolveStandardRound', () => {
  it('eliminates saboteur when strict majority votes for them', () => {
    // 5 voters, 3 vote for saboteur → strict majority
    const votes = {
      alice: 'dave',   // saboteur
      bob: 'dave',     // saboteur
      carol: 'dave',   // saboteur
      dave: 'alice',   // self-defense (dave is saboteur)
      eve: 'alice',
    };
    const outcome = resolveStandardRound(votes, 'dave', 'alice');
    expect(outcome.eliminatedId).toBe('dave');
    expect(outcome.reason).toBe('saboteur_caught');
  });

  it('eliminates victim when no majority for saboteur', () => {
    // 5 voters, only 2 vote for saboteur → not majority
    const votes = {
      alice: 'dave',
      bob: 'dave',
      carol: 'alice',
      dave: 'carol',
      eve: 'carol',
    };
    const outcome = resolveStandardRound(votes, 'dave', 'alice');
    expect(outcome.eliminatedId).toBe('alice');
    expect(outcome.reason).toBe('victim_eliminated');
  });

  it('exactly half votes is NOT a majority → victim eliminated', () => {
    // 4 voters, 2 vote for saboteur → not strict majority (need 3)
    const votes = {
      alice: 'bob',   // saboteur
      carol: 'bob',   // saboteur
      bob: 'alice',
      dave: 'alice',
    };
    const outcome = resolveStandardRound(votes, 'bob', 'alice');
    expect(outcome.eliminatedId).toBe('alice');
    expect(outcome.reason).toBe('victim_eliminated');
  });
});

// ─── resolveFinal3Round ───────────────────────────────────────────────────────

describe('resolveFinal3Round', () => {
  it('resolves normally when 2 votes target same player (non-saboteur)', () => {
    // alice=saboteur, bob=victim, carol=neutral
    // votes: alice→carol, bob→carol, carol→alice  (2 for carol, 1 for alice)
    const votes = { alice: 'carol', bob: 'carol', carol: 'alice' };
    const outcome = resolveFinal3Round(votes, 'alice', 'bob');
    // 2 votes for carol (not saboteur) → victim eliminated
    expect(outcome.eliminatedId).toBe('bob');
    expect(outcome.reason).toBe('victim_eliminated');
    expect(outcome.victimOverride).toBe(false);
  });

  it('saboteur caught normally when 2+ votes target saboteur', () => {
    // votes: bob→alice, carol→alice, alice→carol  (2 for alice=saboteur)
    const votes = { alice: 'carol', bob: 'alice', carol: 'alice' };
    const outcome = resolveFinal3Round(votes, 'alice', 'bob');
    expect(outcome.eliminatedId).toBe('alice');
    expect(outcome.reason).toBe('saboteur_caught');
    expect(outcome.victimOverride).toBe(false);
  });

  it('1-1-1 tie + victim voted saboteur → saboteur caught via Victim Override', () => {
    // alice=saboteur, bob=victim, carol=neutral
    // each gets 1 vote → 1-1-1 tie
    // victim (bob) voted for alice (saboteur)
    const votes = { alice: 'carol', bob: 'alice', carol: 'bob' };
    const outcome = resolveFinal3Round(votes, 'alice', 'bob');
    expect(outcome.eliminatedId).toBe('alice');
    expect(outcome.reason).toBe('saboteur_caught');
    expect(outcome.victimOverride).toBe(true);
  });

  it('1-1-1 tie + victim did NOT vote saboteur → victim eliminated via Victim Override', () => {
    // alice=saboteur, bob=victim, carol=neutral
    // For true 1-1-1: alice→bob, bob→carol, carol→alice  (each gets 1 vote)
    // victim=bob voted for carol (not alice=saboteur)
    const votes2 = { alice: 'bob', bob: 'carol', carol: 'alice' };
    const outcome = resolveFinal3Round(votes2, 'alice', 'bob');
    expect(outcome.eliminatedId).toBe('bob');
    expect(outcome.reason).toBe('victim_eliminated');
    expect(outcome.victimOverride).toBe(true);
  });
});

// ─── resolveRound (dispatcher) ────────────────────────────────────────────────

describe('resolveRound', () => {
  it('delegates to resolveFinal3Round when 3 active players', () => {
    const votes = { alice: 'bob', bob: 'carol', carol: 'alice' };
    const outcome = resolveRound(votes, 'alice', 'bob', ['alice', 'bob', 'carol']);
    // 1-1-1 tie, victim=bob voted for carol (not saboteur) → victim override
    expect(outcome.victimOverride).toBe(true);
  });

  it('delegates to resolveStandardRound when 4+ active players', () => {
    const votes = {
      alice: 'dave',
      bob: 'dave',
      carol: 'dave',
      dave: 'alice',
    };
    const outcome = resolveRound(votes, 'dave', 'alice', ['alice', 'bob', 'carol', 'dave']);
    expect(outcome.eliminatedId).toBe('dave');
    expect(outcome.victimOverride).toBe(false);
  });
});

// ─── resolveFinal2 ────────────────────────────────────────────────────────────

describe('resolveFinal2', () => {
  it('jury correctly identifies saboteur → victim wins', () => {
    const votes = { j1: 'sam', j2: 'sam', j3: 'sam' }; // majority for sam=saboteur
    const outcome = resolveFinal2(votes, 'sam', 'pat');
    expect(outcome.winnerId).toBe('pat');
    expect(outcome.eliminatedId).toBe('sam');
    expect(outcome.reason).toBe('jury_correct');
  });

  it('jury incorrectly identifies saboteur → saboteur wins', () => {
    const votes = { j1: 'pat', j2: 'pat', j3: 'pat' }; // majority for pat=victim
    const outcome = resolveFinal2(votes, 'sam', 'pat');
    expect(outcome.winnerId).toBe('sam');
    expect(outcome.eliminatedId).toBe('pat');
    expect(outcome.reason).toBe('jury_incorrect');
  });

  it('tied jury + tiebreak accuses saboteur → victim wins', () => {
    const votes = { j1: 'sam', j2: 'pat' }; // 1-1 tie
    const outcome = resolveFinal2(votes, 'sam', 'pat', 'sam');
    expect(outcome.winnerId).toBe('pat');
    expect(outcome.reason).toBe('jury_tie');
  });

  it('tied jury + tiebreak accuses victim → saboteur wins', () => {
    const votes = { j1: 'sam', j2: 'pat' }; // 1-1 tie
    const outcome = resolveFinal2(votes, 'sam', 'pat', 'pat');
    expect(outcome.winnerId).toBe('sam');
    expect(outcome.reason).toBe('jury_tie');
  });

  it('empty jury → no_jury_fallback', () => {
    const outcome = resolveFinal2({}, 'sam', 'pat');
    expect(outcome.reason).toBe('no_jury_fallback');
  });
});

// ─── noJuryFallbackWinner ─────────────────────────────────────────────────────

describe('noJuryFallbackWinner', () => {
  it('returns one of the two finalists', () => {
    const w = noJuryFallbackWinner(SEED, 'sam', 'pat');
    expect(['sam', 'pat']).toContain(w);
  });

  it('is deterministic', () => {
    const a = noJuryFallbackWinner(SEED, 'sam', 'pat');
    const b = noJuryFallbackWinner(SEED, 'sam', 'pat');
    expect(a).toBe(b);
  });
});

// ─── buildAiJuryVotes ─────────────────────────────────────────────────────────

describe('buildAiJuryVotes', () => {
  it('all jurors get a vote', () => {
    const jurors = ['j1', 'j2', 'j3'];
    const votes = buildAiJuryVotes(SEED, jurors, 'sam', 'pat');
    expect(Object.keys(votes)).toHaveLength(3);
  });

  it('all votes target one of the two finalists', () => {
    const jurors = ['j1', 'j2', 'j3', 'j4', 'j5'];
    const votes = buildAiJuryVotes(SEED, jurors, 'sam', 'pat');
    for (const v of Object.values(votes)) {
      expect(['sam', 'pat']).toContain(v);
    }
  });

  it('is deterministic', () => {
    const a = buildAiJuryVotes(SEED, ['j1', 'j2'], 'sam', 'pat');
    const b = buildAiJuryVotes(SEED, ['j1', 'j2'], 'sam', 'pat');
    expect(a).toEqual(b);
  });
});

// ─── Never eliminate all players ─────────────────────────────────────────────

describe('safety: never eliminate all players', () => {
  it('resolveRound always leaves at least one player active (simulated loop)', () => {
    let active = [...PLAYERS];
    let round = 0;
    while (active.length > 2) {
      const saboteur = pickSaboteur(SEED, round, active);
      const victim = pickVictimForAi(SEED, round, saboteur, active);
      const aiVotes = buildAiVotes(SEED, round, active, active);
      const outcome = resolveRound(aiVotes, saboteur, victim, active);
      active = active.filter((id) => id !== outcome.eliminatedId);
      expect(active.length).toBeGreaterThanOrEqual(1);
      round++;
    }
    // Exactly 2 left
    expect(active.length).toBe(2);
  });
});
