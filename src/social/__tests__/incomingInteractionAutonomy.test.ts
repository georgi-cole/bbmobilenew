import { describe, expect, it } from 'vitest'
import {
  ELIGIBLE_PHASES,
  chooseIncomingInteractionType,
  scheduleIncomingInteractionsForPhase,
  type AutonomyContext,
  type AutonomyStore,
} from '../incomingInteractionAutonomy'
import { getInteractionDedupeReason } from '../incomingInteractionScheduler'
import type { IncomingInteraction, ScheduledIncomingInteraction } from '../types'

function buildContext(overrides: Partial<AutonomyContext> = {}): AutonomyContext {
  return {
    phase: 'week_start',
    week: 2,
    dramaMode: true,
    relationships: {
      ally: { user: { affinity: 65, tags: [] } },
      enemy: { user: { affinity: -55, tags: ['betrayal'] } },
      nominee: { user: { affinity: 30, tags: [] } },
    },
    socialMemory: {},
    players: [
      { id: 'user', name: 'You', status: 'loh', isUser: true },
      { id: 'ally', name: 'Ally', status: 'active' },
      { id: 'enemy', name: 'Enemy', status: 'active' },
      { id: 'nominee', name: 'Nominee', status: 'nominated' },
    ],
    nomineeIds: [],
    votes: {},
    ...overrides,
  }
}

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'i-1',
    fromId: 'ally',
    type: 'check_in',
    text: 'Checking in.',
    payload: { scenarioKey: 'generic_check_in', phase: 'week_start' },
    createdAt: 100,
    createdWeek: 2,
    expiresAtWeek: 3,
    read: false,
    requiresResponse: false,
    resolved: false,
    ...overrides,
  }
}

function buildStore(context: AutonomyContext): AutonomyStore & {
  actions: unknown[]
  social: {
    incomingInteractions: IncomingInteraction[]
    scheduledIncomingInteractions: ScheduledIncomingInteraction[]
    incomingInteractionDelivery: {
      lastDeliveryPhase: string | null
      lastDeliveryWeek: number | null
      deliveredThisPhase: number
    }
    relationships: AutonomyContext['relationships']
    socialMemory: NonNullable<AutonomyContext['socialMemory']>
  }
} {
  const actions: unknown[] = []
  const social = {
    incomingInteractions: [] as IncomingInteraction[],
    scheduledIncomingInteractions: [] as ScheduledIncomingInteraction[],
    incomingInteractionDelivery: {
      lastDeliveryPhase: null,
      lastDeliveryWeek: null,
      deliveredThisPhase: 0,
    },
    relationships: context.relationships,
    socialMemory: context.socialMemory ?? {},
  }

  return {
    actions,
    social,
    dispatch(action: unknown) {
      actions.push(action)
      if (
        typeof action === 'object' &&
        action !== null &&
        'type' in action &&
        'payload' in action &&
        (action as { type?: string }).type === 'social/scheduleIncomingInteraction'
      ) {
        social.scheduledIncomingInteractions.push(
          (action as { payload: ScheduledIncomingInteraction }).payload
        )
      }
      return action
    },
    getState() {
      return {
        social,
        game: {
          players: context.players,
          week: context.week,
          seed: context.seed ?? 0,
          lohId: context.lohId ?? null,
          nomineeIds: context.nomineeIds ?? [],
          posWinnerId: context.posWinnerId ?? null,
          povSavedId: context.povSavedId ?? null,
          prevHohId: context.prevHohId ?? null,
          votes: context.votes ?? {},
          pendingEviction: context.pendingEvictionId
            ? { evicteeId: context.pendingEvictionId }
            : null,
          doubleEviction: { weekActive: context.isDoubleEviction === true },
          specialVeto: { activeType: context.specialVeto ?? null },
        },
      }
    },
  }
}

describe('incomingInteractionAutonomy thematic routing', () => {
  it('routes nominees to plea only when the player is HOH', () => {
    const context = buildContext({
      phase: 'nominations',
      lohId: 'user',
      nomineeIds: ['nominee'],
    })

    expect(chooseIncomingInteractionType('nominee', 'user', context)).toBe('nomination_plea')
  })

  it('lets a nominee react directly to the human LOH after nominations are revealed', () => {
    const context = buildContext({
      phase: 'nomination_results',
      lohId: 'user',
      nomineeIds: ['nominee'],
      random: () => 0,
    })
    const store = buildStore(context)

    scheduleIncomingInteractionsForPhase('nomination_results', store, context)

    const interaction = store.social.scheduledIncomingInteractions.find(
      (entry) => entry.interaction.fromId === 'nominee'
    )?.interaction
    expect(interaction?.type).toBe('check_in')
    expect(interaction?.payload?.scenarioKey).toBe('nominee_understands_loh')
  })

  it('routes nominees to deal offers when the player holds veto power', () => {
    const context = buildContext({
      phase: 'pos_results',
      players: [
        { id: 'user', name: 'You', status: 'pos', isUser: true },
        { id: 'nominee', name: 'Nominee', status: 'nominated' },
      ],
      nomineeIds: ['nominee'],
      posWinnerId: 'user',
    })

    expect(chooseIncomingInteractionType('nominee', 'user', context)).toBe('deal_offer')
  })

  it('has an AI Safety winner consult the human LOH before the ceremony', () => {
    const context = buildContext({
      phase: 'pos_results',
      lohId: 'user',
      posWinnerId: 'holder',
      relationships: { holder: { user: { affinity: 10, tags: [] } } },
      players: [
        { id: 'user', name: 'You', status: 'loh', isUser: true },
        { id: 'holder', name: 'Holder', status: 'pos' },
      ],
      random: () => 0,
    })
    const store = buildStore(context)

    scheduleIncomingInteractionsForPhase('pos_results', store, context)

    const interaction = store.social.scheduledIncomingInteractions[0]?.interaction
    expect(interaction?.type).toBe('deal_offer')
    expect(interaction?.payload?.scenarioKey).toBe('safety_holder_consults_loh')
  })
  it('has the AI LOH consult a human Safety holder with the real nominees', () => {
    const context = buildContext({
      phase: 'pos_results',
      seed: 0,
      lohId: 'loh',
      posWinnerId: 'user',
      nomineeIds: ['nomineeA', 'nomineeB'],
      relationships: { loh: { user: { affinity: 5, tags: [] } } },
      players: [
        { id: 'user', name: 'You', status: 'pos', isUser: true },
        { id: 'loh', name: 'Leader', status: 'loh' },
        { id: 'nomineeA', name: 'Nominee A', status: 'nominated' },
        { id: 'nomineeB', name: 'Nominee B', status: 'nominated' },
      ],
      random: () => 0,
    })
    const store = buildStore(context)

    scheduleIncomingInteractionsForPhase('pos_results', store, context)

    const consultation = store.social.scheduledIncomingInteractions.find(
      (entry) => entry.interaction.fromId === 'loh'
    )?.interaction
    expect(consultation?.type).toBe('deal_offer')
    expect(consultation?.payload?.scenarioKey).toBe('loh_consults_safety_holder')
    expect(consultation?.payload?.nomineeNames).toEqual(['Nominee A', 'Nominee B'])
    expect(consultation?.payload?.preferredSafetyAdvice).toBe('hold')
  })

  it('does not route nominee vote pitches to the human LOH', () => {
    const context = buildContext({
      phase: 'live_vote',
      lohId: 'user',
      nomineeIds: ['nominee'],
      players: [
        { id: 'user', name: 'You', status: 'loh', isUser: true },
        { id: 'nominee', name: 'Nominee', status: 'nominated' },
      ],
      relationships: { nominee: { user: { affinity: 20, tags: [] } } },
      random: () => 0,
    })
    const store = buildStore(context)

    scheduleIncomingInteractionsForPhase('live_vote', store, context)

    expect(
      store.social.scheduledIncomingInteractions.some(
        (entry) => entry.interaction.payload?.scenarioKey === 'live_vote_pitch'
      )
    ).toBe(false)
  })

  it('queues both nominee pitches when the human holds Safety, while delivery remains paced', () => {
    const context = buildContext({
      phase: 'pos_results',
      posWinnerId: 'user',
      nomineeIds: ['nomineeA', 'nomineeB'],
      relationships: {
        nomineeA: { user: { affinity: 0, tags: [] } },
        nomineeB: { user: { affinity: 0, tags: [] } },
      },
      players: [
        { id: 'user', name: 'You', status: 'pos', isUser: true },
        { id: 'nomineeA', name: 'Nominee A', status: 'nominated' },
        { id: 'nomineeB', name: 'Nominee B', status: 'nominated' },
      ],
      random: () => 0,
    })
    const store = buildStore(context)

    scheduleIncomingInteractionsForPhase('pos_results', store, context)

    const scheduled = store.social.scheduledIncomingInteractions
    expect(scheduled).toHaveLength(2)
    expect(
      scheduled.every((entry) => entry.interaction.payload?.scenarioKey === 'nominee_veto_pitch')
    ).toBe(true)
  })

  it('keeps alliance-tagged relationships from turning hostile', () => {
    const context = buildContext({
      phase: 'loh_results',
      lohId: 'user',
      relationships: {
        ally: { user: { affinity: -20, tags: ['alliance'] } },
      },
      players: [
        { id: 'user', name: 'You', status: 'loh', isUser: true },
        { id: 'ally', name: 'Ally', status: 'active' },
      ],
    })

    expect(chooseIncomingInteractionType('ally', 'user', context)).not.toBe('warning')
    expect(chooseIncomingInteractionType('ally', 'user', context)).not.toBe('snide_remark')
  })

  it('adds the new thematic phases to eligible scheduling', () => {
    expect(ELIGIBLE_PHASES.has('social_1')).toBe(true)
    expect(ELIGIBLE_PHASES.has('nomination_results')).toBe(true)
    expect(ELIGIBLE_PHASES.has('pos_ceremony_results')).toBe(true)
    expect(ELIGIBLE_PHASES.has('social_2')).toBe(true)
  })

  it('dedupes repeated scenarios from the same actor in the same phase', () => {
    const pending = [
      makeInteraction({
        fromId: 'nominee',
        type: 'nomination_plea',
        payload: { scenarioKey: 'nominee_hoh_plea', phase: 'nominations' },
      }),
    ]

    const dedupeReason = getInteractionDedupeReason({
      interaction: makeInteraction({
        id: 'i-2',
        fromId: 'nominee',
        type: 'nomination_plea',
        payload: { scenarioKey: 'nominee_hoh_plea', phase: 'nominations' },
      }),
      priority: 'high',
      pendingInteractions: pending,
      week: 2,
    })

    expect(dedupeReason).toBe('deduped_same_scenario')
  })

  it('dedupes interactions from the same actor that reuse the same variant family within the cooldown window', () => {
    // Use different interaction types so the sameTypeCooldownWeeks check does not
    // fire before reaching the family-level dedupe check.
    const pending = [
      makeInteraction({
        fromId: 'ally',
        type: 'compliment',
        createdWeek: 2,
        payload: {
          scenarioKey: 'generic_check_in',
          phase: 'week_start',
          variantFamilyId: 'gci_casual',
        },
      }),
    ]

    const dedupeReason = getInteractionDedupeReason({
      interaction: makeInteraction({
        id: 'i-2',
        fromId: 'ally',
        type: 'check_in',
        createdWeek: 2,
        payload: {
          scenarioKey: 'generic_check_in',
          phase: 'social_1',
          variantFamilyId: 'gci_casual',
        },
      }),
      priority: 'medium',
      pendingInteractions: pending,
      week: 2,
    })

    expect(dedupeReason).toBe('deduped_same_family')
  })

  it('does not dedupe the same variant family when outside the cooldown window', () => {
    const pending = [
      makeInteraction({
        fromId: 'ally',
        type: 'compliment',
        createdWeek: 1,
        payload: {
          scenarioKey: 'generic_check_in',
          phase: 'week_start',
          variantFamilyId: 'gci_casual',
        },
      }),
    ]

    // familyCooldownWeeks defaults to 1; createdWeek=1, current week=3 → 2 weeks apart → outside window
    const dedupeReason = getInteractionDedupeReason({
      interaction: makeInteraction({
        id: 'i-2',
        fromId: 'ally',
        type: 'check_in',
        createdWeek: 3,
        payload: {
          scenarioKey: 'generic_check_in',
          phase: 'social_1',
          variantFamilyId: 'gci_casual',
        },
      }),
      priority: 'medium',
      pendingInteractions: pending,
      week: 3,
    })

    expect(dedupeReason).toBeNull()
  })

  it('schedules contextual text and payload for HOH pleas', () => {
    const context = buildContext({
      phase: 'nominations',
      lohId: 'user',
      nomineeIds: ['nominee'],
      players: [
        { id: 'user', name: 'Jordan', status: 'loh', isUser: true },
        { id: 'nominee', name: 'Rae', status: 'nominated' },
      ],
      random: () => 0,
    })
    const store = buildStore(context)

    scheduleIncomingInteractionsForPhase('nominations', store, context)

    expect(store.social.scheduledIncomingInteractions).toHaveLength(1)
    const interaction = store.social.scheduledIncomingInteractions[0]?.interaction
    expect(interaction?.type).toBe('nomination_plea')
    expect(interaction?.payload?.scenarioKey).toBe('nominee_hoh_plea')
    expect(interaction?.text).toContain('Jordan')
  })

  it('does not manufacture generic check-ins for neutral players without a trigger', () => {
    const context = buildContext({
      phase: 'week_start',
      relationships: { neutral: { user: { affinity: 0, tags: [] } } },
      players: [
        { id: 'user', name: 'You', status: 'active', isUser: true },
        { id: 'neutral', name: 'Neutral', status: 'active' },
      ],
      random: () => 0,
    })
    const store = buildStore(context)

    scheduleIncomingInteractionsForPhase('week_start', store, context)

    expect(store.social.scheduledIncomingInteractions).toHaveLength(0)
  })

  it('creates only the highest-ranked contact at a single checkpoint', () => {
    const context = buildContext({
      phase: 'week_start',
      relationships: {
        closeAlly: { user: { affinity: 90, tags: ['alliance'] } },
        ally: { user: { affinity: 65, tags: ['alliance'] } },
      },
      players: [
        { id: 'user', name: 'You', status: 'active', isUser: true },
        { id: 'closeAlly', name: 'Close Ally', status: 'active' },
        { id: 'ally', name: 'Ally', status: 'active' },
      ],
      random: () => 0,
    })
    const store = buildStore(context)

    scheduleIncomingInteractionsForPhase('week_start', store, context)

    expect(store.social.scheduledIncomingInteractions).toHaveLength(1)
    expect(store.social.scheduledIncomingInteractions[0]?.interaction.fromId).toBe('closeAlly')
  })
})
