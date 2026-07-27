import type { PublicOpinionState } from '../../publicOpinion/types';
import type { Player } from '../../types';

export interface PublicFavoriteForecastEntry {
  playerId: string;
  score: number;
  targetPercent: number;
}

export interface PublicFavoriteForecast {
  entries: PublicFavoriteForecastEntry[];
  targetPercentages: Record<string, number>;
  winnerId: string | null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 50;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function hashUnit(seed: number, value: string): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x45d9f3b);
    hash ^= hash >>> 16;
  }
  return (hash >>> 0) / 0x1_0000_0000;
}

function toIntegerPercentages(
  entries: Array<{ playerId: string; value: number }>,
): Record<string, number> {
  if (entries.length === 0) return {};
  if (entries.length === 1) return { [entries[0].playerId]: 100 };

  const total = entries.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const scaled = entries.map((entry) => ({
    playerId: entry.playerId,
    value: (entry.value / total) * 100,
  }));
  const result = Object.fromEntries(
    scaled.map((entry) => [entry.playerId, Math.max(1, Math.floor(entry.value))]),
  );
  let remainder = 100 - Object.values(result).reduce((sum, value) => sum + value, 0);

  const order = [...scaled].sort((left, right) => {
    const fractionDifference =
      right.value - Math.floor(right.value) - (left.value - Math.floor(left.value));
    return fractionDifference || left.playerId.localeCompare(right.playerId);
  });

  let cursor = 0;
  while (remainder !== 0 && order.length > 0) {
    const entry = order[cursor % order.length];
    if (remainder > 0) {
      result[entry.playerId] += 1;
      remainder -= 1;
    } else if (result[entry.playerId] > 1) {
      result[entry.playerId] -= 1;
      remainder += 1;
    }
    cursor += 1;
    if (cursor > order.length * 200) break;
  }

  return result;
}

function headlineImpact(playerId: string, publicOpinion?: PublicOpinionState | null): number {
  return clamp(
    (publicOpinion?.feed ?? [])
      .filter((entry) => entry.playerId === playerId)
      .reduce((sum, entry) => sum + (Number.isFinite(entry.delta) ? entry.delta : 0), 0),
    -30,
    30,
  );
}

function scoreCandidate(
  player: Player,
  publicOpinion: PublicOpinionState | null | undefined,
  seed: number,
): number {
  const profile = publicOpinion?.profiles[player.id];
  const wins = (player.stats?.lohWins ?? 0) + (player.stats?.posWins ?? 0);
  const nominations = player.stats?.timesNominated ?? 0;

  const currentApproval = clamp(profile?.approval ?? 50, 0, 100);
  const seasonAverage = clamp(
    profile ? average(profile.seasonApprovals) : currentApproval,
    0,
    100,
  );
  const momentum = clamp(
    profile ? profile.approval - profile.previousApproval : 0,
    -18,
    18,
  );
  const positiveImpact = clamp(profile?.cumulativePositiveDelta ?? 0, 0, 45);
  const completedDirections = clamp(profile?.completedDirectionCount ?? 0, 0, 6);
  const feedImpact = headlineImpact(player.id, publicOpinion);
  const boundedVariation = (hashUnit(seed, player.id) - 0.5) * 4;

  return Math.max(
    1,
    currentApproval * 0.5 +
      seasonAverage * 0.25 +
      momentum * 0.65 +
      positiveImpact * 0.14 +
      completedDirections * 1.1 +
      clamp(wins, 0, 6) * 1.45 +
      clamp(nominations, 0, 6) * 0.55 +
      feedImpact * 0.22 +
      boundedVariation,
  );
}

/**
 * Produces the authoritative public-favorite forecast from the season's public
 * opinion history. The small seeded variation breaks exact ties but can never
 * overpower a meaningful approval difference.
 */
export function buildPublicFavoriteForecast(
  candidates: Player[],
  publicOpinion?: PublicOpinionState | null,
  seed = 0,
): PublicFavoriteForecast {
  if (candidates.length === 0) {
    return { entries: [], targetPercentages: {}, winnerId: null };
  }

  const scored = candidates
    .map((player) => ({
      playerId: player.id,
      score: scoreCandidate(player, publicOpinion, seed),
    }))
    .sort(
      (left, right) =>
        right.score - left.score || left.playerId.localeCompare(right.playerId),
    );

  const targetPercentages = toIntegerPercentages(
    scored.map((entry) => ({
      playerId: entry.playerId,
      value: Math.pow(entry.score, 1.28),
    })),
  );

  return {
    entries: scored.map((entry) => ({
      ...entry,
      targetPercent: targetPercentages[entry.playerId] ?? 0,
    })),
    targetPercentages,
    winnerId: scored[0]?.playerId ?? null,
  };
}
