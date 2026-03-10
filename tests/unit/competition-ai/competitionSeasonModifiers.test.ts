import { describe, it, expect } from 'vitest';
import {
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
});
