import { describe, expect, it } from 'vitest'
import type { GameState, Player } from '../../types'
import { reconcileStrategicNominationStatuses } from '../nominationStatusConsistency'

function player(id: string, status: Player['status'], isUser = false): Player {
  return {
    id,
    name: id,
    avatar: '🧑',
    status,
    isUser,
    stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
  } as Player
}

function makeState(options: {
  nominees: string[]
  players: Player[]
  awaitingNominations?: boolean
}): GameState {
  return {
    week: 2,
    phase: 'nomination_results',
    lohId: 'loh',
    nomineeIds: options.nominees,
    awaitingNominations: options.awaitingNominations ?? false,
    players: options.players,
    lohNominationPlan: {
      week: 2,
      lohId: 'loh',
      targetId: options.nominees[0] ?? 'target',
      backupTargetId: null,
      pawnIds: options.nominees.slice(1),
      initialNomineeIds: [...options.nominees],
      strategy: 'direct',
      status: 'initial_block_set',
      selectionBasis: 'strategy',
      targetScore: 50,
      backdoorChance: 0,
    },
  } as GameState
}

function nominatedStatusIds(state: GameState): string[] {
  return state.players
    .filter((candidate) => candidate.status.includes('nominated'))
    .map((candidate) => candidate.id)
    .sort()
}

describe('strategic nomination status consistency', () => {
  it('repairs a one-player-overlap provisional block without changing nomineeIds', () => {
    // Reproduces the shape seen in the UI: the base reducer marked user + aria,
    // then the strategic AI plan replaced the block with mimi + aria.
    const state = makeState({
      nominees: ['mimi', 'aria'],
      players: [
        player('loh', 'loh'),
        player('user', 'nominated', true),
        player('aria', 'nominated'),
        player('mimi', 'active'),
      ],
    })

    const result = reconcileStrategicNominationStatuses(state)

    expect(result.nomineeIds).toEqual(['mimi', 'aria'])
    expect(nominatedStatusIds(result)).toEqual(['aria', 'mimi'])
    expect(result.players.find((candidate) => candidate.id === 'user')?.status).toBe('active')
    expect(result.players.find((candidate) => candidate.id === 'mimi')?.status).toBe('nominated')
  })

  it('repairs a zero-overlap provisional block and strips stale compound nomination status', () => {
    // Reproduces the second observed shape: user + remy leaked into roster state
    // while the final strategic block was quinn + sol.
    const state = makeState({
      nominees: ['quinn', 'sol'],
      players: [
        player('loh', 'loh'),
        player('user', 'nominated', true),
        player('remy', 'nominated+pos'),
        player('quinn', 'active'),
        player('sol', 'active'),
      ],
    })

    const result = reconcileStrategicNominationStatuses(state)

    expect(result.nomineeIds).toEqual(['quinn', 'sol'])
    expect(nominatedStatusIds(result)).toEqual(['quinn', 'sol'])
    expect(result.players.find((candidate) => candidate.id === 'user')?.status).toBe('active')
    expect(result.players.find((candidate) => candidate.id === 'remy')?.status).toBe('pos')
  })

  it('does not touch a human nomination draft before the block is committed', () => {
    const state = makeState({
      nominees: ['mimi', 'aria'],
      awaitingNominations: true,
      players: [player('loh', 'loh'), player('user', 'nominated', true), player('mimi', 'active')],
    })

    const result = reconcileStrategicNominationStatuses(state)

    expect(result).toBe(state)
    expect(result.players.find((candidate) => candidate.id === 'user')?.status).toBe('nominated')
  })
})
