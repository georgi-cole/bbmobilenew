import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';

import { getGame, getPoolByFilter } from '../src/minigames/registry';
import {
  simulateMinigameAiScore,
  simulateSnakeAiScore,
  simulateSnakeAiRun,
} from '../src/ai/competition';
import type { CompetitionSkillProfile } from '../src/ai/competition';
import { minigameAiRegistry } from '../src/ai/competition/minigameAiRegistry';
import {
  NUM_ROUNDS,
  computeAverageAccuracy,
  computeRoundScore,
  deriveLastPlaceId,
} from '../src/components/EstimationGame/estimationGameUtils';
import { getMinigameAiModel } from '../src/ai/competition';
import tiltLabyrinthReducer, {
  initTiltLabyrinth,
  setHumanScore,
} from '../src/features/tiltLabyrinth/tiltLabyrinthSlice';
import {
  CAPITALIZATION_CONTINENTS,
  CAPITALIZATION_COUNTRIES_BY_CONTINENT,
} from '../src/components/Capitalization/capitalizationData';

type TiltStore = ReturnType<typeof makeTiltStore>;

function makeTiltStore() {
  return configureStore({ reducer: { tiltLabyrinth: tiltLabyrinthReducer } });
}

function initTilt(store: TiltStore) {
  store.dispatch(
    initTiltLabyrinth({
      participantIds: ['alice', 'bob', 'carol'],
      participantNames: { alice: 'Alice', bob: 'Bob', carol: 'Carol' },
      humanPlayerId: 'alice',
      competitionType: 'LOH',
      seed: 42,
      aiScores: { bob: 12_000, carol: 45_000 },
    }),
  );
}

describe('Registry and AI wiring', () => {
  it('keeps the active batch-6 games wired to the expected components and AI models', () => {
    expect(getGame('estimationGame')?.reactComponentKey).toBe('EstimationGame');
    expect(getGame('snake')?.reactComponentKey).toBe('SnakeGame');
    expect(getGame('tiltLabyrinth')?.reactComponentKey).toBe('TiltLabyrinth');

    expect(getGame('laserPantryDash')?.legacy).toBe(true);
    expect(getGame('laserPantryDash')?.retired).toBe(true);

    expect(minigameAiRegistry.estimationGame).toBeDefined();
    expect(minigameAiRegistry.snake).toBeDefined();
    expect(minigameAiRegistry.tiltLabyrinth).toBeDefined();
    expect(minigameAiRegistry.laserPantryDash).toBeDefined();
  });

  it('keeps retired legacy entries out of the active pool', () => {
    const activeKeys = new Set(getPoolByFilter({ retired: false }).map((game) => game.key));

    for (const key of ['rainBarrelBalance', 'socialStrings', 'flashFlood', 'laserPantryDash']) {
      expect(activeKeys.has(key), `${key} should not be in the active pool`).toBe(false);
      expect(getGame(key)?.retired, `${key} should be retired`).toBe(true);
    }
  });
});

describe('Estimation Game audit', () => {
  it('keeps the scoring helpers deterministic and bounded', () => {
    expect(NUM_ROUNDS).toBe(5);
    expect(computeRoundScore(42, 42)).toBe(100);
    expect(computeRoundScore(42, 43)).toBe(97);
    expect(computeRoundScore(42, 8)).toBe(0);
    expect(computeAverageAccuracy([80, 90, 70, 60, 100])).toBe(80);
    expect(deriveLastPlaceId({ alice: 91, bob: 72, carol: 55 }, ['alice', 'bob', 'carol'], 'alice'))
      .toBe('carol');
  });

  it('simulates deterministic AI scores inside the configured score band', () => {
    const model = getMinigameAiModel('estimationGame');
    expect(model.minScore).toBe(0);
    expect(model.maxScore).toBe(100);
    expect(model.scoreDirection).toBe('higher-is-better');

    const a = simulateMinigameAiScore({ gameKey: 'estimationGame', seed: 77, playerId: 'p1' });
    const b = simulateMinigameAiScore({ gameKey: 'estimationGame', seed: 77, playerId: 'p1' });
    const c = simulateMinigameAiScore({ gameKey: 'estimationGame', seed: 78, playerId: 'p1' });

    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(100);
    expect(a).not.toBe(c);
  });
});

describe('Snake audit', () => {
  it('keeps the headless simulator deterministic and within the target envelope', () => {
    const skill: CompetitionSkillProfile = {
      overall: 80,
      physical: 70,
      mental: 60,
      precision: 90,
      nerve: 80,
      consistency: 75,
      clutch: 70,
      chokeRisk: 25,
      luck: 40,
    };

    const runA = simulateSnakeAiRun(12345, 0.65);
    const runB = simulateSnakeAiRun(12345, 0.65);
    const runC = simulateSnakeAiRun(54321, 0.65);

    expect(runA).toEqual(runB);
    expect(runA.score).toBeGreaterThanOrEqual(0);
    expect(runA.score).toBeLessThanOrEqual(1000);
    expect(runA.ticks).toBeGreaterThan(0);
    expect(runA.completed || runA.score < 1000).toBe(true);
    expect(runA).not.toEqual(runC);

    const aiA = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'alice', profile: skill });
    const aiB = simulateSnakeAiScore({ sessionSeed: 42, playerId: 'alice', profile: skill });
    const aiC = simulateSnakeAiScore({ sessionSeed: 99, playerId: 'alice', profile: skill });

    expect(aiA).toEqual(aiB);
    expect(aiA.score).toBeGreaterThanOrEqual(0);
    expect(aiA.score).toBeLessThanOrEqual(1000);
    expect(aiA.completionMs === null || aiA.completionMs > 0).toBe(true);
    expect(aiA).not.toEqual(aiC);

    const routed = simulateMinigameAiScore({ gameKey: 'snake', seed: 42, playerId: 'alice' });
    expect(routed).toBeGreaterThanOrEqual(0);
    expect(routed).toBeLessThanOrEqual(1000);
  });
});

describe('Tilt Labyrinth audit', () => {
  it('initialises and resolves winner/last-place correctly from completion times', () => {
    const store = makeTiltStore();
    initTilt(store);

    expect(store.getState().tiltLabyrinth.phase).toBe('playing');
    expect(store.getState().tiltLabyrinth.aiScores).toEqual({ bob: 12_000, carol: 45_000 });

    store.dispatch(setHumanScore(18_000));

    expect(store.getState().tiltLabyrinth.phase).toBe('complete');
    expect(store.getState().tiltLabyrinth.winnerId).toBe('bob');
    expect(store.getState().tiltLabyrinth.lastPlaceId).toBe('carol');
    expect(store.getState().tiltLabyrinth.finalScores).toEqual({
      alice: 18_000,
      bob: 12_000,
      carol: 45_000,
    });
  });

  it('keeps the AI model and host-scored routing aligned', () => {
    const model = getMinigameAiModel('tiltLabyrinth');
    expect(model.scoreDirection).toBe('lower-is-better');
    expect(model.category).toBe('precision');

    const score = simulateMinigameAiScore({ gameKey: 'tiltLabyrinth', seed: 88, playerId: 'p1' });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(60_000);
  });
});

describe('Legacy retirement guards', () => {
  it('keeps the retired names explicitly marked as retired', () => {
    for (const key of ['rainBarrelBalance', 'socialStrings', 'flashFlood']) {
      expect(getGame(key)?.retired).toBe(true);
      expect(getGame(key)?.legacy).toBe(true);
    }
  });

  it('keeps the retired legacy registry data available for Laser Pantry Dash', () => {
    const game = getGame('laserPantryDash');
    expect(game?.retired).toBe(true);
    expect(game?.legacy).toBe(true);
    expect(game?.modulePath).toBe('laser-pantry-dash.js');
    expect(minigameAiRegistry.laserPantryDash?.category).toBe('physical');
    expect(minigameAiRegistry.laserPantryDash?.scoreDirection).toBe('higher-is-better');
  });

  it('preserves the Capitalization data pack needed by the AI audit', () => {
    expect(CAPITALIZATION_CONTINENTS).toContain('Oceania');
    expect(CAPITALIZATION_COUNTRIES_BY_CONTINENT.Oceania.map((country) => country.name)).toEqual(
      expect.arrayContaining(['Australia', 'New Zealand']),
    );
  });
});
