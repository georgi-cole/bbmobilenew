import { describe, expect, it } from 'vitest'
import type { GameState, Player } from '../../types'
import gameReducer, { advance, getNominationTargetScore } from '../gameSlice'
import { withLohNominationPlanning } from '../lohNominationPlanning'

function player(id: string, name: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name,
    avatar: '🧑',
    status: 'active',
    isUser: false,
    stats: { lohWins: 0, posWins: 0, timesNominated: 0 },
    ...overrides,
  } as Player
}

function nominatedIds(state: GameState): string[] {
  return state.players
    .filter((candidate) => candidate.status.split('+').includes('nominated'))
    .map((candidate) => candidate.id)
    .sort()
}

describe('AI LOH opening nomination block', () => {
  it('uses the persisted strategic plan atomically when Public Mode is off', () => {
    const initial = gameReducer(undefined, { type: 'test/init' })
    const loh = player('bea', 'Bea', { status: 'loh' })

    // These two are deliberately made attractive to the legacy base selector.
    // Before the atomic-plan fix, the base reducer could choose them first and
    // the outer LOH planner would then rewrite the official block to Blue + Vee.
    const user = player('user', 'Georgi Kolev', {
      isUser: true,
      stats: { lohWins: 20, posWins: 20, timesNominated: 0 },
    })
    const zed = player('zed', 'Zed', {
      stats: { lohWins: 20, posWins: 20, timesNominated: 0 },
    })
    const blue = player('blue', 'Blue')
    const vee = player('vee', 'Vee')

    const state = {
      ...initial,
      week: 3,
      phase: 'nominations' as const,
      publicModeEnabled: false,
      pendingPublicModeEnabled: null,
      lohId: loh.id,
      nomineeIds: [],
      players: [user, zed, blue, vee, loh],
      tvFeed: [],
      broadcastQueue: [],
      lohNominationPlan: {
        week: 3,
        lohId: loh.id,
        targetId: blue.id,
        backupTargetId: zed.id,
        pawnIds: [vee.id],
        initialNomineeIds: [blue.id, vee.id],
        strategy: 'direct' as const,
        status: 'planned' as const,
        selectionBasis: 'strategy' as const,
        targetScore: 80,
        backdoorChance: 0,
      },
    } as GameState

    const reducer = withLohNominationPlanning(gameReducer, getNominationTargetScore)
    const result = reducer(state, advance())

    expect(result.phase).toBe('nomination_results')
    expect(result.nomineeIds).toEqual([blue.id, vee.id])
    expect(nominatedIds(result)).toEqual([blue.id, vee.id])
    expect(result.lohNominationPlan?.status).toBe('initial_block_set')
    expect(
      result.tvFeed.find((event) => /have been nominated for elimination/i.test(event.text))?.text
    ).toContain('Blue and Vee')
  })

  it('does not force a stored strategic block while Public Mode is on', () => {
    const initial = gameReducer(undefined, { type: 'test/init' })
    const loh = player('bea', 'Bea', { status: 'loh' })
    const user = player('user', 'Georgi Kolev', { isUser: true })
    const zed = player('zed', 'Zed')
    const blue = player('blue', 'Blue')
    const vee = player('vee', 'Vee')

    const state = {
      ...initial,
      week: 3,
      phase: 'nominations' as const,
      publicModeEnabled: true,
      pendingPublicModeEnabled: null,
      lohId: loh.id,
      lastHohCompFinisherId: zed.id,
      nomineeIds: [],
      players: [user, zed, blue, vee, loh],
      tvFeed: [],
      broadcastQueue: [],
      lohNominationPlan: {
        week: 3,
        lohId: loh.id,
        targetId: blue.id,
        backupTargetId: null,
        pawnIds: [vee.id],
        initialNomineeIds: [blue.id, vee.id],
        strategy: 'direct' as const,
        status: 'planned' as const,
        selectionBasis: 'strategy' as const,
        targetScore: 80,
        backdoorChance: 0,
      },
    } as GameState

    const reducer = withLohNominationPlanning(gameReducer, getNominationTargetScore)
    const result = reducer(state, advance())

    // Public Mode keeps its existing three-person opening-block rule and the
    // strategic planner is intentionally disabled there.
    expect(result.nomineeIds).toHaveLength(3)
    expect(result.nomineeIds).toContain(zed.id)
    expect(result.lohNominationPlan?.status).toBe('planned')
  })
})
