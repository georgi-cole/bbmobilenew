import { publicOpinionConfig } from './publicOpinionConfig';
import type { PlayerPublicProfile } from './types';

export interface PublicEvictionTieResult {
  evicteeId: string;
  tieBreakUsed: boolean;
}

const FLOAT_EQUALITY_EPSILON = 0.001;

function seasonAvg(profile: PlayerPublicProfile): number {
  if (profile.seasonApprovals.length === 0) return profile.approval;
  return profile.seasonApprovals.reduce((sum, value) => sum + value, 0) / profile.seasonApprovals.length;
}

function getProfile(
  playerId: string,
  profiles: Record<string, PlayerPublicProfile>,
): PlayerPublicProfile {
  return (
    profiles[playerId] ?? {
      playerId,
      approval: publicOpinionConfig.DEFAULT_APPROVAL,
      previousApproval: publicOpinionConfig.DEFAULT_APPROVAL,
      seasonApprovals: [publicOpinionConfig.DEFAULT_APPROVAL],
      completedDirectionCount: 0,
      cumulativePositiveDelta: 0,
    }
  );
}

/**
 * Resolve which tied nominee should be evicted by the public.
 *
 * Rule: the tied nominee with the lower current approval rating is evicted.
 * Tie-breaks use lower season-average approval, then fewer completed public
 * directions, then stable alphabetical order by player ID.
 */
export function resolvePublicEvictionTieNominee(params: {
  nomineeIds: string[];
  profiles: Record<string, PlayerPublicProfile>;
}): PublicEvictionTieResult {
  const { nomineeIds, profiles } = params;

  if (nomineeIds.length === 0) {
    return { evicteeId: '', tieBreakUsed: false };
  }

  if (nomineeIds.length === 1) {
    return { evicteeId: nomineeIds[0], tieBreakUsed: false };
  }

  const sorted = [...nomineeIds].sort((a, b) => {
    const profA = getProfile(a, profiles);
    const profB = getProfile(b, profiles);

    if (profA.approval !== profB.approval) return profA.approval - profB.approval;

    const avgA = seasonAvg(profA);
    const avgB = seasonAvg(profB);
    if (Math.abs(avgA - avgB) > FLOAT_EQUALITY_EPSILON) return avgA - avgB;

    if (profA.completedDirectionCount !== profB.completedDirectionCount) {
      return profA.completedDirectionCount - profB.completedDirectionCount;
    }

    return a < b ? -1 : a > b ? 1 : 0;
  });

  const loser = sorted[0];
  const runnerUp = sorted[1];
  const loserProfile = getProfile(loser, profiles);
  const runnerUpProfile = getProfile(runnerUp, profiles);

  let tieBreakUsed = false;
  if (loserProfile.approval === runnerUpProfile.approval) {
    const avgDiff = Math.abs(seasonAvg(loserProfile) - seasonAvg(runnerUpProfile));
    tieBreakUsed =
      avgDiff > FLOAT_EQUALITY_EPSILON ||
      loserProfile.completedDirectionCount !== runnerUpProfile.completedDirectionCount ||
      loser !== runnerUp;
  }

  return { evicteeId: loser, tieBreakUsed };
}
