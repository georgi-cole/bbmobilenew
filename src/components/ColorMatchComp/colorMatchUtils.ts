import { mulberry32 } from '../../store/rng';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface ColorMatchCompetitionParticipant {
  id: string;
  name: string;
  isHuman: boolean;
  precomputedScore?: number;
  participantIndex?: number;
}

export interface ColorMatchCompetitionStanding {
  participantId: string;
  participantName: string;
  isHuman: boolean;
  roundScores: number[];
  eliminatedRound: number | null;
}

export interface ColorMatchCompetitionRoundState {
  standings: ColorMatchCompetitionStanding[];
  eliminatedIds: string[];
  activeIds: string[];
}

export const MAX_RGB_DIST = Math.sqrt(255 * 255 * 3);
export const HINT_PENALTY_POINTS = 5;
export const COLOR_MATCH_COMPETITION_SCORE_PRECISION = 3;

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function rgbDist(a: RGB, b: RGB): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

export function calculateColorMatchAccuracy(target: RGB, player: RGB): number {
  return Math.max(0, 100 - (rgbDist(target, player) / MAX_RGB_DIST) * 100);
}

export function randomStartColor(target: RGB, rng: () => number): RGB {
  function offsetChannel(v: number): number {
    const delta = 40 + Math.floor(rng() * 80);
    const sign = rng() < 0.5 ? 1 : -1;
    return Math.min(255, Math.max(0, v + sign * delta));
  }

  return {
    r: offsetChannel(target.r),
    g: offsetChannel(target.g),
    b: offsetChannel(target.b),
  };
}

export function seededPick<T>(arr: T[], count: number, rng: () => number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function channelHint(channel: 'r' | 'g' | 'b', target: number, current: number): string {
  const label = channel === 'r' ? 'red' : channel === 'g' ? 'green' : 'blue';
  const delta = target - current;
  const deltaPct = Math.round((Math.abs(delta) / 255) * 100);
  if (deltaPct <= 2) return `${label} level is accurate`;
  return `${delta > 0 ? 'increase' : 'decrease'} ${label} by ${deltaPct}%`;
}

export function buildHintMessage(target: RGB, current: RGB): string {
  return [
    channelHint('r', target.r, current.r),
    channelHint('g', target.g, current.g),
    channelHint('b', target.b, current.b),
  ].join(' • ');
}

export function applyHintPenalty(rawAverage: number, hintsUsed: number): number {
  return Math.max(0, Math.round(rawAverage - hintsUsed * HINT_PENALTY_POINTS));
}

export function normalizeColorMatchCompetitionScore(value: number): number {
  return Number(clamp(value, 0, 100).toFixed(COLOR_MATCH_COMPETITION_SCORE_PRECISION));
}

export function getColorMatchScoreDisplayPrecision(values: number[]): number {
  const normalizedValues = values
    .filter((value) => Number.isFinite(value))
    .map((value) => normalizeColorMatchCompetitionScore(value));
  if (normalizedValues.length <= 1) return 0;

  for (let precision = 0; precision <= COLOR_MATCH_COMPETITION_SCORE_PRECISION; precision += 1) {
    const formatted = normalizedValues.map((value) => value.toFixed(precision));
    if (new Set(formatted).size === formatted.length) {
      return precision;
    }
  }

  return COLOR_MATCH_COMPETITION_SCORE_PRECISION;
}

export function formatColorMatchScore(value: number, precision = 0): string {
  return `${normalizeColorMatchCompetitionScore(value).toFixed(precision)}%`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hashString(value: string): number {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function getRoundBoost(roundNumber: number): number {
  const boosts = [0, 2, 4, 7, 10];
  return boosts[Math.max(0, Math.min(boosts.length - 1, roundNumber - 1))] ?? 0;
}

function getParticipantScoreBias(participant?: Pick<ColorMatchCompetitionParticipant, 'precomputedScore'>): number {
  const baseline = participant?.precomputedScore ?? 50;
  return (clamp(baseline, 0, 100) - 50) / 10;
}

function getCumulativeScore(standing: ColorMatchCompetitionStanding): number {
  return standing.roundScores.reduce((sum, score) => sum + score, 0);
}

function getEliminationScore(standing: ColorMatchCompetitionStanding): number {
  const eliminationRound = standing.eliminatedRound;
  if (eliminationRound == null) {
    return standing.roundScores[standing.roundScores.length - 1] ?? 0;
  }
  return standing.roundScores[eliminationRound - 1] ?? 0;
}

export function createColorMatchCompetitionStandings(
  participants: ColorMatchCompetitionParticipant[],
): ColorMatchCompetitionStanding[] {
  return participants.map((participant) => ({
    participantId: participant.id,
    participantName: participant.name,
    isHuman: participant.isHuman,
    roundScores: [],
    eliminatedRound: null,
  }));
}

export function simulateColorMatchAiRoundScore(
  participant: Pick<ColorMatchCompetitionParticipant, 'id' | 'participantIndex' | 'precomputedScore'>,
  roundNumber: number,
  seed: number,
): number {
  const rng = mulberry32(
    ((seed >>> 0) ^ hashString(`${participant.id}:${participant.participantIndex ?? 0}:${roundNumber}:color-match`)) >>> 0,
  );
  const clusteredRoll = (rng() + rng() + rng()) / 3;
  const rawScore = 67 + clusteredRoll * 22 + getRoundBoost(roundNumber) + getParticipantScoreBias(participant);
  return normalizeColorMatchCompetitionScore(clamp(rawScore, 65, 99));
}

export function resolveColorMatchCompetitionRound(
  standings: ColorMatchCompetitionStanding[],
  roundNumber: number,
  roundScoresById: Record<string, number>,
): ColorMatchCompetitionRoundState {
  const nextStandings = standings.map((standing) => {
    if (standing.eliminatedRound !== null) return standing;
    return {
      ...standing,
      roundScores: [...standing.roundScores, roundScoresById[standing.participantId] ?? 0],
    };
  });

  const activeStandings = nextStandings.filter((standing) => standing.eliminatedRound === null);
  if (activeStandings.length <= 1) {
    return {
      standings: nextStandings,
      eliminatedIds: [],
      activeIds: activeStandings.map((standing) => standing.participantId),
    };
  }

  if (roundNumber < 5) {
    const lowestScore = Math.min(...activeStandings.map((standing) => getEliminationScore(standing)));
    const eliminatedIds = activeStandings
      .filter((standing) => getEliminationScore(standing) === lowestScore)
      .map((standing) => standing.participantId);
    const eliminatedSet = new Set(
      eliminatedIds.length < activeStandings.length ? eliminatedIds : [],
    );
    const resolvedStandings = nextStandings.map((standing) => (
      standing.eliminatedRound === null && eliminatedSet.has(standing.participantId)
        ? { ...standing, eliminatedRound: roundNumber }
        : standing
    ));

    return {
      standings: resolvedStandings,
      eliminatedIds: [...eliminatedSet],
      activeIds: resolvedStandings
        .filter((standing) => standing.eliminatedRound === null)
        .map((standing) => standing.participantId),
    };
  }

  const highestScore = Math.max(...activeStandings.map((standing) => getEliminationScore(standing)));
  const activeIds = activeStandings
    .filter((standing) => getEliminationScore(standing) === highestScore)
    .map((standing) => standing.participantId);
  const activeSet = new Set(activeIds);
  const eliminatedIds = activeStandings
    .filter((standing) => !activeSet.has(standing.participantId))
    .map((standing) => standing.participantId);
  const eliminatedSet = new Set(eliminatedIds);
  const resolvedStandings = nextStandings.map((standing) => (
    standing.eliminatedRound === null && eliminatedSet.has(standing.participantId)
      ? { ...standing, eliminatedRound: roundNumber }
      : standing
  ));

  return {
    standings: resolvedStandings,
    eliminatedIds,
    activeIds,
  };
}

export function rankColorMatchCompetitionStandings(
  standings: ColorMatchCompetitionStanding[],
): ColorMatchCompetitionStanding[] {
  return [...standings].sort((a, b) => {
    const aReachedFinale = a.eliminatedRound === null;
    const bReachedFinale = b.eliminatedRound === null;
    if (aReachedFinale !== bReachedFinale) return aReachedFinale ? -1 : 1;
    if (aReachedFinale && bReachedFinale) {
      const finalScoreDiff = getEliminationScore(b) - getEliminationScore(a);
      if (finalScoreDiff !== 0) return finalScoreDiff;
    } else {
      const roundDiff = (b.eliminatedRound ?? 0) - (a.eliminatedRound ?? 0);
      if (roundDiff !== 0) return roundDiff;
      const eliminationScoreDiff = getEliminationScore(b) - getEliminationScore(a);
      if (eliminationScoreDiff !== 0) return eliminationScoreDiff;
    }

    const cumulativeDiff = getCumulativeScore(b) - getCumulativeScore(a);
    if (cumulativeDiff !== 0) return cumulativeDiff;
    return a.participantId.localeCompare(b.participantId);
  });
}

export function buildColorMatchCompetitionRawResults(
  standings: ColorMatchCompetitionStanding[],
): Record<string, number> {
  return Object.fromEntries(standings.map((standing) => {
    const stageIndex = standing.eliminatedRound === null
      ? 4
      : Math.min(4, Math.max(0, standing.eliminatedRound - 1));
    const stageBase = stageIndex * 20;
    const eliminationScore = getEliminationScore(standing);
    const cumulativeScore = getCumulativeScore(standing);
    const unclampedRawValue = stageBase + eliminationScore / 5 + cumulativeScore / 5000;
    const rawValue = Number(Math.min(100, unclampedRawValue).toFixed(3));
    return [standing.participantId, rawValue];
  }));
}
