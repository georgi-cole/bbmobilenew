/**
 * secretMission.logic.test.ts — Unit tests for the secret mission framework.
 *
 * Covers:
 *  1. Trigger chance logic by eligible day (Days 5–12)
 *  2. No trigger before Day 5 or after Day 12
 *  3. At most one mission per season (Redux reducer guard)
 *  4. Testing slider override behaviour (0, 100, intermediate values)
 *  5. Accept / decline flow (Redux reducers)
 *  6. Mission progress updates for checklist tasks
 *  7. Mission completion transitions to reward-pending state
 *  8. Turkish blue badge selector visibility in PR 1 states
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  triggerSecretMission,
  offerSecretMission,
  acceptSecretMission,
  declineSecretMission,
  updateMissionTaskProgress,
  completeMission,
  hydrateGame,
  tryActivateSecretMission,
} from '../../../src/store/gameSlice';
import settingsReducer, { setSim } from '../../../src/store/settingsSlice';
import {
  DEFAULT_TRIGGER_CHANCES,
  getSecretMissionTriggerChance,
  checkSecretMissionTrigger,
  createSecretMissionState,
  buildMissionTasks,
  MISSION_TEMPLATES,
} from '../../../src/bb/secretMission';
import { selectConfessionalMissionBadge } from '../../../src/store/selectors';
import type { RootState } from '../../../src/store/store';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });
}

/** A deterministic RNG that always returns the given value. */
const alwaysReturn = (v: number) => () => v;

// ── 1. Trigger chance logic by eligible day ───────────────────────────────────

describe('getSecretMissionTriggerChance — default table', () => {
  const expected = [
    [5,  0.10],
    [6,  0.15],
    [7,  0.20],
    [8,  0.25],
    [9,  0.30],
    [10, 0.40],
    [11, 0.50],
    [12, 0.75],
  ] as const;

  for (const [day, chance] of expected) {
    it(`Day ${day} has ${chance * 100}% chance`, () => {
      expect(getSecretMissionTriggerChance(day)).toBe(chance);
    });
  }

  it('all eligible day entries are present in DEFAULT_TRIGGER_CHANCES', () => {
    expect(Object.keys(DEFAULT_TRIGGER_CHANCES).map(Number)).toEqual(
      expect.arrayContaining([5, 6, 7, 8, 9, 10, 11, 12]),
    );
  });
});

// ── 2. No trigger before Day 5 or after Day 12 ────────────────────────────────

describe('getSecretMissionTriggerChance — out-of-window days', () => {
  const outerDays = [1, 2, 3, 4, 13, 14, 20, 0, -1];

  for (const day of outerDays) {
    it(`Day ${day} returns 0 (out of trigger window)`, () => {
      expect(getSecretMissionTriggerChance(day)).toBe(0);
    });
  }
});

describe('checkSecretMissionTrigger — never fires outside Days 5–12', () => {
  const rngAlwaysHigh = alwaysReturn(0.99);

  for (const day of [1, 2, 3, 4, 13, 14]) {
    it(`never triggers on Day ${day} regardless of RNG`, () => {
      expect(checkSecretMissionTrigger(day, rngAlwaysHigh)).toBe(false);
    });
  }
});

describe('checkSecretMissionTrigger — fires on eligible days given high roll', () => {
  const rngAlwaysLow = alwaysReturn(0); // always triggers

  for (const day of [5, 6, 7, 8, 9, 10, 11, 12]) {
    it(`triggers on Day ${day} when roll is 0`, () => {
      expect(checkSecretMissionTrigger(day, rngAlwaysLow)).toBe(true);
    });
  }
});

describe('checkSecretMissionTrigger — does not fire when roll exceeds chance', () => {
  it('does not fire on Day 5 when roll >= 0.10', () => {
    expect(checkSecretMissionTrigger(5, alwaysReturn(0.10))).toBe(false);
    expect(checkSecretMissionTrigger(5, alwaysReturn(0.50))).toBe(false);
    expect(checkSecretMissionTrigger(5, alwaysReturn(0.99))).toBe(false);
  });

  it('fires on Day 5 when roll < 0.10', () => {
    expect(checkSecretMissionTrigger(5, alwaysReturn(0.09))).toBe(true);
    expect(checkSecretMissionTrigger(5, alwaysReturn(0.00))).toBe(true);
  });
});

// ── 3. At most one mission per season ─────────────────────────────────────────

describe('triggerSecretMission reducer — at most one per season', () => {
  it('sets secretMission on first trigger', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(7));
    expect(store.getState().game.secretMission).toBeDefined();
    expect(store.getState().game.secretMission?.triggeredDay).toBe(7);
    expect(store.getState().game.secretMission?.status).toBe('available');
  });

  it('ignores a second trigger if a mission already exists', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    const firstMission = store.getState().game.secretMission;
    store.dispatch(triggerSecretMission(8)); // second trigger — must be ignored
    expect(store.getState().game.secretMission).toBe(firstMission);
    expect(store.getState().game.secretMission?.triggeredDay).toBe(5);
  });
});

// ── 4. Testing slider override behaviour ──────────────────────────────────────

describe('getSecretMissionTriggerChance — override', () => {
  it('override=100 returns 1.0 for any eligible day', () => {
    for (const day of [5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(getSecretMissionTriggerChance(day, 100)).toBe(1.0);
    }
  });

  it('override=0 returns 0.0 for any eligible day', () => {
    for (const day of [5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(getSecretMissionTriggerChance(day, 0)).toBe(0.0);
    }
  });

  it('override=50 returns 0.5 for any eligible day', () => {
    for (const day of [5, 12]) {
      expect(getSecretMissionTriggerChance(day, 50)).toBe(0.5);
    }
  });

  it('null override falls back to default table', () => {
    expect(getSecretMissionTriggerChance(5, null)).toBe(0.10);
    expect(getSecretMissionTriggerChance(12, null)).toBe(0.75);
  });

  it('undefined override falls back to default table', () => {
    expect(getSecretMissionTriggerChance(5, undefined)).toBe(0.10);
  });
});

describe('checkSecretMissionTrigger — override=100 always triggers on Day 5', () => {
  it('guarantees trigger when override=100', () => {
    expect(checkSecretMissionTrigger(5, alwaysReturn(0.99), 100)).toBe(true);
    expect(checkSecretMissionTrigger(5, alwaysReturn(0), 100)).toBe(true);
  });

  it('guarantees no trigger when override=0', () => {
    expect(checkSecretMissionTrigger(5, alwaysReturn(0), 0)).toBe(false);
    expect(checkSecretMissionTrigger(12, alwaysReturn(0), 0)).toBe(false);
  });
});

describe('tryActivateSecretMission thunk', () => {
  function setGameWeek(store: ReturnType<typeof makeStore>, week: number) {
    const state = store.getState();
    store.dispatch(
      hydrateGame({
        ...state.game,
        week,
        phase: 'week_start',
      }),
    );
  }

  it('triggers on Day 5 when override is 100', () => {
    const store = makeStore();
    setGameWeek(store, 5);
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }));

    expect(store.dispatch(tryActivateSecretMission())).toBe(true);
    expect(store.getState().game.secretMission?.triggeredDay).toBe(5);
  });

  it('does not trigger on Day 5 when override is 0', () => {
    const store = makeStore();
    setGameWeek(store, 5);
    store.dispatch(setSim({ secretMissionTriggerOverride: 0 }));

    expect(store.dispatch(tryActivateSecretMission())).toBe(false);
    expect(store.getState().game.secretMission).toBeUndefined();
  });

  it('does not trigger before Day 5 even with override 100', () => {
    const store = makeStore();
    setGameWeek(store, 4);
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }));

    expect(store.dispatch(tryActivateSecretMission())).toBe(false);
    expect(store.getState().game.secretMission).toBeUndefined();
  });

  it('does not trigger after Day 12 even with override 100', () => {
    const store = makeStore();
    setGameWeek(store, 13);
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }));

    expect(store.dispatch(tryActivateSecretMission())).toBe(false);
    expect(store.getState().game.secretMission).toBeUndefined();
  });

  it('does not trigger if a mission already exists for the season', () => {
    const store = makeStore();
    setGameWeek(store, 5);
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }));
    expect(store.dispatch(tryActivateSecretMission())).toBe(true);

    setGameWeek(store, 6);
    expect(store.dispatch(tryActivateSecretMission())).toBe(false);
    expect(store.getState().game.secretMission?.triggeredDay).toBe(5);
  });

  it('forces activation on an exact configured week', () => {
    const store = makeStore();
    setGameWeek(store, 9);
    store.dispatch(setSim({
      secretMissionTriggerOverride: 0,
      secretMissionTriggerWeekOverride: 9,
    }));

    expect(store.dispatch(tryActivateSecretMission())).toBe(true);
    expect(store.getState().game.secretMission?.triggeredDay).toBe(9);
  });

  it('does not trigger before the configured force week', () => {
    const store = makeStore();
    setGameWeek(store, 8);
    store.dispatch(setSim({
      secretMissionTriggerOverride: 100,
      secretMissionTriggerWeekOverride: 9,
    }));

    expect(store.dispatch(tryActivateSecretMission())).toBe(false);
    expect(store.getState().game.secretMission).toBeUndefined();
  });

  it('force week takes precedence over the percent override', () => {
    const store = makeStore();
    setGameWeek(store, 7);
    store.dispatch(setSim({
      secretMissionTriggerOverride: 0,
      secretMissionTriggerWeekOverride: 7,
    }));

    expect(store.dispatch(tryActivateSecretMission())).toBe(true);
    expect(store.getState().game.secretMission?.triggeredDay).toBe(7);
  });
});

// ── 5. Accept / decline flow ──────────────────────────────────────────────────

describe('offerSecretMission reducer', () => {
  it('transitions available → offered and records offeredDay', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    const sm = store.getState().game.secretMission!;
    expect(sm.status).toBe('offered');
    expect(sm.offeredDay).toBe(5);
    expect(sm.offerCount).toBe(1);
  });

  it('is a no-op when no mission exists', () => {
    const store = makeStore();
    store.dispatch(offerSecretMission(5));
    expect(store.getState().game.secretMission).toBeUndefined();
  });

  it('is a no-op when mission is already accepted', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());
    const statusBefore = store.getState().game.secretMission!.status;
    store.dispatch(offerSecretMission(6));
    expect(store.getState().game.secretMission!.status).toBe(statusBefore);
  });
});

describe('acceptSecretMission reducer', () => {
  it('transitions offered → accepted and builds tasks', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());
    const sm = store.getState().game.secretMission!;
    expect(sm.status).toBe('accepted');
    expect(sm.tasks.length).toBeGreaterThan(0);
    // All tasks start at 0 / not completed
    sm.tasks.forEach((t) => {
      expect(t.current).toBe(0);
      expect(t.completed).toBe(false);
    });
  });

  it('is a no-op when status is not offered', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    // Not yet offered
    store.dispatch(acceptSecretMission());
    expect(store.getState().game.secretMission!.status).toBe('available');
  });
});

describe('declineSecretMission reducer', () => {
  it('transitions offered → declined and records declinedDay', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(declineSecretMission(5));
    const sm = store.getState().game.secretMission!;
    expect(sm.status).toBe('declined');
    expect(sm.declinedDay).toBe(5);
  });

  it('allows a second offer after decline (offerCount < 2)', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(declineSecretMission(5));
    store.dispatch(offerSecretMission(6)); // re-offer
    const sm = store.getState().game.secretMission!;
    expect(sm.status).toBe('offered');
    expect(sm.offerCount).toBe(2);
  });

  it('does NOT allow a third offer (offerCount >= 2)', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(declineSecretMission(5));
    store.dispatch(offerSecretMission(6));
    store.dispatch(declineSecretMission(6));
    // third offer attempt should be ignored
    store.dispatch(offerSecretMission(7));
    expect(store.getState().game.secretMission!.status).toBe('declined');
  });
});

// ── 6. Mission progress updates ───────────────────────────────────────────────

describe('updateMissionTaskProgress reducer', () => {
  function setupAcceptedMission() {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());
    return store;
  }

  it('increments a task current value', () => {
    const store = setupAcceptedMission();
    const firstTask = store.getState().game.secretMission!.tasks[0];
    store.dispatch(updateMissionTaskProgress({ taskId: firstTask.id, current: 1 }));
    const updated = store.getState().game.secretMission!.tasks.find((t) => t.id === firstTask.id)!;
    expect(updated.current).toBe(1);
    expect(updated.completed).toBe(false);
  });

  it('marks a task completed when current reaches target', () => {
    const store = setupAcceptedMission();
    const firstTask = store.getState().game.secretMission!.tasks[0];
    store.dispatch(updateMissionTaskProgress({ taskId: firstTask.id, current: firstTask.target }));
    const updated = store.getState().game.secretMission!.tasks.find((t) => t.id === firstTask.id)!;
    expect(updated.completed).toBe(true);
  });

  it('is a no-op when mission is not accepted', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    // Status is 'available', not 'accepted'
    store.dispatch(updateMissionTaskProgress({ taskId: 'confessional_visits', current: 5 }));
    expect(store.getState().game.secretMission!.tasks).toHaveLength(0);
  });
});

// ── 7. Mission completion transitions to reward-pending state ─────────────────

describe('completeMission reducer', () => {
  function setupAcceptedMission() {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());
    return store;
  }

  it('marks all tasks completed and transitions to rewardPending', () => {
    const store = setupAcceptedMission();
    store.dispatch(completeMission());
    const sm = store.getState().game.secretMission!;
    expect(sm.status).toBe('rewardPending');
    sm.tasks.forEach((t) => expect(t.completed).toBe(true));
  });

  it('is a no-op when status is not accepted', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    // status is 'offered', not 'accepted'
    store.dispatch(completeMission());
    expect(store.getState().game.secretMission!.status).toBe('offered');
  });
});

describe('updateMissionTaskProgress — auto-completes when all tasks done', () => {
  it('transitions status to rewardPending when the last task is ticked', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());
    const tasks = store.getState().game.secretMission!.tasks;

    // Complete all but the last task
    tasks.slice(0, -1).forEach((t) => {
      store.dispatch(updateMissionTaskProgress({ taskId: t.id, current: t.target }));
    });
    expect(store.getState().game.secretMission!.status).toBe('accepted');

    // Complete the final task — should auto-transition
    const lastTask = tasks[tasks.length - 1];
    store.dispatch(updateMissionTaskProgress({ taskId: lastTask.id, current: lastTask.target }));
    const sm = store.getState().game.secretMission!;
    expect(sm.status).toBe('rewardPending');
  });
});

// ── 8. Turkish blue badge selector visibility ──────────────────────────────────

describe('selectConfessionalMissionBadge', () => {
  function stateWith(missionPartial: Partial<ReturnType<typeof createSecretMissionState>> | undefined): RootState {
    const store = makeStore();
    if (missionPartial) {
      store.dispatch(triggerSecretMission(5));
    }
    const baseState = store.getState() as RootState;
    if (!missionPartial) return baseState;
    return {
      ...baseState,
      game: {
        ...baseState.game,
        secretMission: { ...baseState.game.secretMission!, ...missionPartial },
      },
    } as RootState;
  }

  it('returns false when no mission exists', () => {
    const store = makeStore();
    expect(selectConfessionalMissionBadge(store.getState() as RootState)).toBe(false);
  });

  it('returns true when status is available', () => {
    const s = stateWith({ status: 'available' });
    expect(selectConfessionalMissionBadge(s)).toBe(true);
  });

  it('returns true when status is offered', () => {
    const s = stateWith({ status: 'offered' });
    expect(selectConfessionalMissionBadge(s)).toBe(true);
  });

  it('returns true when status is accepted', () => {
    const s = stateWith({ status: 'accepted' });
    expect(selectConfessionalMissionBadge(s)).toBe(true);
  });

  it('returns true when status is rewardPending', () => {
    const s = stateWith({ status: 'rewardPending' });
    expect(selectConfessionalMissionBadge(s)).toBe(true);
  });

  it('returns false when status is declined', () => {
    const s = stateWith({ status: 'declined' });
    expect(selectConfessionalMissionBadge(s)).toBe(false);
  });

  it('returns false when status is expired', () => {
    const s = stateWith({ status: 'expired' });
    expect(selectConfessionalMissionBadge(s)).toBe(false);
  });

});

// ── Helper unit tests ─────────────────────────────────────────────────────────

describe('createSecretMissionState', () => {
  it('creates a well-formed initial state', () => {
    const state = createSecretMissionState(7);
    expect(state.triggeredDay).toBe(7);
    expect(state.status).toBe('available');
    expect(state.offeredDay).toBeNull();
    expect(state.offerCount).toBe(0);
    expect(state.declinedDay).toBeNull();
    expect(state.tasks).toHaveLength(0); // tasks added on accept
    expect(state.templateId).toBeDefined();
  });
});

describe('buildMissionTasks', () => {
  it('returns tasks with current=0 and completed=false', () => {
    const template = MISSION_TEMPLATES[0];
    const tasks = buildMissionTasks(template, 5);
    expect(tasks.length).toBeGreaterThan(0);
    tasks.forEach((t) => {
      expect(t.current).toBe(0);
      expect(t.completed).toBe(false);
    });
  });

  it('survive_days task target is triggeredDay + 3', () => {
    const template = MISSION_TEMPLATES[0];
    const triggeredDay = 6;
    const tasks = buildMissionTasks(template, triggeredDay);
    const surviveTask = tasks.find((t) => t.type === 'survive_days');
    expect(surviveTask).toBeDefined();
    expect(surviveTask!.target).toBe(triggeredDay + 3);
  });
});
