import { describe, expect, it } from 'vitest'
import type { GameState, Player } from '../../types'
import { withImmediateVoxPublicMode } from '../voxPublicModeReducer'

function player(id: string, status: Player['status'], isUser = false): Player {
  return { id, name: id, avatar: '🧑', status, isUser } as Player
}

describe('strategic nomination store boundary', () => {
  it('keeps roster nomination statuses identical to the final strategic nomineeIds', () => {
    const state = {
      week: 2,
      phase: 'nomination_results',
      lohId: 'loh',
      nomineeIds: ['quinn', 'sol'],
      awaitingNominations: false,
      players: [
        player('loh', 'loh'),
        player('user', 'nominated', true),
        player('remy', 'nominated'),
        player('quinn', 'active'),
        player('sol', 'active'),
      ],
      lohNominationPlan: {
        week: 2,
        lohId: 'loh',
        targetId: 'quinn',
        backupTargetId: 'sol',
        pawnIds: ['sol'],
        initialNomineeIds: ['quinn', 'sol'],
        strategy: 'direct',
        status: 'initial_block_set',
        selectionBasis: 'strategy',
        targetScore: 70,
        backdoorChance: 0,
      },
    } as GameState

    const reducer = withImmediateVoxPublicMode((current = state) => current)
    const result = reducer(state, { type: 'test/render-boundary' })
    const rosterNominees = result.players
      .filter((candidate) => candidate.status.includes('nominated'))
      .map((candidate) => candidate.id)
      .sort()

    expect(rosterNominees).toEqual([...result.nomineeIds].sort())
  })
})
