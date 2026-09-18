import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import socialReducer, {
  recordRealityActualVote,
  replaceRealityDomain,
  updateRelationship,
} from '../socialSlice'
import { migrateSocialState } from '../socialStateMigration'
import {
  addRealityFact,
  applyRealityRelationshipChange,
  createDirectedRelationship,
  createInitialRealityDomainState,
  createRealityAlliance,
  deriveRelationshipLabel,
  learnRealityFact,
  overdueRealityPromises,
  projectRealityAffinity,
  retrieveMemories,
  upsertRealityPromise,
} from '../reality'
import type { RealityFact, RealityMemory, RealityPromise } from '../reality'
import { SOCIAL_INITIAL_STATE } from '../constants'

function memory(overrides: Partial<RealityMemory> = {}): RealityMemory {
  return {
    id: 'memory-1',
    ownerId: 'lia',
    eventId: 'event-1',
    day: 2,
    phase: 'social_1',
    participantIds: ['human', 'kai'],
    sourceType: 'HEARSAY',
    sourceChain: ['human'],
    confidence: 0.58,
    importance: 0.7,
    surprise: 0.4,
    emotionalValence: -0.2,
    emotionalIntensity: 0.5,
    secrecy: 0.8,
    strategicRelevance: 0.9,
    visibility: 'PRIVATE',
    tags: ['alliance_claim'],
    relatedPromiseIds: [],
    relatedSecretIds: [],
    recallStrength: 1,
    ...overrides,
  }
}

describe('Reality domain migration and directed relationships', () => {
  it('clears the complete social simulation when a new game is started', () => {
    const store = configureStore({ reducer: { social: socialReducer } })
    store.dispatch(updateRelationship({ source: 'human', target: 'lia', delta: 24 }))

    expect(store.getState().social.reality.relationships.human.lia).toBeDefined()
    store.dispatch({ type: 'game/resetGame' })

    expect(store.getState().social.relationships).toEqual({})
    expect(store.getState().social.reality.relationships).toEqual({})
    expect(store.getState().social.reality.events).toEqual([])
    expect(store.getState().social.actionHistory).toEqual([])
  })

  it('projects legacy affinity into one directed edge without inventing the reverse edge', () => {
    const migrated = migrateSocialState({
      ...SOCIAL_INITIAL_STATE,
      relationships: {
        human: { lia: { affinity: 40, tags: ['alliance'] } },
      },
    })

    expect(migrated.reality.relationships.human.lia.fromId).toBe('human')
    expect(migrated.reality.relationships.human.lia.trust).toBeGreaterThan(0)
    expect(migrated.reality.relationships.lia?.human).toBeUndefined()
  })

  it('rebuilds overlap metadata when hydrating existing alliances', () => {
    const reality = createInitialRealityDomainState()
    createRealityAlliance(reality, {
      id: 'alliance-core',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Inner pact',
      at: { day: 2, phase: 'social_1' },
    })
    createRealityAlliance(reality, {
      id: 'alliance-outer',
      founderIds: ['ava', 'lia'],
      memberIds: ['kai'],
      purpose: 'Wider coalition',
      at: { day: 3, phase: 'social_1' },
    })

    reality.alliances['alliance-core'].overlapAllianceIds = []
    reality.alliances['alliance-outer'].overlapAllianceIds = []

    const migrated = migrateSocialState({
      ...SOCIAL_INITIAL_STATE,
      reality,
    })

    expect(migrated.reality.alliances['alliance-core'].overlapAllianceIds).toEqual([
      'alliance-outer',
    ])
    expect(migrated.reality.alliances['alliance-outer'].overlapAllianceIds).toEqual([
      'alliance-core',
    ])
  })

  it('preserves an established core member when alliance dynamics are rebuilt on migration', () => {
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'alliance-core-status',
      founderIds: ['human'],
      memberIds: ['lia'],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.memberCommitment.human = 0.5
    alliance.memberPerceivedStatus.human = 'CORE'
    alliance.leaderIds = ['human']

    const migrated = migrateSocialState({
      ...SOCIAL_INITIAL_STATE,
      reality,
    })

    expect(migrated.reality.alliances['alliance-core-status'].memberPerceivedStatus.human).toBe(
      'CORE'
    )
    expect(migrated.reality.alliances['alliance-core-status'].leaderIds).toContain('human')
  })

  it('re-projects vote-night alliance fractures into the visible relationship map immediately', () => {
    const store = configureStore({ reducer: { social: socialReducer } })
    const reality = createInitialRealityDomainState()
    applyRealityRelationshipChange(reality, {
      sourceId: 'human',
      targetId: 'lia',
      eventId: 'core-bond',
      day: 3,
      phase: 'social_1',
      anchor: 'positive',
      deltas: { warmth: 35, trust: 50, loyalty: 55 },
    })
    const alliance = createRealityAlliance(reality, {
      id: 'vote-fracture',
      founderIds: ['human', 'lia'],
      memberIds: [],
      purpose: 'Final two',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.status = 'ACTIVE'
    alliance.memberPerceivedStatus.human = 'CORE'
    alliance.memberPerceivedStatus.lia = 'CORE'
    alliance.memberCommitment.human = 0.7
    alliance.memberCommitment.lia = 0.7

    store.dispatch(replaceRealityDomain(reality))
    expect(store.getState().social.relationships.human.lia.tags).toContain('alliance')

    store.dispatch(
      recordRealityActualVote({
        actorId: 'human',
        targetId: 'lia',
        day: 5,
        phase: 'live_vote',
        eventId: 'vote:5:human',
      })
    )

    expect(store.getState().social.reality.alliances['vote-fracture'].status).toBe('FRACTURED')
    expect(store.getState().social.relationships.human.lia.tags).not.toContain('alliance')
  })

  it('does not project fractured or dormant formal pacts as active alliance tags', () => {
    for (const status of ['FRACTURED', 'DORMANT'] as const) {
      const store = configureStore({ reducer: { social: socialReducer } })
      const reality = createInitialRealityDomainState()
      applyRealityRelationshipChange(reality, {
        sourceId: 'human',
        targetId: 'lia',
        eventId: `bond-${status}`,
        day: 3,
        phase: 'social_1',
        anchor: 'positive',
        deltas: { warmth: 25, trust: 35, loyalty: 30 },
      })
      const alliance = createRealityAlliance(reality, {
        id: `inactive-${status.toLowerCase()}`,
        founderIds: ['human'],
        memberIds: ['lia'],
        purpose: 'Old pact',
        at: { day: 2, phase: 'social_1' },
      })
      alliance.status = status

      store.dispatch(replaceRealityDomain(reality))

      expect(store.getState().social.relationships.human.lia.tags).not.toContain('alliance')
    }
  })

  it('dual-writes legacy relationship outcomes into the Reality edge only', () => {
    const store = configureStore({ reducer: { social: socialReducer } })
    store.dispatch(updateRelationship({ source: 'human', target: 'lia', delta: 8 }))

    const reality = store.getState().social.reality
    expect(reality.relationships.human.lia.warmth).toBeGreaterThan(0)
    expect(projectRealityAffinity(reality.relationships.human.lia)).toBeGreaterThan(0)
    expect(reality.relationships.lia?.human).toBeUndefined()
  })

  it('can update compatibility affinity without replaying an already-recorded Reality consequence', () => {
    const store = configureStore({ reducer: { social: socialReducer } })
    store.dispatch(
      updateRelationship({
        source: 'human',
        target: 'lia',
        delta: -18,
        tags: ['betrayal'],
        actionSource: 'system',
        skipRealityProjection: true,
      })
    )

    const state = store.getState().social
    expect(state.relationships.human.lia.affinity).toBe(-18)
    expect(state.relationships.human.lia.tags).toContain('betrayal')
    expect(state.reality.relationships.human?.lia).toBeUndefined()
  })

  it('requires supporting anchor events before deriving major relationship labels', () => {
    const edge = createDirectedRelationship('human', 'lia')
    edge.loyalty = 80
    edge.trust = 70
    edge.strategicValue = 70
    expect(deriveRelationshipLabel(edge)).not.toBe('CORE_ALLY')

    edge.positiveAnchorEventIds.push('saved-at-ceremony', 'kept-vote-promise')
    expect(deriveRelationshipLabel(edge)).toBe('CORE_ALLY')
  })

  it('does not erase a severe conflict with one small positive interaction', () => {
    const state = createInitialRealityDomainState()
    applyRealityRelationshipChange(state, {
      sourceId: 'lia',
      targetId: 'kai',
      eventId: 'betrayal',
      day: 4,
      phase: 'eviction_results',
      anchor: 'negative',
      deltas: { trust: -70, resentment: 85, suspicion: 70, perceivedThreat: 55 },
    })
    expect(state.relationships.lia.kai.perceivedLabel).toBe('ENEMY')

    applyRealityRelationshipChange(state, {
      sourceId: 'lia',
      targetId: 'kai',
      eventId: 'quick-apology',
      day: 4,
      phase: 'night',
      anchor: 'positive',
      deltas: { warmth: 5, trust: 5, resentment: -8 },
    })
    expect(state.relationships.lia.kai.perceivedLabel).toBe('ENEMY')
  })
})

describe('Reality epistemic integrity and memory', () => {
  const fact: RealityFact = {
    id: 'fact-secret-alliance',
    propositionType: 'ALLIANCE_EXISTS',
    subjectIds: ['human', 'kai'],
    value: true,
    day: 2,
    phase: 'social_1',
    visibility: 'PAIR_ONLY',
    participantIds: ['human', 'kai'],
    witnessIds: [],
    viewerVisible: true,
    publicVisible: false,
    juryVisible: false,
    sourceEventId: 'event-1',
  }

  it('blocks an unentitled contestant from learning a hidden fact as direct knowledge', () => {
    const state = createInitialRealityDomainState()
    addRealityFact(state, fact)
    const learned = learnRealityFact(state, {
      ownerId: 'lia',
      factId: fact.id,
      memory: memory({ sourceType: 'DIRECT', sourceChain: [] }),
    })
    expect(learned).toBeNull()
    expect(state.beliefsByOwner.lia).toBeUndefined()
  })

  it('preserves hearsay source and confidence without turning it into certainty', () => {
    const state = createInitialRealityDomainState()
    addRealityFact(state, fact)
    const learned = learnRealityFact(state, {
      ownerId: 'lia',
      factId: fact.id,
      memory: memory(),
    })

    expect(learned).toMatchObject({
      ownerId: 'lia',
      confidence: 0.58,
      sourceChain: ['human'],
    })
    expect(retrieveMemories(state, 'lia', { day: 2, tags: ['alliance_claim'] })[0].id).toBe(
      'memory-1'
    )
  })
})

describe('Reality promise lifecycle', () => {
  it('finds active promises only after their exact day and phase deadline', () => {
    const state = createInitialRealityDomainState()
    const promise: RealityPromise = {
      id: 'promise-1',
      kind: 'VOTE_TO_KEEP',
      promisorId: 'human',
      beneficiaryIds: ['lia'],
      witnessIds: ['lia'],
      createdAt: { day: 3, phase: 'social_2' },
      deadline: { day: 3, phase: 'live_vote' },
      stakes: 0.8,
      scope: { targetId: 'lia' },
      status: 'ACTIVE',
    }
    upsertRealityPromise(state, promise)

    expect(overdueRealityPromises(state, { day: 3, phase: 'pos_ceremony' })).toHaveLength(0)
    expect(overdueRealityPromises(state, { day: 3, phase: 'eviction_results' })).toEqual([promise])
  })
})
