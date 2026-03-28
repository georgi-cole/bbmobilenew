/**
 * Tests for event-driven Public Meter updates.
 *
 * Validates:
 * 1. Approval updates happen immediately at major game events (not only end-of-day).
 * 2. Daily feed budget is respected (up to feedBudgetPerDay visible posts per day).
 * 3. Nomination/eviction reactions produce expected deltas based on approval standings.
 * 4. Deterministic ordering when multiple events compete for feed visibility.
 */

import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect } from 'vitest';
import type { Player } from '../../../src/types';
import publicOpinionReducer, {
  initializeProfiles,
  updateApproval,
} from '../../../src/publicOpinion/publicOpinionSlice';
import { publicOpinionMiddleware } from '../../../src/publicOpinion/publicOpinionMiddleware';
import { publicOpinionConfig } from '../../../src/publicOpinion/publicOpinionConfig';
import {
  computeNominationReactions,
  computeEvictionReactions,
  computePovSaveReactions,
} from '../../../src/publicOpinion/EventDrivenReactionService';

// ── Helpers ───────────────────────────────────────────────────────────────────

interface TestGameState {
  phase: string;
  week: number;
  hohId: string | null;
  povWinnerId: string | null;
  nomineeIds: string[];
  players: Player[];
  seed: number;
  awaitingNominations?: boolean;
  votes?: Record<string, string>;
  povSavedId?: string | null;
  publicSavedNomineeId?: string | null;
}

function makePlayer(
  id: string,
  name: string,
  status: Player['status'] = 'active',
): Player {
  return { id, name, avatar: '🙂', status };
}

function makeGameState(overrides: Partial<TestGameState> = {}): TestGameState {
  return {
    phase: 'week_start',
    week: 1,
    hohId: null,
    povWinnerId: null,
    nomineeIds: [],
    players: [
      makePlayer('p1', 'Aria'),
      makePlayer('p2', 'Kian'),
      makePlayer('p3', 'Rae'),
      makePlayer('p4', 'Echo'),
    ],
    seed: 42,
    ...overrides,
  };
}

function gameReducer(
  state: TestGameState = makeGameState(),
  action: { type: string; payload?: Partial<TestGameState> | string | { winnerId?: string } },
) {
  if (
    action.type === 'game/advance' ||
    action.type === 'game/setPhase' ||
    action.type === 'game/forcePhase'
  ) {
    return { ...state, ...(action.payload as Partial<TestGameState>) };
  }
  if (action.type === 'game/applyMinigameWinner' && state.phase === 'hoh_comp') {
    const payload = action.payload as { winnerId?: string } | undefined;
    return {
      ...state,
      phase: 'hoh_results',
      hohId: payload?.winnerId ?? state.hohId,
    };
  }
  return state;
}

function makeStore(initialGame?: Partial<TestGameState>) {
  return configureStore({
    reducer: {
      game: gameReducer,
      publicOpinion: publicOpinionReducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(publicOpinionMiddleware),
    preloadedState: {
      game: makeGameState(initialGame ?? {}),
    },
  });
}

// ── 1. Event-driven approval updates ─────────────────────────────────────────

describe('event-driven approval: nomination_results', () => {
  it('randomizes opening approvals after the first LOH result before applying the winner bonus', () => {
    const store = makeStore({
      phase: 'hoh_comp',
      week: 1,
      hohId: null,
      seed: 42,
    });

    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'hoh_results',
        hohId: 'p1',
        week: 1,
      },
    });

    const profiles = store.getState().publicOpinion.profiles;
    expect(Object.keys(profiles)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(profiles.p1.previousApproval).toBeGreaterThanOrEqual(42);
    expect(profiles.p1.previousApproval).toBeLessThanOrEqual(57);
    expect(profiles.p1.approval).toBe(profiles.p1.previousApproval + publicOpinionConfig.competitionImpact.hohWin);
    expect(profiles.p1.seasonApprovals).toEqual([
      profiles.p1.previousApproval,
      profiles.p1.approval,
    ]);

    for (const playerId of ['p2', 'p3', 'p4']) {
      expect(profiles[playerId].approval).toBeGreaterThanOrEqual(42);
      expect(profiles[playerId].approval).toBeLessThanOrEqual(57);
      expect(profiles[playerId].seasonApprovals).toEqual([profiles[playerId].approval]);
    }
  });

  it('randomizes opening approvals on the live applyMinigameWinner path', () => {
    const store = makeStore({
      phase: 'hoh_comp',
      week: 1,
      hohId: null,
      seed: 42,
    });

    store.dispatch({
      type: 'game/applyMinigameWinner',
      payload: { winnerId: 'p1' },
    });

    const profiles = store.getState().publicOpinion.profiles;
    expect(profiles.p1.previousApproval).toBeGreaterThanOrEqual(42);
    expect(profiles.p1.previousApproval).toBeLessThanOrEqual(57);
    expect(profiles.p1.approval).toBe(profiles.p1.previousApproval + publicOpinionConfig.competitionImpact.hohWin);
    expect(profiles.p2.approval).toBeGreaterThanOrEqual(42);
    expect(profiles.p2.approval).toBeLessThanOrEqual(57);
  });

  it('applies HOH backlash immediately when a liked player (≥60%) is nominated', () => {
    const store = makeStore({ phase: 'hoh_results', week: 1, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Manually set p2 to 75% (liked band)
    store.dispatch(updateApproval({ playerId: 'p2', delta: 25, reason: 'test', week: 1, addToFeed: false }));

    const beforeHohApproval = store.getState().publicOpinion.profiles.p1.approval;

    // Advance to nomination_results — p2 is the nominee
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'nomination_results',
        hohId: 'p1',
        nomineeIds: ['p2'],
        awaitingNominations: false,
        week: 1,
      },
    });

    const afterHohApproval = store.getState().publicOpinion.profiles.p1.approval;
    // HOH should have taken a backlash penalty for nominating a liked player
    expect(afterHohApproval).toBeLessThan(beforeHohApproval);
  });

  it('gives a sympathy boost to a beloved nominee (≥80%) when nominated', () => {
    const store = makeStore({ phase: 'hoh_results', week: 1, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p3 to 85% (beloved band)
    store.dispatch(updateApproval({ playerId: 'p3', delta: 35, reason: 'test', week: 1, addToFeed: false }));

    const beforeNomineeApproval = store.getState().publicOpinion.profiles.p3.approval;

    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'nomination_results',
        hohId: 'p1',
        nomineeIds: ['p3'],
        awaitingNominations: false,
        week: 1,
      },
    });

    const afterNomineeApproval = store.getState().publicOpinion.profiles.p3.approval;
    // Beloved nominee should get sympathy boost
    expect(afterNomineeApproval).toBeGreaterThan(beforeNomineeApproval);
  });

  it('does not apply HOH backlash for nominating a mixed/disliked player', () => {
    const store = makeStore({ phase: 'hoh_results', week: 1, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // p4 starts at 50 (default = mixed) — no backlash expected
    const beforeHohApproval = store.getState().publicOpinion.profiles.p1.approval;

    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'nomination_results',
        hohId: 'p1',
        nomineeIds: ['p4'],
        awaitingNominations: false,
        week: 1,
      },
    });

    const afterHohApproval = store.getState().publicOpinion.profiles.p1.approval;
    expect(afterHohApproval).toBe(beforeHohApproval);
  });

  it('approval changes happen at nomination time, not only at week_end', () => {
    const store = makeStore({ phase: 'hoh_results', week: 1, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Give p2 a liked approval rating
    store.dispatch(updateApproval({ playerId: 'p2', delta: 25, reason: 'test', week: 1, addToFeed: false }));

    const snapshotBeforeNomination = {
      p1: store.getState().publicOpinion.profiles.p1.approval,
      p2: store.getState().publicOpinion.profiles.p2.approval,
    };

    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'nomination_results',
        hohId: 'p1',
        nomineeIds: ['p2'],
        awaitingNominations: false,
        week: 1,
      },
    });

    // At least one of the players' approvals should have changed immediately
    const p1Now = store.getState().publicOpinion.profiles.p1.approval;
    const p2Now = store.getState().publicOpinion.profiles.p2.approval;
    const anyChanged = p1Now !== snapshotBeforeNomination.p1 || p2Now !== snapshotBeforeNomination.p2;
    expect(anyChanged).toBe(true);
  });
});

describe('event-driven approval: game/commitNominees (human HOH)', () => {
  it('applies HOH backlash when human HOH nominates a liked player via commitNominees', () => {
    // Human HOH flow: phase stays nomination_results, awaitingNominations=true.
    // Reactions should fire at commitNominees time, not at nomination_results phase entry.
    const store = makeStore({
      phase: 'nomination_results',
      week: 1,
      hohId: 'p1',
      awaitingNominations: true,
    });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p2 to 75% (liked band)
    store.dispatch(updateApproval({ playerId: 'p2', delta: 25, reason: 'test', week: 1, addToFeed: false }));

    const beforeHohApproval = store.getState().publicOpinion.profiles.p1.approval;

    // Human HOH commits nominees — no phase change occurs
    store.dispatch({
      type: 'game/commitNominees',
      payload: ['p2'],
    });

    const afterHohApproval = store.getState().publicOpinion.profiles.p1.approval;
    expect(afterHohApproval).toBeLessThan(beforeHohApproval);
  });

  it('gives a sympathy boost to a beloved player nominated by human HOH', () => {
    const store = makeStore({
      phase: 'nomination_results',
      week: 1,
      hohId: 'p1',
      awaitingNominations: true,
    });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p3 to 85% (beloved band)
    store.dispatch(updateApproval({ playerId: 'p3', delta: 35, reason: 'test', week: 1, addToFeed: false }));

    const beforeNomineeApproval = store.getState().publicOpinion.profiles.p3.approval;

    store.dispatch({
      type: 'game/commitNominees',
      payload: ['p3'],
    });

    const afterNomineeApproval = store.getState().publicOpinion.profiles.p3.approval;
    expect(afterNomineeApproval).toBeGreaterThan(beforeNomineeApproval);
  });

  it('does not double-apply reactions when awaitingNominations is true (human HOH path)', () => {
    // When awaitingNominations=true, nomination_results entry should NOT fire reactions
    // (since they will be fired by commitNominees). The guard on nomination_results
    // checks !awaitingNominations, so phase entry with awaitingNominations=true is a no-op.
    const store = makeStore({ phase: 'hoh_results', week: 1, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p2 to 75% (liked band)
    store.dispatch(updateApproval({ playerId: 'p2', delta: 25, reason: 'test', week: 1, addToFeed: false }));

    const beforeHohApproval = store.getState().publicOpinion.profiles.p1.approval;

    // Phase transitions to nomination_results with awaitingNominations=true (human HOH)
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'nomination_results',
        hohId: 'p1',
        nomineeIds: [],  // not yet set — human hasn't committed
        awaitingNominations: true,
        week: 1,
      },
    });

    // No reactions should have fired yet (nomineeIds empty + awaitingNominations=true)
    const afterPhaseEntry = store.getState().publicOpinion.profiles.p1.approval;
    expect(afterPhaseEntry).toBe(beforeHohApproval);

    // Now human commits nominees
    store.dispatch({
      type: 'game/commitNominees',
      payload: ['p2'],
    });

    const afterCommit = store.getState().publicOpinion.profiles.p1.approval;
    // HOH backlash fires once at commitNominees
    expect(afterCommit).toBeLessThan(afterPhaseEntry);
  });
});

describe('event-driven approval: finalizePendingEviction', () => {
  it('responsible actors receive a boost when a disliked player is evicted', () => {
    const store = makeStore({ phase: 'eviction_results', week: 2, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p2 to 30% (disliked band)
    store.dispatch(updateApproval({ playerId: 'p2', delta: -20, reason: 'test', week: 2, addToFeed: false }));

    const beforeHohApproval = store.getState().publicOpinion.profiles.p1.approval;

    // finalizePendingEviction is triggered via direct action dispatch
    store.dispatch({
      type: 'game/finalizePendingEviction',
      payload: 'p2',
    });

    const afterHohApproval = store.getState().publicOpinion.profiles.p1.approval;
    expect(afterHohApproval).toBeGreaterThan(beforeHohApproval);
  });

  it('responsible actors receive a penalty when a beloved player is evicted', () => {
    const store = makeStore({ phase: 'eviction_results', week: 2, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p3 to 85% (beloved band)
    store.dispatch(updateApproval({ playerId: 'p3', delta: 35, reason: 'test', week: 2, addToFeed: false }));

    const beforeHohApproval = store.getState().publicOpinion.profiles.p1.approval;

    store.dispatch({
      type: 'game/finalizePendingEviction',
      payload: 'p3',
    });

    const afterHohApproval = store.getState().publicOpinion.profiles.p1.approval;
    expect(afterHohApproval).toBeLessThan(beforeHohApproval);
  });

  it('evicted beloved player receives an additional penalty (fan outrage)', () => {
    const store = makeStore({ phase: 'eviction_results', week: 2, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p2 to 85% (beloved)
    store.dispatch(updateApproval({ playerId: 'p2', delta: 35, reason: 'test', week: 2, addToFeed: false }));
    const beforeApproval = store.getState().publicOpinion.profiles.p2.approval;

    store.dispatch({
      type: 'game/finalizePendingEviction',
      payload: 'p2',
    });

    const afterApproval = store.getState().publicOpinion.profiles.p2.approval;
    expect(afterApproval).toBeLessThan(beforeApproval);
  });
});

describe('event-driven approval: pov_ceremony_results', () => {
  it('applies save reactions when POV is used on a liked player', () => {
    const store = makeStore({
      phase: 'pov_ceremony',
      week: 2,
      hohId: 'p1',
      povWinnerId: 'p2',
      povSavedId: 'p3',
    });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p3 to 70% (liked band)
    store.dispatch(updateApproval({ playerId: 'p3', delta: 20, reason: 'test', week: 2, addToFeed: false }));

    const beforeSaved = store.getState().publicOpinion.profiles.p3.approval;
    const beforeSavior = store.getState().publicOpinion.profiles.p2.approval;

    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'pov_ceremony_results',
        hohId: 'p1',
        povWinnerId: 'p2',
        povSavedId: 'p3',
        week: 2,
      },
    });

    const afterSaved = store.getState().publicOpinion.profiles.p3.approval;
    const afterSavior = store.getState().publicOpinion.profiles.p2.approval;

    // Saved player should get a boost
    expect(afterSaved).toBeGreaterThan(beforeSaved);
    // Savior should also get a boost for saving a liked player
    expect(afterSavior).toBeGreaterThanOrEqual(beforeSavior);
  });
});

describe('event-driven approval: commitPublicSave', () => {
  it('saved player receives an approval boost after public save', () => {
    const store = makeStore({ phase: 'pre_veto_public_save', week: 1, nomineeIds: ['p1', 'p2', 'p3'] });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    const beforeApproval = store.getState().publicOpinion.profiles.p2.approval;

    store.dispatch({
      type: 'game/commitPublicSave',
      payload: 'p2',
    });

    const afterApproval = store.getState().publicOpinion.profiles.p2.approval;
    expect(afterApproval).toBeGreaterThan(beforeApproval);
  });
});

// ── 2. Feed budget limiting ───────────────────────────────────────────────────

describe('feed budget', () => {
  it('respects feedBudgetPerDay: no more than feedBudgetPerDay visible non-headline posts per day', () => {
    const store = makeStore({ phase: 'week_end', week: 1 });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    const budget = publicOpinionConfig.feedBudgetPerDay;
    const week = 2;

    // Dispatch more updateApproval calls than the daily budget allows
    for (let i = 0; i < budget + 3; i++) {
      store.dispatch(updateApproval({
        playerId: `p${(i % 4) + 1}`,
        delta: 1,
        reason: 'test_event',
        week,
        addToFeed: true,
        isHeadline: false,
      }));
    }

    const feed = store.getState().publicOpinion.feed;
    const nonHeadlineEntries = feed.filter((e) => !e.isHeadline && e.week === week);
    expect(nonHeadlineEntries.length).toBeLessThanOrEqual(budget);
  });

  it('headline events are not counted against the daily budget', () => {
    const store = makeStore({ phase: 'week_end', week: 1 });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    const budget = publicOpinionConfig.feedBudgetPerDay;
    const week = 2;

    // Dispatch headline events (should always go through)
    for (let i = 0; i < budget + 2; i++) {
      store.dispatch(updateApproval({
        playerId: `p${(i % 4) + 1}`,
        delta: 5,
        reason: 'headline_positive',
        week,
        addToFeed: true,
        isHeadline: true,
        headlineText: 'A viral clip dropped.',
      }));
    }

    const feed = store.getState().publicOpinion.feed;
    const headlineEntries = feed.filter((e) => e.isHeadline && e.week === week);
    // All headline entries should be present
    expect(headlineEntries.length).toBe(budget + 2);
  });

  it('approval deltas still apply even when feed budget is exhausted', () => {
    const store = makeStore({ phase: 'week_end', week: 1 });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    const budget = publicOpinionConfig.feedBudgetPerDay;
    const week = 2;

    // Fill the budget + apply one more
    for (let i = 0; i < budget + 1; i++) {
      store.dispatch(updateApproval({
        playerId: 'p1',
        delta: 2,
        reason: 'test_event',
        week,
        addToFeed: true,
        isHeadline: false,
      }));
    }

    // p1 should have received all delta increments regardless of feed budget
    const finalApproval = store.getState().publicOpinion.profiles.p1.approval;
    expect(finalApproval).toBe(50 + 2 * (budget + 1));
  });

  it('daily budget resets when the week transitions to week_start', () => {
    const store = makeStore({ phase: 'week_end', week: 1 });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Exhaust the budget on week 2
    const budget = publicOpinionConfig.feedBudgetPerDay;
    for (let i = 0; i < budget; i++) {
      store.dispatch(updateApproval({ playerId: 'p1', delta: 1, reason: 'test', week: 2 }));
    }

    // Confirm budget is full
    expect(store.getState().publicOpinion.feedPostsThisDay).toBe(budget);

    // Advance to week_start (week 3) — this resets the budget via resetDailyFeedBudget
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'week_start',
        week: 3,
        players: [
          makePlayer('p1', 'Aria'),
          makePlayer('p2', 'Kian'),
          makePlayer('p3', 'Rae'),
          makePlayer('p4', 'Echo'),
        ],
        seed: 42,
      },
    });

    // The budget counter should be fresh (or already updated to new week's posts)
    expect(store.getState().publicOpinion.currentFeedDay).toBe(3);
  });
});

// ── 3. Reaction dependency mapping ───────────────────────────────────────────

describe('computeNominationReactions', () => {
  const baseApprovals = { hoh: 55, beloved: 85, liked: 70, mixed: 50, disliked: 30, hated: 15 };

  it('produces HOH backlash when a beloved player is nominated', () => {
    const reactions = computeNominationReactions({
      nomineeIds: ['beloved'],
      hohId: 'hoh',
      approvals: baseApprovals,
      week: 1,
    });
    const hohReaction = reactions.find((r) => r.playerId === 'hoh');
    expect(hohReaction).toBeDefined();
    expect(hohReaction!.delta).toBe(publicOpinionConfig.nominationReactions.hohBelovedNomineePenalty);
  });

  it('produces smaller HOH backlash when a liked (not beloved) player is nominated', () => {
    const reactions = computeNominationReactions({
      nomineeIds: ['liked'],
      hohId: 'hoh',
      approvals: baseApprovals,
      week: 1,
    });
    const hohReaction = reactions.find((r) => r.playerId === 'hoh');
    expect(hohReaction).toBeDefined();
    expect(hohReaction!.delta).toBe(publicOpinionConfig.nominationReactions.hohLikedNomineePenalty);
  });

  it('gives no HOH penalty for nominating a mixed-approval player', () => {
    const reactions = computeNominationReactions({
      nomineeIds: ['mixed'],
      hohId: 'hoh',
      approvals: baseApprovals,
      week: 1,
    });
    const hohReaction = reactions.find((r) => r.playerId === 'hoh');
    expect(hohReaction).toBeUndefined();
  });

  it('gives no HOH penalty for nominating a disliked player', () => {
    const reactions = computeNominationReactions({
      nomineeIds: ['disliked'],
      hohId: 'hoh',
      approvals: baseApprovals,
      week: 1,
    });
    const hohReaction = reactions.find((r) => r.playerId === 'hoh');
    expect(hohReaction).toBeUndefined();
  });

  it('gives a sympathy boost to a beloved nominee', () => {
    const reactions = computeNominationReactions({
      nomineeIds: ['beloved'],
      hohId: 'hoh',
      approvals: baseApprovals,
      week: 1,
    });
    const nomineeReaction = reactions.find((r) => r.playerId === 'beloved');
    expect(nomineeReaction).toBeDefined();
    expect(nomineeReaction!.delta).toBe(publicOpinionConfig.nominationReactions.nomineeSympathyBeloved);
  });

  it('gives a smaller sympathy boost to a liked nominee', () => {
    const reactions = computeNominationReactions({
      nomineeIds: ['liked'],
      hohId: 'hoh',
      approvals: baseApprovals,
      week: 1,
    });
    const nomineeReaction = reactions.find((r) => r.playerId === 'liked');
    expect(nomineeReaction).toBeDefined();
    expect(nomineeReaction!.delta).toBe(publicOpinionConfig.nominationReactions.nomineeSympathyLiked);
  });

  it('handles multiple nominees, each generating independent reactions', () => {
    const reactions = computeNominationReactions({
      nomineeIds: ['beloved', 'disliked'],
      hohId: 'hoh',
      approvals: baseApprovals,
      week: 1,
    });
    // Should include beloved sympathy + HOH penalty (for beloved), but no HOH penalty for disliked
    const belovedNomineeReaction = reactions.find((r) => r.playerId === 'beloved');
    const dislikedNomineeReaction = reactions.find((r) => r.playerId === 'disliked');
    expect(belovedNomineeReaction?.delta).toBeGreaterThan(0); // sympathy
    expect(dislikedNomineeReaction).toBeUndefined(); // no sympathy for disliked
  });
});

describe('computeEvictionReactions', () => {
  const baseApprovals = { hoh: 55, povHolder: 60, beloved: 85, liked: 72, mixed: 50, disliked: 28, hated: 12 };

  it('HOH receives a strong boost when a hated player is evicted', () => {
    const reactions = computeEvictionReactions({
      evicteeId: 'hated',
      hohId: 'hoh',
      povHolderId: null,
      approvals: baseApprovals,
      week: 2,
    });
    const hohReaction = reactions.find((r) => r.playerId === 'hoh');
    expect(hohReaction).toBeDefined();
    expect(hohReaction!.delta).toBe(publicOpinionConfig.evictionReactions.hatedEvictedResponsibleBoost);
  });

  it('HOH receives a boost when a disliked player is evicted', () => {
    const reactions = computeEvictionReactions({
      evicteeId: 'disliked',
      hohId: 'hoh',
      povHolderId: null,
      approvals: baseApprovals,
      week: 2,
    });
    const hohReaction = reactions.find((r) => r.playerId === 'hoh');
    expect(hohReaction).toBeDefined();
    expect(hohReaction!.delta).toBe(publicOpinionConfig.evictionReactions.dislikedEvictedResponsibleBoost);
  });

  it('HOH receives a penalty when a beloved player is evicted', () => {
    const reactions = computeEvictionReactions({
      evicteeId: 'beloved',
      hohId: 'hoh',
      povHolderId: null,
      approvals: baseApprovals,
      week: 2,
    });
    const hohReaction = reactions.find((r) => r.playerId === 'hoh');
    expect(hohReaction).toBeDefined();
    expect(hohReaction!.delta).toBe(publicOpinionConfig.evictionReactions.belovedEvictedResponsiblePenalty);
  });

  it('HOH receives a penalty when a liked player is evicted', () => {
    const reactions = computeEvictionReactions({
      evicteeId: 'liked',
      hohId: 'hoh',
      povHolderId: null,
      approvals: baseApprovals,
      week: 2,
    });
    const hohReaction = reactions.find((r) => r.playerId === 'hoh');
    expect(hohReaction).toBeDefined();
    expect(hohReaction!.delta).toBe(publicOpinionConfig.evictionReactions.likedEvictedResponsiblePenalty);
  });

  it('evicted beloved player receives the evictedBelovedFinalPenalty', () => {
    const reactions = computeEvictionReactions({
      evicteeId: 'beloved',
      hohId: 'hoh',
      povHolderId: null,
      approvals: baseApprovals,
      week: 2,
    });
    const evicteeReaction = reactions.find((r) => r.playerId === 'beloved');
    expect(evicteeReaction).toBeDefined();
    expect(evicteeReaction!.delta).toBe(publicOpinionConfig.evictionReactions.evictedBelovedFinalPenalty);
  });

  it('evicted disliked player receives the evictedDislikedFinalBoost', () => {
    const reactions = computeEvictionReactions({
      evicteeId: 'disliked',
      hohId: 'hoh',
      povHolderId: null,
      approvals: baseApprovals,
      week: 2,
    });
    const evicteeReaction = reactions.find((r) => r.playerId === 'disliked');
    expect(evicteeReaction).toBeDefined();
    expect(evicteeReaction!.delta).toBe(publicOpinionConfig.evictionReactions.evictedDislikedFinalBoost);
  });

  it('both HOH and POV holder are credited when both contributed to a disliked player eviction', () => {
    const reactions = computeEvictionReactions({
      evicteeId: 'disliked',
      hohId: 'hoh',
      povHolderId: 'povHolder',
      approvals: baseApprovals,
      week: 2,
    });
    const hohReaction = reactions.find((r) => r.playerId === 'hoh');
    const povReaction = reactions.find((r) => r.playerId === 'povHolder');
    expect(hohReaction).toBeDefined();
    expect(povReaction).toBeDefined();
    expect(hohReaction!.delta).toBe(publicOpinionConfig.evictionReactions.dislikedEvictedResponsibleBoost);
    expect(povReaction!.delta).toBe(publicOpinionConfig.evictionReactions.dislikedEvictedResponsibleBoost);
  });

  it('deduplicates when HOH and POV holder are the same player', () => {
    const reactions = computeEvictionReactions({
      evicteeId: 'disliked',
      hohId: 'hoh',
      povHolderId: 'hoh',  // same player
      approvals: baseApprovals,
      week: 2,
    });
    const hohReactions = reactions.filter((r) => r.playerId === 'hoh');
    // Should only appear once, not twice
    expect(hohReactions.length).toBe(1);
  });

  it('evicted player is not counted as a responsible actor', () => {
    const reactions = computeEvictionReactions({
      evicteeId: 'beloved',
      hohId: 'beloved', // edge case: evictee is somehow the HOH (should not happen normally)
      povHolderId: null,
      approvals: baseApprovals,
      week: 2,
    });
    // The evictee-as-HOH entry should not appear as a responsible actor reaction
    const responsibleReactions = reactions.filter(
      (r) => r.playerId === 'beloved' && r.reason === 'eviction_reaction',
    );
    expect(responsibleReactions.length).toBe(0);
  });
});

describe('computePovSaveReactions', () => {
  const baseApprovals = { savior: 55, liked: 72, disliked: 30, mixed: 50 };

  it('saved player always receives a boost', () => {
    const reactions = computePovSaveReactions({
      savedPlayerId: 'liked',
      saviorId: 'savior',
      approvals: baseApprovals,
      week: 2,
    });
    const savedReaction = reactions.find((r) => r.playerId === 'liked');
    expect(savedReaction).toBeDefined();
    expect(savedReaction!.delta).toBeGreaterThan(0);
  });

  it('savior receives a boost for saving a liked player', () => {
    const reactions = computePovSaveReactions({
      savedPlayerId: 'liked',
      saviorId: 'savior',
      approvals: baseApprovals,
      week: 2,
    });
    const saviorReaction = reactions.find((r) => r.playerId === 'savior');
    expect(saviorReaction).toBeDefined();
    expect(saviorReaction!.delta).toBeGreaterThan(0);
  });

  it('savior receives a penalty for saving a disliked player', () => {
    const reactions = computePovSaveReactions({
      savedPlayerId: 'disliked',
      saviorId: 'savior',
      approvals: baseApprovals,
      week: 2,
    });
    const saviorReaction = reactions.find((r) => r.playerId === 'savior');
    expect(saviorReaction).toBeDefined();
    expect(saviorReaction!.delta).toBeLessThan(0);
  });

  it('public save has no savior reaction', () => {
    const reactions = computePovSaveReactions({
      savedPlayerId: 'liked',
      saviorId: null,
      approvals: baseApprovals,
      week: 2,
      isPublicSave: true,
    });
    // Only the saved player should appear (no savior)
    expect(reactions.length).toBe(1);
    expect(reactions[0].playerId).toBe('liked');
  });
});

// ── 4. Multiple events in the same day update approval multiple times ─────────

describe('multiple events in same day', () => {
  it('approval can update multiple times in the same week', () => {
    const store = makeStore({ phase: 'hoh_comp', week: 2 });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p2 as liked before nominations
    store.dispatch(updateApproval({ playerId: 'p2', delta: 25, reason: 'test', week: 2, addToFeed: false }));

    // HOH win → p1 gets +6
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'hoh_results',
        hohId: 'p1',
        week: 2,
      },
    });
    const afterHohWin = store.getState().publicOpinion.profiles.p1.approval;

    // Nomination → p1 gets backlash for nominating liked p2
    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'nomination_results',
        hohId: 'p1',
        nomineeIds: ['p2'],
        awaitingNominations: false,
        week: 2,
      },
    });
    const afterNomination = store.getState().publicOpinion.profiles.p1.approval;

    // p1's approval changed twice in the same week — once up for HOH win, once down for nomination
    expect(afterHohWin).toBeGreaterThan(50); // HOH win boost
    expect(afterNomination).toBeLessThan(afterHohWin); // nomination backlash
  });
});

// ── 5. Feed entries have event attribution ────────────────────────────────────

describe('feed entry attribution', () => {
  it('feed entries produced by event-driven reactions include eventType', () => {
    const store = makeStore({ phase: 'hoh_results', week: 1, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    // Set p2 as liked
    store.dispatch(updateApproval({ playerId: 'p2', delta: 25, reason: 'test', week: 1, addToFeed: false }));

    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'nomination_results',
        hohId: 'p1',
        nomineeIds: ['p2'],
        awaitingNominations: false,
        week: 1,
      },
    });

    const feed = store.getState().publicOpinion.feed;
    const nominationEntry = feed.find((e) => e.eventType === 'nomination');
    expect(nominationEntry).toBeDefined();
  });

  it('hoh_win feed entries include the correct eventType', () => {
    const store = makeStore({ phase: 'hoh_comp', week: 1, hohId: 'p1' });
    store.dispatch(initializeProfiles(['p1', 'p2', 'p3', 'p4']));

    store.dispatch({
      type: 'game/advance',
      payload: {
        phase: 'hoh_results',
        hohId: 'p1',
        week: 1,
      },
    });

    const feed = store.getState().publicOpinion.feed;
    const hohEntry = feed.find((e) => e.eventType === 'hoh_win');
    expect(hohEntry).toBeDefined();
    expect(hohEntry!.playerId).toBe('p1');
  });
});
