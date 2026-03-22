import { describe, it, expect } from 'vitest';
import { resolvePublicJuryVote } from '../../../src/publicOpinion/PublicFinalVoteService';
import type { PlayerPublicProfile } from '../../../src/publicOpinion/types';

function makeProfile(
  playerId: string,
  approval: number,
  overrides: Partial<PlayerPublicProfile> = {},
): PlayerPublicProfile {
  return {
    playerId,
    approval,
    previousApproval: approval,
    seasonApprovals: [approval],
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
    ...overrides,
  };
}

describe('resolvePublicJuryVote', () => {
  it('finalist with higher approval wins', () => {
    const profiles = {
      f1: makeProfile('f1', 70),
      f2: makeProfile('f2', 55),
    };
    const result = resolvePublicJuryVote({ finalistIds: ['f1', 'f2'], profiles });
    expect(result.winnerId).toBe('f1');
    expect(result.tieBreakUsed).toBe(false);
  });

  it('eliminated players are ignored — only finalistIds matter', () => {
    const profiles = {
      f1: makeProfile('f1', 60),
      f2: makeProfile('f2', 55),
      evicted: makeProfile('evicted', 99),
    };
    const result = resolvePublicJuryVote({ finalistIds: ['f1', 'f2'], profiles });
    expect(result.winnerId).toBe('f1');
  });

  it('tie-break by season average', () => {
    const profiles = {
      f1: makeProfile('f1', 60, { seasonApprovals: [50, 55, 60] }), // avg ~55
      f2: makeProfile('f2', 60, { seasonApprovals: [60, 65, 70] }), // avg ~65
    };
    const result = resolvePublicJuryVote({ finalistIds: ['f1', 'f2'], profiles });
    expect(result.winnerId).toBe('f2');
    expect(result.tieBreakUsed).toBe(true);
  });

  it('tie-break by completed directions', () => {
    const profiles = {
      f1: makeProfile('f1', 60, { seasonApprovals: [60], completedDirectionCount: 3 }),
      f2: makeProfile('f2', 60, { seasonApprovals: [60], completedDirectionCount: 5 }),
    };
    const result = resolvePublicJuryVote({ finalistIds: ['f1', 'f2'], profiles });
    expect(result.winnerId).toBe('f2');
    expect(result.tieBreakUsed).toBe(true);
  });

  it('tie-break by cumulative positive delta', () => {
    const profiles = {
      f1: makeProfile('f1', 60, {
        seasonApprovals: [60],
        completedDirectionCount: 3,
        cumulativePositiveDelta: 20,
      }),
      f2: makeProfile('f2', 60, {
        seasonApprovals: [60],
        completedDirectionCount: 3,
        cumulativePositiveDelta: 35,
      }),
    };
    const result = resolvePublicJuryVote({ finalistIds: ['f1', 'f2'], profiles });
    expect(result.winnerId).toBe('f2');
    expect(result.tieBreakUsed).toBe(true);
  });

  it('deterministic fallback picks first finalist', () => {
    const profiles = {
      f1: makeProfile('f1', 60),
      f2: makeProfile('f2', 60),
    };
    const result = resolvePublicJuryVote({ finalistIds: ['f1', 'f2'], profiles });
    expect(result.tieBreakUsed).toBe(true);
    expect(result.winnerId).toBe('f1');
  });

  it('handles single finalist', () => {
    const profiles = { f1: makeProfile('f1', 60) };
    const result = resolvePublicJuryVote({ finalistIds: ['f1'], profiles });
    expect(result.winnerId).toBe('f1');
  });

  it('handles no finalists', () => {
    const result = resolvePublicJuryVote({ finalistIds: [], profiles: {} });
    expect(result.winnerId).toBe('');
  });
});
