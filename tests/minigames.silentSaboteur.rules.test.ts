import { describe, expect, it } from 'vitest';

import {
  buildAiJuryVotes,
  getValidSaboteurCandidates,
  noJuryFallbackWinner,
  pickSaboteur,
  pickVictimForAi,
  pickVictimTieBreakVote,
  pickVoteForAi,
  pickVoteForAiOrAbstain,
  resolveFinal2,
  resolveRound,
} from '../src/features/silentSaboteur/helpers';

describe('Silent Saboteur rules', () => {
  it('keeps saboteur and victim selection inside the active set', () => {
    const activeIds = ['a', 'b', 'c', 'd'];
    const saboteur = pickSaboteur(21, 3, activeIds);
    expect(activeIds).toContain(saboteur);
    expect(pickSaboteur(21, 3, activeIds)).toBe(saboteur);

    expect(getValidSaboteurCandidates(activeIds, 'b', 'c')).toEqual(['a', 'd']);

    const victim = pickVictimForAi(21, 3, saboteur, activeIds);
    expect(activeIds).toContain(victim);
    expect(victim).not.toBe(saboteur);

    const voteActiveIds = ['a', 'b', 'c'];
    expect(pickVoteForAi(21, 3, 'a', voteActiveIds, 'c')).toBe('b');
    expect(pickVoteForAiOrAbstain(21, 3, 'a', ['a', 'c'], 'c')).toBeNull();
  });

  it('resolves normal rounds with abstentions, majorities, and victim override ties', () => {
    const abstain = resolveRound({}, 's', 'v', ['s', 'v', 'x']);
    expect(abstain).toEqual({
      eliminatedId: 'v',
      reason: 'victim_eliminated',
      victimOverride: false,
      accusedId: 'v',
    });

    const caught = resolveRound({ s: 's', x: 's' }, 's', 'v', ['s', 'v', 'x']);
    expect(caught.reason).toBe('saboteur_caught');
    expect(caught.eliminatedId).toBe('s');
    expect(caught.accusedId).toBe('s');

    const victimOverrideEliminatesVictim = resolveRound(
      { s: 'c', v: 'd', c: 'c', d: 'd' },
      's',
      'v',
      ['s', 'v', 'c', 'd'],
    );
    expect(victimOverrideEliminatesVictim.victimOverride).toBe(true);
    expect(victimOverrideEliminatesVictim.reason).toBe('victim_eliminated');
    expect(victimOverrideEliminatesVictim.accusedId).toBe('d');

    const victimOverrideCatchesSaboteur = resolveRound(
      { s: 'c', v: 's', c: 'd', d: 'c' },
      's',
      'v',
      ['s', 'v', 'c', 'd'],
    );
    expect(victimOverrideCatchesSaboteur.victimOverride).toBe(true);
    expect(victimOverrideCatchesSaboteur.reason).toBe('saboteur_caught');
    expect(victimOverrideCatchesSaboteur.eliminatedId).toBe('s');
  });

  it('resolves final-2 jury outcomes and fallback deterministically', () => {
    const juryCorrect = resolveFinal2({ j1: 's', j2: 's', j3: 'v' }, 's', 'v');
    expect(juryCorrect).toEqual({
      winnerId: 'v',
      eliminatedId: 's',
      reason: 'jury_correct',
    });

    const juryIncorrect = resolveFinal2({ j1: 'v', j2: 'v', j3: 's' }, 's', 'v');
    expect(juryIncorrect.reason).toBe('jury_incorrect');
    expect(juryIncorrect.winnerId).toBe('s');
    expect(juryIncorrect.eliminatedId).toBe('v');

    const juryTie = resolveFinal2({ j1: 's', j2: 'v' }, 's', 'v');
    expect(juryTie.reason).toBe('jury_tie');
    expect(juryTie.winnerId).toBe('s');

    const fallback = resolveFinal2({}, 's', 'v');
    expect(fallback.reason).toBe('no_jury_fallback');
    expect(fallback.winnerId).toBe('v');
    expect(fallback.eliminatedId).toBe('s');

    expect(['s', 'v']).toContain(noJuryFallbackWinner(99, 's', 'v'));
    expect(noJuryFallbackWinner(99, 's', 'v')).toBe(noJuryFallbackWinner(99, 's', 'v'));

    const aiVotes = buildAiJuryVotes(12, ['j1', 'j2'], 's', 'v');
    expect(Object.keys(aiVotes)).toEqual(['j1', 'j2']);
    expect(Object.values(aiVotes).every((vote) => ['s', 'v'].includes(vote))).toBe(true);
    expect(['s', 'v']).toContain(pickVictimTieBreakVote(12, 'v', 's', 'x'));
  });
});
