import { describe, expect, it } from 'vitest';
import {
  ELIGIBLE_PHASES,
  chooseIncomingInteractionType,
  scheduleIncomingInteractionsForPhase,
  type AutonomyContext,
  type AutonomyStore,
} from '../incomingInteractionAutonomy';
import { getInteractionDedupeReason } from '../incomingInteractionScheduler';
import type { IncomingInteraction, ScheduledIncomingInteraction } from '../types';

function buildContext(overrides: Partial<AutonomyContext> = {}): AutonomyContext {
  return {
    phase: 'week_start',
    week: 2,
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
  };
}

function makeInteraction(
  overrides: Partial<IncomingInteraction> = {},
): IncomingInteraction {
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
  };
}

function buildStore(context: AutonomyContext): AutonomyStore & {
  actions: unknown[];
  social: {
    incomingInteractions: IncomingInteraction[];
    scheduledIncomingInteractions: ScheduledIncomingInteraction[];
    incomingInteractionDelivery: {
      lastDeliveryPhase: string | null;
      lastDeliveryWeek: number | null;
      deliveredThisPhase: number;
    };
    relationships: AutonomyContext['relationships'];
    socialMemory: NonNullable<AutonomyContext['socialMemory']>;
  };
} {
  const actions: unknown[] = [];
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
  };

  return {
    actions,
    social,
    dispatch(action: unknown) {
      actions.push(action);
      if (
        typeof action === 'object' &&
        action !== null &&
        'type' in action &&
        (action as { type?: string }).type === 'social/scheduleIncomingInteraction'
      ) {
        social.scheduledIncomingInteractions.push(
          (action as { payload: ScheduledIncomingInteraction }).payload,
        );
      }
      return action;
    },
    getState() {
      return {
        social,
        game: {
          players: context.players,
          week: context.week,
          lohId: context.lohId ?? null,
          nomineeIds: context.nomineeIds ?? [],
          posWinnerId: context.posWinnerId ?? null,
          povSavedId: context.povSavedId ?? null,
          prevHohId: context.prevLohId ?? null,
          votes: context.votes ?? {},
          pendingEviction: context.pendingEvictionId
            ? { evicteeId: context.pendingEvictionId }
            : null,
          doubleEviction: { weekActive: context.isDoubleEviction === true },
          specialVeto: { activeType: context.specialVeto ?? null },
        },
      };
    },
  };
}

describe('incomingInteractionAutonomy thematic routing', () => {
  it('routes nominees to plea only when the player is HOH', () => {
    const context = buildContext({
      phase: 'nominations',
      lohId: 'user',
      nomineeIds: ['nominee'],
    });

    expect(chooseIncomingInteractionType('nominee', 'user', context)).toBe('nomination_plea');
  });

  it('routes nominees to deal offers when the player holds veto power', () => {
    const context = buildContext({
      phase: 'pos_results',
      players: [
        { id: 'user', name: 'You', status: 'pos', isUser: true },
        { id: 'nominee', name: 'Nominee', status: 'nominated' },
      ],
      nomineeIds: ['nominee'],
      posWinnerId: 'user',
    });

    expect(chooseIncomingInteractionType('nominee', 'user', context)).toBe('deal_offer');
  });

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
    });

    expect(chooseIncomingInteractionType('ally', 'user', context)).not.toBe('warning');
    expect(chooseIncomingInteractionType('ally', 'user', context)).not.toBe('snide_remark');
  });

  it('adds the new thematic phases to eligible scheduling', () => {
    expect(ELIGIBLE_PHASES.has('social_1')).toBe(true);
    expect(ELIGIBLE_PHASES.has('nomination_results')).toBe(true);
    expect(ELIGIBLE_PHASES.has('pos_ceremony_results')).toBe(true);
    expect(ELIGIBLE_PHASES.has('social_2')).toBe(true);
  });

  it('dedupes repeated scenarios from the same actor in the same phase', () => {
    const pending = [
      makeInteraction({
        fromId: 'nominee',
        type: 'nomination_plea',
        payload: { scenarioKey: 'nominee_hoh_plea', phase: 'nominations' },
      }),
    ];

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
    });

    expect(dedupeReason).toBe('deduped_same_scenario');
  });

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
    });
    const store = buildStore(context);

    scheduleIncomingInteractionsForPhase('nominations', store, context);

    expect(store.social.scheduledIncomingInteractions).toHaveLength(1);
    const interaction = store.social.scheduledIncomingInteractions[0]?.interaction;
    expect(interaction?.type).toBe('nomination_plea');
    expect(interaction?.payload?.scenarioKey).toBe('nominee_hoh_plea');
    expect(interaction?.text).toContain('Jordan');
  });
});
