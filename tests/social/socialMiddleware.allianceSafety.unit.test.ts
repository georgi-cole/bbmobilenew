import { describe, expect, it } from 'vitest'
import { createInitialRealityDomainState } from '../../src/social/reality'
import { socialMiddleware } from '../../src/social/socialMiddleware'

describe('socialMiddleware alliance Safety consequences', () => {
  it('routes an abandoned ally through Reality once and keeps the legacy fallout compatibility-only', () => {
    const state = {
      game: {
        gameId: 'safety-alliance-test',
        seed: 7,
        phase: 'pos_ceremony_results',
        week: 4,
        mode: 'classic',
        publicModeEnabled: false,
        lohId: 'loh',
        prevHohId: null,
        posWinnerId: 'holder',
        povSavedId: null,
        nomineeIds: ['ally'],
        awaitingPovDecision: true,
        awaitingPovSaveTarget: false,
        dramaSocialMode: true,
        players: [
          { id: 'loh', name: 'LOH', status: 'loh' },
          { id: 'holder', name: 'Holder', status: 'pos' },
          { id: 'ally', name: 'Ally', status: 'nominated' },
        ],
      },
      social: {
        commitments: [],
        incomingInteractions: [],
        scheduledIncomingInteractions: [],
        relationships: {
          holder: {
            ally: { affinity: 65, tags: ['alliance'] },
          },
          ally: {
            holder: { affinity: 65, tags: ['alliance'] },
          },
        },
        reality: createInitialRealityDomainState(),
      },
    }
    const dispatched: Array<{ type?: string; payload?: Record<string, unknown> }> = []
    const api = {
      getState: () => state,
      dispatch: (action: unknown) => {
        dispatched.push(action as { type?: string; payload?: Record<string, unknown> })
        return action
      },
    }

    const invoke = socialMiddleware(api as never)((action: unknown) => action)
    invoke({ type: 'game/submitPovDecision', payload: false })

    const abandonment = dispatched.find(
      (action) => action.type === 'social/recordRealityAllianceBetrayal'
    )
    expect(abandonment?.payload).toMatchObject({
      actorId: 'holder',
      targetId: 'ally',
      kind: 'SAFETY_ABANDON',
      day: 4,
      phase: 'pos_ceremony_results',
    })

    const legacyFallout = dispatched.find(
      (action) =>
        action.type === 'social/updateRelationship' &&
        action.payload?.source === 'ally' &&
        action.payload?.target === 'holder'
    )
    expect(legacyFallout?.payload).toMatchObject({
      delta: -10,
      skipRealityProjection: true,
    })
  })
})
