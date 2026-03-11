/**
 * Eviction Social Lockout tests.
 *
 * Validates the requirements from the issue:
 *  1. On eviction (finalizePendingEviction / selfEvict), the user's social
 *     resources are zeroed out.
 *  2. All unresolved incoming interactions are dismissed on eviction.
 *  3. All scheduled incoming interactions are cleared on eviction.
 *  4. No new incoming interactions are scheduled while the user is evicted/jury.
 *  5. On Battle Back win (completeBattleBack), the user's energy is restored.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  finalizePendingEviction,
  selfEvict,
  activateBattleBack,
  completeBattleBack,
} from '../../src/store/gameSlice';
import socialReducer, {
  setEnergyBankEntry,
  setInfluenceBankEntry,
  setInfoBankEntry,
  pushIncomingInteraction,
  scheduleIncomingInteraction,
  selectActiveIncomingInteractions,
  selectScheduledIncomingInteractions,
} from '../../src/social/socialSlice';
import { socialMiddleware } from '../../src/social/socialMiddleware';
import { scheduleIncomingInteractionsForPhase } from '../../src/social/incomingInteractionAutonomy';
import type { GameState, Player } from '../../src/types';
import type { IncomingInteraction, ScheduledIncomingInteraction } from '../../src/social/types';
import { DEFAULT_ENERGY } from '../../src/social/constants';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i === 0 ? 'user' : `p${i}`,
    name: i === 0 ? 'User Player' : `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
}

function makeStore(gameOverrides: Partial<GameState> = {}) {
  const players = makePlayers(6);
  const base: GameState = {
    season: 1,
    week: 4,
    phase: 'eviction_results',
    seed: 42,
    hohId: 'p1',
    prevHohId: null,
    nomineeIds: ['user'],
    players,
    tvFeed: [],
    votes: {},
    evictedCount: 0,
    jurySize: 0,
    povWinnerId: null,
    povSavedId: null,
    pendingEviction: {
      evicteeId: 'user',
      evictionMessage: 'User has been evicted.',
    },
    awaitingNominations: false,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    pendingNominee1Id: null,
    replacementNeeded: false,
    stats: {},
    spectatorActive: null,
    twistActive: false,
    ...gameOverrides,
  };
  return configureStore({
    reducer: { game: gameReducer, social: socialReducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(socialMiddleware as never),
    preloadedState: { game: base } as never,
  });
}

function makeInteraction(id: string): IncomingInteraction {
  return {
    id,
    fromId: 'p1',
    type: 'check_in',
    text: 'Hey, how are you?',
    createdAt: Date.now(),
    createdWeek: 4,
    expiresAtWeek: 5,
    read: false,
    requiresResponse: false,
    resolved: false,
  };
}

function makeScheduled(id: string): ScheduledIncomingInteraction {
  return {
    interaction: makeInteraction(id),
    priority: 'medium',
    scheduledAt: Date.now(),
    scheduledForWeek: 4,
    scheduledForPhase: 'social_1',
  };
}

// ── 1. finalizePendingEviction zeros out resources ───────────────────────────

describe('finalizePendingEviction — social resource drain', () => {
  it('zeroes energy bank for the evicted user', () => {
    const store = makeStore();
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 8 }));
    store.dispatch(finalizePendingEviction('user'));
    const state = store.getState() as { social: { energyBank: Record<string, number> } };
    expect(state.social.energyBank['user']).toBe(0);
  });

  it('zeroes influence bank for the evicted user', () => {
    const store = makeStore();
    store.dispatch(setInfluenceBankEntry({ playerId: 'user', value: 500 }));
    store.dispatch(finalizePendingEviction('user'));
    const state = store.getState() as { social: { influenceBank: Record<string, number> } };
    expect(state.social.influenceBank['user']).toBe(0);
  });

  it('zeroes info bank for the evicted user', () => {
    const store = makeStore();
    store.dispatch(setInfoBankEntry({ playerId: 'user', value: 3 }));
    store.dispatch(finalizePendingEviction('user'));
    const state = store.getState() as { social: { infoBank: Record<string, number> } };
    expect(state.social.infoBank['user']).toBe(0);
  });

  it('does NOT drain resources for a non-user evictee', () => {
    // Set up a game where an AI player is being evicted instead of user.
    const players = makePlayers(6);
    // user is NOT nominated; p1 is.
    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(socialMiddleware as never),
      preloadedState: {
        game: {
          season: 1,
          week: 4,
          phase: 'eviction_results',
          seed: 42,
          hohId: 'p2',
          prevHohId: null,
          nomineeIds: ['p1'],
          players,
          tvFeed: [],
          votes: {},
          evictedCount: 0,
          jurySize: 0,
          povWinnerId: null,
          povSavedId: null,
          pendingEviction: { evicteeId: 'p1', evictionMessage: 'p1 has been evicted.' },
          awaitingNominations: false,
          awaitingPovDecision: false,
          awaitingPovSaveTarget: false,
          awaitingHumanVote: false,
          awaitingTieBreak: false,
          awaitingFinal3Eviction: false,
          awaitingFinal3Plea: false,
          pendingNominee1Id: null,
          replacementNeeded: false,
          stats: {},
          spectatorActive: null,
          twistActive: false,
        },
      } as never,
    });
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 5 }));
    store.dispatch(finalizePendingEviction('p1'));
    const state = store.getState() as { social: { energyBank: Record<string, number> } };
    // User's energy should be unchanged.
    expect(state.social.energyBank['user']).toBe(5);
  });
});

// ── 2. finalizePendingEviction dismisses unresolved incoming interactions ────

describe('finalizePendingEviction — incoming interaction dismissal', () => {
  it('dismisses all unresolved incoming interactions on eviction', () => {
    const store = makeStore();
    store.dispatch(pushIncomingInteraction(makeInteraction('int-1')));
    store.dispatch(pushIncomingInteraction(makeInteraction('int-2')));
    store.dispatch(finalizePendingEviction('user'));
    const active = selectActiveIncomingInteractions(
      store.getState() as Parameters<typeof selectActiveIncomingInteractions>[0],
    );
    expect(active).toHaveLength(0);
  });

  it('marks dismissed interactions as resolved with "dismiss"', () => {
    const store = makeStore();
    store.dispatch(pushIncomingInteraction(makeInteraction('int-3')));
    store.dispatch(finalizePendingEviction('user'));
    const state = store.getState() as { social: { incomingInteractions: IncomingInteraction[] } };
    const interaction = state.social.incomingInteractions.find((i) => i.id === 'int-3');
    expect(interaction?.resolved).toBe(true);
    expect(interaction?.resolvedWith).toBe('dismiss');
  });
});

// ── 3. finalizePendingEviction clears scheduled incoming interactions ────────

describe('finalizePendingEviction — scheduled interaction clearing', () => {
  it('clears all scheduled incoming interactions on eviction', () => {
    const store = makeStore();
    store.dispatch(scheduleIncomingInteraction(makeScheduled('sched-1')));
    store.dispatch(scheduleIncomingInteraction(makeScheduled('sched-2')));
    store.dispatch(finalizePendingEviction('user'));
    const scheduled = selectScheduledIncomingInteractions(
      store.getState() as Parameters<typeof selectScheduledIncomingInteractions>[0],
    );
    expect(scheduled).toHaveLength(0);
  });
});

// ── 4. selfEvict also drains social resources ────────────────────────────────

describe('selfEvict — social resource drain', () => {
  it('zeroes energy bank for the self-evicted user', () => {
    const players = makePlayers(6);
    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(socialMiddleware as never),
      preloadedState: {
        game: {
          season: 1,
          week: 3,
          phase: 'social_1',
          seed: 42,
          hohId: 'p1',
          prevHohId: null,
          nomineeIds: [],
          players,
          tvFeed: [],
          votes: {},
          evictedCount: 0,
          jurySize: 0,
          povWinnerId: null,
          povSavedId: null,
          pendingEviction: null,
          awaitingNominations: false,
          awaitingPovDecision: false,
          awaitingPovSaveTarget: false,
          awaitingHumanVote: false,
          awaitingTieBreak: false,
          awaitingFinal3Eviction: false,
          awaitingFinal3Plea: false,
          pendingNominee1Id: null,
          replacementNeeded: false,
          stats: {},
          spectatorActive: null,
          twistActive: false,
        },
      } as never,
    });
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 7 }));
    store.dispatch(pushIncomingInteraction(makeInteraction('self-int-1')));
    store.dispatch(selfEvict('user'));
    const state = store.getState() as {
      social: { energyBank: Record<string, number>; incomingInteractions: IncomingInteraction[] };
    };
    expect(state.social.energyBank['user']).toBe(0);
    // Interactions should also be dismissed.
    const active = selectActiveIncomingInteractions(
      store.getState() as Parameters<typeof selectActiveIncomingInteractions>[0],
    );
    expect(active).toHaveLength(0);
  });
});

// ── 5. scheduleIncomingInteractionsForPhase skips evicted/jury user ──────────

describe('scheduleIncomingInteractionsForPhase — evicted/jury user skip', () => {
  function makeAutonomyStore(userStatus: 'evicted' | 'jury' | 'active') {
    const players = makePlayers(6);
    players[0].status = userStatus;
    return {
      dispatch: () => {},
      getState: () => ({
        game: { players, week: 4 },
        social: {
          energyBank: {},
          influenceBank: {},
          infoBank: {},
          relationships: {},
          sessionLogs: [],
          incomingInteractions: [],
          scheduledIncomingInteractions: [],
          incomingInteractionLogs: [],
          incomingInteractionDelivery: {
            lastDeliveryPhase: null,
            lastDeliveryWeek: null,
            deliveredThisPhase: 0,
          },
          socialMemory: {},
          influenceWeights: {},
          panelOpen: false,
          weekStartRelSnapshot: {},
          incomingInboxOpen: false,
        },
      }),
    };
  }

  it('does not dispatch any scheduleIncomingInteraction when user is evicted', () => {
    const dispatched: unknown[] = [];
    const store = makeAutonomyStore('evicted');
    const trackingStore = { ...store, dispatch: (a: unknown) => dispatched.push(a) };
    scheduleIncomingInteractionsForPhase('social_1', trackingStore as never);
    const scheduled = dispatched.filter(
      (a) => typeof a === 'object' && a !== null && 'type' in a &&
             (a as { type: string }).type === 'social/scheduleIncomingInteraction',
    );
    expect(scheduled).toHaveLength(0);
  });

  it('does not dispatch any scheduleIncomingInteraction when user is in jury', () => {
    const dispatched: unknown[] = [];
    const store = makeAutonomyStore('jury');
    const trackingStore = { ...store, dispatch: (a: unknown) => dispatched.push(a) };
    scheduleIncomingInteractionsForPhase('social_1', trackingStore as never);
    const scheduled = dispatched.filter(
      (a) => typeof a === 'object' && a !== null && 'type' in a &&
             (a as { type: string }).type === 'social/scheduleIncomingInteraction',
    );
    expect(scheduled).toHaveLength(0);
  });
});

// ── 6. completeBattleBack restores energy for returning user ─────────────────

describe('completeBattleBack — social resource restoration', () => {
  it('restores DEFAULT_ENERGY to the user who wins Battle Back', () => {
    const players = makePlayers(10);
    // user is in jury (was evicted earlier)
    players[0].status = 'jury';
    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(socialMiddleware as never),
      preloadedState: {
        game: {
          season: 1,
          week: 5,
          phase: 'eviction_results',
          seed: 42,
          hohId: 'p2',
          prevHohId: null,
          nomineeIds: [],
          players,
          tvFeed: [],
          votes: {},
          evictedCount: 1,
          jurySize: 3,
          povWinnerId: null,
          povSavedId: null,
          pendingEviction: null,
          awaitingNominations: false,
          awaitingPovDecision: false,
          awaitingPovSaveTarget: false,
          awaitingHumanVote: false,
          awaitingTieBreak: false,
          awaitingFinal3Eviction: false,
          awaitingFinal3Plea: false,
          pendingNominee1Id: null,
          replacementNeeded: false,
          stats: {},
          spectatorActive: null,
          twistActive: true,
          battleBack: {
            used: false,
            active: true,
            competitionActive: false,
            weekDecided: 5,
            candidates: ['user'],
            winnerId: null,
          },
        },
      } as never,
    });

    // User starts with 0 energy (was drained on eviction).
    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 0 }));
    store.dispatch(completeBattleBack('user'));

    const state = store.getState() as { social: { energyBank: Record<string, number> } };
    expect(state.social.energyBank['user']).toBe(DEFAULT_ENERGY);
  });

  it('does NOT restore energy when an AI player wins Battle Back', () => {
    const players = makePlayers(10);
    players[1].status = 'jury'; // p1 is the AI jury member
    const store = configureStore({
      reducer: { game: gameReducer, social: socialReducer },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(socialMiddleware as never),
      preloadedState: {
        game: {
          season: 1,
          week: 5,
          phase: 'eviction_results',
          seed: 42,
          hohId: 'p2',
          prevHohId: null,
          nomineeIds: [],
          players,
          tvFeed: [],
          votes: {},
          evictedCount: 1,
          jurySize: 3,
          povWinnerId: null,
          povSavedId: null,
          pendingEviction: null,
          awaitingNominations: false,
          awaitingPovDecision: false,
          awaitingPovSaveTarget: false,
          awaitingHumanVote: false,
          awaitingTieBreak: false,
          awaitingFinal3Eviction: false,
          awaitingFinal3Plea: false,
          pendingNominee1Id: null,
          replacementNeeded: false,
          stats: {},
          spectatorActive: null,
          twistActive: true,
          battleBack: {
            used: false,
            active: true,
            competitionActive: false,
            weekDecided: 5,
            candidates: ['p1'],
            winnerId: null,
          },
        },
      } as never,
    });

    store.dispatch(setEnergyBankEntry({ playerId: 'user', value: 3 }));
    store.dispatch(completeBattleBack('p1'));

    const state = store.getState() as { social: { energyBank: Record<string, number> } };
    // User's energy should remain unchanged.
    expect(state.social.energyBank['user']).toBe(3);
  });
});
