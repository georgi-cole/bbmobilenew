import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../src/store/rng';
import {
  buildAiVoteRecords,
  buildFinalRawResults,
  CHAIN_LADDER,
  createChainOfGreedPlayers,
  createInitialChainState,
  decideAiAction,
  getStandardRoundEliminationCount,
  getStandardRoundTurnCap,
  rankPlayersByScore,
  resolveChainAction,
  resolveChainOfGreedParticipants,
  resolveVoteElimination,
  type ChainOfGreedPlayerState,
} from '../src/components/ChainOfGreed/chainOfGreedLogic';

function sequenceRng(values: number[]) {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0.5;
}

function makePlayer(id: string, overrides: Partial<ChainOfGreedPlayerState> = {}): ChainOfGreedPlayerState {
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
    ...overrides,
  };
}

describe('Chain of Greed rules', () => {
  it('caps the roster, seeds a playable chain, and resets player state', () => {
    const participants = Array.from({ length: 18 }, (_, index) => ({
      id: `p${index + 1}`,
      name: `Player ${index + 1}`,
      isHuman: index === 0,
      precomputedScore: 100 - index,
      avatar: '',
    }));

    const resolved = resolveChainOfGreedParticipants({ participants });
    expect(resolved).toHaveLength(16);

    const chain = createInitialChainState(() => 0);
    expect(chain.referenceNumber).toBeGreaterThanOrEqual(18);
    expect(chain.referenceNumber).toBeLessThanOrEqual(83);

    expect(getStandardRoundEliminationCount(14, 1, 14)).toBe(2);
    expect(getStandardRoundEliminationCount(8, 1, 8)).toBe(1);
    expect(getStandardRoundTurnCap(9)).toBe(14);
    expect(getStandardRoundTurnCap(5)).toBe(10);

    const players = createChainOfGreedPlayers(resolved, mulberry32(12));
    expect(players).toHaveLength(16);
    expect(players.every((player) => !player.isEliminated && player.roundContribution === 0 && player.latestMoment === null)).toBe(true);
  });

  it('banks safely and keeps AI decisions inside the higher/lower rules', () => {
    const bankChain = {
      step: 3,
      pot: CHAIN_LADDER[2],
      referenceNumber: 61,
      recentNumbers: [18, 44, 61],
    };

    const bankResolution = resolveChainAction('bank', bankChain, () => 0.5);
    expect(bankResolution.securedDelta).toBe(150);
    expect(bankResolution.updatedChain).toMatchObject({
      step: 0,
      pot: 0,
      referenceNumber: 61,
    });

    const tieChain = {
      step: 2,
      pot: CHAIN_LADDER[1],
      referenceNumber: 44,
      recentNumbers: [20, 43],
    };

    const tieResolution = resolveChainAction('higher', tieChain, sequenceRng([0.4343434343, 0.9]));
    expect(tieResolution.revealedNumber).toBe(44);
    expect(tieResolution.wasCorrect).toBe(false);
    expect(tieResolution.equalMiss).toBe(true);

    const cautiousPlayer = makePlayer('ai-1', {
      precomputedScore: 88,
      roundContribution: 40,
      personality: { aggression: 0.35, caution: 0.92, volatility: 0.1, social: 0.5 },
    });
    const choice = decideAiAction({
      player: cautiousPlayer,
      chain: {
        step: 4,
        pot: CHAIN_LADDER[3],
        referenceNumber: 58,
        recentNumbers: [24, 39, 58],
      },
      remainingTurns: 2,
      phase: 'standard',
      activePlayers: [cautiousPlayer, makePlayer('ai-2')],
      bankAvailable: false,
    });

    expect(['higher', 'lower']).toContain(choice);
  });

  it('builds valid votes and resolves a tied elimination with a duel', () => {
    const players = [
      makePlayer('human', { isHuman: true, name: 'You' }),
      makePlayer('ai-1', { name: 'AI 1' }),
      makePlayer('ai-2', { name: 'AI 2' }),
      makePlayer('ai-3', { name: 'AI 3' }),
    ];

    const votes = buildAiVoteRecords({
      activePlayers: players,
      roundNumber: 2,
      seed: 77,
      humanVoteTargetId: 'ai-2',
    });

    expect(votes.find((vote) => vote.voterId === 'human')?.targetId).toBe('ai-2');
    expect(
      votes.every((vote) => vote.targetId !== vote.voterId && players.some((player) => player.id === vote.targetId && !player.isEliminated)),
    ).toBe(true);

    const elimination = resolveVoteElimination({
      activePlayers: players,
      votes: [
        { voterId: 'human', voterName: 'You', targetId: 'ai-1', targetName: 'AI 1', reason: 'tight race' },
        { voterId: 'ai-2', voterName: 'AI 2', targetId: 'ai-1', targetName: 'AI 1', reason: 'tight race' },
        { voterId: 'ai-3', voterName: 'AI 3', targetId: 'ai-2', targetName: 'AI 2', reason: 'tight race' },
      ],
      eliminateCount: 1,
      rng: sequenceRng([0.2, 0.6, 0.4, 0.8]),
    });

    expect(elimination.tieBreaks[0]?.type).toBe('duel');
    expect(elimination.eliminatedIds).toHaveLength(1);
    expect(['ai-1', 'ai-2']).toContain(elimination.eliminatedIds[0]);
    expect(elimination.updatedPlayers.find((player) => player.id === elimination.eliminatedIds[0])?.isEliminated).toBe(true);
  });

  it('breaks tied endgame scores and keeps the final payout winner-take-all', () => {
    const players = [
      makePlayer('human', { isHuman: true, name: 'You' }),
      makePlayer('ai-1', { name: 'AI 1' }),
      makePlayer('ai-2', { name: 'AI 2' }),
      makePlayer('ai-3', { name: 'AI 3' }),
    ];

    const scores = {
      human: 80,
      'ai-1': 120,
      'ai-2': 120,
      'ai-3': 40,
    };

    const ranked = rankPlayersByScore(scores, players, sequenceRng([0.11, 0.72, 0.33, 0.88]));
    expect(ranked.tieBreak?.type).toBe('duel');

    const winnerId = ranked.ordered[0]?.id;
    expect(winnerId).toBeTruthy();
    expect(['ai-1', 'ai-2']).toContain(winnerId ?? '');

    expect(buildFinalRawResults(players, winnerId ?? 'ai-1', 3450)).toEqual(
      Object.fromEntries(players.map((player) => [player.id, player.id === winnerId ? 3450 : 0])),
    );
  });
});