import { describe, expect, it, vi } from 'vitest'
import {
  eventReferencesInactivePlayer,
  getBrokenBondTags,
  realityIntegrityMiddleware,
} from '../../src/social/realityIntegrityMiddleware'

type TestState = ReturnType<typeof makeState>
type DispatchedAction = {
  type: string
  payload?: {
    tags?: string[]
    delta?: number
    meta?: { bondBetrayal?: boolean }
  }
}

function makeState() {
  return {
    game: {
      week: 6,
      phase: 'pos_ceremony_results',
      lohId: 'loh',
      nomineeIds: ['nominee-a', 'nominee-b'],
      players: [
        { id: 'loh', name: 'Rune', status: 'loh' },
        { id: 'human', name: 'Georgi', status: 'active' },
        { id: 'nominee-a', name: 'Echo', status: 'nominated' },
        { id: 'nominee-b', name: 'Vee', status: 'nominated' },
        { id: 'jax', name: 'Jax', status: 'jury' },
      ],
      dramaSocialMode: true,
      voxPopuli: { status: 'inactive' },
    },
    social: {
      relationships: {
        loh: { human: { affinity: 72, tags: ['romance'] } },
        human: { loh: { affinity: 80, tags: ['romance'] } },
      },
    },
    settings: { gameUX: { dramaMode: true } },
    vip: { isActive: true, entitlements: { dramaMode: true } },
  }
}

describe('Reality integrity middleware', () => {
  it('recognizes public shocks that reference evicted or Tribunal players', () => {
    const players = makeState().game.players
    expect(
      eventReferencesInactivePlayer(players, "HOUSE EXPOSED: Jax's voting bloc is public.")
    ).toBe(true)
    expect(eventReferencesInactivePlayer(players, "HOUSE EXPOSED: Rune's plan is public.")).toBe(
      false
    )
  })

  it('converts positive bond tags into explicit rupture tags', () => {
    expect(getBrokenBondTags(['romance', 'alliance'])).toEqual([
      'betrayal',
      'ex',
      'broken_romance',
      'broken_alliance',
    ])
  })

  it('suppresses a fresh public shock about an inactive player', () => {
    const next = vi.fn()
    const api = {
      getState: () => makeState(),
      dispatch: vi.fn(),
    }
    const invoke = realityIntegrityMiddleware(api as never)(next as never)

    invoke({
      type: 'game/addTvEvent',
      payload: {
        text: "HOUSE EXPOSED: Jax's hidden voting bloc is now public.",
        type: 'social',
        meta: { dramaEvent: true },
      },
    })

    expect(next).not.toHaveBeenCalled()
  })

  it('records a severe betrayal when the LOH replacement-nominates a romance', () => {
    let current: TestState = makeState()
    const after = makeState()
    after.game.nomineeIds = ['nominee-a', 'nominee-b', 'human']
    const dispatch = vi.fn()
    const api = {
      getState: () => current,
      dispatch,
    }
    const invoke = realityIntegrityMiddleware(api as never)(((action: unknown) => {
      current = after
      return action
    }) as never)

    invoke({ type: 'game/advance' })

    const dispatched = dispatch.mock.calls.map(([action]) => action as DispatchedAction)
    const relationshipActions = dispatched.filter(
      (action) => action.type === 'social/updateRelationship'
    )
    expect(relationshipActions).toHaveLength(2)
    expect(relationshipActions[0].payload?.tags).toContain('broken_romance')
    expect(relationshipActions[0].payload?.tags).toContain('betrayal')
    expect(relationshipActions[1].payload?.delta).toBeLessThanOrEqual(-55)
    expect(
      dispatched.some(
        (action) => action.type === 'game/addTvEvent' && action.payload?.meta?.bondBetrayal === true
      )
    ).toBe(true)
  })
})
