import { describe, expect, it } from 'vitest'
import {
  createRealityNemesisObjective,
  createInitialRealityDomainState,
  createRelationshipBoundary,
  getActiveRealityNemesis,
  recordGroundedJealousy,
  planRelationshipStoryBeat,
  recordRealityCeremonyOutcome,
  resolveRelationshipStoryResponse,
  signalRealityRomance,
  startAutonomousNemesisIfReady,
  upsertRealitySecret,
  addRealityFact,
} from '../reality'

describe('persistent relationship autonomy', () => {
  it('turns an explicit romantic refusal into a durable boundary', () => {
    const domain = createInitialRealityDomainState()
    domain.relationships.rae = {
      player: {
        ...domain.relationships.rae?.player,
        fromId: 'rae',
        toId: 'player',
        attraction: 52,
        warmth: 30,
        trust: 18,
        loyalty: 0,
        respect: 0,
        intimacy: 12,
        gratitude: 0,
        resentment: 0,
        fear: 0,
        envy: 0,
        suspicion: 0,
        strategicValue: 0,
        perceivedThreat: 0,
        reliability: 0,
        familiarity: 16,
        publicCloseness: 0,
        secretCloseness: 0,
        trend: 0,
        positiveAnchorEventIds: [],
        negativeAnchorEventIds: [],
        unresolvedGrievanceIds: [],
        activePromiseIds: [],
        activeDebtIds: [],
        perceivedLabel: 'FRIENDLY',
        publicLabel: 'ACQUAINTANCE',
        labelConfidence: 0.4,
      },
    }

    expect(planRelationshipStoryBeat(domain, { ownerId: 'rae', targetId: 'player', at: { day: 2, phase: 'social_1' } })?.intent).toBe('EXPLORE_ROMANCE')
    resolveRelationshipStoryResponse(domain, {
      ownerId: 'rae',
      targetId: 'player',
      intent: 'EXPLORE_ROMANCE',
      responseType: 'negative',
      eventId: 'conversation-1',
      at: { day: 2, phase: 'social_1' },
    })

    expect(planRelationshipStoryBeat(domain, { ownerId: 'rae', targetId: 'player', at: { day: 9, phase: 'social_1' } })?.intent).not.toBe('EXPLORE_ROMANCE')
    expect(Object.values(domain.relationshipAutonomy.boundaries)[0]?.category).toBe('NO_ROMANTIC_PURSUIT')
    expect(Object.values(domain.threads)[0]?.type).toBe('RELATIONSHIP_EXPLORE_ROMANCE')
  })

  it('does not let a contact boundary erase a strategic conflict', () => {
    const domain = createInitialRealityDomainState()
    createRelationshipBoundary(domain, {
      ownerId: 'player',
      targetId: 'nemesis',
      category: 'MINIMIZE_CONTACT',
      sourceEventId: 'player-boundary',
      at: { day: 3, phase: 'social_2' },
    })
    expect(domain.relationshipAutonomy.boundaries).toHaveProperty(
      'relationship-boundary:player:nemesis:MINIMIZE_CONTACT'
    )
  })

  it('lets one AI autonomously choose a Nemesis from the evolving game state', () => {
    const domain = createInitialRealityDomainState()
    domain.publicPerception.player = {
      competitionRespect: 60,
      strategicRespect: 48,
      likability: 0,
      controversy: 0,
      authenticity: 0,
      entertainment: 0,
      underdog: 0,
      loyalty: 0,
      fatigue: 0,
      sourceEventIds: [],
    }
    const objective = startAutonomousNemesisIfReady(domain, {
      targetId: 'player',
      candidateIds: ['rae', 'ivy'],
      seed: 17,
      at: { day: 3, phase: 'social_1' },
      humanHasPower: true,
    })

    expect(objective?.targetId).toBe('player')
    expect(['rae', 'ivy']).toContain(objective?.ownerId)
    expect(startAutonomousNemesisIfReady(domain, {
      targetId: 'player',
      candidateIds: ['rae', 'ivy'],
      seed: 17,
      at: { day: 5, phase: 'social_1' },
    })).toBeNull()
  })

  it('keeps the objective through a contact boundary and reconciles it only when the player saves that Nemesis with Safety', () => {
    const domain = createInitialRealityDomainState()
    createRealityNemesisObjective(domain, {
      ownerId: 'rae',
      targetId: 'player',
      sourceEventId: 'conflict-1',
      at: { day: 3, phase: 'social_1' },
    })
    createRelationshipBoundary(domain, {
      ownerId: 'player',
      targetId: 'rae',
      category: 'MINIMIZE_CONTACT',
      sourceEventId: 'boundary-1',
      at: { day: 3, phase: 'social_2' },
    })
    expect(getActiveRealityNemesis(domain, 'rae', 'player')).not.toBeNull()
    expect(planRelationshipStoryBeat(domain, { ownerId: 'rae', targetId: 'player', at: { day: 4, phase: 'social_1' } })).toBeNull()

    recordRealityCeremonyOutcome(domain, {
      kind: 'SAFETY_USED',
      day: 4,
      phase: 'pos_ceremony_results',
      actorId: 'player',
      targetIds: ['rae'],
      witnessIds: ['player', 'rae'],
      publicEligible: true,
    })

    expect(getActiveRealityNemesis(domain, 'rae', 'player')).toBeNull()
    expect(Object.values(domain.relationshipAutonomy.nemeses)[0]?.status).toBe('RECONCILED')
  })

  it('creates jealousy only for a bonded third party who actually witnessed the new romantic signal', () => {
    const domain = createInitialRealityDomainState()
    signalRealityRomance(domain, {
      actorId: 'ivy',
      targetId: 'sam',
      at: { day: 2, phase: 'social_1' },
      acceptedByTarget: true,
      settings: { enabled: true },
    })
    signalRealityRomance(domain, {
      actorId: 'sam',
      targetId: 'ivy',
      at: { day: 2, phase: 'social_2' },
      acceptedByTarget: true,
      settings: { enabled: true },
    })
    recordGroundedJealousy(domain, {
      actorId: 'sam',
      targetId: 'player',
      eventId: 'witnessed-flirt',
      at: { day: 3, phase: 'social_1' },
      witnessIds: ['ivy'],
      publicEligible: false,
    })

    expect(Object.values(domain.threads).some((thread) => thread.type === 'JEALOUSY')).toBe(true)
  })

  it('creates a scandal only when a causal secret is leaked or exposed', () => {
    const domain = createInitialRealityDomainState()
    addRealityFact(domain, {
      id: 'fact:secret-romance',
      propositionType: 'SECRET_ROMANCE',
      subjectIds: ['rae', 'ivy'],
      value: true,
      day: 4,
      phase: 'social_2',
      visibility: 'PAIR_ONLY',
      participantIds: ['rae', 'ivy'],
      witnessIds: ['sam'],
      viewerVisible: false,
      publicVisible: false,
      juryVisible: false,
      sourceEventId: 'private-romance',
    })
    upsertRealitySecret(domain, {
      id: 'secret:rae-ivy',
      kind: 'ROMANCE',
      truthFactId: 'fact:secret-romance',
      ownerIds: ['rae', 'ivy'],
      knowerIds: ['rae', 'ivy', 'sam'],
      suspectedByIds: [],
      exposure: 0,
      createdAt: { day: 4, phase: 'social_2' },
      status: 'SECRET',
    })
    expect(Object.values(domain.threads).some((thread) => thread.type === 'SCANDAL')).toBe(false)

    upsertRealitySecret(domain, {
      ...domain.secrets['secret:rae-ivy'],
      status: 'EXPOSED',
      exposure: 1,
    })
    expect(Object.values(domain.threads).some((thread) => thread.type === 'SCANDAL')).toBe(true)
  })
})
