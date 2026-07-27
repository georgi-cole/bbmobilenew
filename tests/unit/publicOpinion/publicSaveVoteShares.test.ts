import { describe, expect, it } from 'vitest';
import {
  buildPublicSaveVoteShares,
  normalisePublicSaveVoteShares,
  resolvePublicSaveNominee,
} from '../../../src/publicOpinion/PublicSaveService';
import { resolveDramaPublicSave } from '../../../src/publicOpinion/DramaPublicSaveService';
import type {
  PlayerPublicProfile,
  PublicFeedEntry,
} from '../../../src/publicOpinion/types';

function profile(
  playerId: string,
  approval: number,
  previousApproval = approval,
): PlayerPublicProfile {
  return {
    playerId,
    approval,
    previousApproval,
    seasonApprovals: [previousApproval, approval],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
  };
}

describe('public save vote shares', () => {
  it('normalises arbitrary scores to exactly 100.0%', () => {
    const shares = normalisePublicSaveVoteShares(
      ['a', 'b', 'c'],
      { a: 61, b: 47, c: 39 },
    );

    expect(Object.values(shares).reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(shares.a).toBeGreaterThan(shares.b);
    expect(shares.b).toBeGreaterThan(shares.c);
  });

  it('preserves the established Normal Mode winner and tie-break rules', () => {
    const profiles = {
      a: profile('a', 70),
      b: profile('b', 50),
      c: profile('c', 30),
    };

    const shares = buildPublicSaveVoteShares({
      nomineeIds: ['a', 'b', 'c'],
      profiles,
    });
    const result = resolvePublicSaveNominee({
      nomineeIds: ['a', 'b', 'c'],
      profiles,
    });

    expect(result.savedId).toBe('a');
    expect(result.voteShareByPlayerId).toEqual(shares);
    expect(result.winningShare).toBe(shares.a);
    expect(Object.values(shares).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('lets visible momentum and storyline change a close Drama Mode ballot', () => {
    const profiles = {
      a: profile('a', 60, 60),
      b: profile('b', 58, 48),
      c: profile('c', 45, 45),
    };
    const feed: PublicFeedEntry[] = [
      {
        id: 'headline-b',
        playerId: 'b',
        text: 'The audience rallies behind B.',
        delta: 8,
        week: 4,
        timestamp: 1,
        isHeadline: true,
      },
    ];

    const result = resolveDramaPublicSave({
      nomineeIds: ['a', 'b', 'c'],
      profiles,
      feed,
      week: 4,
    });

    expect(result.savedId).toBe('b');
    expect(result.decisiveReason).not.toBe('tiebreak');
    expect(
      Object.values(result.voteShareByPlayerId).reduce((sum, value) => sum + value, 0),
    ).toBe(100);
  });

  it('ignores storyline entries from other days', () => {
    const profiles = {
      a: profile('a', 60, 60),
      b: profile('b', 58, 58),
      c: profile('c', 45, 45),
    };
    const oldFeed: PublicFeedEntry[] = [
      {
        id: 'old-headline-b',
        playerId: 'b',
        text: 'Old audience story.',
        delta: 20,
        week: 3,
        timestamp: 1,
        isHeadline: true,
      },
    ];

    const result = resolveDramaPublicSave({
      nomineeIds: ['a', 'b', 'c'],
      profiles,
      feed: oldFeed,
      week: 4,
    });

    expect(result.savedId).toBe('a');
  });
});
