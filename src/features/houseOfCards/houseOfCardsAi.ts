import { mulberry32 } from '../../store/rng';

export interface HouseOfCardsAiSessionProfile {
  playerId: string;
  sessionAbility: number;
}

export interface HouseOfCardsRoundPerformance {
  score: number;
  mistakes: number;
  timeMs: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function hashId(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getPerfectRunChance(effectiveAbility: number, pairCount: number): number {
  let baseChance: number;

  if (effectiveAbility < 45) baseChance = 0.001;
  else if (effectiveAbility < 60) baseChance = 0.005;
  else if (effectiveAbility < 75) baseChance = 0.02;
  else if (effectiveAbility < 85) baseChance = 0.05;
  else baseChance = 0.08;

  // A flawless run becomes substantially less plausible as the board grows.
  // This especially tightens the final two elimination rounds (8 and 10 pairs)
  // while still allowing an exceptional performance occasionally.
  const boardMultiplier = pairCount >= 10
    ? 0.35
    : pairCount >= 8
      ? 0.5
      : pairCount >= 6
        ? 0.75
        : 1;

  return baseChance * boardMultiplier;
}

export function createHouseOfCardsSessionAbility(
  playerId: string,
  tournamentSeed: number,
): number {
  const rng = mulberry32(
    (tournamentSeed ^ hashId(playerId) ^ 0x517cc1b7) >>> 0,
  );
  const centered =
    (rng() + rng() + rng() + rng()) / 4 - 0.5;

  return Math.round(
    clamp(55 + centered * 80, 25, 85),
  );
}

export function createHouseOfCardsAiProfiles(
  participantIds: string[],
  humanId: string | null,
  tournamentSeed: number,
): Record<string, HouseOfCardsAiSessionProfile> {
  return Object.fromEntries(
    participantIds
      .filter((playerId) => playerId !== humanId)
      .map((playerId) => [
        playerId,
        {
          playerId,
          sessionAbility: createHouseOfCardsSessionAbility(playerId, tournamentSeed),
        },
      ]),
  );
}

export function simulateHouseOfCardsAiRound(params: {
  playerId: string;
  round: number;
  pairCount: number;
  tournamentSeed: number;
  sessionAbility: number;
}): HouseOfCardsRoundPerformance {
  const { playerId, round, pairCount, tournamentSeed, sessionAbility } = params;
  const rng = mulberry32(
    (
      tournamentSeed
      ^ hashId(playerId)
      ^ Math.imul(round, 0x9e3779b9)
    ) >>> 0,
  );
  const roundCentered =
    (rng() + rng() + rng() + rng()) / 4 - 0.5;
  const roundForm = roundCentered * 28;
  const effectiveAbility = clamp(
    sessionAbility + roundForm,
    20,
    90,
  );
  const ability01 = effectiveAbility / 100;
  const expectedMistakes =
    pairCount * (0.9 - ability01 * 0.62);
  const variation =
    ((rng() + rng() + rng() + rng()) / 4 - 0.5)
    * pairCount
    * 0.7;
  let mistakes = Math.round(
    expectedMistakes + variation,
  );

  mistakes = clamp(
    mistakes,
    0,
    Math.max(2, Math.round(pairCount * 1.5)),
  );

  if (rng() < getPerfectRunChance(effectiveAbility, pairCount)) {
    mistakes = 0;
  } else {
    mistakes = Math.max(1, mistakes);
  }

  const basePerPairMs =
    850 + (1 - ability01) * 650;
  const mistakeDelayMs =
    mistakes * (850 + rng() * 500);
  const timeMs = Math.max(
    3000,
    Math.round(
      pairCount * basePerPairMs
        + mistakeDelayMs
        + 1200
        + rng() * 2500,
    ),
  );
  const score = Math.max(
    1,
    pairCount * 1000
      - mistakes * 90
      - Math.floor(timeMs / 1000),
  );

  return {
    mistakes,
    timeMs,
    score,
  };
}
