import { describe, expect, it } from 'vitest';
import {
  buildFinalRawResults,
  CHAIN_LADDER,
  createInitialChainState,
  getStandardRoundEliminationCount,
  getStandardRoundTurnCap,
  resolveChainAction,
  type ChainOfGreedPlayerState,
} from '../../../src/components/ChainOfGreed/chainOfGreedLogic';

function buildPlayer(id: string): ChainOfGreedPlayerState {
  return {
    id,
    name: id,
    isHuman: id === 'human',
    avatar: '◉',
    precomputedScore: 50,
    isEliminated: false,
    totalContribution: 0,
    roundContribution: 0,
    roundCorrectGuesses: 0,
    roundWrongGuesses: 0,
    roundBanks: 0,
    roundBusts: 0,
    totalCorrectGuesses: 0,
    totalWrongGuesses: 0,
    totalBanks: 0,
    totalBusts: 0,
    voteCount: 0,
    semifinalScore: 0,
    finalScore: 0,
    turnsTakenThisRound: 0,
    personality: { aggression: 0.5, caution: 0.5, volatility: 0.5, social: 0.5 },
    lastRoundPerformance: 0,
    latestMoment: null,
  };
}

describe('chainOfGreedLogic', () => {
  it('uses the requested elimination schedule', () => {
    expect(getStandardRoundEliminationCount(14, 1, 14)).toBe(2);
    expect(getStandardRoundEliminationCount(14, 4, 8)).toBe(1);
    expect(getStandardRoundEliminationCount(10, 2, 8)).toBe(2);
    expect(getStandardRoundEliminationCount(8, 1, 8)).toBe(1);
  });

  it('uses brisk round turn caps to avoid long idle periods', () => {
    expect(getStandardRoundTurnCap(13)).toBe(13);
    expect(getStandardRoundTurnCap(9)).toBe(14);
    expect(getStandardRoundTurnCap(5)).toBe(10);
  });

  it('bank secures the active pot and keeps the current reference number', () => {
    const chain = {
      step: 3,
      pot: CHAIN_LADDER[2],
      referenceNumber: 61,
      recentNumbers: [18, 44, 61],
    };

    const resolution = resolveChainAction('bank', chain, () => 0.5);
    expect(resolution.securedDelta).toBe(150);
    expect(resolution.updatedChain.referenceNumber).toBe(61);
    expect(resolution.updatedChain.step).toBe(0);
    expect(resolution.updatedChain.pot).toBe(0);
  });

  it('treats equal reveals as a miss for higher/lower guesses', () => {
    const chain = {
      step: 2,
      pot: CHAIN_LADDER[1],
      referenceNumber: 44,
      recentNumbers: [20, 44],
    };

    const resolution = resolveChainAction('higher', chain, () => 0.4343434343);
    expect(resolution.revealedNumber).toBe(44);
    expect(resolution.wasCorrect).toBe(false);
    expect(resolution.equalMiss).toBe(true);
    expect(resolution.lostAmount).toBe(100);
    expect(resolution.updatedChain.referenceNumber).toBe(44);
  });

  it('builds winner-take-all raw results', () => {
    const players = [buildPlayer('human'), buildPlayer('ai-1'), buildPlayer('ai-2')];
    expect(buildFinalRawResults(players, 'ai-1', 3450)).toEqual({
      human: 0,
      'ai-1': 3450,
      'ai-2': 0,
    });
  });

  it('creates a mid-range starting reference number', () => {
    const chain = createInitialChainState(() => 0);
    expect(chain.referenceNumber).toBeGreaterThanOrEqual(18);
    expect(chain.referenceNumber).toBeLessThanOrEqual(83);
  });
});
