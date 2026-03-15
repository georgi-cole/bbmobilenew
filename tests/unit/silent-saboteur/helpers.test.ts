/**
 * Unit tests — Silent Saboteur pure helpers.
 *
 * Covers:
 *   - Deterministic saboteur selection (reproducible, covers range)
 *   - Deterministic victim selection (never self)
 *   - AI vote selection (never self)
 *   - resolveRoundWithAbstentions: deterministic cases A–D + edge cases
 *   - resolveRound: delegates to abstention-aware resolution for 3+ players
 *   - resolveFinal2: jury correct (majority for saboteur)
 *   - resolveFinal2: jury incorrect (majority for victim)
 *   - resolveFinal2: jury tie → saboteur wins
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
  pickVoteForAiOrAbstain,
  buildAiVotes,
  resolveRoundWithAbstentions,
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

describe('pickVoteForAiOrAbstain', () => {
  it('returns null when victim exclusion leaves no valid suspects', () => {
    expect(pickVoteForAiOrAbstain(SEED, 0, 'bob', ['alice', 'bob'], 'alice')).toBeNull();
  });

  it('returns a deterministic valid target when suspects exist', () => {
    const a = pickVoteForAiOrAbstain(SEED, 0, 'alice', PLAYERS, 'eve');
    const b = pickVoteForAiOrAbstain(SEED, 0, 'alice', PLAYERS, 'eve');
    expect(a).toBe(b);
    expect(a).not.toBeNull();
    expect(a).not.toBe('alice');
    expect(a).not.toBe('eve');
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

  it('abstains when victim exclusion leaves no valid suspects', () => {
    const votes = buildAiVotes(SEED, 0, ['bob'], ['alice', 'bob'], 'alice');
    expect(votes).toEqual({});
  });
});

// ─── resolveRoundWithAbstentions ──────────────────────────────────────────────

describe('resolveRoundWithAbstentions', () => {
  it('Case A: unique leader who is the saboteur → saboteur caught', () => {
    const votes = {
      alice: 'dave',
      bob: 'dave',
      carol: 'dave',
      dave: 'alice',
      eve: 'alice',
    };
    const outcome = resolveRoundWithAbstentions(votes, ['alice', 'bob', 'carol', 'dave', 'eve'], 'dave', 'alice');
    expect(outcome.eliminatedId).toBe('dave');
    expect(outcome.reason).toBe('saboteur_caught');
    expect(outcome.accusedId).toBe('dave');
    expect(outcome.victimOverride).toBe(false);
  });

  it('Case A: unique leader who is not the saboteur → victim eliminated', () => {
    const votes = {
      alice: 'carol',
      bob: 'carol',
      carol: 'dave',
      dave: 'carol',
      eve: 'dave',
    };
    const outcome = resolveRoundWithAbstentions(votes, ['alice', 'bob', 'carol', 'dave', 'eve'], 'dave', 'alice');
    expect(outcome.eliminatedId).toBe('alice');
    expect(outcome.reason).toBe('victim_eliminated');
    expect(outcome.accusedId).toBe('carol');
    expect(outcome.victimOverride).toBe(false);
  });

  it('Case B: tie + victim voted for saboteur → saboteur caught via victim override', () => {
    const votes = {
      alice: 'carol',
      bob: 'dave',
      carol: 'dave',
      dave: 'carol',
    };
    const outcome = resolveRoundWithAbstentions(votes, ['alice', 'bob', 'carol', 'dave'], 'dave', 'bob');
    expect(outcome.eliminatedId).toBe('dave');
    expect(outcome.reason).toBe('saboteur_caught');
    expect(outcome.accusedId).toBe('dave');
    expect(outcome.victimOverride).toBe(true);
  });

  it('Case B edge case: tie + victim voted for a non-tied candidate → victim eliminated with victim vote as accusedId', () => {
    const votes = {
      alice: 'carol',
      bob: 'eve',
      carol: 'dave',
      dave: 'carol',
      eve: 'dave',
    };
    const outcome = resolveRoundWithAbstentions(votes, ['alice', 'bob', 'carol', 'dave', 'eve'], 'dave', 'bob');
    expect(outcome.eliminatedId).toBe('bob');
    expect(outcome.reason).toBe('victim_eliminated');
    expect(outcome.accusedId).toBe('eve');
    expect(outcome.victimOverride).toBe(true);
  });

  it('Case C: tie + victim abstained → victim eliminated', () => {
    const votes = {
      alice: 'carol',
      carol: 'dave',
      dave: 'carol',
      eve: 'dave',
    };
    const outcome = resolveRoundWithAbstentions(votes, ['alice', 'bob', 'carol', 'dave', 'eve'], 'dave', 'bob');
    expect(outcome.eliminatedId).toBe('bob');
    expect(outcome.reason).toBe('victim_eliminated');
    expect(outcome.accusedId).toBe('bob');
    expect(outcome.victimOverride).toBe(false);
  });

  it('Case D: everyone abstains → victim eliminated', () => {
    const outcome = resolveRoundWithAbstentions({}, ['alice', 'bob', 'carol'], 'carol', 'bob');
    expect(outcome.eliminatedId).toBe('bob');
    expect(outcome.reason).toBe('victim_eliminated');
    expect(outcome.accusedId).toBe('bob');
    expect(outcome.victimOverride).toBe(false);
  });
});

// ─── resolveRound (dispatcher) ────────────────────────────────────────────────

describe('resolveRound', () => {
  it('uses abstention-aware victim override logic when 3 active players', () => {
    const votes = { alice: 'bob', bob: 'carol', carol: 'alice' };
    const outcome = resolveRound(votes, 'alice', 'bob', ['alice', 'bob', 'carol']);
    // 1-1-1 tie, victim=bob voted for carol (not saboteur) → victim override
    expect(outcome.victimOverride).toBe(true);
  });

  it('uses the same abstention-aware resolution when 4+ active players', () => {
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

  it('tied jury means the saboteur wins', () => {
    const votes = { j1: 'sam', j2: 'pat' }; // 1-1 tie
    const outcome = resolveFinal2(votes, 'sam', 'pat');
    expect(outcome.winnerId).toBe('sam');
    expect(outcome.eliminatedId).toBe('pat');
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
