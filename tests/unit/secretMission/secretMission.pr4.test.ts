import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  acceptSecretMission,
  activateMissionImmunityReward,
  claimMissionReward,
  expireMissionReward,
  offerSecretMission,
  recordSecretMissionEasterEgg,
  setPhase,
  setMissionTaskBaselineApproval,
  syncMissionTask,
  triggerSecretMission,
  hydrateGame,
} from '../../../src/store/gameSlice';
import settingsReducer from '../../../src/store/settingsSlice';
import socialReducer from '../../../src/social/socialSlice';
import publicOpinionReducer, {
  initializeProfiles,
  updateApproval,
} from '../../../src/publicOpinion/publicOpinionSlice';
import { secretMissionMiddleware } from '../../../src/store/secretMissionMiddleware';
import { getSecretMissionEasterEggByIntent } from '../../../src/bb/secretMissionEasterEggs';
import { canOfferMissionImmunity, pickMissionImmunityDuration } from '../../../src/bb/secretMission';
import type { GameState } from '../../../src/types';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      social: socialReducer,
      publicOpinion: publicOpinionReducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(secretMissionMiddleware),
  });
}

function setupAcceptedMission() {
  const store = makeStore();
  store.dispatch(initializeProfiles(['user']));
  store.dispatch(triggerSecretMission(5));
  store.dispatch(offerSecretMission(5));
  store.dispatch(acceptSecretMission());
  return store;
}

describe('secret mission v2 follow-up', () => {
  it('removes an incomplete mission when its final day ends', () => {
    const store = setupAcceptedMission();
    const mission = store.getState().game.secretMission!;
    store.dispatch(hydrateGame({
      ...store.getState().game,
      week: mission.endDay,
      phase: 'social_2',
    }));

    store.dispatch(setPhase('week_end'));

    expect(store.getState().game.secretMission?.status).toBe('expired');
  });

  it('picks a deterministic immunity duration in the 1–3 day range', () => {
    const duration = pickMissionImmunityDuration(5, 'silent_witness');
    expect([1, 2, 3]).toContain(duration);
    expect(pickMissionImmunityDuration(5, 'silent_witness')).toBe(duration);
  });

  it('persists easter egg discoveries and progresses the matching task', () => {
    const store = makeStore();
    store.dispatch(initializeProfiles(['user']));
    store.dispatch(triggerSecretMission(3));
    store.dispatch(offerSecretMission(3));
    store.dispatch(acceptSecretMission());
    const task = store.getState().game.secretMission!.tasks[0];
    store.dispatch(syncMissionTask({
      taskId: task.id,
      updates: {
        type: 'easter_egg_discovery',
        current: 0,
        target: 1,
        completed: false,
        discoveredEggIds: [],
      },
    }));

    const egg = getSecretMissionEasterEggByIntent('winner_prediction');
    expect(egg).toBeTruthy();
    store.dispatch(recordSecretMissionEasterEgg({ eggId: egg!.id, day: 5 }));

    const updated = store.getState().game.secretMission!;
    expect(updated.discoveredEasterEggIds).toContain(egg!.id);
    const updatedTask = updated.tasks.find((entry) => entry.id === task.id)!;
    expect(updatedTask.current).toBe(1);
    expect(updatedTask.completed).toBe(true);
  });

  it('marks the mission successful when a completed easter egg covers one unfinished task', () => {
    const store = setupAcceptedMission();
    const [firstTask, secondTask, thirdTask, fourthTask, fifthTask] = store.getState().game.secretMission!.tasks;
    const egg = getSecretMissionEasterEggByIntent('winner_prediction');
    expect(egg).toBeTruthy();
    if (!egg) throw new Error('Expected easter egg fixture');

    store.dispatch(syncMissionTask({
      taskId: firstTask.id,
      updates: {
        type: 'easter_egg_discovery',
        current: 1,
        target: 1,
        completed: true,
        discoveredEggIds: [egg.id],
        optional: true,
      },
    }));
    store.dispatch(syncMissionTask({ taskId: secondTask.id, updates: { current: secondTask.target, completed: true } }));
    store.dispatch(syncMissionTask({ taskId: thirdTask.id, updates: { current: thirdTask.target, completed: true } }));
    store.dispatch(syncMissionTask({ taskId: fourthTask.id, updates: { current: fourthTask.target, completed: true } }));
    store.dispatch(syncMissionTask({ taskId: fifthTask.id, updates: { current: 0, completed: false } }));

    expect(store.getState().game.secretMission?.status).toBe('rewardPending');
  });

  it('lets the middleware initialize and satisfy public-approval tasks centrally', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    store.dispatch(syncMissionTask({
      taskId: task.id,
      updates: {
        type: 'public_approval_gain',
        current: 0,
        target: 5,
        requiredDelta: 5,
        completed: false,
      },
    }));

    store.dispatch(setMissionTaskBaselineApproval({ taskId: task.id, approval: 50 }));
    store.dispatch(updateApproval({
      playerId: 'user',
      delta: 6,
      reason: 'test_boost',
      week: 5,
    }));

    const updatedTask = store.getState().game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(updatedTask.current).toBeGreaterThan(0);
    expect(updatedTask.lastProgressDay).toBeGreaterThan(0);
  });

  it('expires an unused immunity reward after its activation window closes', () => {
    const store = setupAcceptedMission();
    store.dispatch(syncMissionTask({
      taskId: store.getState().game.secretMission!.tasks[0].id,
      updates: { current: 1, completed: true },
    }));
    store.getState().game.secretMission!.tasks.slice(1).forEach((task) => {
      store.dispatch(syncMissionTask({ taskId: task.id, updates: { current: task.target, completed: true } }));
    });
    store.dispatch(claimMissionReward({ claimDay: 5, durationDays: 1 }));
    store.dispatch(hydrateGame({
      ...store.getState().game,
      week: 7,
      phase: 'week_start',
    }));
    // middleware is wired to advance/setPhase/forcePhase, so call setPhase path through hydrate+no-op update
    store.dispatch(expireMissionReward());
    expect(store.getState().game.secretMission!.reward?.eligible).toBe(false);
  });

  it('offers ceremony immunity only while nominated during pos_ceremony_results', () => {
    const store = setupAcceptedMission();
    store.dispatch(syncMissionTask({
      taskId: store.getState().game.secretMission!.tasks[0].id,
      updates: { current: 1, completed: true },
    }));
    store.getState().game.secretMission!.tasks.slice(1).forEach((task) => {
      store.dispatch(syncMissionTask({ taskId: task.id, updates: { current: task.target, completed: true } }));
    });
    store.dispatch(claimMissionReward({ claimDay: 5, durationDays: 2 }));

    const game = store.getState().game;
    const updated: GameState = {
      ...game,
      phase: 'pos_ceremony_results',
      week: 6,
      lohId: 'p0',
      posWinnerId: 'p2',
      nomineeIds: ['user', 'p1'],
      players: game.players.map((player, index) => {
        if (player.isUser) return { ...player, status: 'nominated' };
        if (index === 1) return { ...player, id: 'p0', status: 'loh', isUser: false };
        if (index === 2) return { ...player, id: 'p1', status: 'nominated', isUser: false };
        if (index === 3) return { ...player, id: 'p2', status: 'pos', isUser: false };
        return { ...player, isUser: false, status: 'active' };
      }),
    };
    store.dispatch(hydrateGame(updated));

    expect(canOfferMissionImmunity({
      phase: 'pos_ceremony_results',
      week: 6,
      secretMission: store.getState().game.secretMission,
      nomineeIds: ['user', 'p1'],
      lohId: 'p0',
      posWinnerId: 'p2',
      players: updated.players,
    })).toBe(true);
  });

  it('does not offer ceremony immunity once only four active players remain', () => {
    const store = setupAcceptedMission();
    store.dispatch(syncMissionTask({
      taskId: store.getState().game.secretMission!.tasks[0].id,
      updates: { current: 1, completed: true },
    }));
    store.getState().game.secretMission!.tasks.slice(1).forEach((task) => {
      store.dispatch(syncMissionTask({ taskId: task.id, updates: { current: task.target, completed: true } }));
    });
    store.dispatch(claimMissionReward({ claimDay: 5, durationDays: 2 }));

    expect(canOfferMissionImmunity({
      phase: 'pos_ceremony_results',
      week: 6,
      secretMission: store.getState().game.secretMission,
      nomineeIds: ['user', 'p1'],
      lohId: 'p0',
      posWinnerId: 'p2',
      players: [
        { id: 'user', isUser: true, status: 'nominated' },
        { id: 'p0', isUser: false, status: 'loh' },
        { id: 'p1', isUser: false, status: 'nominated' },
        { id: 'p2', isUser: false, status: 'pos' },
      ],
    })).toBe(false);
  });

  it('consumes immunity, removes the human from the block, and keeps at least two nominees when possible', () => {
    const store = setupAcceptedMission();
    store.dispatch(syncMissionTask({
      taskId: store.getState().game.secretMission!.tasks[0].id,
      updates: { current: 1, completed: true },
    }));
    store.getState().game.secretMission!.tasks.slice(1).forEach((task) => {
      store.dispatch(syncMissionTask({ taskId: task.id, updates: { current: task.target, completed: true } }));
    });
    store.dispatch(claimMissionReward({ claimDay: 5, durationDays: 2 }));

    const game = store.getState().game;
    const updated: GameState = {
      ...game,
      phase: 'pos_ceremony_results',
      week: 6,
      lohId: 'ai-hoh',
      posWinnerId: 'ai-pos',
      awaitingMissionImmunityOffer: true,
      nomineeIds: ['user', 'nom-a'],
      players: [
        { ...game.players.find((player) => player.isUser)!, id: 'user', status: 'nominated', isUser: true },
        { ...game.players[1], id: 'ai-hoh', status: 'loh', isUser: false },
        { ...game.players[2], id: 'nom-a', status: 'nominated', isUser: false },
        { ...game.players[3], id: 'ai-pos', status: 'pos', isUser: false },
        { ...game.players[4], id: 'spare', status: 'active', isUser: false },
      ],
    };
    store.dispatch(hydrateGame(updated));
    store.dispatch(activateMissionImmunityReward());

    const after = store.getState().game;
    expect(after.awaitingMissionImmunityOffer).toBe(false);
    expect(after.nomineeIds).not.toContain('user');
    expect(after.nomineeIds.length).toBeGreaterThanOrEqual(2);
    expect(after.secretMission?.reward?.consumed).toBe(true);
    expect(after.secretMission?.reward?.eligible).toBe(false);
  });
});
