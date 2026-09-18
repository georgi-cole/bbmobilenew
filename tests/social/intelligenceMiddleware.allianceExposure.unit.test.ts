import { describe, expect, it } from 'vitest'
import { intelligenceMiddleware } from '../../src/social/intelligenceMiddleware'
import {
  addRealityFact,
  createInitialRealityDomainState,
  createRealityAlliance,
  maybeExposeRealityAlliance,
} from '../../src/social/reality'

function rootState(reality: ReturnType<typeof createInitialRealityDomainState>) {
  return {
    game: {
      mode: 'classic',
      week: 5,
      phase: 'social_1',
      players: [
        { id: 'ava', name: 'Ava', status: 'active' },
        { id: 'lia', name: 'Lia', status: 'active' },
        { id: 'kai', name: 'Kai', status: 'active' },
      ],
    },
    social: {
      reality,
      intelligenceDeliveries: [],
    },
    challenge: { history: [] },
  }
}

describe('intelligenceMiddleware alliance exposure editorial gate', () => {
  it('broadcasts a newly public alliance exposure through Faux TV', () => {
    const beforeDomain = createInitialRealityDomainState()
    const afterDomain = createInitialRealityDomainState()
    const alliance = createRealityAlliance(afterDomain, {
      id: 'public-coalition',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Control the middle',
      at: { day: 3, phase: 'social_1' },
      secrecy: 0.1,
    })
    const exposed = maybeExposeRealityAlliance(
      afterDomain,
      alliance.id,
      { day: 5, phase: 'social_1' },
      'leak-event'
    )
    expect(exposed?.publicVisible).toBe(true)

    let state = rootState(beforeDomain)
    const dispatched: Array<{ type?: string; payload?: Record<string, unknown> }> = []
    const api = {
      getState: () => state,
      dispatch: (action: unknown) => {
        dispatched.push(action as { type?: string; payload?: Record<string, unknown> })
        return action
      },
    }
    const invoke = intelligenceMiddleware(api as never)((action: unknown) => {
      state = rootState(afterDomain)
      return action
    })

    invoke({ type: 'social/replaceRealityDomain', payload: afterDomain })

    const broadcast = dispatched.find((action) => action.type === 'game/addTvEvent')
    expect(broadcast?.payload?.text).toMatch(/^HOUSE EXPOSED/)
    expect(broadcast?.payload?.meta).toMatchObject({
      forceOnTv: true,
      broadcastLevel: 'major',
      allianceExposure: true,
    })
    expect(dispatched.some((action) => action.type === 'social/recordIntelligenceDelivery')).toBe(
      true
    )
  })

  it('does not broadcast a private alliance fact', () => {
    const beforeDomain = createInitialRealityDomainState()
    const afterDomain = createInitialRealityDomainState()
    addRealityFact(afterDomain, {
      id: 'private-pact',
      propositionType: 'SECRET_ALLIANCE',
      subjectIds: ['ava', 'lia'],
      value: true,
      day: 5,
      phase: 'social_1',
      visibility: 'PAIR_ONLY',
      participantIds: ['ava', 'lia'],
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'private-event',
    })

    let state = rootState(beforeDomain)
    const dispatched: Array<{ type?: string }> = []
    const api = {
      getState: () => state,
      dispatch: (action: unknown) => {
        dispatched.push(action as { type?: string })
        return action
      },
    }
    const invoke = intelligenceMiddleware(api as never)((action: unknown) => {
      state = rootState(afterDomain)
      return action
    })

    invoke({ type: 'social/commitRealityOutcome', payload: {} })

    expect(dispatched.some((action) => action.type === 'game/addTvEvent')).toBe(false)
  })
})
