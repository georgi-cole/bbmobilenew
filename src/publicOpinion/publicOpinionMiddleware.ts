import type { Middleware, MiddlewareAPI, Dispatch, UnknownAction } from '@reduxjs/toolkit';
import type { Player } from '../types';
import {
  initializeProfiles,
  updateApproval,
  addDirection,
  pruneExpiredDirections,
  updateMissionProgress,
  resolveDirection,
} from './publicOpinionSlice';
import { publicOpinionConfig } from './publicOpinionConfig';
import { generateDirectionsForCycle } from './PublicDirectionService';
import { generateDailyPublicUpdate } from './PublicHeadlineService';
import { resolveEventMissionProgress, type MissionGameEvent } from './MissionActionMapper';
import type { PublicDirection } from './types';

interface GameState {
  phase: string;
  week: number;
  hohId: string | null;
  povWinnerId: string | null;
  nomineeIds: string[];
  players: Player[];
  seed: number;
}

interface StateWithGame {
  game: GameState;
  publicOpinion?: {
    profiles: Record<string, unknown>;
    directions: PublicDirection[];
  };
}

// ── Helper: dispatch mission-progress signals ─────────────────────────────────

function dispatchMissionProgress(
  store: MiddlewareAPI<Dispatch<UnknownAction>>,
  event: MissionGameEvent,
) {
  const state = store.getState() as StateWithGame;
  const directions = state.publicOpinion?.directions ?? [];
  const activeDirections = directions.filter(
    (d) => d.playerId === event.actorId && d.status === 'active',
  );
  if (activeDirections.length === 0) return;

  const signals = resolveEventMissionProgress(event, activeDirections);
  for (const signal of signals) {
    store.dispatch(
      updateMissionProgress({
        directionId: signal.directionId,
        progressPercent: signal.newProgress,
        week: event.week,
      }),
    );
    // If the mission did NOT auto-complete via updateMissionProgress
    // but the signal says it should, finalise it with resolveDirection too
    // (resolveDirection handles the edge case when the direction was already
    //  marked completed inside updateMissionProgress, that call is a no-op).
    if (signal.isComplete) {
      store.dispatch(
        resolveDirection({ directionId: signal.directionId, status: 'completed', week: event.week }),
      );
    }
  }
}

export const publicOpinionMiddleware: Middleware = (store) => (next) => (action) => {
  const prevState = store.getState() as StateWithGame;
  const prevPhase = prevState.game?.phase;

  const result = next(action);

  const nextState = store.getState() as StateWithGame;
  const newPhase = nextState.game?.phase;
  const game = nextState.game;

  if (!game) return result;

  const actionType = (action as { type: string }).type;
  const actionPayload = (action as { payload?: unknown }).payload;

  // ── Game reset ─────────────────────────────────────────────────────────────
  if (actionType === 'game/resetGame') {
    const playerIds = game.players?.map((p) => p.id) ?? [];
    if (playerIds.length > 0) {
      store.dispatch(initializeProfiles(playerIds));
    }
    return result;
  }

  // ── Mission action mapping for explicit gameplay actions ───────────────────

  if (actionType === 'game/commitNominees') {
    // Human HOH nominated a set of players
    const nominees = (actionPayload as string[] | undefined) ?? [];
    const week = game.week ?? 1;
    const hohId = game.hohId;
    if (hohId && nominees.length > 0) {
      for (const targetId of nominees) {
        dispatchMissionProgress(store, {
          type: 'nominated_target',
          actorId: hohId,
          targetId,
          week,
        });
      }
      dispatchMissionProgress(store, {
        type: 'bold_move',
        actorId: hohId,
        week,
      });
    }
    return result;
  }

  if (actionType === 'game/submitHumanVote') {
    // Human cast an eviction vote
    const vote = actionPayload as { evicteeId?: string } | undefined;
    const week = game.week ?? 1;
    const humanPlayer = game.players?.find((p) => p.isUser);
    if (humanPlayer && vote?.evicteeId) {
      dispatchMissionProgress(store, {
        type: 'voted_to_evict',
        actorId: humanPlayer.id,
        targetId: vote.evicteeId,
        week,
      });
    }
    return result;
  }

  if (actionType === 'game/applyMinigameWinner') {
    // A competition (HOH / POV / other) was resolved via the minigame flow.
    // Only dispatch mission progress when we have an explicit winnerId in the
    // payload — falling back to the HOH/POV state could pick the wrong player
    // (e.g. a stale HOH id when processing a POV result).
    const payload = actionPayload as { winnerId?: string; competitionType?: string } | undefined;
    const week = game.week ?? 1;
    const winnerId = payload?.winnerId;
    if (winnerId) {
      const compType = payload?.competitionType ?? newPhase ?? '';
      const eventType = compType.includes('pov') || compType.includes('veto')
        ? 'pov_win'
        : compType.includes('hoh')
        ? 'hoh_win'
        : 'won_competition';
      dispatchMissionProgress(store, { type: eventType, actorId: winnerId, week });
    }
    return result;
  }

  if (actionType === 'social/influenceUpdated') {
    // Social influence action — map to mission progress
    const payload = actionPayload as {
      actorId?: string;
      targetId?: string;
      type?: string;
      week?: number;
    } | undefined;
    if (payload?.actorId) {
      const week = payload.week ?? game.week ?? 1;
      const socialType = payload.type ?? '';

      let missionEventType: MissionGameEvent['type'] | null = null;
      if (socialType.includes('betrayal')) missionEventType = 'betrayal';
      else if (socialType.includes('positive')) missionEventType = 'positive_social';
      else if (socialType.includes('negative')) missionEventType = 'negative_social';
      else if (socialType.includes('alliance_formed')) missionEventType = 'formed_alliance';
      else if (socialType.includes('alliance_broke')) missionEventType = 'broke_alliance';
      else if (socialType.includes('confront')) missionEventType = 'confronted_player';
      else if (socialType.includes('rumor')) missionEventType = 'spread_rumor';
      else if (socialType.includes('apolog')) missionEventType = 'apologized_to';
      else if (socialType.includes('loyal')) missionEventType = 'showed_loyalty';

      if (missionEventType) {
        dispatchMissionProgress(store, {
          type: missionEventType,
          actorId: payload.actorId,
          targetId: payload.targetId,
          week,
        });
      }
    }
    return result;
  }

  // ── Phase-transition handling ──────────────────────────────────────────────
  if (
    actionType === 'game/advance' ||
    actionType === 'game/setPhase' ||
    actionType === 'game/forcePhase'
  ) {
    const profiles = nextState.publicOpinion?.profiles ?? {};
    const hasProfiles = Object.keys(profiles).length > 0;

    if (!hasProfiles && game.players?.length > 0) {
      const playerIds = game.players.map((p) => p.id);
      store.dispatch(initializeProfiles(playerIds));
    }

    if (prevPhase !== newPhase) {
      const week = game.week ?? 1;

      if (newPhase === 'hoh_results') {
        if (game.hohId) {
          store.dispatch(
            updateApproval({
              playerId: game.hohId,
              delta: publicOpinionConfig.competitionImpact.hohWin,
              reason: 'hoh_win',
              week,
            }),
          );
          // Mission progress: HOH win
          dispatchMissionProgress(store, {
            type: 'hoh_win',
            actorId: game.hohId,
            week,
          });
        }
      }

      if (newPhase === 'pov_results') {
        if (game.povWinnerId) {
          store.dispatch(
            updateApproval({
              playerId: game.povWinnerId,
              delta: publicOpinionConfig.competitionImpact.povWin,
              reason: 'pov_win',
              week,
            }),
          );
          dispatchMissionProgress(store, {
            type: 'pov_win',
            actorId: game.povWinnerId,
            week,
          });
        }
      }

      if (newPhase === 'eviction_results') {
        for (const nomineeId of game.nomineeIds ?? []) {
          store.dispatch(
            updateApproval({
              playerId: nomineeId,
              delta: publicOpinionConfig.competitionImpact.nominated,
              reason: 'nominated',
              week,
            }),
          );
        }
      }

      if (newPhase === 'week_start') {
        // Generate dramatic headline events + background drift for the new day
        const activePlayers = (game.players ?? [])
          .filter((p) => p.status !== 'evicted' && p.status !== 'jury')
          .map((p) => ({ id: p.id, name: p.name }));

        if (activePlayers.length > 0) {
          const { headlineEvents, backgroundDrifts } = generateDailyPublicUpdate({
            activePlayers,
            week,
            seed: game.seed ?? 0,
          });

          for (const event of headlineEvents) {
            store.dispatch(
              updateApproval({
                playerId: event.playerId,
                delta: event.delta,
                reason: event.reason,
                week,
                isHeadline: true,
                headlineText: event.text,
              }),
            );
          }

          for (const drift of backgroundDrifts) {
            if (drift.delta !== 0) {
              store.dispatch(
                updateApproval({
                  playerId: drift.playerId,
                  delta: drift.delta,
                  reason: drift.delta > 0 ? 'generic_positive' : 'generic_negative',
                  week,
                  isHeadline: false,
                }),
              );
            }
          }
        }
      }

      if (newPhase === 'week_end') {
        store.dispatch(pruneExpiredDirections({ week: week + 1 }));

        const activePlayers = (game.players ?? []).filter(
          (p) => p.status !== 'evicted' && p.status !== 'jury',
        );

        if (activePlayers.length > 0) {
          const newDirections = generateDirectionsForCycle({
            players: activePlayers,
            week: week + 1,
            seed: game.seed ?? 0,
            count: publicOpinionConfig.directionsPerCycle,
          });
          for (const direction of newDirections) {
            store.dispatch(addDirection(direction));
          }
        }
      }
    }
  }

  return result;
};
