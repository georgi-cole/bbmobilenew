import type { PlayerPublicProfile } from './types';

export interface PublicSaveResult {
  savedId: string;
  tieBreakUsed: boolean;
  voteShareByPlayerId: Record<string, number>;
  winningShare: number;
}

/** Floating-point tolerance for season-average tie comparisons. */
const FLOAT_EQUALITY_EPSILON = 0.001;
/** Store shares as tenths of one percent while allocating the remainder. */
const SHARE_UNITS = 1000;

function seasonAverage(profile: PlayerPublicProfile): number {
  if (profile.seasonApprovals.length === 0) return profile.approval;
  return (
    profile.seasonApprovals.reduce((sum, value) => sum + value, 0) /
    profile.seasonApprovals.length
  );
}

/**
 * Convert arbitrary non-negative audience scores into a deterministic vote
 * distribution that totals exactly 100.0%.
 */
export function normalisePublicSaveVoteShares(
  playerIds: string[],
  scores: Record<string, number>,
): Record<string, number> {
  if (playerIds.length === 0) return {};

  const safeScores = playerIds.map((playerId) => {
    const score = scores[playerId];
    return Number.isFinite(score) ? Math.max(0, score) : 0;
  });
  const scoreTotal = safeScores.reduce((sum, value) => sum + value, 0);
  const weightedScores = scoreTotal > 0 ? safeScores : safeScores.map(() => 1);
  const weightedTotal = weightedScores.reduce((sum, value) => sum + value, 0);
  const exactUnits = weightedScores.map((value) => (value / weightedTotal) * SHARE_UNITS);
  const allocatedUnits = exactUnits.map(Math.floor);
  let remainingUnits = SHARE_UNITS - allocatedUnits.reduce((sum, value) => sum + value, 0);

  const remainderOrder = playerIds
    .map((playerId, index) => ({
      playerId,
      index,
      remainder: exactUnits[index] - allocatedUnits[index],
    }))
    .sort(
      (left, right) =>
        right.remainder - left.remainder || left.playerId.localeCompare(right.playerId),
    );

  for (let index = 0; remainingUnits > 0; index = (index + 1) % remainderOrder.length) {
    allocatedUnits[remainderOrder[index].index] += 1;
    remainingUnits -= 1;
  }

  return Object.fromEntries(
    playerIds.map((playerId, index) => [playerId, allocatedUnits[index] / 10]),
  );
}

export function buildPublicSaveVoteShares(params: {
  nomineeIds: string[];
  profiles: Record<string, PlayerPublicProfile>;
}): Record<string, number> {
  const scores = Object.fromEntries(
    params.nomineeIds.map((playerId) => [
      playerId,
      Math.max(0, params.profiles[playerId]?.approval ?? 50),
    ]),
  );
  return normalisePublicSaveVoteShares(params.nomineeIds, scores);
}

/**
 * Resolve the Normal Mode public save.
 *
 * The established winner and tie-break rules remain unchanged. The additional
 * vote-share fields are presentation data only, replacing the misleading use
 * of absolute approval as if it were a percentage of votes cast.
 */
export function resolvePublicSaveNominee(params: {
  nomineeIds: string[];
  profiles: Record<string, PlayerPublicProfile>;
}): PublicSaveResult {
  const { nomineeIds, profiles } = params;
  const voteShareByPlayerId = buildPublicSaveVoteShares(params);

  if (nomineeIds.length === 0) {
    return { savedId: '', tieBreakUsed: false, voteShareByPlayerId, winningShare: 0 };
  }

  if (nomineeIds.length === 1) {
    const savedId = nomineeIds[0];
    return {
      savedId,
      tieBreakUsed: false,
      voteShareByPlayerId,
      winningShare: voteShareByPlayerId[savedId] ?? 100,
    };
  }

  const sorted = [...nomineeIds].sort((leftId, rightId) => {
    const left = profiles[leftId];
    const right = profiles[rightId];

    if (!left && !right) return leftId.localeCompare(rightId);
    if (!left) return 1;
    if (!right) return -1;
    if (right.approval !== left.approval) return right.approval - left.approval;

    const averageDifference = seasonAverage(right) - seasonAverage(left);
    if (Math.abs(averageDifference) > FLOAT_EQUALITY_EPSILON) return averageDifference;
    if (right.completedDirectionCount !== left.completedDirectionCount) {
      return right.completedDirectionCount - left.completedDirectionCount;
    }
    return leftId.localeCompare(rightId);
  });

  const savedId = sorted[0];
  const runnerUpId = sorted[1];
  const winnerProfile = profiles[savedId];
  const runnerUpProfile = profiles[runnerUpId];
  const tieBreakUsed =
    !winnerProfile ||
    !runnerUpProfile ||
    winnerProfile.approval === runnerUpProfile.approval;

  return {
    savedId,
    tieBreakUsed,
    voteShareByPlayerId,
    winningShare: voteShareByPlayerId[savedId] ?? 0,
  };
}
