import { describe, it, expect } from 'vitest';
import {
  getDefaultCompetitionProfile,
  simulateAiPerformance,
  type CompetitionSkillProfile,
  type MinigameAiModel,
} from '../../../src/ai/competition';

const BASE_PROFILE: CompetitionSkillProfile = {
  overall: 50,
  physical: 50,
  mental: 50,
  precision: 50,
  nerve: 50,
  consistency: 50,
  clutch: 50,
  chokeRisk: 50,
  luck: 50,
};

const PRECISION_GAME: MinigameAiModel = {
  key: 'precision-game',
  category: 'precision',
  scoreDirection: 'higher-is-better',
  volatility: 0.3,
  minScore: 0,
  maxScore: 100,
  weights: { physical: 0, mental: 0, precision: 1, nerve: 0, luck: 0 },
};

describe('simulateAiPerformance', () => {
  it('returns deterministic results for identical inputs', () => {
    const scoreA = simulateAiPerformance({
      minigameKey: PRECISION_GAME.key,
      minigame: PRECISION_GAME,
      seed: 42,
      playerId: 'player-1',
      profile: BASE_PROFILE,
    });
    const scoreB = simulateAiPerformance({
      minigameKey: PRECISION_GAME.key,
      minigame: PRECISION_GAME,
      seed: 42,
      playerId: 'player-1',
      profile: BASE_PROFILE,
    });

    expect(scoreA).toBe(scoreB);
  });

  it('rewards stronger profiles for higher-is-better games', () => {
    const strongProfile: CompetitionSkillProfile = {
      ...BASE_PROFILE,
      overall: 90,
      physical: 90,
      mental: 90,
      precision: 90,
      nerve: 90,
    };
    const weakProfile: CompetitionSkillProfile = {
      ...BASE_PROFILE,
      overall: 20,
      physical: 20,
      mental: 20,
      precision: 20,
      nerve: 20,
    };

    const playerId = 'player-strong';
    const strongScore = simulateAiPerformance({
      minigameKey: PRECISION_GAME.key,
      minigame: PRECISION_GAME,
      seed: 1337,
      playerId,
      profile: strongProfile,
    });
    const weakScore = simulateAiPerformance({
      minigameKey: PRECISION_GAME.key,
      minigame: PRECISION_GAME,
      seed: 1337,
      playerId,
      profile: weakProfile,
    });

    expect(strongScore).toBeGreaterThan(weakScore);
  });

  it('differentiates performance across minigames with different weights', () => {
    const physicalGame: MinigameAiModel = {
      key: 'physical-game',
      category: 'physical',
      scoreDirection: 'higher-is-better',
      volatility: 0.3,
      minScore: 0,
      maxScore: 100,
      weights: { physical: 1, mental: 0, precision: 0, nerve: 0, luck: 0 },
    };
    const mentalGame: MinigameAiModel = {
      key: 'mental-game',
      category: 'mental',
      scoreDirection: 'higher-is-better',
      volatility: 0.3,
      minScore: 0,
      maxScore: 100,
      weights: { physical: 0, mental: 1, precision: 0, nerve: 0, luck: 0 },
    };
    const profile: CompetitionSkillProfile = {
      ...BASE_PROFILE,
      physical: 90,
      mental: 15,
    };

    const physicalScore = simulateAiPerformance({
      minigameKey: physicalGame.key,
      minigame: physicalGame,
      seed: 2024,
      playerId: 'player-1',
      profile,
    });
    const mentalScore = simulateAiPerformance({
      minigameKey: mentalGame.key,
      minigame: mentalGame,
      seed: 2024,
      playerId: 'player-1',
      profile,
    });

    expect(physicalScore).toBeGreaterThan(mentalScore);
  });

  it('maps stronger profiles to lower scores for lower-is-better games', () => {
    const lowerBetterGame: MinigameAiModel = {
      key: 'lower-better-game',
      category: 'precision',
      scoreDirection: 'lower-is-better',
      volatility: 0.25,
      minScore: 10,
      maxScore: 100,
      weights: { physical: 0, mental: 0, precision: 1, nerve: 0, luck: 0 },
    };
    const strongProfile: CompetitionSkillProfile = {
      ...BASE_PROFILE,
      precision: 95,
    };
    const weakProfile: CompetitionSkillProfile = {
      ...BASE_PROFILE,
      precision: 15,
    };

    const strongScore = simulateAiPerformance({
      minigameKey: lowerBetterGame.key,
      minigame: lowerBetterGame,
      seed: 88,
      playerId: 'player-2',
      profile: strongProfile,
    });
    const weakScore = simulateAiPerformance({
      minigameKey: lowerBetterGame.key,
      minigame: lowerBetterGame,
      seed: 88,
      playerId: 'player-2',
      profile: weakProfile,
    });

    expect(strongScore).toBeLessThan(weakScore);
  });

  it('falls back safely when profile or metadata is missing', () => {
    const score = simulateAiPerformance({
      minigameKey: 'unknown-minigame',
      seed: 999,
      playerId: 'fallback-player',
      profile: undefined,
    });

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('uses the default profile when none is provided', () => {
    const scoreWithDefault = simulateAiPerformance({
      minigameKey: PRECISION_GAME.key,
      minigame: PRECISION_GAME,
      seed: 314,
      playerId: 'player-default',
      profile: getDefaultCompetitionProfile(),
    });
    const scoreWithUndefined = simulateAiPerformance({
      minigameKey: PRECISION_GAME.key,
      minigame: PRECISION_GAME,
      seed: 314,
      playerId: 'player-default',
      profile: undefined,
    });

    expect(scoreWithDefault).toBe(scoreWithUndefined);
  });
});
