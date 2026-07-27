import { normalisePublicSaveVoteShares } from './PublicSaveService';
import type { PlayerPublicProfile, PublicFeedEntry } from './types';

export type DramaPublicSaveDecisiveReason =
  | 'approval'
  | 'momentum'
  | 'storyline'
  | 'tiebreak';

export interface DramaPublicSaveResult {
  savedId: string;
  voteShareByPlayerId: Record<string, number>;
  winningShare: number;
  winningMargin: number;
  tieBreakUsed: boolean;
  decisiveReason: DramaPublicSaveDecisiveReason;
  scoreByPlayerId: Record<string, number>;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

function seasonAverage(profile: PlayerPublicProfile | undefined): number {
  if (!profile) return 50;
  if (profile.seasonApprovals.length === 0) return profile.approval;
  return (
    profile.seasonApprovals.reduce((sum, value) => sum + value, 0) /
    profile.seasonApprovals.length
  );
}

function momentumScore(profile: PlayerPublicProfile | undefined): number {
  if (!profile) return 50;
  const momentum = clamp(profile.approval - profile.previousApproval, -12, 12);
  return clamp(50 + momentum * 4, 0, 100);
}

function storylineScore(playerId: string, feed: PublicFeedEntry[], week: number): number {
  const visibleImpact = feed
    .filter((entry) => entry.playerId === playerId && entry.week === week)
    .slice(0, 4)
    .reduce((sum, entry) => sum + entry.delta, 0);
  return clamp(50 + clamp(visibleImpact, -20, 20) * 2.5, 0, 100);
}

function stableTieOrder(
  playerIds: string[],
  profiles: Record<string, PlayerPublicProfile>,
): string[] {
  return [...playerIds].sort((leftId, rightId) => {
    const left = profiles[leftId];
    const right = profiles[rightId];
    const averageDifference = seasonAverage(right) - seasonAverage(left);
    if (Math.abs(averageDifference) > 0.001) return averageDifference;
    const completedDifference =
      (right?.completedDirectionCount ?? 0) - (left?.completedDirectionCount ?? 0);
    if (completedDifference !== 0) return completedDifference;
    return leftId.localeCompare(rightId);
  });
}

/**
 * Premium Drama Mode audience ballot.
 *
 * 70% current approval + 20% current momentum + 10% visible storyline impact.
 * Private social information is deliberately excluded because it has not reached
 * the audience yet.
 */
export function resolveDramaPublicSave(params: {
  nomineeIds: string[];
  profiles: Record<string, PlayerPublicProfile>;
  feed: PublicFeedEntry[];
  week: number;
}): DramaPublicSaveResult {
  const { nomineeIds, profiles, feed, week } = params;
  const componentByPlayerId = Object.fromEntries(
    nomineeIds.map((playerId) => {
      const profile = profiles[playerId];
      return [
        playerId,
        {
          approval: clamp(profile?.approval ?? 50, 0, 100),
          momentum: momentumScore(profile),
          storyline: storylineScore(playerId, feed, week),
        },
      ];
    }),
  );

  const scoreByPlayerId = Object.fromEntries(
    nomineeIds.map((playerId) => {
      const component = componentByPlayerId[playerId];
      return [
        playerId,
        component.approval * 0.7 + component.momentum * 0.2 + component.storyline * 0.1,
      ];
    }),
  );
  const voteShareByPlayerId = normalisePublicSaveVoteShares(nomineeIds, scoreByPlayerId);

  if (nomineeIds.length === 0) {
    return {
      savedId: '',
      voteShareByPlayerId,
      winningShare: 0,
      winningMargin: 0,
      tieBreakUsed: false,
      decisiveReason: 'tiebreak',
      scoreByPlayerId,
    };
  }

  const ranked = [...nomineeIds].sort((leftId, rightId) => {
    const difference = scoreByPlayerId[rightId] - scoreByPlayerId[leftId];
    if (Math.abs(difference) > 0.001) return difference;
    return stableTieOrder([leftId, rightId], profiles).indexOf(leftId) === 0 ? -1 : 1;
  });
  const savedId = ranked[0];
  const runnerUpId = ranked[1];
  const tieBreakUsed = runnerUpId
    ? Math.abs(scoreByPlayerId[savedId] - scoreByPlayerId[runnerUpId]) <= 0.001
    : false;
  const winningShare = voteShareByPlayerId[savedId] ?? 0;
  const winningMargin = runnerUpId
    ? Math.max(0, winningShare - (voteShareByPlayerId[runnerUpId] ?? 0))
    : winningShare;

  let decisiveReason: DramaPublicSaveDecisiveReason = tieBreakUsed ? 'tiebreak' : 'approval';
  if (runnerUpId && !tieBreakUsed) {
    const winner = componentByPlayerId[savedId];
    const runnerUp = componentByPlayerId[runnerUpId];
    const advantages: Record<Exclude<DramaPublicSaveDecisiveReason, 'tiebreak'>, number> = {
      approval: (winner.approval - runnerUp.approval) * 0.7,
      momentum: (winner.momentum - runnerUp.momentum) * 0.2,
      storyline: (winner.storyline - runnerUp.storyline) * 0.1,
    };
    decisiveReason = (Object.entries(advantages).sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0] ?? 'approval') as DramaPublicSaveDecisiveReason;
  }

  return {
    savedId,
    voteShareByPlayerId,
    winningShare,
    winningMargin,
    tieBreakUsed,
    decisiveReason,
    scoreByPlayerId,
  };
}
