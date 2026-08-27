import { describe, expect, it } from 'vitest'
import reducer, {
  skipBlackjackTournamentToEnd,
  type BlackjackTournamentState,
} from './blackjackTournamentSlice'

describe('skipBlackjackTournamentToEnd', () => {
  it('finishes the simulated tournament for an eliminated human spectator', () => {
    const state = {
      competitionType: 'LOH',
      phase: 'pick_opponent',
      stage: 'final',
      allPlayerIds: ['human', 'a', 'b'],
      remainingPlayerIds: ['a', 'b'],
      eliminatedPlayerIds: ['human'],
      playerScores: { human: 0, a: 1, b: 2 },
      leagueScores: {},
      leagueRankings: [],
      leagueOpponentIds: [],
      leagueOpponentIndex: 0,
      finalistIds: ['human', 'a', 'b'],
      humanPlayerId: 'human',
      isSpectating: true,
      controllingPlayerId: 'a',
      fighterAId: null,
      fighterBId: null,
      currentDuel: null,
      duelWinnerId: null,
      duelLoserId: null,
      duelEliminatedId: null,
      isDuelTie: false,
      rematchCount: 0,
      duelIndex: 2,
      winnerId: null,
      seed: 13,
      outcomeResolved: false,
    } satisfies BlackjackTournamentState

    const result = reducer(state, skipBlackjackTournamentToEnd())

    expect(result.phase).toBe('complete')
    expect(result.winnerId).toBe('b')
    expect(result.remainingPlayerIds).toEqual(['b'])
    expect(result.eliminatedPlayerIds).toEqual(expect.arrayContaining(['human', 'a']))
  })

  it('does not let an active player skip the competition', () => {
    const state = reducer(undefined, { type: 'test/init' })
    expect(reducer(state, skipBlackjackTournamentToEnd())).toEqual(state)
  })
})
