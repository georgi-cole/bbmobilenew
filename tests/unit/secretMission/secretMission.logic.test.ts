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
  buildMissionTasks,
  checkSecretMissionTrigger,
  createSecretMissionState,
  getSecretMissionTriggerChance,
  isSecretMissionSuccessful,
  MISSION_TEMPLATES,
  pickMissionTemplate,
  SECOND_SECRET_MISSION_CHANCE,
  type SecretMissionTriggerContext,
  type MissionTemplate,
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
const makeTriggerContext = (overrides: Partial<SecretMissionTriggerContext> = {}): SecretMissionTriggerContext => ({
  day: 3,
  aliveCount: 8,
  seasonMissionCount: 0,
  secondMissionRollResolved: false,
  ...overrides,
});

describe('getSecretMissionTriggerChance', () => {
  it('guarantees the first mission from the first eligible day', () => {
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 2 }))).toBe(0);
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 3, seasonMissionCount: 0 }))).toBe(1);
  });

  it('returns 0 when aliveCount is final-5-or-fewer', () => {
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, aliveCount: 5 }))).toBe(0);
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, aliveCount: 4 }))).toBe(0);
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, aliveCount: 6 }))).toBe(1);
  });

  it('uses a flat 50% chance for the second mission before the roll is resolved', () => {
    expect(getSecretMissionTriggerChance(makeTriggerContext({
      day: 7,
      seasonMissionCount: 1,
      secondMissionRollResolved: false,
    }))).toBe(SECOND_SECRET_MISSION_CHANCE);
    expect(getSecretMissionTriggerChance(makeTriggerContext({
      day: 7,
      seasonMissionCount: 1,
      secondMissionRollResolved: true,
    }))).toBe(0);
  });

  it('uses the debug override when provided', () => {
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, override: 100 }))).toBe(1);
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, override: 0 }))).toBe(0);
    expect(getSecretMissionTriggerChance(makeTriggerContext({ day: 7, override: 35 }))).toBe(0.35);
  });
});

describe('checkSecretMissionTrigger', () => {
  it('never fires before day 3', () => {
    expect(checkSecretMissionTrigger(makeTriggerContext({ day: 2 }), alwaysReturn(0))).toBe(false);
  });

  it('fires on day 3 for the guaranteed first mission boundary', () => {
    expect(checkSecretMissionTrigger(makeTriggerContext({ day: 3 }), alwaysReturn(0.99))).toBe(true);
  });

  it('respects alive-count gating', () => {
    expect(checkSecretMissionTrigger(makeTriggerContext({ day: 7, aliveCount: 5 }), alwaysReturn(0))).toBe(false);
    expect(checkSecretMissionTrigger(makeTriggerContext({ day: 7, aliveCount: 6 }), alwaysReturn(0))).toBe(true);
  });

  it('uses the computed probability threshold', () => {
    expect(checkSecretMissionTrigger(makeTriggerContext({
      day: 5,
      seasonMissionCount: 1,
      secondMissionRollResolved: false,
    }), alwaysReturn(0.25))).toBe(true);
    expect(checkSecretMissionTrigger(makeTriggerContext({
      day: 5,
      seasonMissionCount: 1,
      secondMissionRollResolved: false,
    }), alwaysReturn(0.75))).toBe(false);
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

  it('limits template selection to those that fit before final 5 when a max day span is provided', () => {
    const mission = createSecretMissionState(8, { maxDaySpan: 3, missionNumber: 2 });
    expect(mission.endDay - mission.startDay).toBeLessThanOrEqual(3);
    expect(mission.missionNumber).toBe(2);
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

  it('builds concrete social tasks instead of generic random interaction counts', () => {
    const template: MissionTemplate = {
      id: 'social-proof',
      title: 'Social Proof',
      description: 'Forces social task generation in the deterministic test path.',
      daySpan: 3,
      requirementWeights: {
        competition_placement: 0,
        avoid_last_place: 0,
        public_approval_gain: 0,
        social_energy_empty_streak: 0,
        social_action_count: 10,
        easter_egg_discovery: 0,
        incoming_response_streak: 0,
        target_nominated: 0,
      },
    };
    const socialTask = buildMissionTasks(template, 6, {
      targetCandidateIds: ['alpha', 'beta', 'gamma'],
    }).find((task) => task.type === 'social_action_count');

    expect(socialTask).toBeDefined();
    expect(socialTask?.description).not.toContain('Complete 3 social interactions');
    expect(
      /Form an alliance|Start a fight|Complete this social set/.test(socialTask?.description ?? ''),
    ).toBe(true);
  });

  it('treats the easter egg task as optional once all other tasks are done', () => {
    const tasks = [
      { id: '1', type: 'survive_days', description: '', current: 1, target: 1, completed: true },
      { id: '2', type: 'competition_placement', description: '', current: 1, target: 1, completed: true },
      { id: '3', type: 'avoid_last_place', description: '', current: 2, target: 2, completed: true },
      { id: '4', type: 'public_approval_gain', description: '', current: 5, target: 5, completed: true },
      {
        id: '5',
        type: 'easter_egg_discovery',
        description: '',
        current: 0,
        target: 1,
        completed: false,
        optional: true,
      },
    ] as const;

    expect(isSecretMissionSuccessful(tasks)).toBe(true);
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

  it('guarantees the first mission from day 3 onward while above final 5', () => {
    const store = makeStore();
    setWeek(store, 3, 6);
    expect(store.dispatch(tryActivateSecretMission())).toBe(true);
  });

  it('can trigger a second mission after the first one is resolved', () => {
    const store = makeStore();
    setWeek(store, 3, 9);
    expect(store.dispatch(tryActivateSecretMission())).toBe(true);

    const current = store.getState().game;
    store.dispatch(hydrateGame({
      ...current,
      week: 6,
      phase: 'week_start',
      secretMissionCount: 1,
      secretMissionSecondChanceResolved: false,
      secretMission: {
        ...current.secretMission!,
        status: 'expired',
      },
    }));
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }));
    expect(store.dispatch(tryActivateSecretMission())).toBe(true);
    expect(store.getState().game.secretMissionCount).toBe(2);
    expect(store.getState().game.secretMission?.missionNumber).toBe(2);
  });

  it('does not start a second mission if there is not enough runway before final 5', () => {
    const store = makeStore();
    setWeek(store, 7, 7);
    const current = store.getState().game;
    store.dispatch(hydrateGame({
      ...current,
      secretMissionCount: 1,
      secretMissionSecondChanceResolved: false,
      secretMission: {
        ...createSecretMissionState(3),
        status: 'expired',
      },
    }));

    expect(store.dispatch(tryActivateSecretMission())).toBe(false);
    expect(store.getState().game.secretMissionCount).toBe(1);
    expect(store.getState().game.secretMissionSecondChanceResolved).toBe(true);
  });

  it('blocks activation once the game reaches final 5', () => {
    const store = makeStore();
    setWeek(store, 7, 5);
    store.dispatch(setSim({ secretMissionTriggerOverride: 100 }));
    expect(store.dispatch(tryActivateSecretMission())).toBe(false);
    expect(store.getState().game.secretMission).toBeUndefined();
  });
});
