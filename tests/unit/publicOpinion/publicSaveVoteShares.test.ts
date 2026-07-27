import { describe, expect, it } from 'vitest';
import {
  buildPublicSaveVoteShares,
  normalisePublicSaveVoteShares,
  resolvePublicSaveNominee,
} from '../../../src/publicOpinion/PublicSaveService';
import { resolveDramaPublicSave } from '../../../src/publicOpinion/DramaPublicSaveService';
import { shouldUseDramaPublicSave } from '../../../src/publicOpinion/DramaPublicSaveIntegration';
import { pruneExpiredPublicSaveThreatBeliefs } from '../../../src/publicOpinion/dramaPublicSaveMiddleware';
import { createInitialDramaSocialNetwork } from '../../../src/social/dramaModeEngine';
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

  it('requires both Drama Mode and Public Mode for premium consequences', () => {
    expect(shouldUseDramaPublicSave(true, true)).toBe(true);
    expect(shouldUseDramaPublicSave(false, true)).toBe(false);
    expect(shouldUseDramaPublicSave(true, false)).toBe(false);
    expect(shouldUseDramaPublicSave(false, false)).toBe(false);
  });

  it('keeps the public-threat belief for the save day and expires it next day', () => {
    const network = createInitialDramaSocialNetwork();
    network.beliefs.push(
      {
        id: 'public-threat-4-a-b',
        holderId: 'a',
        subjectId: 'b',
        kind: 'strategic_threat',
        confidence: 0.68,
        sentiment: -0.12,
        sourceId: 'public-save-4-b',
        createdWeek: 4,
        lastUpdatedWeek: 4,
      },
      {
        id: 'normal-threat',
        holderId: 'c',
        subjectId: 'b',
        kind: 'strategic_threat',
        confidence: 0.5,
        sentiment: -0.1,
        sourceId: 'rumour-c-b',
        createdWeek: 3,
        lastUpdatedWeek: 3,
      },
    );

    expect(pruneExpiredPublicSaveThreatBeliefs(network, 4).beliefs).toHaveLength(2);
    const nextDay = pruneExpiredPublicSaveThreatBeliefs(network, 5);
    expect(nextDay.beliefs.map((belief) => belief.id)).toEqual(['normal-threat']);
  });
});
