import type { Middleware, MiddlewareAPI, Dispatch, UnknownAction } from '@reduxjs/toolkit';
import type { Player } from '../types';
import {
  initializeProfiles,
  updateApproval,
  addDirection,
  pruneExpiredDirections,
  updateMissionProgress,
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
  /** True when the human HOH has not yet submitted nominations. */
  awaitingNominations?: boolean;
  /** Map of voterId → nomineeId set during live_vote. */
  votes?: Record<string, string>;
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
    // updateMissionProgress handles progress accumulation AND auto-completion at 100%.
    // Do NOT also dispatch resolveDirection here — that would double-apply the success
    // reward (delta, counter, feed entry) for the same completion event.
    store.dispatch(
      updateMissionProgress({
        directionId: signal.directionId,
        progressPercent: signal.newProgress,
        week: event.week,
      }),
    );
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
    // Payload is a plain string (the nomineeId the human voted to evict).
    const nomineeId = actionPayload as string | undefined;
    const week = game.week ?? 1;
    const humanPlayer = game.players?.find((p) => p.isUser);
    if (humanPlayer && nomineeId) {
      dispatchMissionProgress(store, {
        type: 'voted_to_evict',
        actorId: humanPlayer.id,
        targetId: nomineeId,
        week,
      });
    }
    return result;
  }

  if (actionType === 'game/applyMinigameWinner') {
    // Payload shape: { winnerId, participants?, scores?, ... } — no competitionType field.
    // Derive competition type from prevPhase, which is 'hoh_comp' or 'pov_comp' when
    // this action is dispatched.
    const payload = actionPayload as { winnerId?: string } | undefined;
    const week = game.week ?? 1;
    const winnerId = payload?.winnerId;
    if (winnerId) {
      const eventType = prevPhase === 'pov_comp'
        ? 'pov_win'
        : prevPhase === 'hoh_comp'
        ? 'hoh_win'
        : 'won_competition';
      dispatchMissionProgress(store, { type: eventType, actorId: winnerId, week });
    }
    return result;
  }

  if (actionType === 'social/recordSocialAction') {
    // Payload: { entry: SocialActionLogEntry }
    // entry has actorId, targetId, actionId ('ally'|'protect'|'betray'|'nominate'),
    // outcome ('success'|'failure'), and delta.
    const payload = actionPayload as {
      entry?: {
        actorId?: string;
        targetId?: string;
        actionId?: string;
        outcome?: string;
        delta?: number;
      };
    } | undefined;
    const entry = payload?.entry;
    if (entry?.actorId) {
      const week = game.week ?? 1;
      const { actorId, targetId, actionId = '', outcome = '', delta = 0 } = entry;

      let missionEventType: MissionGameEvent['type'] | null = null;
      if (actionId === 'betray' && outcome === 'success') {
        missionEventType = 'betrayal';
      } else if (actionId === 'ally' || actionId === 'protect') {
        missionEventType = outcome === 'success' ? 'positive_social' : null;
      } else if (actionId === 'nominate') {
        missionEventType = outcome === 'success' ? 'negative_social' : null;
      } else if (delta > 0) {
        missionEventType = 'positive_social';
      } else if (delta < 0) {
        missionEventType = 'negative_social';
      }

      if (missionEventType) {
        dispatchMissionProgress(store, {
          type: missionEventType,
          actorId,
          targetId,
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
        // Dispatch mission progress for all votes cast (AI + human) during live_vote.
        // Human vote is also wired from submitHumanVote, but this covers AI voters and
        // remains idempotent (progress signals are additive, not re-applied on duplicates).
        for (const [voterId, nomineeId] of Object.entries(game.votes ?? {})) {
          dispatchMissionProgress(store, {
            type: 'voted_to_evict',
            actorId: voterId,
            targetId: nomineeId,
            week,
          });
        }
      }

      // nomination_results: dispatch mission progress for AI HOH nominations.
      // (Human HOH nominations are handled by game/commitNominees.)
      if (newPhase === 'nomination_results' && !game.awaitingNominations && game.hohId) {
        for (const nomineeId of game.nomineeIds ?? []) {
          dispatchMissionProgress(store, {
            type: 'nominated_target',
            actorId: game.hohId,
            targetId: nomineeId,
            week,
          });
        }
        if ((game.nomineeIds ?? []).length > 0) {
          dispatchMissionProgress(store, {
            type: 'bold_move',
            actorId: game.hohId,
            week,
          });
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

          // Background drift is applied silently (addToFeed: false) to keep the Public
          // Feed focused on the 2–3 daily headline events rather than listing every
          // player's hidden drift movement.
          for (const drift of backgroundDrifts) {
            store.dispatch(
              updateApproval({
                playerId: drift.playerId,
                delta: drift.delta,
                reason: drift.delta > 0 ? 'generic_positive' : 'generic_negative',
                week,
                addToFeed: false,
              }),
            );
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
