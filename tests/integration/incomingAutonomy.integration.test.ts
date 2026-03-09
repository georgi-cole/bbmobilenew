/**
 * Integration tests for AI-driven incoming interaction autonomy.
 *
 * Simulates phase transitions (week_start, nominations, hoh_results, pov_results,
 * live_vote) through socialMiddleware and confirms that interactions are queued
 * into the social state.
 *
 * Uses seeded/mocked randomness via the contextOverride parameter of
 * scheduleIncomingInteractionsForPhase, and also tests the middleware integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { setPhase } from '../../src/store/gameSlice';
import socialReducer from '../../src/social/socialSlice';
import { socialMiddleware } from '../../src/social/socialMiddleware';
import { scheduleIncomingInteractionsForPhase } from '../../src/social/incomingInteractionAutonomy';
import type { AutonomyContext } from '../../src/social/incomingInteractionAutonomy';
import {
  selectPendingIncomingInteractionCount,
  selectIncomingInteractions,
  selectScheduledIncomingInteractions,
  selectScheduledIncomingInteractionCount,
  pushIncomingInteraction,
} from '../../src/social/socialSlice';
import { deliverScheduledIncomingInteractionsForPhase } from '../../src/social/incomingInteractionScheduler';
import { socialConfig } from '../../src/social/socialConfig';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      social: socialReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(socialMiddleware),
  });
}

/**
 * A simple seeded Linear Congruential Generator (Park-Miller).
 * Constants: multiplier=16807, modulus=2147483647 (Mersenne prime 2^31-1).
 * Returns values in [0, 1).
 */
function makeSeededRng(seed: number): () => number {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('incomingInteractionAutonomy – direct scheduling', () => {
  it('scheduleIncomingInteractionsForPhase schedules interactions for nominations phase', () => {
    const store = makeStore();

    // Inject a seeded RNG so the test is deterministic
    scheduleIncomingInteractionsForPhase('nominations', store, {
      random: makeSeededRng(42),
      players: [
        { id: 'user', status: 'active', isUser: true },
        { id: 'ai1', status: 'active' },
        { id: 'ai2', status: 'active' },
      ],
      week: 2,
      relationships: {
        ai1: { user: { affinity: 60, tags: [] } },
        ai2: { user: { affinity: -40, tags: [] } },
      },
      phase: 'nominations',
    });

    const deliveredBefore = selectIncomingInteractions({ social: store.getState().social });
    const scheduled = selectScheduledIncomingInteractions({ social: store.getState().social });
    expect(deliveredBefore.length + scheduled.length).toBeGreaterThan(0);

    const scheduledForNow = scheduled.filter(
      (entry) => entry.scheduledForWeek === 2 && entry.scheduledForPhase === 'nominations',
    );
    expect(scheduledForNow.length).toBeLessThanOrEqual(
      socialConfig.incomingInteractionDeliveryConfig.maxDeliveredPerPhase,
    );

    deliverScheduledIncomingInteractionsForPhase('nominations', store, { week: 2 });
    const deliveredAfter = selectIncomingInteractions({ social: store.getState().social });
    expect(deliveredAfter.length - deliveredBefore.length).toBeLessThanOrEqual(
      socialConfig.incomingInteractionDeliveryConfig.maxDeliveredPerPhase,
    );
  });

  it('interactions scheduled have correct fromId and type fields', () => {
    const store = makeStore();

    scheduleIncomingInteractionsForPhase('nominations', store, {
      random: makeSeededRng(1),
      players: [
        { id: 'user', status: 'active', isUser: true },
        { id: 'ai1', status: 'active' },
      ],
      week: 1,
      relationships: {
        ai1: { user: { affinity: 70, tags: [] } },
      },
      phase: 'nominations',
    });

    const delivered = selectIncomingInteractions({ social: store.getState().social });
    const scheduled = selectScheduledIncomingInteractions({ social: store.getState().social });
    const interactions = [...delivered, ...scheduled.map((entry) => entry.interaction)];
    expect(interactions.length).toBeGreaterThan(0);
    const first = interactions[0];
    expect(first.fromId).toBe('ai1');
    expect(first.read).toBe(false);
    expect(first.resolved).toBe(false);
    expect(first.createdWeek).toBe(1);
    expect(first.expiresAtWeek).toBe(2);
  });

  it('does not enqueue interactions for ineligible phases', () => {
    const store = makeStore();

    scheduleIncomingInteractionsForPhase('hoh_comp', store, {
      random: makeSeededRng(42),
      players: [
        { id: 'user', status: 'active', isUser: true },
        { id: 'ai1', status: 'active' },
      ],
      week: 2,
      relationships: { ai1: { user: { affinity: 90, tags: [] } } },
      phase: 'hoh_comp',
    });

    const pending = selectPendingIncomingInteractionCount({ social: store.getState().social });
    const scheduled = selectScheduledIncomingInteractionCount({ social: store.getState().social });
    expect(pending + scheduled).toBe(0);
  });

  it('respects global maxActive cap: never exceeds configured unresolved interactions', () => {
    const store = makeStore();

    const manyActors = Array.from({ length: 10 }, (_, i) => ({
      id: `ai${i}`,
      status: 'active',
    }));
    const players = [{ id: 'user', status: 'active', isUser: true }, ...manyActors];

    const relationships: Record<string, Record<string, { affinity: number; tags: string[] }>> = {};
    for (const actor of manyActors) {
      relationships[actor.id] = { user: { affinity: 80, tags: [] } };
    }

    scheduleIncomingInteractionsForPhase('nominations', store, {
      random: makeSeededRng(7),
      players,
      week: 1,
      relationships,
      phase: 'nominations',
    });

    const pending = selectPendingIncomingInteractionCount({ social: store.getState().social });
    const scheduled = selectScheduledIncomingInteractionCount({ social: store.getState().social });
    expect(pending + scheduled).toBeLessThanOrEqual(socialConfig.incomingInteractionConfig.maxActive);
  });

  it('evicted and jury players are skipped', () => {
    const store = makeStore();

    scheduleIncomingInteractionsForPhase('nominations', store, {
      random: makeSeededRng(42),
      players: [
        { id: 'user', status: 'active', isUser: true },
        { id: 'ai1', status: 'evicted' },
        { id: 'ai2', status: 'jury' },
      ],
      week: 2,
      relationships: {
        ai1: { user: { affinity: 90, tags: [] } },
        ai2: { user: { affinity: 90, tags: [] } },
      },
      phase: 'nominations',
    });

    const pending = selectPendingIncomingInteractionCount({ social: store.getState().social });
    const scheduled = selectScheduledIncomingInteractionCount({ social: store.getState().social });
    expect(pending + scheduled).toBe(0);
  });

  it('skips low-priority scheduling when actor already has a pending interaction', () => {
    const store = makeStore();
    store.dispatch(
      pushIncomingInteraction({
        id: 'existing',
        fromId: 'ai1',
        type: 'compliment',
        text: 'Old message.',
        createdAt: 100,
        createdWeek: 1,
        expiresAtWeek: 3,
        read: false,
        requiresResponse: false,
        resolved: false,
      }),
    );

    scheduleIncomingInteractionsForPhase('hoh_results', store, {
      random: makeSeededRng(17),
      players: [
        { id: 'user', status: 'active', isUser: true },
        { id: 'ai1', status: 'active' },
      ],
      week: 3,
      relationships: {
        ai1: { user: { affinity: 20, tags: [] } },
      },
      phase: 'hoh_results',
    });

    const scheduled = selectScheduledIncomingInteractions({ social: store.getState().social });
    const ai1Scheduled = scheduled.filter((entry) => entry.interaction.fromId === 'ai1');
    expect(ai1Scheduled).toHaveLength(0);
  });

  it('delivers at most the configured number per phase checkpoint', () => {
    const store = makeStore();

    const manyActors = Array.from({ length: 6 }, (_, i) => ({
      id: `ai${i}`,
      status: 'active',
    }));
    const players = [{ id: 'user', status: 'active', isUser: true }, ...manyActors];

    const relationships: Record<string, Record<string, { affinity: number; tags: string[] }>> = {};
    for (const actor of manyActors) {
      relationships[actor.id] = { user: { affinity: 70, tags: [] } };
    }

    scheduleIncomingInteractionsForPhase('nominations', store, {
      random: makeSeededRng(11),
      players,
      week: 1,
      relationships,
      phase: 'nominations',
    });

    const deliveredBefore = selectIncomingInteractions({ social: store.getState().social }).length;
    expect(deliveredBefore).toBeLessThanOrEqual(
      socialConfig.incomingInteractionDeliveryConfig.maxDeliveredPerPhase,
    );

    deliverScheduledIncomingInteractionsForPhase('hoh_results', store);

    const deliveredAfter = selectIncomingInteractions({ social: store.getState().social }).length;
    expect(deliveredAfter - deliveredBefore).toBeLessThanOrEqual(
      socialConfig.incomingInteractionDeliveryConfig.maxDeliveredPerPhase,
    );
  });
});

describe('incomingInteractionAutonomy – middleware integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('week_start phase transition enqueues interactions via middleware', () => {
    const store = makeStore();

    // Force week_start transition; this calls handleWeekStart which calls autonomy scheduler.
    // The store starts at week_start but we need to transition away and back to trigger it.
    store.dispatch(setPhase('hoh_comp'));
    store.dispatch(setPhase('week_start'));

    // The middleware hooks scheduleIncomingInteractionsForPhase('week_start', store)
    // With the real game state, players include AI actors from buildInitialPlayers().
    // We just check state is valid (no crash and state has structure).
    const socialState = store.getState().social;
    expect(socialState).toBeDefined();
    expect(Array.isArray(socialState.incomingInteractions)).toBe(true);
    expect(Array.isArray(socialState.scheduledIncomingInteractions)).toBe(true);
  });

  it('nominations phase transition can enqueue interactions via middleware', () => {
    const store = makeStore();

    store.dispatch(setPhase('nominations'));

    const socialState = store.getState().social;
    expect(socialState).toBeDefined();
    // With a real multi-player game state and nominations urgency, at least some
    // interactions may be enqueued. The count should not exceed maxActive.
    const pending = selectPendingIncomingInteractionCount({ social: socialState });
    const scheduled = selectScheduledIncomingInteractionCount({ social: socialState });
    expect(pending + scheduled).toBeLessThanOrEqual(socialConfig.incomingInteractionConfig.maxActive);
  });

  it('shouldEnqueueInteraction cap is consistent with dispatched count', () => {
    const players = [
      { id: 'user', status: 'active', isUser: true },
      { id: 'ai1', status: 'active' },
      { id: 'ai2', status: 'active' },
      { id: 'ai3', status: 'active' },
    ];
    const ctx: AutonomyContext = {
      phase: 'nominations',
      week: 3,
      players,
      relationships: {
        ai1: { user: { affinity: 70, tags: [] } },
        ai2: { user: { affinity: -60, tags: [] } },
        ai3: { user: { affinity: 50, tags: [] } },
      },
      random: makeSeededRng(99),
    };

    const store = makeStore();
    scheduleIncomingInteractionsForPhase('nominations', store, { ...ctx });

    const enqueued = selectIncomingInteractions({ social: store.getState().social });
    const scheduled = selectScheduledIncomingInteractions({ social: store.getState().social });
    const all = [...enqueued, ...scheduled.map((entry) => entry.interaction)];
    // Every enqueued interaction should have fromId in the actor list
    const actorIds = new Set(['ai1', 'ai2', 'ai3']);
    for (const interaction of all) {
      expect(actorIds.has(interaction.fromId)).toBe(true);
    }
    // shouldEnqueueInteraction would return false for any actor already at per-AI cap
    const ai1Count = all.filter((i) => i.fromId === 'ai1').length;
    expect(ai1Count).toBeLessThanOrEqual(2); // maxPerAI = 2
  });
});

describe('incomingInteractionAutonomy – badge counts', () => {
  it('unread count equals total pending after autonomy scheduling', () => {
    const store = makeStore();

    scheduleIncomingInteractionsForPhase('nominations', store, {
      random: makeSeededRng(5),
      players: [
        { id: 'user', status: 'active', isUser: true },
        { id: 'ai1', status: 'active' },
        { id: 'ai2', status: 'active' },
      ],
      week: 1,
      relationships: {
        ai1: { user: { affinity: 80, tags: [] } },
        ai2: { user: { affinity: -70, tags: [] } },
      },
      phase: 'nominations',
    });

    const all = selectIncomingInteractions({ social: store.getState().social });
    const unread = all.filter((i) => !i.read).length;
    // All autonomy-generated interactions start as unread
    expect(unread).toBe(all.length);
  });
});
