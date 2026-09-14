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
  settleSecretMissionDay,
  setMissionTaskBaselineApproval,
  syncMissionTask,
  triggerSecretMission,
  hydrateGame,
  applyMinigameWinner,
  completeMission,
} from '../../../src/store/gameSlice';
import settingsReducer from '../../../src/store/settingsSlice';
import socialReducer, { pushIncomingInteraction } from '../../../src/social/socialSlice';
import publicOpinionReducer, {
  initializeProfiles,
  setProfileApprovals,
} from '../../../src/publicOpinion/publicOpinionSlice';
import { secretMissionMiddleware } from '../../../src/store/secretMissionMiddleware';
import { getSecretMissionEasterEggByIntent } from '../../../src/bb/secretMissionEasterEggs';
import {
  canOfferMissionImmunity,
  pickMissionImmunityDuration,
} from '../../../src/bb/secretMission';
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
  it('counts an authoritative non-last result from the winner-only competition flow', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: { type: 'avoid_last_place', current: 1, target: 2, completed: false },
      })
    );
    const game = store.getState().game;
    const humanId = game.players.find((player) => player.isUser)?.id;
    const otherIds = game.players
      .filter((player) => player.id !== humanId)
      .map((player) => player.id);
    if (!humanId || otherIds.length < 2) throw new Error('Expected a playable competition roster');
    store.dispatch(
      hydrateGame({
        ...game,
        phase: 'loh_comp',
      })
    );

    store.dispatch(
      applyMinigameWinner({
        winnerId: otherIds[0],
        lastPlaceId: otherIds[1],
        runId: 'mission-test-authoritative-result',
      })
    );

    const updatedTask = store
      .getState()
      .game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(updatedTask.current).toBe(2);
    expect(updatedTask.completed).toBe(true);

    // The ceremony can safely replay its dispatch; one competition run has one
    // chance to advance an avoid-last objective.
    store.dispatch(
      applyMinigameWinner({
        winnerId: otherIds[0],
        lastPlaceId: otherIds[1],
        runId: 'mission-test-authoritative-result',
      })
    );
    expect(
      store.getState().game.secretMission!.tasks.find((entry) => entry.id === task.id)!.current
    ).toBe(2);
  });

  it('scores incoming-request streaks by the day a queued request was delivered', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: {
          type: 'incoming_response_streak',
          current: 0,
          target: 2,
          completed: false,
          currentStreak: 0,
          maxStreak: 0,
          startDay: 6,
        },
      })
    );
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        week: 6,
        phase: 'social_2',
      })
    );
    store.dispatch(
      pushIncomingInteraction({
        id: 'queued-yesterday-delivered-today',
        fromId: 'ai-1',
        type: 'compliment',
        text: 'Queued request',
        createdAt: 1,
        createdWeek: 5,
        createdDay: 5,
        expiresAtWeek: 7,
        read: true,
        requiresResponse: true,
        resolved: true,
        resolvedWith: 'positive',
        payload: { deliveredWeek: 6, deliveredPhase: 'social_2' },
      })
    );

    store.dispatch(setPhase('week_end'));
    expect(
      store.getState().game.secretMission!.tasks.find((entry) => entry.id === task.id)!.current
    ).toBe(0);
    store.dispatch(settleSecretMissionDay({ day: 6 }));

    const updated = store
      .getState()
      .game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(updated.current).toBe(1);
    expect(updated.lastProgressDay).toBe(6);
  });

  it('rebuilds a response streak from delivered-request history after a stale save', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: {
          type: 'incoming_response_streak',
          current: 1,
          target: 3,
          completed: false,
          currentStreak: 0,
          maxStreak: 1,
          lastProgressDay: 6,
        },
      })
    );
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        week: 7,
        phase: 'social_2',
      })
    );
    for (const day of [5, 6, 7]) {
      store.dispatch(
        pushIncomingInteraction({
          id: `answered-day-${day}`,
          fromId: 'ai-1',
          type: 'compliment',
          text: 'Answered request',
          createdAt: day,
          createdWeek: day,
          expiresAtWeek: day + 1,
          read: true,
          requiresResponse: true,
          resolved: true,
          resolvedWith: 'positive',
          payload: { deliveredWeek: day, deliveredPhase: 'social_2' },
        })
      );
    }

    store.dispatch(setPhase('week_end'));
    store.dispatch(settleSecretMissionDay({ day: 7 }));

    const updated = store
      .getState()
      .game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(updated.current).toBe(3);
    expect(updated.currentStreak).toBe(3);
    expect(updated.completed).toBe(true);
  });

  it('counts a quiet day toward the incoming-response streak', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: {
          type: 'incoming_response_streak',
          current: 0,
          target: 2,
          completed: false,
          currentStreak: 0,
          maxStreak: 0,
          startDay: 6,
        },
      })
    );
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        week: 6,
        phase: 'week_end',
      })
    );
    store.dispatch(settleSecretMissionDay({ day: 6 }));

    const updated = store
      .getState()
      .game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(updated.current).toBe(1);
    expect(updated.auditLog?.at(-1)).toContain('counts automatically');
  });

  it('replaces and retrospectively credits the legacy AI-only Vote Rally requirement', () => {
    const store = setupAcceptedMission();
    const game = store.getState().game;
    const task = game.secretMission!.tasks[0];
    const humanId = game.players.find((player) => player.isUser)!.id;
    store.dispatch({
      type: 'social/recordSocialAction',
      payload: {
        entry: {
          actorId: humanId,
          targetId: 'ai-1',
          actionId: 'rally_votes_against',
          outcome: 'success',
          source: 'manual',
          week: task.startDay ?? game.week,
        },
      },
    });
    store.dispatch(
      hydrateGame({
        ...game,
        secretMission: {
          ...game.secretMission!,
          tasks: [
            {
              ...task,
              type: 'social_action_count',
              description: 'Complete this social set before Day 8: rumor, vote rally, and favour request',
              current: 2,
              target: 3,
              completed: false,
              requiredActionIds: ['rumor', 'vote_rally', 'favor_request'],
              requireDistinctActionIds: true,
              completedActionIds: ['rumor', 'favor_request'],
            },
            ...game.secretMission!.tasks.slice(1),
          ],
        },
      })
    );

    const repaired = store.getState().game.secretMission!.tasks[0];
    expect(repaired.requiredActionIds).toEqual(['rumor', 'rally_votes_against', 'favor_request']);
    expect(repaired.target).toBe(3);
    expect(repaired.current).toBe(3);
    expect(repaired.completed).toBe(true);
  });

  it('credits a manual social-set action even when its social outcome backfires', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    const humanId = store.getState().game.players.find((player) => player.isUser)!.id;
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: {
          type: 'social_action_count',
          current: 0,
          target: 1,
          completed: false,
          requiredActionIds: ['compliment'],
          requireDistinctActionIds: true,
          completedActionIds: [],
        },
      })
    );
    store.dispatch({
      type: 'social/recordSocialAction',
      payload: {
        entry: {
          actorId: humanId,
          targetId: 'ai-1',
          actionId: 'compliment',
          outcome: 'failure',
          source: 'manual',
        },
      },
    });

    expect(store.getState().game.secretMission!.tasks[0].completed).toBe(true);
  });

  it('recovers a historical zero-energy day from the recorded action balance', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    const humanId = store.getState().game.players.find((player) => player.isUser)!.id;
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: {
          type: 'social_energy_empty_streak',
          current: 0,
          target: 2,
          completed: false,
          currentStreak: 0,
          maxStreak: 0,
          startDay: 7,
          activityDays: [],
          auditLog: [],
        },
      })
    );
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        week: 7,
        phase: 'social_2',
      })
    );
    store.dispatch({
      type: 'social/recordSocialAction',
      payload: {
        entry: {
          actorId: humanId,
          actionId: 'rumor',
          outcome: 'failure',
          // Older saves did not preserve an explicit source for player moves.
          week: 7,
          cost: 3,
          newEnergy: 0,
        },
      },
    });

    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        week: 8,
        phase: 'loh_results',
      })
    );

    const updated = store
      .getState()
      .game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(updated.current).toBe(1);
    expect(updated.currentStreak).toBe(1);
    expect(updated.activityDays).toContain('7');
  });

  it('repairs an incoming-response streak from completed days before the next settlement', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: {
          type: 'incoming_response_streak',
          current: 0,
          target: 3,
          completed: false,
          currentStreak: 0,
          maxStreak: 0,
          startDay: 5,
          uniqueDays: [],
        },
      })
    );
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        week: 8,
        phase: 'loh_results',
      })
    );
    store.dispatch(
      pushIncomingInteraction({
        id: 'answered-before-repair',
        fromId: 'ai-1',
        type: 'compliment',
        text: 'Answered request',
        createdAt: 7,
        createdWeek: 7,
        expiresAtWeek: 8,
        read: true,
        requiresResponse: true,
        resolved: true,
        resolvedWith: 'positive',
        payload: { deliveredWeek: 7, deliveredPhase: 'social_2' },
      })
    );

    const updated = store
      .getState()
      .game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(updated.current).toBe(3);
    expect(updated.currentStreak).toBe(3);
    expect(updated.completed).toBe(true);
  });

  it('caps a public-rating requirement at the available approval headroom', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: { type: 'public_approval_gain', current: 0, target: 7, completed: false },
      })
    );

    store.dispatch(setMissionTaskBaselineApproval({ taskId: task.id, approval: 98 }));

    const updated = store
      .getState()
      .game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(updated.target).toBe(2);
    expect(updated.requiredDelta).toBe(2);
  });

  it('removes an incomplete mission when its final day ends', () => {
    const store = setupAcceptedMission();
    const mission = store.getState().game.secretMission!;
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        week: mission.endDay,
        phase: 'social_2',
      })
    );

    store.dispatch(setPhase('week_end'));
    store.dispatch(settleSecretMissionDay({ day: mission.endDay }));

    expect(store.getState().game.secretMission?.status).toBe('expired');
  });

  it('keeps a completed mission claimable after its deadline passes', () => {
    const store = setupAcceptedMission();
    const mission = store.getState().game.secretMission!;
    store.dispatch(completeMission());
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        week: mission.endDay + 1,
        phase: 'week_start',
      })
    );

    store.dispatch(setPhase('social_1'));

    expect(store.getState().game.secretMission?.status).toBe('rewardPending');
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
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: {
          type: 'easter_egg_discovery',
          current: 0,
          target: 1,
          completed: false,
          discoveredEggIds: [],
        },
      })
    );

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
    const [firstTask, secondTask, thirdTask, fourthTask, fifthTask] =
      store.getState().game.secretMission!.tasks;
    const egg = getSecretMissionEasterEggByIntent('winner_prediction');
    expect(egg).toBeTruthy();
    if (!egg) throw new Error('Expected easter egg fixture');

    store.dispatch(
      syncMissionTask({
        taskId: firstTask.id,
        updates: {
          type: 'easter_egg_discovery',
          current: 1,
          target: 1,
          completed: true,
          discoveredEggIds: [egg.id],
          optional: true,
        },
      })
    );
    store.dispatch(
      syncMissionTask({
        taskId: secondTask.id,
        updates: { current: secondTask.target, completed: true },
      })
    );
    store.dispatch(
      syncMissionTask({
        taskId: thirdTask.id,
        updates: { current: thirdTask.target, completed: true },
      })
    );
    store.dispatch(
      syncMissionTask({
        taskId: fourthTask.id,
        updates: { current: fourthTask.target, completed: true },
      })
    );
    store.dispatch(
      syncMissionTask({ taskId: fifthTask.id, updates: { current: 0, completed: false } })
    );

    expect(store.getState().game.secretMission?.status).toBe('rewardPending');
  });

  it('tracks public approval from every rating update path and allows regression', () => {
    const store = setupAcceptedMission();
    const task = store.getState().game.secretMission!.tasks[0];
    store.dispatch(
      syncMissionTask({
        taskId: task.id,
        updates: { type: 'public_approval_gain', current: 0, target: 5, completed: false },
      })
    );

    store.dispatch(setMissionTaskBaselineApproval({ taskId: task.id, approval: 50 }));
    store.dispatch(setProfileApprovals({ user: 56 }));

    const improvedTask = store
      .getState()
      .game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(improvedTask.current).toBe(5);
    expect(improvedTask.completed).toBe(true);
    expect(improvedTask.lastProgressDay).toBeGreaterThan(0);

    store.dispatch(setProfileApprovals({ user: 53 }));

    const regressedTask = store
      .getState()
      .game.secretMission!.tasks.find((entry) => entry.id === task.id)!;
    expect(regressedTask.current).toBe(3);
    expect(regressedTask.completed).toBe(false);
  });

  it('expires an unused immunity reward after its activation window closes', () => {
    const store = setupAcceptedMission();
    store.dispatch(
      syncMissionTask({
        taskId: store.getState().game.secretMission!.tasks[0].id,
        updates: { current: 1, completed: true },
      })
    );
    store
      .getState()
      .game.secretMission!.tasks.slice(1)
      .forEach((task) => {
        store.dispatch(
          syncMissionTask({ taskId: task.id, updates: { current: task.target, completed: true } })
        );
      });
    store.dispatch(claimMissionReward({ claimDay: 5, durationDays: 1 }));
    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        week: 7,
        phase: 'week_start',
      })
    );
    // middleware is wired to advance/setPhase/forcePhase, so call setPhase path through hydrate+no-op update
    store.dispatch(expireMissionReward());
    expect(store.getState().game.secretMission!.reward?.eligible).toBe(false);
  });

  it('offers ceremony immunity only while nominated during pos_ceremony_results', () => {
    const store = setupAcceptedMission();
    store.dispatch(
      syncMissionTask({
        taskId: store.getState().game.secretMission!.tasks[0].id,
        updates: { current: 1, completed: true },
      })
    );
    store
      .getState()
      .game.secretMission!.tasks.slice(1)
      .forEach((task) => {
        store.dispatch(
          syncMissionTask({ taskId: task.id, updates: { current: task.target, completed: true } })
        );
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

    expect(
      canOfferMissionImmunity({
        phase: 'pos_ceremony_results',
        week: 6,
        secretMission: store.getState().game.secretMission,
        nomineeIds: ['user', 'p1'],
        lohId: 'p0',
        posWinnerId: 'p2',
        players: updated.players,
      })
    ).toBe(true);
  });

  it('does not offer ceremony immunity once only four active players remain', () => {
    const store = setupAcceptedMission();
    store.dispatch(
      syncMissionTask({
        taskId: store.getState().game.secretMission!.tasks[0].id,
        updates: { current: 1, completed: true },
      })
    );
    store
      .getState()
      .game.secretMission!.tasks.slice(1)
      .forEach((task) => {
        store.dispatch(
          syncMissionTask({ taskId: task.id, updates: { current: task.target, completed: true } })
        );
      });
    store.dispatch(claimMissionReward({ claimDay: 5, durationDays: 2 }));

    expect(
      canOfferMissionImmunity({
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
      })
    ).toBe(false);
  });

  it('consumes immunity, removes the human from the block, and keeps at least two nominees when possible', () => {
    const store = setupAcceptedMission();
    store.dispatch(
      syncMissionTask({
        taskId: store.getState().game.secretMission!.tasks[0].id,
        updates: { current: 1, completed: true },
      })
    );
    store
      .getState()
      .game.secretMission!.tasks.slice(1)
      .forEach((task) => {
        store.dispatch(
          syncMissionTask({ taskId: task.id, updates: { current: task.target, completed: true } })
        );
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
        {
          ...game.players.find((player) => player.isUser)!,
          id: 'user',
          status: 'nominated',
          isUser: true,
        },
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
