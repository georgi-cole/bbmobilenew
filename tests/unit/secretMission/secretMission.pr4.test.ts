/**
 * secretMission.pr4.test.ts — Tests for PR 4 stabilization changes.
 *
 * Covers:
 *  1. Mission generation produces varied task sets across valid trigger days
 *  2. Anti-cheese: addUniqueDayToTask credits unique days only (idempotent)
 *  3. Anti-cheese: confessional_visits cannot be trivially spammed in one day
 *  4. voteDeduction: activateVoteDeductionReward updates state for eviction pipeline
 *  5. voteDeduction: final tally is correct after deduction
 *  6. voteDeduction: no regression when no reward is present
 *  7. doubleVoteTimingMessage returns correct messaging based on phase
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  triggerSecretMission,
  offerSecretMission,
  acceptSecretMission,
  addUniqueDayToTask,
  activateVoteDeductionReward,
  declineVoteDeduction,
  advance,
  hydrateGame,
  dismissVoteResults,
} from '../../../src/store/gameSlice';
import settingsReducer from '../../../src/store/settingsSlice';
import {
  MISSION_TEMPLATES,
  pickMissionTemplate,
  buildMissionTasks,
  doubleVoteTimingMessage,
} from '../../../src/bb/secretMission';
import type { GameState, Player } from '../../../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });
}

function makePlayers(overrides: Partial<Player>[] = []): Player[] {
  const base: Player[] = [
    { id: 'p0', name: 'Player0', avatar: '🧑', status: 'hoh', isUser: false, competitionWins: { hoh: 0, pov: 0 }, competitionHistory: [], seasonPlacement: null },
    { id: 'user', name: 'User', avatar: '🧑', status: 'nominated', isUser: true, competitionWins: { hoh: 0, pov: 0 }, competitionHistory: [], seasonPlacement: null },
    { id: 'p1', name: 'Player1', avatar: '🧑', status: 'nominated', isUser: false, competitionWins: { hoh: 0, pov: 0 }, competitionHistory: [], seasonPlacement: null },
    { id: 'v1', name: 'Voter1', avatar: '🧑', status: 'active', isUser: false, competitionWins: { hoh: 0, pov: 0 }, competitionHistory: [], seasonPlacement: null },
    { id: 'v2', name: 'Voter2', avatar: '🧑', status: 'active', isUser: false, competitionWins: { hoh: 0, pov: 0 }, competitionHistory: [], seasonPlacement: null },
    { id: 'v3', name: 'Voter3', avatar: '🧑', status: 'active', isUser: false, competitionWins: { hoh: 0, pov: 0 }, competitionHistory: [], seasonPlacement: null },
  ];
  for (const override of overrides) {
    const idx = base.findIndex((p) => p.id === override.id);
    if (idx >= 0) base[idx] = { ...base[idx], ...override };
  }
  return base;
}

function makeVoteDeductionStore(
  phase: string,
  extra: Partial<GameState> = {},
) {
  const store = makeStore();
  const players = makePlayers();
  const base: GameState = {
    phase: phase as GameState['phase'],
    week: 3,
    season: 1,
    seed: 42,
    hohId: 'p0',
    nomineeIds: ['user', 'p1'],
    players,
    povWinnerId: null,
    votes: {},
    awaitingHumanVote: false,
    tvFeed: [],
    isLive: false,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    competitionSeasonStateByPlayerId: {},
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    twistActivatedThisWeek: false,
    ...extra,
  };
  store.dispatch(hydrateGame(base as GameState));
  return store;
}

// ── 1. Mission generation produces varied task sets ──────────────────────────

describe('Mission template pool — variety', () => {
  it('pool has 5 distinct templates', () => {
    expect(MISSION_TEMPLATES.length).toBe(5);
    const ids = MISSION_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(5); // all unique IDs
  });

  it('pickMissionTemplate returns different templates for consecutive trigger days', () => {
    // With the (day * 3) % 5 scheme, days 5–9 should each yield a different template.
    const templateIds = [5, 6, 7, 8, 9].map((day) => pickMissionTemplate(day).id);
    const uniqueIds = new Set(templateIds);
    // All 5 days should yield different templates (the spread cycle covers all 5 in 5 steps)
    expect(uniqueIds.size).toBe(5);
  });

  it('pickMissionTemplate cycles back after 5 days (deterministic)', () => {
    // Day 5 and day 10 map to the same index ((5*3)%5 = 0, (10*3)%5 = 0)
    expect(pickMissionTemplate(5).id).toBe(pickMissionTemplate(10).id);
    expect(pickMissionTemplate(6).id).toBe(pickMissionTemplate(11).id);
    expect(pickMissionTemplate(7).id).toBe(pickMissionTemplate(12).id);
  });

  it('not all templates produce the same task structure', () => {
    // Build task lists for all templates and verify at least 2 are structurally different
    const taskSets = MISSION_TEMPLATES.map((t) => buildMissionTasks(t, 7));
    // Compare descriptions as a proxy for structure
    const descSets = taskSets.map((tasks) => tasks.map((t) => t.description).sort().join('|'));
    const uniqueDescSets = new Set(descSets);
    expect(uniqueDescSets.size).toBeGreaterThanOrEqual(2);
  });

  it('all templates produce at least 2 tasks', () => {
    for (const template of MISSION_TEMPLATES) {
      const tasks = buildMissionTasks(template, 7);
      expect(tasks.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('templates that include survive_days set target relative to triggeredDay', () => {
    for (const template of MISSION_TEMPLATES) {
      const tasks = buildMissionTasks(template, 7);
      const surviveTask = tasks.find((t) => t.type === 'survive_days');
      if (surviveTask) {
        expect(surviveTask.target).toBeGreaterThan(7); // target > triggeredDay
      }
    }
  });

  it('templates that include confessional_visits start with uniqueDays undefined (set by reducer)', () => {
    for (const template of MISSION_TEMPLATES) {
      const tasks = buildMissionTasks(template, 7);
      const visitTask = tasks.find((t) => t.type === 'confessional_visits');
      if (visitTask) {
        // uniqueDays is not set at template level; reducer initialises it on first addUniqueDayToTask
        expect(visitTask.uniqueDays).toBeUndefined();
        expect(visitTask.current).toBe(0);
      }
    }
  });
});

// ── 2–3. Anti-cheese: addUniqueDayToTask ────────────────────────────────────

describe('addUniqueDayToTask — anti-cheese confessional visits', () => {
  function setupMissionWithVisitTask() {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());
    return store;
  }

  function getVisitTask(store: ReturnType<typeof setupMissionWithVisitTask>) {
    const sm = store.getState().game.secretMission;
    return sm?.tasks.find((t) => t.type === 'confessional_visits');
  }

  it('credits day 5 as the first unique visit', () => {
    const store = setupMissionWithVisitTask();
    const task = getVisitTask(store);
    if (!task) return; // skip if current template has no visit task

    store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '5' }));
    const updated = getVisitTask(store);
    expect(updated?.current).toBe(1);
    expect(updated?.uniqueDays).toEqual(['5']);
  });

  it('re-crediting the same day is a no-op (idempotent)', () => {
    const store = setupMissionWithVisitTask();
    const task = getVisitTask(store);
    if (!task) return;

    store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '5' }));
    store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '5' }));
    store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '5' }));
    const updated = getVisitTask(store);
    // All three dispatches for the same day should result in current = 1
    expect(updated?.current).toBe(1);
    expect(updated?.uniqueDays?.length).toBe(1);
  });

  it('three rapid entries on the same day only count as 1 visit', () => {
    const store = setupMissionWithVisitTask();
    const task = getVisitTask(store);
    if (!task) return;

    // Simulate player rapidly entering/exiting Confessional 10 times on day 5
    for (let i = 0; i < 10; i++) {
      store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '5' }));
    }
    const updated = getVisitTask(store);
    expect(updated?.current).toBe(1);
  });

  it('visits on different days each count once', () => {
    const store = setupMissionWithVisitTask();
    const task = getVisitTask(store);
    if (!task) return;

    store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '5' }));
    store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '6' }));
    store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '7' }));
    const updated = getVisitTask(store);
    expect(updated?.current).toBe(3);
    expect(updated?.uniqueDays).toEqual(['5', '6', '7']);
  });

  it('mixed: same-day repeats plus new days accumulate correctly', () => {
    const store = setupMissionWithVisitTask();
    const task = getVisitTask(store);
    if (!task) return;

    // Day 5: 4 rapid attempts → only 1 credited
    for (let i = 0; i < 4; i++) {
      store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '5' }));
    }
    // Day 6: 3 rapid attempts → only 1 credited
    for (let i = 0; i < 3; i++) {
      store.dispatch(addUniqueDayToTask({ taskId: task.id, day: '6' }));
    }
    const updated = getVisitTask(store);
    expect(updated?.current).toBe(2);
    expect(updated?.uniqueDays).toEqual(['5', '6']);
  });

  it('is a no-op when mission status is not accepted', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    // mission is 'available', not 'accepted'
    const fakeTaskId = 'confessional_visits';
    store.dispatch(addUniqueDayToTask({ taskId: fakeTaskId, day: '5' }));
    const after = store.getState().game.secretMission;
    expect(after?.status).toBe('available'); // unchanged
  });

  it('completes mission when unique-day target is reached (if visit task exists in template)', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());

    const task = store.getState().game.secretMission?.tasks.find(
      (t) => t.type === 'confessional_visits',
    );
    if (!task) return; // skip if no visit task in this template

    // Add unique days up to the target — mission should complete
    for (let day = 5; day < 5 + task.target; day++) {
      store.dispatch(addUniqueDayToTask({ taskId: task.id, day: String(day) }));
    }
    const finalTask = store.getState().game.secretMission?.tasks.find(
      (t) => t.type === 'confessional_visits',
    );
    expect(finalTask?.completed).toBe(true);
    expect(finalTask?.current).toBe(task.target);
  });
});

// ── 4–6. voteDeduction no-hang fix ──────────────────────────────────────────

describe('voteDeduction — continues into eviction pipeline (PR 4 fix)', () => {
  it('activateVoteDeductionReward leaves pendingEviction set (eviction cinematic can proceed)', () => {
    const store = makeVoteDeductionStore('eviction_results', {
      awaitingVoteDeductionPrompt: true,
      voteResults: { user: 3, p1: 1 },
      pendingEviction: {
        evicteeId: 'user',
        evictionMessage: 'User eliminated.',
      },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });

    store.dispatch(activateVoteDeductionReward());
    const state = store.getState().game;

    // pendingEviction must remain set after deduction — the eviction cinematic
    // needs it to trigger showEvictionSplash in the UI.
    expect(state.pendingEviction).not.toBeNull();
    expect(state.pendingEviction?.evicteeId).toBeDefined();

    // awaitingVoteDeductionPrompt must be cleared (UI offer should close)
    expect(state.awaitingVoteDeductionPrompt).toBe(false);
  });

  it('dismissVoteResults after activateVoteDeductionReward clears voteResults (game can unblock)', () => {
    const store = makeVoteDeductionStore('eviction_results', {
      awaitingVoteDeductionPrompt: true,
      voteResults: { user: 3, p1: 1 },
      pendingEviction: { evicteeId: 'user', evictionMessage: 'User eliminated.' },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });

    // Simulate the PR 4 handleVoteDeductionAccept path:
    // dispatch activateVoteDeductionReward then dismissVoteResults
    store.dispatch(activateVoteDeductionReward());
    store.dispatch(dismissVoteResults());

    const state = store.getState().game;

    // voteResults should be null — this makes showVoteResults false in the UI,
    // allowing showEvictionSplash to become true.
    expect(state.voteResults).toBeNull();

    // pendingEviction must still be set so the eviction cinematic renders.
    expect(state.pendingEviction).not.toBeNull();
  });

  it('final vote totals are correct after deduction', () => {
    const store = makeVoteDeductionStore('eviction_results', {
      awaitingVoteDeductionPrompt: true,
      voteResults: { user: 4, p1: 2 },
      pendingEviction: { evicteeId: 'user', evictionMessage: 'User eliminated.' },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });

    store.dispatch(activateVoteDeductionReward());
    const state = store.getState().game;

    // user: 4 - 1 = 3; p1: unchanged = 2
    expect(state.voteResults?.['user']).toBe(3);
    expect(state.voteResults?.['p1']).toBe(2);
  });

  it('advance() sets awaitingVoteDeductionPrompt for valid scenario (pipeline entry)', () => {
    const store = makeVoteDeductionStore('live_vote', {
      votes: { v1: 'user', v2: 'user', v3: 'user' },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });

    store.dispatch(advance()); // transitions live_vote → eviction_results
    const state = store.getState().game;

    expect(state.phase).toBe('eviction_results');
    expect(state.awaitingVoteDeductionPrompt).toBe(true);
    // pendingEviction is set before awaitingVoteDeductionPrompt — must be non-null
    expect(state.pendingEviction).not.toBeNull();
    // voteResults is set so the modal can display vote counts
    expect(state.voteResults).not.toBeNull();
  });

  it('no regression: advance() normal flow without voteDeduction reward still works', () => {
    // No secretMission reward present — normal vote flow should be unaffected.
    const store = makeVoteDeductionStore('live_vote', {
      votes: { v1: 'user', v2: 'user', v3: 'p1' },
    });

    store.dispatch(advance());
    const state = store.getState().game;

    expect(state.phase).toBe('eviction_results');
    expect(state.awaitingVoteDeductionPrompt).toBeFalsy();
    expect(state.pendingEviction).not.toBeNull();
    expect(state.voteResults?.['user']).toBe(2);
    expect(state.voteResults?.['p1']).toBe(1);
  });

  it('declineVoteDeduction clears prompt without touching pendingEviction', () => {
    const store = makeVoteDeductionStore('eviction_results', {
      awaitingVoteDeductionPrompt: true,
      voteResults: { user: 3, p1: 1 },
      pendingEviction: { evicteeId: 'user', evictionMessage: 'User eliminated.' },
      secretMission: {
        triggeredDay: 5,
        status: 'rewardClaimed',
        offeredDay: 5,
        offerCount: 1,
        declinedDay: null,
        tasks: [],
        templateId: 'silent_witness',
        reward: { type: 'voteDeduction', consumed: false, expired: false, eligible: true },
      },
    });

    store.dispatch(declineVoteDeduction());
    const state = store.getState().game;

    expect(state.awaitingVoteDeductionPrompt).toBe(false);
    // reward is NOT consumed on decline
    expect(state.secretMission?.reward?.consumed).toBe(false);
    // pendingEviction untouched
    expect(state.pendingEviction).not.toBeNull();
  });
});

// ── 7. doubleVote timing message ─────────────────────────────────────────────

describe('doubleVoteTimingMessage', () => {
  it('returns a same-day activation message when phase is live_vote', () => {
    const msg = doubleVoteTimingMessage('live_vote');
    expect(msg).toContain('active right now');
    expect(msg.length).toBeGreaterThan(20);
  });

  it('returns a "next vote" message when phase is NOT live_vote', () => {
    const phases = [
      'week_start', 'social_1', 'social_2', 'eviction_results',
      'week_end', 'nominations', 'pov_comp', 'pov_ceremony',
    ];
    for (const phase of phases) {
      const msg = doubleVoteTimingMessage(phase);
      expect(msg).not.toContain('active right now');
      // Should explain when the power becomes available
      expect(msg.length).toBeGreaterThan(30);
    }
  });

  it('non-live_vote message mentions automatic activation timing', () => {
    const msg = doubleVoteTimingMessage('week_end');
    // The message should mention the next live vote opportunity
    expect(msg.toLowerCase()).toMatch(/next|next live|next elimination|automatically/);
  });

  it('returns a string (never null/undefined)', () => {
    expect(typeof doubleVoteTimingMessage('live_vote')).toBe('string');
    expect(typeof doubleVoteTimingMessage('week_start')).toBe('string');
    expect(typeof doubleVoteTimingMessage('final3')).toBe('string');
  });
});
