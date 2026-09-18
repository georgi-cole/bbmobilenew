import { describe, expect, it } from 'vitest'
import { createInitialRealitySimulationState } from '../realitySimulation'
import {
  REALITY_ACTION_BY_ID,
  REALITY_ACTION_CONTRACTS,
  createDirectedRelationship,
  createInitialRealityDomainState,
  createRealityAlliance,
  evaluateRealityCandidate,
  resolveRealityTargetResponse,
  holdRealityAllianceMeeting,
  resolvePendingHumanRealityInteraction,
  runRealityOpportunity,
  validateRealityActionContract,
} from '../reality'
import type { RealityActorSnapshot, RealityContext, RealityOpportunity } from '../reality'

const context: RealityContext = {
  day: 3,
  phase: 'social_1',
  gameMode: 'CLASSIC',
  socialIntensity: 'NORMAL',
  audienceMode: 'OFF',
  feedPerspective: 'PLAYER_LIMITED',
  activeActorIds: ['ava', 'lia', 'human'],
  rolesByActor: {
    ava: ['active'],
    lia: ['active'],
    human: ['active'],
  },
  atRiskActorIds: [],
  powerHolderIds: [],
}

const actors: Record<string, RealityActorSnapshot> = {
  ava: {
    id: 'ava',
    isHuman: false,
    active: true,
    roles: ['active'],
    resources: { energy: 20, influence: 1_000, info: 1_000 },
  },
  lia: {
    id: 'lia',
    isHuman: false,
    active: true,
    roles: ['active'],
    resources: { energy: 20, influence: 1_000, info: 1_000 },
  },
  human: {
    id: 'human',
    isHuman: true,
    active: true,
    roles: ['active'],
    resources: { energy: 20, influence: 1_000, info: 1_000 },
  },
}

function opportunity(actionId = 'compliment'): RealityOpportunity {
  const action = REALITY_ACTION_BY_ID.get(actionId)
  if (!action) throw new Error(`Missing ${actionId}`)
  return {
    actorId: 'ava',
    direction: 'AI_TO_AI',
    context,
    actors,
    candidates: [{ action, targetIds: ['lia'] }],
  }
}

describe('Reality action contract', () => {
  it('validates every bundled action definition', () => {
    const invalid = REALITY_ACTION_CONTRACTS.flatMap((action) =>
      validateRealityActionContract(action).map((error) => `${action.id}: ${error}`)
    )
    expect(invalid).toEqual([])
  })

  it('hard-blocks invalid phase, role, resource, and hidden-knowledge candidates', () => {
    const action = REALITY_ACTION_BY_ID.get('expose_secret')
    if (!action) throw new Error('Missing expose_secret')
    const result = evaluateRealityCandidate({
      action,
      actor: { ...actors.ava, resources: { energy: 0, influence: 0, info: 0 } },
      targetIds: ['lia'],
      actors,
      context: { ...context, phase: 'loh_comp', socialIntensity: 'REALITY' },
      reality: createInitialRealityDomainState(),
      direction: 'AI_TO_AI',
    })

    expect(result.eligible).toBe(false)
    expect(result.blockedReasons).toContain('knowledge_required')
    expect(result.blockedReasons.some((reason) => reason.startsWith('insufficient_'))).toBe(true)
  })

  it('uses the target-to-actor edge for an independent response', () => {
    const reality = createInitialRealityDomainState()
    reality.relationships.ava = {
      lia: createDirectedRelationship('ava', 'lia', 80),
    }
    reality.relationships.lia = {
      ava: createDirectedRelationship('lia', 'ava', -80),
    }
    const response = resolveRealityTargetResponse({
      action: REALITY_ACTION_BY_ID.get('proposeAlliance')!,
      actorId: 'ava',
      targetId: 'lia',
      reality,
      draw: 0.5,
    })
    expect(response.accepted).toBe(false)
    expect(['REJECT', 'COUNTER', 'QUESTION', 'LIE']).toContain(response.kind)
  })

  it('allows human social actions despite a same-phase legacy cooldown', () => {
    const reality = createInitialRealityDomainState()
    reality.cooldowns.human = {
      compliment: { day: context.day, phase: context.phase },
    }
    const action = REALITY_ACTION_BY_ID.get('compliment')!
    const result = evaluateRealityCandidate({
      action,
      actor: actors.human,
      targetIds: ['lia'],
      actors,
      context,
      reality,
      direction: 'HUMAN_TO_AI',
    })

    expect(result.eligible).toBe(true)
    expect(result.blockedReasons).not.toContain('cooldown_active')
  })

  it('does not let a fractured formal pact satisfy active-alliance action gates', () => {
    const reality = createInitialRealityDomainState()
    const alliance = createRealityAlliance(reality, {
      id: 'fractured-action-gate',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Former final two',
      at: { day: 2, phase: 'social_1' },
    })
    alliance.status = 'FRACTURED'

    const result = evaluateRealityCandidate({
      action: REALITY_ACTION_BY_ID.get('betray')!,
      actor: actors.ava,
      targetIds: ['lia'],
      actors,
      context: { ...context, socialIntensity: 'REALITY' },
      reality,
      direction: 'AI_TO_AI',
    })

    expect(result.eligible).toBe(false)
    expect(result.blockedReasons).toContain('relationship_required')
  })

  it('uses exact phase-scoped repetition chances when resolving a target', () => {
    const reality = createInitialRealityDomainState()
    const action = REALITY_ACTION_BY_ID.get('compliment')!
    expect(
      resolveRealityTargetResponse({
        action,
        actorId: 'human',
        targetId: 'lia',
        reality,
        draw: 0.49,
        acceptanceChanceOverride: 0.5,
      }).accepted
    ).toBe(true)
    expect(
      resolveRealityTargetResponse({
        action,
        actorId: 'human',
        targetId: 'lia',
        reality,
        draw: 0.5,
        acceptanceChanceOverride: 0.5,
      }).accepted
    ).toBe(false)
  })
})

describe('Reality causal orchestration', () => {
  it('resolves AI-to-AI through selection, target response, event, memory, and directed effects', () => {
    const result = runRealityOpportunity({
      domain: createInitialRealityDomainState(),
      simulation: createInitialRealitySimulationState(123),
      opportunity: opportunity(),
    })

    expect(result.selectedActionId).toBe('compliment')
    expect(result.response).not.toBeNull()
    expect(result.event?.interactionId).toBe(result.interaction?.id)
    expect(result.domain.memoriesByOwner.ava).toHaveLength(1)
    expect(result.domain.memoriesByOwner.lia).toHaveLength(1)
    expect(result.domain.relationships.ava.lia).toBeDefined()
    expect(result.domain.relationships.lia.ava).toBeDefined()
    expect(result.simulation.trace.map((entry) => entry.stage)).toEqual([
      'selected',
      'response',
      'outcome',
    ])
  })

  it('routes AI-to-human through one pending interaction without inventing a response', () => {
    const pendingOpportunity: RealityOpportunity = {
      ...opportunity(),
      direction: 'AI_TO_HUMAN',
      candidates: [
        {
          action: REALITY_ACTION_BY_ID.get('compliment')!,
          targetIds: ['human'],
        },
      ],
    }
    const result = runRealityOpportunity({
      domain: createInitialRealityDomainState(),
      simulation: createInitialRealitySimulationState(123),
      opportunity: pendingOpportunity,
    })

    expect(result.interaction?.status).toBe('AWAITING_HUMAN')
    expect(result.response).toBeNull()
    expect(result.event).toBeNull()
    expect(result.simulation.rng?.cursor).toBe(1)
  })

  it('replays identically from the same mid-season domain and RNG cursor', () => {
    const first = runRealityOpportunity({
      domain: createInitialRealityDomainState(),
      simulation: createInitialRealitySimulationState(998),
      opportunity: opportunity(),
    })
    const resumedDomain = structuredClone(first.domain)
    const resumedSimulation = structuredClone(first.simulation)
    const secondContext = { ...context, phase: 'social_2' }
    const nextOpportunity = { ...opportunity('whisper'), context: secondContext }

    const left = runRealityOpportunity({
      domain: resumedDomain,
      simulation: resumedSimulation,
      opportunity: nextOpportunity,
    })
    const right = runRealityOpportunity({
      domain: structuredClone(first.domain),
      simulation: structuredClone(first.simulation),
      opportunity: nextOpportunity,
    })

    expect(left.selectedActionId).toBe(right.selectedActionId)
    expect(left.response).toEqual(right.response)
    expect(left.event).toEqual(right.event)
    expect(left.simulation.rng).toEqual(right.simulation.rng)
  })

  it('consumes no RNG when every candidate is hard-blocked', () => {
    const action = REALITY_ACTION_BY_ID.get('compliment')!
    const result = runRealityOpportunity({
      domain: createInitialRealityDomainState(),
      simulation: createInitialRealitySimulationState(55),
      opportunity: {
        ...opportunity(),
        actors: {
          ...actors,
          ava: {
            ...actors.ava,
            resources: { energy: 0, influence: 0, info: 0 },
          },
        },
        candidates: [{ action, targetIds: ['lia'] }],
      },
    })

    expect(result.selectedActionId).toBeNull()
    expect(result.simulation.rng?.cursor).toBe(0)
    expect(result.simulation.trace.at(-1)?.stage).toBe('blocked')
  })

  it('resolves group members independently and supports self-directed actions', () => {
    const groupActors: Record<string, RealityActorSnapshot> = {
      ...actors,
      kai: {
        id: 'kai',
        isHuman: false,
        active: true,
        roles: ['active'],
        resources: { energy: 20, influence: 1_000, info: 1_000 },
      },
    }
    const groupResult = runRealityOpportunity({
      domain: createInitialRealityDomainState(),
      simulation: createInitialRealitySimulationState(17),
      opportunity: {
        actorId: 'ava',
        direction: 'GROUP',
        context: {
          ...context,
          socialIntensity: 'REALITY',
          activeActorIds: ['ava', 'lia', 'kai'],
          rolesByActor: { ava: ['active'], lia: ['active'], kai: ['active'] },
        },
        actors: groupActors,
        candidates: [
          {
            action: REALITY_ACTION_BY_ID.get('group_chat')!,
            targetIds: ['lia', 'kai'],
          },
        ],
      },
    })

    expect(groupResult.simulation.trace.filter((entry) => entry.stage === 'response')).toHaveLength(
      2
    )
    expect(groupResult.domain.relationships.ava.lia).toBeDefined()
    expect(groupResult.domain.relationships.ava.kai).toBeDefined()

    const selfResult = runRealityOpportunity({
      domain: createInitialRealityDomainState(),
      simulation: createInitialRealitySimulationState(17),
      opportunity: {
        actorId: 'ava',
        direction: 'SELF',
        context,
        actors,
        candidates: [{ action: REALITY_ACTION_BY_ID.get('observe')!, targetIds: [] }],
      },
    })
    expect(selfResult.event?.outcome).toBe('SUCCESS')
    expect(selfResult.domain.relationships.ava?.ava).toBeUndefined()
    expect(selfResult.simulation.rng?.cursor).toBe(1)
  })

  it('turns an explicit human acceptance into a live operational alliance', () => {
    const pending = runRealityOpportunity({
      domain: createInitialRealityDomainState(),
      simulation: createInitialRealitySimulationState(23),
      opportunity: {
        ...opportunity('proposeAlliance'),
        direction: 'AI_TO_HUMAN',
        candidates: [
          {
            action: REALITY_ACTION_BY_ID.get('proposeAlliance')!,
            targetIds: ['human'],
          },
        ],
      },
    })
    const resolved = resolvePendingHumanRealityInteraction({
      domain: pending.domain,
      interactionId: pending.interaction!.id,
      humanId: 'human',
      responseType: 'accept',
      day: 3,
      phase: 'social_1',
    })

    expect(resolved.event?.outcome).toBe('SUCCESS')
    expect(Object.values(resolved.domain.alliances)).toHaveLength(1)
    expect(Object.values(resolved.domain.alliances)[0]).toMatchObject({
      memberIds: expect.arrayContaining(['ava', 'human']),
      status: 'ACTIVE',
    })
    expect(resolved.domain.interactions[pending.interaction!.id].status).toBe('RESOLVED')
  })

  it('turns an accepted vote rally into the shared alliance target plan', () => {
    const domain = createInitialRealityDomainState()
    const alliance = createRealityAlliance(domain, {
      id: 'vote-pact',
      founderIds: ['ava'],
      memberIds: ['human'],
      purpose: 'Control the vote',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(domain, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'human'],
      targetIds: [],
      planIds: ['stay-flexible'],
      at: { day: 2, phase: 'social_2' },
    })

    const targetActors: Record<string, RealityActorSnapshot> = {
      ...actors,
      nova: {
        id: 'nova',
        isHuman: false,
        active: true,
        roles: ['nominated'],
        resources: { energy: 20, influence: 1_000, info: 1_000 },
      },
    }
    const pending = runRealityOpportunity({
      domain,
      simulation: createInitialRealitySimulationState(43),
      opportunity: {
        actorId: 'ava',
        direction: 'AI_TO_HUMAN',
        context: {
          ...context,
          phase: 'social_2',
          socialIntensity: 'REALITY',
          activeActorIds: ['ava', 'lia', 'human', 'nova'],
          rolesByActor: {
            ...context.rolesByActor,
            nova: ['nominated'],
          },
          atRiskActorIds: ['nova'],
        },
        actors: targetActors,
        candidates: [
          {
            action: REALITY_ACTION_BY_ID.get('rally_votes_against')!,
            targetIds: ['human'],
            subjectId: 'nova',
          },
        ],
      },
    })

    expect(pending.interaction?.status).toBe('AWAITING_HUMAN')
    const resolved = resolvePendingHumanRealityInteraction({
      domain: pending.domain,
      interactionId: pending.interaction!.id,
      humanId: 'human',
      responseType: 'accept',
      day: 3,
      phase: 'social_2',
      subjectId: 'nova',
    })

    expect(resolved.event?.outcome).toBe('SUCCESS')
    expect(resolved.domain.alliances['vote-pact'].currentTargetIds).toEqual(['nova'])
    expect(resolved.domain.alliances['vote-pact'].memberPlanBeliefs.ava).toEqual(['target:nova'])
    expect(resolved.domain.alliances['vote-pact'].memberPlanBeliefs.human).toEqual(['target:nova'])
  })

  it('lets a disloyal AI member leak only partial alliance knowledge through a private whisper', () => {
    const domain = createInitialRealityDomainState()
    const alliance = createRealityAlliance(domain, {
      id: 'leaky-coalition',
      founderIds: ['ava'],
      memberIds: ['lia', 'kai'],
      purpose: 'Control the middle',
      at: { day: 2, phase: 'social_1' },
      secrecy: 0.75,
    })
    alliance.status = 'ACTIVE'
    alliance.infiltratorIds = ['ava']
    alliance.genuine = false
    alliance.memberCommitment.ava = 0.3

    const leakActors: Record<string, RealityActorSnapshot> = {
      ...actors,
      kai: {
        id: 'kai',
        isHuman: false,
        active: true,
        roles: ['active'],
        resources: { energy: 20, influence: 1_000, info: 1_000 },
      },
    }
    const pending = runRealityOpportunity({
      domain,
      simulation: createInitialRealitySimulationState(47),
      opportunity: {
        actorId: 'ava',
        direction: 'AI_TO_HUMAN',
        context: {
          ...context,
          socialIntensity: 'REALITY',
          activeActorIds: ['ava', 'lia', 'kai', 'human'],
          rolesByActor: {
            ...context.rolesByActor,
            kai: ['active'],
          },
        },
        actors: leakActors,
        candidates: [
          {
            action: REALITY_ACTION_BY_ID.get('whisper')!,
            targetIds: ['human'],
          },
        ],
      },
    })

    expect(pending.interaction?.status).toBe('AWAITING_HUMAN')
    const resolved = resolvePendingHumanRealityInteraction({
      domain: pending.domain,
      interactionId: pending.interaction!.id,
      humanId: 'human',
      responseType: 'accept',
      day: 3,
      phase: 'social_1',
    })

    expect(resolved.event?.outcome).toBe('SUCCESS')
    expect(resolved.domain.alliances['leaky-coalition'].secrecy).toBeLessThan(0.75)
    expect(resolved.domain.alliances['leaky-coalition'].suspectedByIds).toContain('human')
    const allianceBeliefs = Object.values(resolved.domain.beliefsByOwner.human ?? {}).filter(
      (belief) => belief.objectId === 'leaky-coalition'
    )
    expect(allianceBeliefs).toHaveLength(1)
    expect(allianceBeliefs[0].subjectIds).toHaveLength(2)
    expect(allianceBeliefs[0].subjectIds).toContain('ava')
    expect(allianceBeliefs[0].subjectIds).not.toContain('kai')
  })

  it('recruits an accepted target into a wider coalition instead of creating another pair', () => {
    const domain = createInitialRealityDomainState()
    const core = createRealityAlliance(domain, {
      id: 'alliance-core',
      founderIds: ['ava'],
      memberIds: ['lia'],
      purpose: 'Mutual protection',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(domain, {
      allianceId: core.id,
      attendeeIds: ['ava', 'lia'],
      targetIds: [],
      planIds: ['protect:core'],
      at: { day: 2, phase: 'social_2' },
    })

    const pending = runRealityOpportunity({
      domain,
      simulation: createInitialRealitySimulationState(29),
      opportunity: {
        ...opportunity('proposeAlliance'),
        direction: 'AI_TO_HUMAN',
        candidates: [
          {
            action: REALITY_ACTION_BY_ID.get('proposeAlliance')!,
            targetIds: ['human'],
          },
        ],
      },
    })
    const resolved = resolvePendingHumanRealityInteraction({
      domain: pending.domain,
      interactionId: pending.interaction!.id,
      humanId: 'human',
      responseType: 'accept',
      day: 3,
      phase: 'social_1',
    })

    const alliances = Object.values(resolved.domain.alliances)
    expect(alliances).toHaveLength(2)
    expect(resolved.domain.alliances['alliance-core'].memberIds).toEqual(['ava', 'lia'])

    const coalition = alliances.find((alliance) => alliance.id !== 'alliance-core')
    expect(coalition).toMatchObject({
      memberIds: ['ava', 'lia', 'human'],
      status: 'ACTIVE',
    })
    expect(coalition?.memberPerceivedStatus).toMatchObject({
      ava: 'CORE',
      lia: 'CORE',
      human: 'REGULAR',
    })
    expect(coalition?.overlapAllianceIds).toEqual(['alliance-core'])
    expect(resolved.domain.alliances['alliance-core'].overlapAllianceIds).toEqual([coalition?.id])
  })

  it('routes the live Betray Ally action into the formal alliance lifecycle', () => {
    const domain = createInitialRealityDomainState()
    const alliance = createRealityAlliance(domain, {
      id: 'betrayal-pact',
      founderIds: ['ava', 'lia'],
      memberIds: [],
      purpose: 'Final two',
      at: { day: 2, phase: 'social_1' },
    })
    holdRealityAllianceMeeting(domain, {
      allianceId: alliance.id,
      attendeeIds: ['ava', 'lia'],
      targetIds: ['human'],
      planIds: ['vote:human'],
      at: { day: 2, phase: 'social_2' },
    })

    const result = runRealityOpportunity({
      domain,
      simulation: createInitialRealitySimulationState(37),
      opportunity: {
        ...opportunity('betray'),
        context: { ...context, socialIntensity: 'REALITY' },
      },
    })

    expect(result.selectedActionId).toBe('betray')
    expect(result.domain.alliances['betrayal-pact'].status).toBe('FRACTURED')
    expect(
      result.domain.events.some(
        (event) =>
          event.type === 'ALLIANCE_BETRAYAL' &&
          event.actorId === 'ava' &&
          event.targetIds.includes('lia')
      )
    ).toBe(true)
  })

  it('creates grievances and repair debt from live conflict actions', () => {
    const conflict = runRealityOpportunity({
      domain: createInitialRealityDomainState(),
      simulation: createInitialRealitySimulationState(31),
      opportunity: opportunity('confront'),
    })

    expect(Object.values(conflict.domain.grievances)).toHaveLength(1)
    expect(Object.values(conflict.domain.grievances)[0]).toMatchObject({
      holderId: 'lia',
      againstId: 'ava',
      status: 'OPEN',
    })
  })

  it('honors the saved romance-storyline setting in the live orchestrator', () => {
    const result = runRealityOpportunity({
      domain: createInitialRealityDomainState(),
      simulation: createInitialRealitySimulationState(37),
      opportunity: {
        ...opportunity('flirt'),
        context: {
          ...context,
          socialIntensity: 'REALITY',
          romanceEnabled: false,
        },
      },
    })

    expect(Object.values(result.domain.romances)).toHaveLength(0)
  })
})
