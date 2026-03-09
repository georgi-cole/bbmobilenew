import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../../src/store/gameSlice';
import socialReducer, {
  pushIncomingInteraction,
  scheduleIncomingInteraction,
} from '../../src/social/socialSlice';
import { deliverScheduledIncomingInteractionsForPhase } from '../../src/social/incomingInteractionScheduler';
import { socialConfig } from '../../src/social/socialConfig';
import type { IncomingInteraction, ScheduledIncomingInteraction } from '../../src/social/types';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
    },
  });
}

function makeInteraction(overrides: Partial<IncomingInteraction> = {}): IncomingInteraction {
  return {
    id: 'interaction-1',
    fromId: 'ai1',
    type: 'compliment',
    text: 'Hello.',
    createdAt: 100,
    createdWeek: 1,
    expiresAtWeek: 4,
    read: false,
    requiresResponse: false,
    resolved: false,
    ...overrides,
  };
}

function makeScheduledInteraction(
  overrides: Partial<ScheduledIncomingInteraction> = {},
): ScheduledIncomingInteraction {
  return {
    interaction: makeInteraction(),
    priority: 'low',
    scheduledAt: 200,
    scheduledForWeek: 1,
    scheduledForPhase: 'week_start',
    ...overrides,
  };
}

const originalMaxWait = socialConfig.incomingInteractionDeliveryConfig.maxScheduledWaitPhases;

describe('incomingInteractionScheduler decision logging', () => {
  beforeEach(() => {
    socialConfig.incomingInteractionDeliveryConfig.maxScheduledWaitPhases = originalMaxWait;
  });

  afterEach(() => {
    socialConfig.incomingInteractionDeliveryConfig.maxScheduledWaitPhases = originalMaxWait;
  });

  it('drops interactions that exceed the max scheduled wait window', () => {
    socialConfig.incomingInteractionDeliveryConfig.maxScheduledWaitPhases = 1;
    const store = makeStore();
    store.dispatch(
      scheduleIncomingInteraction(
        makeScheduledInteraction({
          interaction: makeInteraction({
            id: 'overdue',
            createdWeek: 1,
            expiresAtWeek: 6,
          }),
        }),
      ),
    );

    deliverScheduledIncomingInteractionsForPhase('nominations', store, { week: 2 });

    const { scheduledIncomingInteractions, incomingInteractionLogs } = store.getState().social;
    expect(scheduledIncomingInteractions.length).toBe(0);
    expect(
      incomingInteractionLogs.some((entry) => entry.reason === 'expired_before_delivery'),
    ).toBe(true);
  });

  it('logs expiration when interactions expire before delivery', () => {
    const store = makeStore();
    store.dispatch(
      scheduleIncomingInteraction(
        makeScheduledInteraction({
          interaction: makeInteraction({
            id: 'expired',
            expiresAtWeek: 1,
          }),
        }),
      ),
    );

    deliverScheduledIncomingInteractionsForPhase('nominations', store, { week: 3 });

    const { scheduledIncomingInteractions, incomingInteractionLogs } = store.getState().social;
    expect(scheduledIncomingInteractions.length).toBe(0);
    expect(
      incomingInteractionLogs.some(
        (entry) => entry.interactionId === 'expired' && entry.reason === 'expired_before_delivery',
      ),
    ).toBe(true);
  });

  it('postpones low-priority deliveries when the inbox is full', () => {
    const store = makeStore();
    const maxVisible = socialConfig.incomingInteractionDeliveryConfig.maxActiveVisible;
    for (let i = 0; i < maxVisible; i += 1) {
      store.dispatch(
        pushIncomingInteraction(
          makeInteraction({
            id: `visible-${i}`,
            fromId: `ai-${i}`,
            createdWeek: 2,
            expiresAtWeek: 5,
          }),
        ),
      );
    }
    store.dispatch(
      scheduleIncomingInteraction(
        makeScheduledInteraction({
          interaction: makeInteraction({
            id: 'queued',
            createdWeek: 2,
            expiresAtWeek: 5,
          }),
          scheduledForWeek: 2,
          scheduledForPhase: 'nominations',
        }),
      ),
    );

    deliverScheduledIncomingInteractionsForPhase('nominations', store, { week: 2 });

    const { scheduledIncomingInteractions, incomingInteractionLogs } = store.getState().social;
    expect(scheduledIncomingInteractions.length).toBe(1);
    expect(
      incomingInteractionLogs.some(
        (entry) => entry.interactionId === 'queued' && entry.reason === 'blocked_by_visible_cap',
      ),
    ).toBe(true);
  });
});
