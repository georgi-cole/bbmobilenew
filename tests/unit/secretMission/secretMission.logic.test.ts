import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  acceptSecretMission,
  claimMissionReward,
  completeMission,
  declineSecretMission,
  offerSecretMission,
  triggerSecretMission,
  tryActivateSecretMission,
  hydrateGame,
} from '../../../src/store/gameSlice';
import settingsReducer, { setSim } from '../../../src/store/settingsSlice';
import {
  DEFAULT_TRIGGER_CHANCES,
  buildMissionTasks,
  checkSecretMissionTrigger,
  createSecretMissionState,
  getSecretMissionTriggerChance,
  MISSION_TEMPLATES,
  pickMissionTemplate,
} from '../../../src/bb/secretMission';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });
}

const alwaysReturn = (value: number) => () => value;

describe('getSecretMissionTriggerChance', () => {
  it('opens the default trigger window at Day 3', () => {
    expect(getSecretMissionTriggerChance(2)).toBe(0);
    expect(getSecretMissionTriggerChance(3)).toBe(DEFAULT_TRIGGER_CHANCES[3]);
    expect(getSecretMissionTriggerChance(5)).toBe(DEFAULT_TRIGGER_CHANCES[5]);
  });

  it('returns 0 when aliveCount is final-5-or-fewer', () => {
    expect(getSecretMissionTriggerChance(7, 5, null)).toBe(0);
    expect(getSecretMissionTriggerChance(7, 4, null)).toBe(0);
    expect(getSecretMissionTriggerChance(7, 6, null)).toBe(DEFAULT_TRIGGER_CHANCES[7]);
  });

  it('uses the debug override when provided', () => {
    expect(getSecretMissionTriggerChance(7, 8, 100)).toBe(1);
    expect(getSecretMissionTriggerChance(7, 8, 0)).toBe(0);
    expect(getSecretMissionTriggerChance(7, 8, 35)).toBe(0.35);
  });
});

describe('checkSecretMissionTrigger', () => {
  it('never fires before day 3', () => {
    expect(checkSecretMissionTrigger(2, alwaysReturn(0))).toBe(false);
  });

  it('respects alive-count gating', () => {
    expect(checkSecretMissionTrigger(7, alwaysReturn(0), 5, null)).toBe(false);
    expect(checkSecretMissionTrigger(7, alwaysReturn(0), 6, null)).toBe(true);
  });

  it('uses the computed probability threshold', () => {
    expect(checkSecretMissionTrigger(5, alwaysReturn(0.25))).toBe(true);
    expect(checkSecretMissionTrigger(5, alwaysReturn(0.27))).toBe(false);
  });
});

describe('mission generation', () => {
  it('keeps five deterministic templates in rotation', () => {
    expect(MISSION_TEMPLATES).toHaveLength(5);
    expect(new Set(MISSION_TEMPLATES.map((template) => template.id)).size).toBe(5);
    expect(pickMissionTemplate(3).id).toBe(pickMissionTemplate(8).id);
  });

  it('creates mission state with explicit mission window metadata', () => {
    const mission = createSecretMissionState(4);
    expect(mission.status).toBe('available');
    expect(mission.startDay).toBe(4);
    expect(mission.endDay).toBeGreaterThan(4);
    expect(mission.targetDeadlineDay).toBe(mission.endDay);
  });

  it('builds exactly five distinct requirement types and always includes survive_days', () => {
    const template = pickMissionTemplate(5);
    const tasks = buildMissionTasks(template, 5, {
      targetCandidateIds: ['p1', 'p2', 'p3'],
    });
    expect(tasks).toHaveLength(5);
    const taskTypes = tasks.map((task) => task.type);
    expect(taskTypes).toContain('survive_days');
    expect(new Set(taskTypes).size).toBe(5);
  });

  it('builds target-nominated tasks with a concrete target when selected', () => {
    const template = MISSION_TEMPLATES.find((entry) => entry.id === 'big_eye_gambit')!;
    const tasks = buildMissionTasks(template, 6, {
      targetCandidateIds: ['alpha', 'beta', 'gamma'],
    });
    const targetTask = tasks.find((task) => task.type === 'target_nominated');
    if (targetTask) {
      expect(['alpha', 'beta', 'gamma']).toContain(targetTask.targetPlayerId);
      expect(targetTask.targetDay).toBeGreaterThanOrEqual(6);
    }
  });

  it('formats generated social action labels without underscores in user-facing task text', () => {
    for (const template of MISSION_TEMPLATES) {
      const tasks = buildMissionTasks(template, 6, {
        targetCandidateIds: ['alpha', 'beta', 'gamma'],
      });
      for (const task of tasks) {
        expect(task.description).not.toContain('group_chat');
      }
    }
  });
});

describe('game slice mission flow', () => {
  it('accepts a triggered mission and creates a five-task checklist', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());
    const mission = store.getState().game.secretMission!;
    expect(mission.status).toBe('accepted');
    expect(mission.tasks).toHaveLength(5);
  });

  it('declines an offered mission and records the decline day', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(declineSecretMission(5));
    const mission = store.getState().game.secretMission!;
    expect(mission.status).toBe('declined');
    expect(mission.declinedDay).toBe(5);
  });

  it('completes the checklist and claims an immunity reward', () => {
    const store = makeStore();
    store.dispatch(triggerSecretMission(5));
    store.dispatch(offerSecretMission(5));
    store.dispatch(acceptSecretMission());
    store.dispatch(completeMission());
    store.dispatch(claimMissionReward({ claimDay: 5, durationDays: 2 }));
    const mission = store.getState().game.secretMission!;
    expect(mission.status).toBe('rewardClaimed');
    expect(mission.reward?.type).toBe('immunity');
    expect(mission.reward?.durationDays).toBe(2);
    expect(mission.reward?.activeUntilDay).toBe(6);
  });
});

describe('tryActivateSecretMission', () => {
  function setWeek(store: ReturnType<typeof makeStore>, week: number, aliveCount = 12) {
    const current = store.getState().game;
    const players = current.players.map((player, index) => ({
      ...player,
      status: index < aliveCount ? 'active' : 'evicted',
    }));
    players[0] = { ...players[0], isUser: true, status: 'active' };
    store.dispatch(hydrateGame({
      ...current,
      week,
      phase: 'week_start',
      players,
    }));
  }

  it('allows forced triggering from day 3 onward while above final 5', () => {
    const store = makeStore();
    setWeek(store, 3, 6);
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }));
    expect(store.dispatch(tryActivateSecretMission())).toBe(true);
  });

  it('blocks activation once the game reaches final 5', () => {
    const store = makeStore();
    setWeek(store, 7, 5);
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }));
    expect(store.dispatch(tryActivateSecretMission())).toBe(false);
    expect(store.getState().game.secretMission).toBeUndefined();
  });
});
