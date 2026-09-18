import { describe, expect, it } from 'vitest'
import {
  addRealityFact,
  createInitialRealityDomainState,
  createRealityAlliance,
  getRealityAllianceKnowledgeView,
  learnRealityFact,
  leakRealityAlliance,
  recruitRealityAllianceMember,
} from '../reality'
import type { RealityMemory } from '../reality'

function hearsayMemory(
  ownerId: string,
  eventId: string,
  sourceId: string
): RealityMemory {
  return {
    id: `memory:${ownerId}:${eventId}`,
    ownerId,
    eventId,
    day: 3,
    phase: 'social_2',
    participantIds: [sourceId],
    sourceType: 'HEARSAY' as const,
    sourceChain: [sourceId],
    confidence: 0.68,
    importance: 0.7,
    surprise: 0.6,
    emotionalValence: -0.1,
    emotionalIntensity: 0.45,
    secrecy: 0.85,
    strategicRelevance: 0.9,
    visibility: 'PAIR_ONLY' as const,
    tags: ['intel', 'secret_alliance'],
    relatedPromiseIds: [],
    relatedSecretIds: [],
    recallStrength: 0.9,
  }
}

describe('Reality alliance identity and private knowledge', () => {
  it('names meaningful coalitions without turning every two-person deal into a branded alliance', () => {
    const state = createInitialRealityDomainState()
    const smallDeal = createRealityAlliance(state, {
      id: 'small-deal',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Mutual protection',
      at: { day: 1, phase: 'social_1' },
    })
    const finalTwo = createRealityAlliance(state, {
      id: 'final-two',
      founderIds: ['kai'],
      memberIds: ['nova'],
      purpose: 'Final two',
      at: { day: 1, phase: 'social_1' },
    })
    const coalition = createRealityAlliance(state, {
      id: 'coalition',
      founderIds: ['sol'],
      memberIds: ['mara', 'ivy'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })

    expect(smallDeal.name).toBeUndefined()
    expect(finalTwo.name).toBeTruthy()
    expect(coalition.name).toBeTruthy()
    expect(finalTwo.name).not.toBe(coalition.name)

    const finalTwoName = finalTwo.name
    const outer = recruitRealityAllianceMember(state, {
      allianceId: finalTwo.id,
      recruiterId: 'kai',
      targetId: 'mara',
      expandedAllianceId: 'final-two-outer',
      at: { day: 3, phase: 'social_1' },
    })
    expect(state.alliances['final-two'].name).toBe(finalTwoName)
    expect(outer.purpose).toBe('Wider coalition')
    expect(outer.name).toBeTruthy()
    expect(outer.name).not.toBe(finalTwoName)
  })

  it('binds witnessed alliance claims to the real pact without granting extra membership knowledge', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'quiet-pair',
      founderIds: ['lia'],
      memberIds: ['kai'],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    addRealityFact(state, {
      id: 'observed-pair',
      propositionType: 'SECRET_ALLIANCE',
      subjectIds: ['lia', 'kai'],
      value: true,
      day: 3,
      phase: 'social_2',
      visibility: 'PAIR_ONLY',
      participantIds: ['lia', 'kai'],
      witnessIds: [],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'observed-pair-event',
    })

    learnRealityFact(state, {
      ownerId: 'human',
      factId: 'observed-pair',
      memory: hearsayMemory('human', 'observed-pair-event', 'lia'),
      confidence: 0.68,
    })

    expect(state.facts['observed-pair'].objectId).toBe(alliance.id)
    expect(alliance.suspectedByIds).toContain('human')
    const view = getRealityAllianceKnowledgeView(state, alliance.id, 'human')
    expect(view.level).toBe('SUSPECTED')
    expect(view.knownMemberIds.sort()).toEqual(['kai', 'lia'])
    expect(view.fullMembershipKnown).toBe(false)
    expect(view.cohesion).toBeUndefined()
    expect(view.status).toBeUndefined()
  })

  it('reveals alliance membership incrementally and only exposes the full roster after a public leak threshold', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'hidden-four',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai', 'nova'],
      purpose: 'Control the vote',
      at: { day: 2, phase: 'social_1' },
      secrecy: 0.75,
    })

    leakRealityAlliance(
      state,
      alliance.id,
      'ava',
      ['human', 'mara'],
      { day: 4, phase: 'social_1' }
    )

    const firstRead = getRealityAllianceKnowledgeView(state, alliance.id, 'human')
    expect(firstRead.level).toBe('SUSPECTED')
    expect(firstRead.knownMemberIds).toHaveLength(2)
    expect(firstRead.knownMemberIds).toContain('ava')
    expect(firstRead.fullMembershipKnown).toBe(false)
    expect(
      Object.values(state.facts).some(
        (fact) => fact.propositionType === 'ALLIANCE_EXPOSED' && fact.objectId === alliance.id
      )
    ).toBe(false)

    leakRealityAlliance(
      state,
      alliance.id,
      'ava',
      ['human', 'mara'],
      { day: 5, phase: 'social_1' }
    )

    const publicRead = getRealityAllianceKnowledgeView(state, alliance.id, 'human')
    expect(publicRead.level).toBe('PUBLIC')
    expect(publicRead.fullMembershipKnown).toBe(true)
    expect(publicRead.knownMemberIds.sort()).toEqual(['ava', 'kai', 'lia', 'nova'])
    expect(publicRead.displayName).toBe(alliance.name)
    expect(
      Object.values(state.events).some(
        (event) => event.type === 'ALLIANCE_PUBLICLY_EXPOSED' && event.publicEligible
      )
    ).toBe(true)
  })

  it('gives members full truth while keeping infiltrator intent private from other members', () => {
    const state = createInitialRealityDomainState()
    const alliance = createRealityAlliance(state, {
      id: 'member-view',
      founderIds: ['human'],
      memberIds: ['lia', 'kai'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.infiltratorIds = ['kai']
    alliance.genuine = false

    const view = getRealityAllianceKnowledgeView(state, alliance.id, 'human')
    expect(view.level).toBe('MEMBER')
    expect(view.knownMemberIds.sort()).toEqual(['human', 'kai', 'lia'])
    expect(view.status).toBe(alliance.status)
    expect(view.cohesion).toBe(alliance.cohesion)
    expect(view).not.toHaveProperty('infiltratorIds')
  })
})
