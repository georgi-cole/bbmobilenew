import { describe, expect, it } from 'vitest';

import {
  aiDecisionRng,
  aiShouldSpinAgain,
  aiShouldStop,
  assignAiPersonality,
  computeAiRiskDesire,
  computeEliminationCount,
  computeEliminatedPlayers,
  computePositionFactor,
  computePressureFactor,
  getRoundCap,
  pickSectorIndex,
  resolve666Effect,
  type RiskWheelAiDecisionContext,
} from '../src/features/riskWheel/riskWheelSlice';

const AI_IDS = ['player-1', 'player-2', 'player-3'] as const;

describe('Risk Wheel rules', () => {
  it('keeps the round cap and elimination schedule stable', () => {
    expect(getRoundCap(2)).toBe(3);
    expect(getRoundCap(4)).toBe(3);
    expect(getRoundCap(5)).toBe(8);

    expect(computeEliminationCount(4, 1, 4)).toBe(1);
    expect(computeEliminationCount(4, 2, 4)).toBe(1);
    expect(computeEliminationCount(4, 3, 4)).toBe(0);

    expect(computeEliminationCount(3, 1, 3)).toBe(1);
    expect(computeEliminationCount(3, 2, 3)).toBe(0);
    expect(computeEliminationCount(3, 3, 3)).toBe(1);

    expect(computeEliminationCount(2, 1, 2)).toBe(0);
    expect(computeEliminationCount(2, 2, 2)).toBe(0);
    expect(computeEliminationCount(2, 3, 2)).toBe(1);

    expect(computeEliminationCount(5, 1, 5)).toBe(2);
    expect(computeEliminationCount(5, 2, 5)).toBe(1);
    expect(computeEliminationCount(5, 3, 5)).toBe(1);
  });

  it('picks deterministic sectors and 666 effects', () => {
    const sector = pickSectorIndex(12345, 4);
    expect(sector).toBeGreaterThanOrEqual(0);
    expect(sector).toBeLessThan(16);
    expect(pickSectorIndex(12345, 4)).toBe(sector);

    const effect = resolve666Effect(12345, 4);
    expect(['add', 'subtract']).toContain(effect);
    expect(resolve666Effect(12345, 4)).toBe(effect);
  });

  it('eliminates the lowest scores with deterministic tie breaks', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const scores = { a: 10, b: 40, c: 10, d: 80 };
    expect(computeEliminatedPlayers(ids, scores, 2, 99).sort()).toEqual(['a', 'c']);
    expect(computeEliminatedPlayers(ids, scores, 0, 99)).toEqual([]);
    expect(computeEliminatedPlayers(ids, scores, 10, 99)).toEqual(ids);

    const tied = computeEliminatedPlayers(['a', 'b', 'c'], { a: 5, b: 5, c: 30 }, 1, 7);
    expect(tied).toHaveLength(1);
    expect(['a', 'b']).toContain(tied[0]);
    expect(computeEliminatedPlayers(['a', 'b', 'c'], { a: 5, b: 5, c: 30 }, 1, 7)).toEqual(tied);
  });

  it('keeps AI risk, pressure, and spin decisions bounded', () => {
    const personality = assignAiPersonality(77, AI_IDS[0]);
    expect(['cautious', 'balanced', 'risky']).toContain(personality);
    expect(assignAiPersonality(77, AI_IDS[0])).toBe(personality);

    const context: RiskWheelAiDecisionContext = {
      seed: 77,
      round: 2,
      playerId: AI_IDS[0],
      personality,
      currentScore: 250,
      activePlayerIds: [...AI_IDS],
      roundScores: { 'player-1': 250, 'player-2': 300, 'player-3': 100 },
      spinsRemaining: 2,
      initialPlayerCount: 3,
      decisionIndex: 0,
    };

    expect(computePositionFactor(AI_IDS[0], [...AI_IDS], context.roundScores)).toBeCloseTo(0.5);
    expect(computePressureFactor(2, 3, 3)).toBeCloseTo(0.25);
    expect(aiDecisionRng(77, 2, AI_IDS[0], 0, 0)).toBe(aiDecisionRng(77, 2, AI_IDS[0], 0, 0));

    const risk = computeAiRiskDesire(context);
    expect(risk).toBeGreaterThanOrEqual(0);
    expect(risk).toBeLessThanOrEqual(1);

    expect(
      aiShouldSpinAgain({
        ...context,
        currentScore: 0,
      }),
    ).toBe(true);

    expect(
      aiShouldStop({
        ...context,
        spinsRemaining: 0,
      }),
    ).toBe(true);
  });
});
