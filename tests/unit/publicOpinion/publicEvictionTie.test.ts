import { describe, expect, it } from 'vitest';
import { resolvePublicEvictionTieNominee } from '../../../src/publicOpinion/PublicEvictionTieService';

describe('resolvePublicEvictionTieNominee', () => {
  it('evicts the nominee with lower approval', () => {
    const result = resolvePublicEvictionTieNominee({
      nomineeIds: ['p2', 'p3'],
      profiles: {
        p2: {
          playerId: 'p2',
          approval: 47,
          previousApproval: 47,
          seasonApprovals: [47, 46],
          completedDirectionCount: 2,
          cumulativePositiveDelta: 0,
        },
        p3: {
          playerId: 'p3',
          approval: 31,
          previousApproval: 31,
          seasonApprovals: [31, 35],
          completedDirectionCount: 1,
          cumulativePositiveDelta: 0,
        },
      },
    });

    expect(result.evicteeId).toBe('p3');
    expect(result.tieBreakUsed).toBe(false);
  });

  it('falls back to lower season-average approval when current approval is tied', () => {
    const result = resolvePublicEvictionTieNominee({
      nomineeIds: ['p2', 'p3'],
      profiles: {
        p2: {
          playerId: 'p2',
          approval: 40,
          previousApproval: 40,
          seasonApprovals: [40, 42],
          completedDirectionCount: 2,
          cumulativePositiveDelta: 0,
        },
        p3: {
          playerId: 'p3',
          approval: 40,
          previousApproval: 40,
          seasonApprovals: [40, 34],
          completedDirectionCount: 2,
          cumulativePositiveDelta: 0,
        },
      },
    });

    expect(result.evicteeId).toBe('p3');
    expect(result.tieBreakUsed).toBe(true);
  });
});
