import { describe, it, expect } from 'vitest';
import {
  getCompetitionPerceptionRead,
  getCompetitionSeasonModifiers,
  getDefaultCompetitionSeasonState,
  updateCompetitionSeasonStateByPlayerId,
  type CompetitionSeasonState,
} from '../../../src/ai/competition';

describe('competition season modifiers', () => {
  it('returns neutral adjustments for the default season state', () => {
    const modifiers = getCompetitionSeasonModifiers(getDefaultCompetitionSeasonState());

    expect(modifiers.totalAdjustment).toBe(0);
    expect(modifiers.formAdjustment).toBe(0);
    expect(modifiers.confidenceAdjustment).toBe(0);
    expect(modifiers.fatigueAdjustment).toBe(0);
  });

  it('keeps season state within bounds after repeated updates', () => {
    const playerIds = ['winner', 'loser', 'bench'];
    let seasonStateByPlayerId: Record<string, CompetitionSeasonState> | undefined;

    for (let i = 0; i < 30; i += 1) {
      seasonStateByPlayerId = updateCompetitionSeasonStateByPlayerId(seasonStateByPlayerId, {
        playerIds,
        participants: ['winner', 'loser'],
        scores: { winner: 100, loser: 0 },
        winnerId: 'winner',
      });
    }

    const winnerState = seasonStateByPlayerId?.winner;
    const loserState = seasonStateByPlayerId?.loser;
    const benchState = seasonStateByPlayerId?.bench;

    expect(winnerState?.form).toBeLessThanOrEqual(5);
    expect(winnerState?.confidence).toBeLessThanOrEqual(3);
    expect(winnerState?.fatigue).toBeLessThanOrEqual(5);

    expect(loserState?.form).toBeGreaterThanOrEqual(-5);
    expect(loserState?.confidence).toBeGreaterThanOrEqual(-3);
    expect(loserState?.fatigue).toBeGreaterThanOrEqual(0);

    expect(benchState?.fatigue).toBeGreaterThanOrEqual(0);
  });
  it('turns repeated bottom finishes into weakness plus pawn and sandbag counterplay', () => {
    const playerIds = ['human', 'a', 'b', 'c']
    let seasonStateByPlayerId: Record<string, CompetitionSeasonState> | undefined

    for (let i = 0; i < 4; i += 1) {
      seasonStateByPlayerId = updateCompetitionSeasonStateByPlayerId(seasonStateByPlayerId, {
        playerIds,
        participants: playerIds,
        scores: { human: 0, a: 100, b: 80, c: 60 },
        winnerId: 'a',
      })
    }

    const humanState = seasonStateByPlayerId?.human
    const read = getCompetitionPerceptionRead(undefined, humanState)

    expect(humanState?.recentBottomStreak).toBe(4)
    expect(humanState?.sandbagSuspicion).toBeGreaterThan(10)
    expect(read.perceivedStrength).toBeLessThan(35)
    expect(read.pawnSuitability).toBeGreaterThan(10)
  })

  it('raises sandbag suspicion sharply when a chronic bottom finisher suddenly performs strongly', () => {
    const playerIds = ['human', 'a', 'b', 'c']
    let seasonStateByPlayerId: Record<string, CompetitionSeasonState> | undefined

    for (let i = 0; i < 3; i += 1) {
      seasonStateByPlayerId = updateCompetitionSeasonStateByPlayerId(seasonStateByPlayerId, {
        playerIds,
        participants: playerIds,
        scores: { human: 0, a: 100, b: 80, c: 60 },
        winnerId: 'a',
      })
    }

    const before = seasonStateByPlayerId?.human?.sandbagSuspicion ?? 0
    seasonStateByPlayerId = updateCompetitionSeasonStateByPlayerId(seasonStateByPlayerId, {
      playerIds,
      participants: playerIds,
      scores: { human: 100, a: 80, b: 60, c: 40 },
      winnerId: 'human',
    })

    expect(seasonStateByPlayerId?.human?.recentBottomStreak).toBe(0)
    expect(seasonStateByPlayerId?.human?.sandbagSuspicion ?? 0).toBeGreaterThan(before + 20)
  })

});
