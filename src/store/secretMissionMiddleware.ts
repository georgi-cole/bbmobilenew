import type { Middleware } from '@reduxjs/toolkit';
import {
  expireMissionReward,
  expireSecretMission,
  setMissionTaskBaselineApproval,
  syncMissionTask,
  updateMissionTaskProgress,
} from './gameSlice';
import type { MissionTask } from '../bb/secretMission';

interface RootLike {
  game: {
    phase: string;
    week: number;
    lohId: string | null;
    nomineeIds: string[];
    secretMission?: {
      status: string;
      endDay: number;
      reward?: {
        type: string;
        activeUntilDay?: number;
        eligible: boolean;
      };
      tasks: MissionTask[];
    };
    players: Array<{ id: string; isUser?: boolean; status: string }>;
  };
  social?: {
    energyBank?: Record<string, number>;
    incomingInteractions?: Array<{
      id: string;
      createdWeek: number;
      requiresResponse: boolean;
      resolved: boolean;
      resolvedWith?: string;
    }>;
  };
  publicOpinion?: {
    profiles?: Record<string, { approval?: number }>;
  };
}

function getHumanId(state: RootLike): string | null {
  return state.game.players.find((player) => player.isUser)?.id ?? null;
}

function getAcceptedTasks(state: RootLike): MissionTask[] {
  return state.game.secretMission?.status === 'accepted'
    ? state.game.secretMission.tasks
    : [];
}

function appendAudit(task: MissionTask, text: string): string[] {
  return [...(task.auditLog ?? []), text].slice(-12);
}

function normalizeScoreEntries(
  participants: string[],
  scores?: Record<string, number>,
): Array<{ id: string; score: number }> {
  return participants.map((id) => ({ id, score: scores?.[id] ?? 0 }));
}

function computePlacement(
  participants: string[],
  scores: Record<string, number> | undefined,
  humanId: string,
): { placement: number; participantCount: number } | null {
  if (!participants.includes(humanId) || participants.length === 0) return null;
  const ranked = normalizeScoreEntries(participants, scores)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const index = ranked.findIndex((entry) => entry.id === humanId);
  if (index < 0) return null;
  return { placement: index + 1, participantCount: ranked.length };
}

function updateTaskProgress(
  dispatch: (action: ReturnType<typeof syncMissionTask>) => unknown,
  task: MissionTask,
  updates: Partial<MissionTask>,
) {
  dispatch(syncMissionTask({ taskId: task.id, updates }));
}

export const secretMissionMiddleware: Middleware = (store) => (next) => (action) => {
  const prevState = store.getState() as RootLike;
  const prevWeek = prevState.game.week;
  const prevPhase = prevState.game.phase;

  const result = next(action);

  const nextState = store.getState() as RootLike;
  const game = nextState.game;
  const humanId = getHumanId(nextState);
  const tasks = getAcceptedTasks(nextState);
  const actionType = typeof action === 'object' && action !== null && 'type' in action
    ? String((action as { type: string }).type)
    : '';
  const payload = typeof action === 'object' && action !== null && 'payload' in action
    ? (action as { payload?: unknown }).payload
    : undefined;

  if (!game.secretMission) return result;

  const aliveCount = game.players.filter((player) => player.status !== 'evicted' && player.status !== 'jury').length;
  if (
    game.secretMission.status !== 'rewardClaimed' &&
    game.secretMission.status !== 'expired' &&
    (aliveCount <= 5 || game.week > game.secretMission.endDay)
  ) {
    store.dispatch(expireSecretMission());
    return result;
  }

  if (
    game.secretMission.reward?.type === 'immunity' &&
    game.secretMission.reward.eligible &&
    typeof game.secretMission.reward.activeUntilDay === 'number' &&
    game.week > game.secretMission.reward.activeUntilDay
  ) {
    store.dispatch(expireMissionReward());
  }

  if (!humanId) return result;

  if (actionType === 'game/acceptSecretMission') {
    for (const task of tasks) {
      if (task.type !== 'public_approval_gain') continue;
      const approval = nextState.publicOpinion?.profiles?.[humanId]?.approval;
      if (typeof approval === 'number') {
        store.dispatch(setMissionTaskBaselineApproval({ taskId: task.id, approval }));
      }
    }
    return result;
  }

  if (
    (actionType === 'game/advance' || actionType === 'game/setPhase' || actionType === 'game/forcePhase') &&
    game.phase === 'week_start' &&
    (prevPhase !== 'week_start' || prevWeek !== game.week)
  ) {
    const completedDay = game.week - 1;
    for (const task of tasks) {
      if (task.type === 'survive_days') {
        const current = Math.min(game.week, task.target);
        store.dispatch(updateMissionTaskProgress({
          taskId: task.id,
          current,
          lastProgressDay: game.week,
          firstSatisfiedDay: current >= task.target ? game.week : undefined,
          auditEntry: `Reached day ${game.week}`,
        }));
      }

      if (task.type === 'social_energy_empty_streak') {
        const energy = nextState.social?.energyBank?.[humanId] ?? 0;
        const success = energy === 0;
        const currentStreak = success ? (task.currentStreak ?? 0) + 1 : 0;
        const maxStreak = Math.max(task.maxStreak ?? 0, currentStreak);
        const uniqueDays = success
          ? Array.from(new Set([...(task.uniqueDays ?? []), String(completedDay)]))
          : [];
        updateTaskProgress(store.dispatch, task, {
          current: maxStreak,
          currentStreak,
          maxStreak,
          uniqueDays,
          lastProgressDay: completedDay,
          firstSatisfiedDay: maxStreak >= task.target ? completedDay : task.firstSatisfiedDay,
          auditLog: appendAudit(task, success ? `Spent all social energy on Day ${completedDay}` : `Missed energy streak on Day ${completedDay}`),
          completed: maxStreak >= task.target,
        });
      }

      if (task.type === 'incoming_response_streak') {
        const dayInteractions = (nextState.social?.incomingInteractions ?? []).filter(
          (interaction) => interaction.createdWeek === completedDay && interaction.requiresResponse,
        );
        const success = dayInteractions.length > 0
          && dayInteractions.every(
            (interaction) => interaction.resolved && interaction.resolvedWith !== 'ignore',
          );
        const currentStreak = success ? (task.currentStreak ?? 0) + 1 : 0;
        const maxStreak = Math.max(task.maxStreak ?? 0, currentStreak);
        const uniqueDays = success
          ? Array.from(new Set([...(task.uniqueDays ?? []), String(completedDay)]))
          : [];
        updateTaskProgress(store.dispatch, task, {
          current: maxStreak,
          currentStreak,
          maxStreak,
          uniqueDays,
          lastProgressDay: completedDay,
          firstSatisfiedDay: maxStreak >= task.target ? completedDay : task.firstSatisfiedDay,
          auditLog: appendAudit(task, success ? `Answered all requests on Day ${completedDay}` : `Missed a request on Day ${completedDay}`),
          completed: maxStreak >= task.target,
        });
      }
    }
    return result;
  }

  if (actionType === 'game/commitNominees' || (actionType === 'game/advance' && game.phase === 'nomination_results')) {
    for (const task of tasks) {
      if (task.type !== 'target_nominated' || !task.targetPlayerId) continue;
      if (!game.nomineeIds.includes(task.targetPlayerId)) continue;
      updateTaskProgress(store.dispatch, task, {
        current: task.target,
        completed: true,
        lastProgressDay: game.week,
        firstSatisfiedDay: task.firstSatisfiedDay ?? game.week,
        auditLog: appendAudit(task, `${task.targetPlayerId} was nominated on Day ${game.week}`),
      });
    }
    return result;
  }

  if (actionType === 'publicOpinion/updateApproval') {
    const approval = nextState.publicOpinion?.profiles?.[humanId]?.approval;
    if (typeof approval !== 'number') return result;
    for (const task of tasks) {
      if (task.type !== 'public_approval_gain' || typeof task.baselineApproval !== 'number') continue;
      const delta = Math.max(0, approval - task.baselineApproval);
      updateTaskProgress(store.dispatch, task, {
        current: Math.min(task.target, delta),
        completed: delta >= task.target,
        lastProgressDay: game.week,
        firstSatisfiedDay: delta >= task.target ? (task.firstSatisfiedDay ?? game.week) : task.firstSatisfiedDay,
        auditLog: appendAudit(task, `Public approval changed to ${approval}`),
      });
    }
    return result;
  }

  if (actionType === 'social/recordSocialAction') {
    const entry = (payload as { entry?: { actorId?: string; actionId?: string } } | undefined)?.entry;
    if (!entry || entry.actorId !== humanId) return result;
    for (const task of tasks) {
      if (task.type !== 'social_action_count') continue;
      if (task.requiredActionIds?.length && !task.requiredActionIds.includes(entry.actionId ?? '')) continue;
      updateTaskProgress(store.dispatch, task, {
        current: Math.min(task.target, task.current + 1),
        completed: task.current + 1 >= task.target,
        lastProgressDay: game.week,
        firstSatisfiedDay: task.current + 1 >= task.target ? (task.firstSatisfiedDay ?? game.week) : task.firstSatisfiedDay,
        auditLog: appendAudit(task, `Completed social action ${entry.actionId}`),
      });
    }
    return result;
  }

  if (actionType === 'game/applyMinigameWinner' || actionType === 'game/completeMinigame') {
    const maybePayload = (payload as {
      participants?: string[];
      scores?: Record<string, number>;
      winnerId?: string;
      lastPlaceId?: string;
    } | undefined) ?? {};
    const participants = maybePayload.participants ?? [];
    const placement = computePlacement(participants, maybePayload.scores, humanId);
    if (!placement) return result;

    for (const task of tasks) {
      if (task.type === 'competition_placement' && typeof task.placementThreshold === 'number' && placement.placement <= task.placementThreshold) {
        updateTaskProgress(store.dispatch, task, {
          current: task.target,
          completed: true,
          lastProgressDay: game.week,
          firstSatisfiedDay: task.firstSatisfiedDay ?? game.week,
          auditLog: appendAudit(task, `Finished ${placement.placement}/${placement.participantCount}`),
        });
      }
      if (task.type === 'avoid_last_place' && placement.placement < placement.participantCount) {
        const nextCurrent = Math.min(task.target, task.current + 1);
        updateTaskProgress(store.dispatch, task, {
          current: nextCurrent,
          completed: nextCurrent >= task.target,
          lastProgressDay: game.week,
          firstSatisfiedDay: nextCurrent >= task.target ? (task.firstSatisfiedDay ?? game.week) : task.firstSatisfiedDay,
          auditLog: appendAudit(task, `Avoided last place (${placement.placement}/${placement.participantCount})`),
        });
      }
    }
  }

  return result;
};
