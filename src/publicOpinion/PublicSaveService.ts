import type { PlayerPublicProfile } from './types';

export interface PublicSaveResult {
  savedId: string;
  tieBreakUsed: boolean;
}

/**
 * Floating-point tolerance for comparing season-average approval values.
 * Values below this threshold are treated as equal to avoid spurious
 * tie-break decisions from floating-point rounding differences.
 */
const FLOAT_EQUALITY_EPSILON = 0.001;

/**
 * Resolve which nominee is saved by the public before the veto competition.
 *
 * Rule: the nominee with the highest current approval rating is saved.
 * Tie-breaks use season-average approval (descending), then completed public
 * directions (descending), then stable alphabetical order by player ID to keep
 * the result deterministic across renders.
 *
 * Only considers player IDs listed in `nomineeIds`; unknown profiles fall last.
 */
export function resolvePublicSaveNominee(params: {
  nomineeIds: string[];
  profiles: Record<string, PlayerPublicProfile>;
}): PublicSaveResult {
  const { nomineeIds, profiles } = params;

  if (nomineeIds.length === 0) {
    return { savedId: '', tieBreakUsed: false };
  }

  if (nomineeIds.length === 1) {
    return { savedId: nomineeIds[0], tieBreakUsed: false };
  }

  function seasonAvg(profile: PlayerPublicProfile): number {
    if (profile.seasonApprovals.length === 0) return profile.approval;
    return (
      profile.seasonApprovals.reduce((sum, v) => sum + v, 0) /
      profile.seasonApprovals.length
    );
  }

  const sorted = [...nomineeIds].sort((a, b) => {
    const profA = profiles[a];
    const profB = profiles[b];

    // Unknown profiles fall to the end
    if (!profA && !profB) return a < b ? -1 : a > b ? 1 : 0;
    if (!profA) return 1;
    if (!profB) return -1;

    // Primary: current approval (descending)
    if (profB.approval !== profA.approval) return profB.approval - profA.approval;

    // Tie-break 1: season-average approval (descending)
    const avgA = seasonAvg(profA);
    const avgB = seasonAvg(profB);
    if (Math.abs(avgB - avgA) > FLOAT_EQUALITY_EPSILON) return avgB - avgA;

    // Tie-break 2: completed public directions (descending)
    if (profB.completedDirectionCount !== profA.completedDirectionCount) {
      return profB.completedDirectionCount - profA.completedDirectionCount;
    }

    // Stable final fallback: alphabetical by player ID
    return a < b ? -1 : a > b ? 1 : 0;
  });

  const winner = sorted[0];
  const runnerUp = sorted[1];

  // Determine if any tie-break was needed
  const winnerProfile = profiles[winner];
  const runnerUpProfile = profiles[runnerUp];
  const tieBreakUsed = !!(
    winnerProfile &&
    runnerUpProfile &&
    winnerProfile.approval === runnerUpProfile.approval
  );

  return { savedId: winner, tieBreakUsed };
}
