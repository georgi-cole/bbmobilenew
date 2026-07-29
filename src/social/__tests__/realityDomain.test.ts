import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
import socialReducer, { updateRelationship } from '../socialSlice'
import { migrateSocialState } from '../socialStateMigration'
import {
  addRealityFact,
  applyRealityRelationshipChange,
  createDirectedRelationship,
  createInitialRealityDomainState,
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

  it('dual-writes legacy relationship outcomes into the Reality edge only', () => {
    const store = configureStore({ reducer: { social: socialReducer } })
    store.dispatch(updateRelationship({ source: 'human', target: 'lia', delta: 8 }))

    const reality = store.getState().social.reality
    expect(reality.relationships.human.lia.warmth).toBeGreaterThan(0)
    expect(projectRealityAffinity(reality.relationships.human.lia)).toBeGreaterThan(0)
    expect(reality.relationships.lia?.human).toBeUndefined()
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
