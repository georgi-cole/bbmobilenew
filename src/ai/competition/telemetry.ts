import { getMinigameAiModel } from './index';
import type {
  CompetitionCategory,
  CompetitionSkillProfile,
  CompetitionSkillWeights,
} from './types';

export interface CompetitionRunTelemetry {
  gameKey: string;
  seed: number;
  participants: string[];
  canonicalScores: Record<string, number>;
  rawScores?: Record<string, number>;
  winnerId: string;
  timestamp?: number;
  authoritative?: boolean;
}

export interface CompetitionTelemetryOptions {
  playerProfiles?: Record<string, CompetitionSkillProfile | undefined>;
  closeMarginThreshold?: number;
}

export interface PlayerCompetitionTelemetry {
  playerId: string;
  entries: number;
  wins: number;
  winRate: number;
  averageFinish: number | null;
  averageScoreDelta: number | null;
}

export interface MinigameCompetitionTelemetry {
  gameKey: string;
  runs: number;
  averageWinningScore: number;
  averageScoreSpread: number;
  winners: Record<string, number>;
  winnerArchetypes: Partial<Record<CompetitionCategory, number>>;
}

export interface CategoryCompetitionTelemetry {
  category: CompetitionCategory;
  runs: number;
  winsByPlayer: Record<string, number>;
  winsByArchetype: Partial<Record<CompetitionCategory, number>>;
  consecutiveRepeats: number;
}

export interface OutcomeQualityTelemetry {
  totalRuns: number;
  upsetCount: number;
  upsetRate: number;
  averageMargin: number;
  closeFinishRate: number;
  tieRate: number;
}

export interface CompetitionTelemetrySummary {
  totalRuns: number;
  perPlayer: Record<string, PlayerCompetitionTelemetry>;
  perMinigame: Record<string, MinigameCompetitionTelemetry>;
  perCategory: Record<CompetitionCategory, CategoryCompetitionTelemetry>;
  outcomes: OutcomeQualityTelemetry;
}

const BASELINE_SKILL_KEYS: Array<keyof CompetitionSkillProfile> = [
  'physical',
  'mental',
  'precision',
  'nerve',
  'luck',
];
const CLOSE_MARGIN_DEFAULT = 50;
const CATEGORY_BASELINE: Record<CompetitionCategory, CategoryCompetitionTelemetry> = {
  physical: { category: 'physical', runs: 0, winsByPlayer: {}, winsByArchetype: {}, consecutiveRepeats: 0 },
  mental: { category: 'mental', runs: 0, winsByPlayer: {}, winsByArchetype: {}, consecutiveRepeats: 0 },
  precision: { category: 'precision', runs: 0, winsByPlayer: {}, winsByArchetype: {}, consecutiveRepeats: 0 },
  endurance: { category: 'endurance', runs: 0, winsByPlayer: {}, winsByArchetype: {}, consecutiveRepeats: 0 },
  luck: { category: 'luck', runs: 0, winsByPlayer: {}, winsByArchetype: {}, consecutiveRepeats: 0 },
  hybrid: { category: 'hybrid', runs: 0, winsByPlayer: {}, winsByArchetype: {}, consecutiveRepeats: 0 },
};

export function summarizeCompetitionTelemetry(
  runs: CompetitionRunTelemetry[],
  options: CompetitionTelemetryOptions = {},
): CompetitionTelemetrySummary {
  const closeMarginThreshold = options.closeMarginThreshold ?? CLOSE_MARGIN_DEFAULT;
  const perPlayerAccumulator: Record<
    string,
    { entries: number; wins: number; finishSum: number; scoreDeltaSum: number }
  > = {};
  const perMinigame: Record<string, MinigameCompetitionTelemetry> = {};
  const perCategory = cloneCategoryBaseline();
  const orderedRuns = [...runs].sort(
    (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
  );

  let consecutiveCategory: CompetitionCategory | null = null;
  let totalMargin = 0;
  let closeFinishCount = 0;
  let tieCount = 0;
  let upsetCount = 0;

  for (const run of orderedRuns) {
    const scores = collectScores(run);
    const participants = run.participants.length > 0 ? run.participants : Object.keys(scores);
    const winnerId = run.winnerId || participants[0] || '';
    const ranked = [...participants].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
    const winnerScore = scores[winnerId] ?? scores[ranked[0]] ?? 0;
    const highestScore = scores[ranked[0]] ?? 0;
    const secondScore = scores[ranked[1]] ?? highestScore;
    const margin = Math.max(0, highestScore - secondScore);
    const averageScore = participants.length > 0
      ? participants.reduce((sum, id) => sum + (scores[id] ?? 0), 0) / participants.length
      : 0;

    totalMargin += margin;
    if (margin <= closeMarginThreshold) closeFinishCount += 1;
    if (margin === 0) tieCount += 1;

    const category = getMinigameAiModel(run.gameKey).category;
    const archetype = getPlayerArchetype(winnerId, options.playerProfiles);

    const categoryStats = perCategory[category];
    categoryStats.runs += 1;
    categoryStats.winsByPlayer[winnerId] = (categoryStats.winsByPlayer[winnerId] ?? 0) + 1;
    if (archetype) {
      categoryStats.winsByArchetype[archetype] = (categoryStats.winsByArchetype[archetype] ?? 0) + 1;
    }

    if (consecutiveCategory === category) {
      categoryStats.consecutiveRepeats += 1;
    }
    consecutiveCategory = category;

    const minigameStats = perMinigame[run.gameKey] ?? {
      gameKey: run.gameKey,
      runs: 0,
      averageWinningScore: 0,
      averageScoreSpread: 0,
      winners: {},
      winnerArchetypes: {},
    };
    minigameStats.runs += 1;
    minigameStats.averageWinningScore += winnerScore;
    minigameStats.averageScoreSpread += calcSpread(scores);
    minigameStats.winners[winnerId] = (minigameStats.winners[winnerId] ?? 0) + 1;
    if (archetype) {
      minigameStats.winnerArchetypes[archetype] =
        (minigameStats.winnerArchetypes[archetype] ?? 0) + 1;
    }
    perMinigame[run.gameKey] = minigameStats;

    for (const [index, playerId] of ranked.entries()) {
      const playerStats = perPlayerAccumulator[playerId] ?? {
        entries: 0,
        wins: 0,
        finishSum: 0,
        scoreDeltaSum: 0,
      };
      playerStats.entries += 1;
      if (playerId === winnerId) playerStats.wins += 1;
      playerStats.finishSum += index + 1;
      playerStats.scoreDeltaSum += (scores[playerId] ?? 0) - averageScore;
      perPlayerAccumulator[playerId] = playerStats;
    }

    if (isUpsetOutcome(run, winnerId, options.playerProfiles)) {
      upsetCount += 1;
    }
  }

  const perPlayer = finalizePlayerTelemetry(perPlayerAccumulator);
  const perMinigameFinal = finalizeMinigameTelemetry(perMinigame);
  const totalRuns = orderedRuns.length;

  return {
    totalRuns,
    perPlayer,
    perMinigame: perMinigameFinal,
    perCategory,
    outcomes: {
      totalRuns,
      upsetCount,
      upsetRate: totalRuns > 0 ? upsetCount / totalRuns : 0,
      averageMargin: totalRuns > 0 ? totalMargin / totalRuns : 0,
      closeFinishRate: totalRuns > 0 ? closeFinishCount / totalRuns : 0,
      tieRate: totalRuns > 0 ? tieCount / totalRuns : 0,
    },
  };
}

function collectScores(run: CompetitionRunTelemetry): Record<string, number> {
  if (Object.keys(run.canonicalScores ?? {}).length > 0) {
    return run.canonicalScores;
  }
  return run.rawScores ?? {};
}

function calcSpread(scores: Record<string, number>): number {
  const values = Object.values(scores);
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function finalizePlayerTelemetry(
  accumulator: Record<
    string,
    { entries: number; wins: number; finishSum: number; scoreDeltaSum: number }
  >,
): Record<string, PlayerCompetitionTelemetry> {
  return Object.fromEntries(
    Object.entries(accumulator).map(([playerId, stats]) => [
      playerId,
      {
        playerId,
        entries: stats.entries,
        wins: stats.wins,
        winRate: stats.entries > 0 ? stats.wins / stats.entries : 0,
        averageFinish: stats.entries > 0 ? stats.finishSum / stats.entries : null,
        averageScoreDelta: stats.entries > 0 ? stats.scoreDeltaSum / stats.entries : null,
      },
    ]),
  );
}

function finalizeMinigameTelemetry(
  perMinigame: Record<string, MinigameCompetitionTelemetry>,
): Record<string, MinigameCompetitionTelemetry> {
  return Object.fromEntries(
    Object.entries(perMinigame).map(([gameKey, stats]) => [
      gameKey,
      {
        ...stats,
        averageWinningScore: stats.runs > 0 ? stats.averageWinningScore / stats.runs : 0,
        averageScoreSpread: stats.runs > 0 ? stats.averageScoreSpread / stats.runs : 0,
      },
    ]),
  );
}

function cloneCategoryBaseline(): Record<CompetitionCategory, CategoryCompetitionTelemetry> {
  return {
    physical: { ...CATEGORY_BASELINE.physical, winsByPlayer: {}, winsByArchetype: {} },
    mental: { ...CATEGORY_BASELINE.mental, winsByPlayer: {}, winsByArchetype: {} },
    precision: { ...CATEGORY_BASELINE.precision, winsByPlayer: {}, winsByArchetype: {} },
    endurance: { ...CATEGORY_BASELINE.endurance, winsByPlayer: {}, winsByArchetype: {} },
    luck: { ...CATEGORY_BASELINE.luck, winsByPlayer: {}, winsByArchetype: {} },
    hybrid: { ...CATEGORY_BASELINE.hybrid, winsByPlayer: {}, winsByArchetype: {} },
  };
}

function isUpsetOutcome(
  run: CompetitionRunTelemetry,
  winnerId: string,
  profiles?: Record<string, CompetitionSkillProfile | undefined>,
): boolean {
  if (!profiles) return false;
  const model = getMinigameAiModel(run.gameKey);
  const expected = getExpectedWinner(run.participants, model.weights, profiles);
  return expected !== null && expected !== winnerId;
}

function getExpectedWinner(
  participants: string[],
  weights: CompetitionSkillWeights,
  profiles: Record<string, CompetitionSkillProfile | undefined>,
): string | null {
  let bestId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  let tied = false;

  for (const playerId of participants) {
    const profile = profiles[playerId];
    if (!profile) continue;
    const score = computeExpectedSkill(profile, weights);
    if (score > bestScore) {
      bestScore = score;
      bestId = playerId;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }

  if (bestId === null || tied) return null;
  return bestId;
}

function computeExpectedSkill(
  profile: CompetitionSkillProfile,
  weights: CompetitionSkillWeights,
): number {
  const entries: Array<[keyof CompetitionSkillProfile, number | undefined]> = [
    ['physical', weights.physical],
    ['mental', weights.mental],
    ['precision', weights.precision],
    ['nerve', weights.nerve],
    ['luck', weights.luck],
    ['consistency', weights.consistency],
    ['clutch', weights.clutch],
    ['chokeRisk', weights.chokeRisk],
  ];
  let weightedTotal = 0;
  let weightSum = 0;
  for (const [key, weight] of entries) {
    if (weight == null || weight === 0) continue;
    weightedTotal += (profile[key] ?? 0) * weight;
    weightSum += weight;
  }

  if (weightSum <= 0) {
    return profile.overall ?? averageBaselineSkill(profile);
  }

  return weightedTotal / weightSum;
}

function averageBaselineSkill(profile: CompetitionSkillProfile): number {
  return BASELINE_SKILL_KEYS.reduce((sum, key) => sum + (profile[key] ?? 0), 0) / BASELINE_SKILL_KEYS.length;
}

function getPlayerArchetype(
  playerId: string,
  profiles?: Record<string, CompetitionSkillProfile | undefined>,
): CompetitionCategory | null {
  const profile = profiles?.[playerId];
  if (!profile) return null;

  const enduranceScore = (profile.physical + profile.nerve + profile.consistency) / 3;
  const scores: Record<CompetitionCategory, number> = {
    physical: profile.physical,
    mental: profile.mental,
    precision: profile.precision,
    endurance: enduranceScore,
    luck: profile.luck,
    hybrid: 0,
  };

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (sorted.length < 2) return 'hybrid';
  const [topCategory, topScore] = sorted[0];
  const [, runnerUp] = sorted[1];
  if (topScore - runnerUp <= 5) return 'hybrid';
  return topCategory as CompetitionCategory;
}
