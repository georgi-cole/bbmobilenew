import type { Middleware } from '@reduxjs/toolkit';
import {
  addTvEvent,
  expireMissionReward,
  expireSecretMission,
  settleSecretMissionDay,
  setMissionTaskBaselineApproval,
  syncMissionTask,
  updateMissionTaskProgress,
} from './gameSlice';
import { repairLegacyMissionTasks, type MissionTask } from '../bb/secretMission';

interface RootLike {
  game: {
    phase: string;
    week: number;
    lohId: string | null;
    nomineeIds: string[];
    lastCompetitionResolution?: {
      runId: string;
      status: 'completed' | 'quit' | 'skipped' | 'interrupted';
      gameKey: string;
      week: number;
      participants: string[];
      humanId?: string;
      winnerId?: string;
      lastPlaceId?: string | null;
      placements?: string[];
    } | null;
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
    players: Array<{
      id: string;
      isUser?: boolean;
      status: string;
    }>;
  };
  social?: {
    energyBank?: Record<string, number>;
    actionHistory?: Array<{
      actorId?: string;
      actionId?: string;
      outcome?: 'success' | 'failure';
      source?: 'manual' | 'system';
      week?: number;
      cost?: number;
      costs?: { energy?: number };
      newEnergy?: number;
      balancesAfter?: { energy?: number };
    }>;
    sessionLogs?: Array<{
      actorId?: string;
      actionId?: string;
      outcome?: 'success' | 'failure';
      source?: 'manual' | 'system';
      week?: number;
      cost?: number;
      costs?: { energy?: number };
      newEnergy?: number;
      balancesAfter?: { energy?: number };
    }>;
    incomingInteractions?: Array<{
      id: string;
      createdWeek: number;
      requiresResponse: boolean;
      resolved: boolean;
      resolvedWith?: string;
      createdDay?: number;
      payload?: { deliveredWeek?: unknown; deliveredDay?: unknown };
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
  return state.game.secretMission?.status === 'accepted' ? state.game.secretMission.tasks : [];
}

function appendAudit(task: MissionTask, text: string): string[] {
  return [...(task.auditLog ?? []), text].slice(-12);
}

function updateTaskProgress(
  dispatch: (action: ReturnType<typeof syncMissionTask>) => unknown,
  task: MissionTask,
  updates: Partial<MissionTask>
) {
  dispatch(syncMissionTask({ taskId: task.id, updates }));
}

function getInteractionDeliveryDay(interaction: {
  createdWeek: number;
  createdDay?: number;
  payload?: { deliveredWeek?: unknown; deliveredDay?: unknown };
}): number {
  const deliveredDay = interaction.payload?.deliveredDay ?? interaction.payload?.deliveredWeek;
  if (typeof deliveredDay === 'number') return deliveredDay;
  return interaction.createdDay ?? interaction.createdWeek;
}

function getIncomingResponseStreak(
  interactions: NonNullable<RootLike['social']>['incomingInteractions'],
  startDay: number,
  completedDay: number
): {
  currentStreak: number;
  maxStreak: number;
  uniqueDays: string[];
  todayCount: number;
  todaySucceeded: boolean;
} {
  let currentStreak = 0;
  let maxStreak = 0;
  const uniqueDays: string[] = [];
  let todayCount = 0;
  let todaySucceeded = false;

  for (let day = startDay; day <= completedDay; day += 1) {
    const dayInteractions = (interactions ?? []).filter(
      (interaction) =>
        getInteractionDeliveryDay(interaction) === day && interaction.requiresResponse
    );
    // A player cannot answer a request that was never delivered. Treat a quiet
    // day as compliant, while still failing days with an ignored or dismissed
    // request that actually reached the inbox.
    const succeeded = dayInteractions.every(
        (interaction) =>
          interaction.resolved &&
          interaction.resolvedWith !== 'ignore' &&
          interaction.resolvedWith !== 'dismiss'
      );

    if (day === completedDay) {
      todayCount = dayInteractions.length;
      todaySucceeded = succeeded;
    }

    if (succeeded) {
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
      uniqueDays.push(String(day));
    } else {
      currentStreak = 0;
    }
  }

  return { currentStreak, maxStreak, uniqueDays, todayCount, todaySucceeded };
}

function getCompletedMissionDay(game: RootLike['game']): number {
  // A game day is only complete once its week-end phase has begun. During the
  // following day's ceremony/results screens, the prior day is the latest
  // safe point for a historical streak reconciliation.
  return game.phase === 'week_end' ? game.week : game.week - 1;
}

function getPersistentActionHistory(social: RootLike['social']) {
  return social?.actionHistory ?? social?.sessionLogs ?? [];
}

function getRecordedEnergySuccessDays(
  task: MissionTask,
  actionHistory: NonNullable<RootLike['social']>['actionHistory'],
  humanId: string,
  completedDay: number
): string[] {
  const recordedDays = new Set<string>();
  const manualActionDays = new Set(
    (actionHistory ?? [])
      .filter(
        (entry) =>
          entry.actorId === humanId &&
          // Explicit source metadata was added after some existing saves had
          // already recorded player moves. Background/AI entries are always
          // marked system, so an absent source remains a valid human receipt.
          entry.source !== 'system' &&
          typeof entry.week === 'number'
      )
      .map((entry) => String(entry.week))
  );

  for (const entry of actionHistory ?? []) {
    const energyCost = entry.costs?.energy ?? entry.cost ?? 0;
    const energyAfter = entry.balancesAfter?.energy ?? entry.newEnergy;
    if (
      entry.actorId === humanId &&
      entry.source !== 'system' &&
      typeof entry.week === 'number' &&
      energyCost > 0 &&
      energyAfter === 0
    ) {
      // This is the authoritative receipt: an actual human move consumed the
      // final unit of energy. Unlike the legacy audit phrasing, it survives
      // task-log truncation and does not credit a zero-cost interaction.
      recordedDays.add(String(entry.week));
    }
  }

  for (const entry of task.auditLog ?? []) {
    const spentMatch = /^Spent all social energy on Day (\d+)$/.exec(entry);
    if (spentMatch) {
      recordedDays.add(spentMatch[1]);
      continue;
    }

    // Older builds reached zero correctly, but rejected the day because they
    // only accepted a successful-move receipt. A recorded manual move now
    // supplies that missing receipt; the audit line remains the proof that
    // energy actually was zero, so this cannot manufacture a success day.
    const missingReceiptMatch =
      /^Energy was 0 on Day (\d+), but no successful social move was recorded$/.exec(entry);
    if (missingReceiptMatch && manualActionDays.has(missingReceiptMatch[1])) {
      recordedDays.add(missingReceiptMatch[1]);
    }
  }

  return [...recordedDays]
    .map(Number)
    .filter(
      (day) =>
        Number.isInteger(day) &&
        day >= (task.startDay ?? day) &&
        day <= Math.min(task.endDay ?? completedDay, completedDay)
    )
    .sort((left, right) => left - right)
    .map(String);
}

function getLongestEndingStreak(successDays: readonly string[], completedDay: number): {
  currentStreak: number;
  maxStreak: number;
} {
  const successful = new Set(successDays.map(Number));
  let currentStreak = 0;
  let maxStreak = 0;

  for (let day = Math.min(...successful, completedDay); day <= completedDay; day += 1) {
    if (successful.has(day)) {
      currentStreak += 1;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return { currentStreak, maxStreak };
}

function hasCreditedCompetitionRun(task: MissionTask, runId: string): boolean {
  return task.creditedCompetitionRunIds?.includes(runId) === true;
}

function appendCompetitionRun(task: MissionTask, runId: string): string[] {
  return Array.from(new Set([...(task.creditedCompetitionRunIds ?? []), runId])).slice(-24);
}

export const secretMissionMiddleware: Middleware = (store) => (next) => (action) => {
  const prevState = store.getState() as RootLike;

  const result = next(action);

  let nextState = store.getState() as RootLike;
  let game = nextState.game;
  let tasks = getAcceptedTasks(nextState);
  const actionType =
    typeof action === 'object' && action !== null && 'type' in action
      ? String((action as { type: string }).type)
      : '';
  const payload =
    typeof action === 'object' && action !== null && 'payload' in action
      ? (action as { payload?: unknown }).payload
      : undefined;
  const resolution = game.lastCompetitionResolution;

  if (!game.secretMission) return result;

  // Upgrade an in-progress legacy save as soon as it next receives an action.
  // This also protects a running development session that has not rehydrated.
  const repairedTasks = repairLegacyMissionTasks(game.secretMission.tasks);
  for (let index = 0; index < repairedTasks.length; index += 1) {
    if (repairedTasks[index] === game.secretMission.tasks[index]) continue;
    store.dispatch(syncMissionTask({ taskId: repairedTasks[index].id, updates: repairedTasks[index] }));
  }
  if (repairedTasks.some((task, index) => task !== game.secretMission!.tasks[index])) {
    nextState = store.getState() as RootLike;
    game = nextState.game;
    tasks = getAcceptedTasks(nextState);
  }
  if (!game.secretMission) return result;
  const humanId = getHumanId(nextState);

  if (
    (actionType === 'game/skipMinigame' || actionType === 'game/advance') &&
    (resolution?.status === 'skipped' || resolution?.status === 'interrupted')
  ) {
    for (const task of tasks) {
      if (task.type !== 'avoid_last_place') continue;
      updateTaskProgress(store.dispatch, task, {
        auditLog: appendAudit(
          task,
          `${resolution.status} ${resolution.gameKey}; no mission credit awarded`
        ),
      });
    }
  }

  const aliveCount = game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  ).length;
  // Only an unfinished, accepted mission can run out of time. A completed
  // mission stays rewardPending until its box is claimed; otherwise advancing
  // to the next day could erase the reward before the player sees it.
  if (
    game.secretMission.status === 'accepted' &&
    (aliveCount < 5 || game.week > game.secretMission.endDay)
  ) {
    store.dispatch(expireSecretMission());
    return result;
  }

  if (
    prevState.game.secretMission?.status === 'accepted' &&
    game.secretMission.status === 'rewardPending'
  ) {
    store.dispatch(
      addTvEvent({
        text: 'SECRET MISSION COMPLETE! Your reward is waiting in the Confessional. 🎁',
        type: 'game',
        channels: ['tv', 'mainLog'],
        source: 'system',
        meta: {
          forceOnTv: true,
          broadcastPriority: 'critical',
          major: 'secret_mission_complete',
          announcementTitle: 'Secret Mission Complete',
          announcementSubtitle: 'Visit the Confessional to choose your reward.',
        },
      })
    );
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

  // A player may already have used the human-facing Rally Votes Against action
  // before a saved mission's AI-only Vote Rally requirement is repaired. Credit
  // that recorded manual action when the restored task is reconciled.
  for (const task of tasks) {
    if (
      task.type !== 'social_action_count' ||
      !task.requiredActionIds?.includes('rally_votes_against') ||
      task.completedActionIds?.includes('rally_votes_against') ||
      !task.auditLog?.includes('Replaced unavailable AI-only Vote Rally with Rally Votes Against')
    ) {
      continue;
    }
    const rallyWasPerformed = getPersistentActionHistory(nextState.social).some(
      (entry) =>
        entry.actorId === humanId &&
        entry.actionId === 'rally_votes_against' &&
        entry.source !== 'system' &&
        typeof entry.week === 'number' &&
        entry.week >= (task.startDay ?? entry.week) &&
        entry.week <= (task.endDay ?? entry.week)
    );
    if (!rallyWasPerformed) continue;
    const completedActionIds = [...(task.completedActionIds ?? []), 'rally_votes_against'];
    const current = Math.min(task.target, completedActionIds.length);
    updateTaskProgress(store.dispatch, task, {
      current,
      completedActionIds,
      completed: current >= task.target,
      lastProgressDay: game.week,
      firstSatisfiedDay:
        current >= task.target ? (task.firstSatisfiedDay ?? game.week) : task.firstSatisfiedDay,
      auditLog: appendAudit(task, 'Credited recorded Rally Votes Against action'),
    });
  }

  // Repair already-running missions without waiting for another day to end.
  // The current day remains provisional; only receipts through the last fully
  // completed day can affect a historical streak.
  if (actionType !== settleSecretMissionDay.type && game.phase !== 'week_end') {
    const completedDay = Math.min(getCompletedMissionDay(game), game.secretMission.endDay);
    for (const task of tasks) {
      if (completedDay < (task.startDay ?? completedDay)) continue;

      if (task.type === 'social_energy_empty_streak') {
        const recoveredDays = getRecordedEnergySuccessDays(
          task,
          getPersistentActionHistory(nextState.social),
          humanId,
          completedDay
        );
        const streak = getLongestEndingStreak(recoveredDays, completedDay);
        const maxStreak = Math.max(task.maxStreak ?? task.current, streak.maxStreak);
        const current = Math.max(task.current, maxStreak);
        const activityDays = Array.from(
          new Set([...(task.activityDays ?? []), ...recoveredDays])
        );
        const hasChanged =
          current !== task.current ||
          streak.currentStreak !== (task.currentStreak ?? 0) ||
          activityDays.join('|') !== (task.activityDays ?? []).join('|');
        if (!hasChanged) continue;
        const recoveredOnly = recoveredDays.filter(
          (day) => !(task.activityDays ?? []).includes(day)
        );
        updateTaskProgress(store.dispatch, task, {
          current,
          currentStreak: streak.currentStreak,
          maxStreak,
          uniqueDays: recoveredDays,
          activityDays,
          lastProgressDay: Math.max(task.lastProgressDay ?? 0, completedDay),
          firstSatisfiedDay:
            current >= task.target
              ? (task.firstSatisfiedDay ?? completedDay)
              : task.firstSatisfiedDay,
          completed: current >= task.target,
          auditLog:
            recoveredOnly.length > 0
              ? appendAudit(
                  task,
                  `Recovered manual social activity for Day ${recoveredOnly.join(', ')}`
                )
              : task.auditLog,
        });
      }

      if (task.type === 'incoming_response_streak') {
        const responseStreak = getIncomingResponseStreak(
          nextState.social?.incomingInteractions,
          task.startDay ?? completedDay,
          completedDay
        );
        const maxStreak = Math.max(task.maxStreak ?? task.current, responseStreak.maxStreak);
        const current = Math.max(task.current, maxStreak);
        const hasChanged =
          current !== task.current ||
          responseStreak.currentStreak !== (task.currentStreak ?? 0) ||
          responseStreak.uniqueDays.join('|') !== (task.uniqueDays ?? []).join('|');
        if (!hasChanged) continue;
        updateTaskProgress(store.dispatch, task, {
          current,
          currentStreak: responseStreak.currentStreak,
          maxStreak,
          uniqueDays: responseStreak.uniqueDays,
          lastProgressDay: Math.max(task.lastProgressDay ?? 0, completedDay),
          firstSatisfiedDay:
            current >= task.target
              ? (task.firstSatisfiedDay ?? completedDay)
              : task.firstSatisfiedDay,
          completed: current >= task.target,
          auditLog: appendAudit(task, `Rebuilt incoming-request streak through Day ${completedDay}`),
        });
      }
    }
  }

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

  // Daily streaks must settle after the social middleware has processed the
  // transition's deadlines and invalidations. Processing the raw phase action
  // first could stamp the day as settled, then cause the post-social receipt
  // (which has the final interaction state) to be ignored as a duplicate.
  if (actionType === settleSecretMissionDay.type && game.phase === 'week_end') {
    const completedDay = game.week;
    for (const task of tasks) {
      // A lifecycle receipt can arrive after the transition itself (once social
      // expiry has settled). Never let either route credit the same day twice.
      if (
        (task.type === 'social_energy_empty_streak' || task.type === 'incoming_response_streak') &&
        task.lastProgressDay === completedDay
      ) {
        continue;
      }
      if (task.type === 'survive_days') {
        const current = Math.min(completedDay, task.target);
        store.dispatch(
          updateMissionTaskProgress({
            taskId: task.id,
            current,
            lastProgressDay: completedDay,
            firstSatisfiedDay: current >= task.target ? completedDay : undefined,
            auditEntry: `Reached day ${completedDay}`,
          })
        );
      }

      if (task.type === 'social_energy_empty_streak') {
        const energy = nextState.social?.energyBank?.[humanId] ?? 0;
        // Zero must come from actual play. A missing grant, an unavailable
        // Social module, or an unrelated resource reset must not manufacture
        // a successful mission day.
        const spentEnergy = (task.activityDays ?? []).includes(String(completedDay));
        const success = energy === 0 && spentEnergy;
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
          auditLog: appendAudit(
            task,
            success
              ? `Spent all social energy on Day ${completedDay}`
              : energy === 0
                ? `Energy was 0 on Day ${completedDay}, but no successful social move was recorded`
                : `Missed energy streak on Day ${completedDay}: ${energy} energy remained`
          ),
          completed: maxStreak >= task.target,
        });
      }

      if (task.type === 'incoming_response_streak') {
        const responseStreak = getIncomingResponseStreak(
          nextState.social?.incomingInteractions,
          task.startDay ?? completedDay,
          completedDay
        );
        // Rebuild from the delivered-request receipts, rather than trusting a
        // previously persisted counter. This both makes replay idempotent and
        // repairs saves that were affected by the old pre-social settlement race.
        const maxStreak = Math.max(task.maxStreak ?? 0, responseStreak.maxStreak);
        updateTaskProgress(store.dispatch, task, {
          current: maxStreak,
          currentStreak: responseStreak.currentStreak,
          maxStreak,
          uniqueDays: responseStreak.uniqueDays,
          lastProgressDay: completedDay,
          firstSatisfiedDay: maxStreak >= task.target ? completedDay : task.firstSatisfiedDay,
          auditLog: appendAudit(
            task,
            responseStreak.todayCount === 0
              ? `No response-required incoming request was delivered on Day ${completedDay}; day counts automatically`
              : responseStreak.todaySucceeded
                ? `Answered all ${responseStreak.todayCount} requests on Day ${completedDay}`
                : `Missed, ignored, or auto-dismissed a request on Day ${completedDay}`
          ),
          completed: maxStreak >= task.target,
        });
      }
    }
    const latest = store.getState() as RootLike;
    if (
      completedDay >= game.secretMission.endDay &&
      latest.game.secretMission?.status === 'accepted'
    ) {
      store.dispatch(expireSecretMission());
    }
    return result;
  }

  // Nominees can be added by the initial ceremony, a replacement ceremony, or
  // a twist. Observe the resulting state transition rather than a short list of
  // reducer action names, so every real nomination route is covered.
  const newlyNominatedIds = game.nomineeIds.filter((id) => !prevState.game.nomineeIds.includes(id));
  if (newlyNominatedIds.length > 0) {
    for (const task of tasks) {
      if (task.type !== 'target_nominated' || !task.targetPlayerId) continue;
      if (!newlyNominatedIds.includes(task.targetPlayerId)) continue;
      updateTaskProgress(store.dispatch, task, {
        current: task.target,
        completed: true,
        lastProgressDay: game.week,
        firstSatisfiedDay: task.firstSatisfiedDay ?? game.week,
        auditLog: appendAudit(task, `${task.targetPlayerId} was nominated on Day ${game.week}`),
      });
    }
  }

  const previousApproval = prevState.publicOpinion?.profiles?.[humanId]?.approval;
  const currentApproval = nextState.publicOpinion?.profiles?.[humanId]?.approval;
  if (typeof currentApproval === 'number' && currentApproval !== previousApproval) {
    for (const task of tasks) {
      if (task.type !== 'public_approval_gain' || typeof task.baselineApproval !== 'number')
        continue;
      // Public-rating objectives intentionally reflect the current rating. A
      // later approval loss may reduce this value again.
      const delta = Math.max(0, currentApproval - task.baselineApproval);
      updateTaskProgress(store.dispatch, task, {
        current: Math.min(task.target, delta),
        completed: delta >= task.target,
        lastProgressDay: game.week,
        firstSatisfiedDay:
          delta >= task.target ? (task.firstSatisfiedDay ?? game.week) : task.firstSatisfiedDay,
        auditLog: appendAudit(task, `Public approval changed to ${currentApproval}`),
      });
    }
  }

  if (actionType === 'social/recordSocialAction') {
    const entry = (
      payload as
        | {
            entry?: {
              actorId?: string;
              actionId?: string;
              targetId?: string;
              outcome?: 'success' | 'failure';
              source?: 'manual' | 'system';
            };
          }
        | undefined
    )?.entry;
    if (
      !entry ||
      entry.actorId !== humanId ||
      entry.source === 'system'
    ) {
      return result;
    }
    for (const task of tasks) {
      if (task.type !== 'social_energy_empty_streak') continue;
      const activityDays = Array.from(new Set([...(task.activityDays ?? []), String(game.week)]));
      updateTaskProgress(store.dispatch, task, {
        activityDays,
        auditLog: appendAudit(task, `Successful social action recorded on Day ${game.week}`),
      });
    }
    for (const task of tasks) {
      if (task.type !== 'social_action_count') continue;
      if (task.requiredActionIds?.length && !task.requiredActionIds.includes(entry.actionId ?? ''))
        continue;
      if (task.targetPlayerId && entry.targetId !== task.targetPlayerId) continue;
      if (task.requireDistinctActionIds) {
        const actionId = entry.actionId ?? '';
        if (!actionId) continue;
        if (task.completedActionIds?.includes(actionId)) continue;
        const nextCompletedActionIds = [...(task.completedActionIds ?? []), actionId];
        const nextCurrent = Math.min(task.target, nextCompletedActionIds.length);
        updateTaskProgress(store.dispatch, task, {
          current: nextCurrent,
          completedActionIds: nextCompletedActionIds,
          completed: nextCurrent >= task.target,
          lastProgressDay: game.week,
          firstSatisfiedDay:
            nextCurrent >= task.target
              ? (task.firstSatisfiedDay ?? game.week)
              : task.firstSatisfiedDay,
          auditLog: appendAudit(task, `Completed social action ${entry.actionId}`),
        });
        continue;
      }
      updateTaskProgress(store.dispatch, task, {
        current: Math.min(task.target, task.current + 1),
        completed: task.current + 1 >= task.target,
        lastProgressDay: game.week,
        firstSatisfiedDay:
          task.current + 1 >= task.target
            ? (task.firstSatisfiedDay ?? game.week)
            : task.firstSatisfiedDay,
        auditLog: appendAudit(task, `Completed social action ${entry.actionId}`),
      });
    }
    return result;
  }

  if (actionType === 'game/applyMinigameWinner' || actionType === 'game/completeMinigame') {
    const competition = game.lastCompetitionResolution;
    if (
      !competition ||
      competition.status !== 'completed' ||
      !competition.participants.includes(humanId)
    ) {
      return result;
    }

    const placementIndex = competition.placements?.indexOf(humanId) ?? -1;
    const placement = placementIndex >= 0 ? placementIndex + 1 : null;
    const participantCount = competition.participants.length;
    const definitelyNotLast =
      competition.lastPlaceId != null && competition.lastPlaceId !== humanId;

    for (const task of tasks) {
      if (hasCreditedCompetitionRun(task, competition.runId)) continue;

      if (
        task.type === 'competition_placement' &&
        typeof task.placementThreshold === 'number' &&
        placement != null &&
        placement <= task.placementThreshold
      ) {
        updateTaskProgress(store.dispatch, task, {
          current: task.target,
          completed: true,
          creditedCompetitionRunIds: appendCompetitionRun(task, competition.runId),
          lastProgressDay: game.week,
          firstSatisfiedDay: task.firstSatisfiedDay ?? game.week,
          auditLog: appendAudit(task, `Finished ${placement}/${participantCount}`),
        });
      }

      if (task.type === 'avoid_last_place' && definitelyNotLast) {
        const nextCurrent = Math.min(task.target, task.current + 1);
        updateTaskProgress(store.dispatch, task, {
          current: nextCurrent,
          completed: nextCurrent >= task.target,
          creditedCompetitionRunIds: appendCompetitionRun(task, competition.runId),
          lastProgressDay: game.week,
          firstSatisfiedDay:
            nextCurrent >= task.target
              ? (task.firstSatisfiedDay ?? game.week)
              : task.firstSatisfiedDay,
          auditLog: appendAudit(
            task,
            placement != null
              ? `Avoided last place (${placement}/${participantCount})`
              : `Avoided last place (last finisher: ${competition.lastPlaceId})`
          ),
        });
      }
    }
  }

  return result;
};
