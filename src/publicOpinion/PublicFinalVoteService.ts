import type { PlayerPublicProfile } from './types';

export interface FinalistPublicVoteResult {
  winnerId: string;
  tieBreakUsed: boolean;
  tieBreakReason?: string;
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((sum, v) => sum + v, 0) / arr.length;
}

export function resolvePublicJuryVote(params: {
  finalistIds: string[];
  profiles: Record<string, PlayerPublicProfile>;
}): FinalistPublicVoteResult {
  const { finalistIds, profiles } = params;

  if (finalistIds.length === 0) {
    return { winnerId: '', tieBreakUsed: false };
  }

  if (finalistIds.length === 1) {
    return { winnerId: finalistIds[0], tieBreakUsed: false };
  }

  const finalistProfiles = finalistIds
    .map((id) => profiles[id])
    .filter(Boolean) as PlayerPublicProfile[];

  if (finalistProfiles.length === 0) {
    return {
      winnerId: finalistIds[0],
      tieBreakUsed: true,
      tieBreakReason: 'No profiles found, using first finalist',
    };
  }

  const sorted = [...finalistProfiles].sort((a, b) => {
    if (b.approval !== a.approval) return b.approval - a.approval;
    const avgA = mean(a.seasonApprovals);
    const avgB = mean(b.seasonApprovals);
    if (Math.abs(avgB - avgA) > 0.001) return avgB - avgA;
    if (b.completedDirectionCount !== a.completedDirectionCount)
      return b.completedDirectionCount - a.completedDirectionCount;
    if (b.cumulativePositiveDelta !== a.cumulativePositiveDelta)
      return b.cumulativePositiveDelta - a.cumulativePositiveDelta;
    return 0;
  });

  const winner = sorted[0];
  const runnerUp = sorted[1];

  if (!runnerUp) {
    return { winnerId: winner.playerId, tieBreakUsed: false };
  }

  const tied = winner.approval === runnerUp.approval;

  if (!tied) {
    return { winnerId: winner.playerId, tieBreakUsed: false };
  }

  const avgWinner = mean(winner.seasonApprovals);
  const avgRunnerUp = mean(runnerUp.seasonApprovals);

  if (Math.abs(avgWinner - avgRunnerUp) > 0.001) {
    return {
      winnerId: winner.playerId,
      tieBreakUsed: true,
      tieBreakReason: 'Higher season average approval',
    };
  }

  if (winner.completedDirectionCount !== runnerUp.completedDirectionCount) {
    return {
      winnerId: winner.playerId,
      tieBreakUsed: true,
      tieBreakReason: 'More completed public directions',
    };
  }

  if (winner.cumulativePositiveDelta !== runnerUp.cumulativePositiveDelta) {
    return {
      winnerId: winner.playerId,
      tieBreakUsed: true,
      tieBreakReason: 'Higher cumulative positive impact',
    };
  }

  const fallbackId =
    finalistIds.find((id) => id === winner.playerId || id === runnerUp.playerId) ?? finalistIds[0];
  return { winnerId: fallbackId, tieBreakUsed: true, tieBreakReason: 'Deterministic fallback' };
}
