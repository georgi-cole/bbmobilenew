import type { Middleware, MiddlewareAPI, Dispatch, UnknownAction } from '@reduxjs/toolkit';
import type { Player } from '../types';
import {
  initializeProfiles,
  setProfileApprovals,
  updateApproval,
  addDirection,
  pruneExpiredDirections,
  updateMissionProgress,
  resetDailyFeedBudget,
} from './publicOpinionSlice';
import { publicOpinionConfig } from './publicOpinionConfig';
import { generateDirectionsForCycle } from './PublicDirectionService';
import { generateDailyPublicUpdate } from './PublicHeadlineService';
import { resolveEventMissionProgress, type MissionGameEvent } from './MissionActionMapper';
import { mulberry32 } from '../store/rng';
import {
  computeNominationReactions,
  computeEvictionReactions,
  computePovSaveReactions,
  type ReactionDelta,
} from './EventDrivenReactionService';
import type { PublicDirection } from './types';

interface GameState {
  phase: string;
  week: number;
  lohId: string | null;
  posWinnerId: string | null;
  nomineeIds: string[];
  players: Player[];
  seed: number;
  /** True when the human LOH has not yet submitted nominations. */
  awaitingNominations?: boolean;
  /** Map of voterId → nomineeId set during live_vote. */
  votes?: Record<string, string>;
  /** ID of the nominee saved by the POS holder (null if not used). */
  povSavedId?: string | null;
  /** ID of the nominee saved by the public-save twist (null if not triggered). */
  publicSavedNomineeId?: string | null;
}

/** Helper: build a current approval map from public opinion profiles. */
function buildApprovalMap(
  profiles: Record<string, unknown> | undefined,
): Record<string, number> {
  if (!profiles) return {};
  const map: Record<string, number> = {};
  for (const [id, profile] of Object.entries(profiles)) {
    const p = profile as { approval?: number };
    if (typeof p?.approval === 'number') {
      map[id] = p.approval;
    }
  }
  return map;
}

/** Dispatch all reaction deltas from the EventDrivenReactionService. */
function dispatchReactionDeltas(
  store: MiddlewareAPI<Dispatch<UnknownAction>>,
  reactions: ReactionDelta[],
  week: number,
): void {
  for (const r of reactions) {
    store.dispatch(
      updateApproval({
        playerId: r.playerId,
        delta: r.delta,
        reason: r.reason,
        week,
        eventType: r.eventType,
        attributedToId: r.attributedToId,
      }),
    );
  }
}

interface StateWithGame {
  game: GameState;
  publicOpinion?: {
    profiles: Record<string, unknown>;
    directions: PublicDirection[];
  };
}

const OPENING_PUBLIC_APPROVAL_MIN = 42;
const OPENING_PUBLIC_APPROVAL_MAX = 57;
// Golden-ratio bit mixer keeps the opening approval shuffle deterministic while
// avoiding obvious patterns from adjacent game seeds.
const OPENING_PUBLIC_APPROVAL_SEED_MIX = 0x9e3779b9;

function isDefaultOpeningProfile(profile: unknown): boolean {
  const candidate = profile as {
    approval?: number;
    previousApproval?: number;
    seasonApprovals?: number[];
    completedDirectionCount?: number;
    cumulativePositiveDelta?: number;
  };

  return (
    candidate?.approval === publicOpinionConfig.DEFAULT_APPROVAL &&
    candidate?.previousApproval === publicOpinionConfig.DEFAULT_APPROVAL &&
    Array.isArray(candidate?.seasonApprovals) &&
    candidate.seasonApprovals.length === 1 &&
    candidate.seasonApprovals[0] === publicOpinionConfig.DEFAULT_APPROVAL &&
    (candidate?.completedDirectionCount ?? 0) === 0 &&
    (candidate?.cumulativePositiveDelta ?? 0) === 0
  );
}

function shouldRandomizeOpeningApprovals(
  profiles: Record<string, unknown>,
  playerIds: string[],
): boolean {
  if (playerIds.length === 0) return false;
  return playerIds.every((playerId) => isDefaultOpeningProfile(profiles[playerId]));
}

function buildOpeningApprovalMap(players: Player[], seed: number): Record<string, number> {
  const rng = mulberry32((seed ^ OPENING_PUBLIC_APPROVAL_SEED_MIX) >>> 0);
  const range = OPENING_PUBLIC_APPROVAL_MAX - OPENING_PUBLIC_APPROVAL_MIN + 1;

  return Object.fromEntries(
    [...players]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((player) => [
        player.id,
        OPENING_PUBLIC_APPROVAL_MIN + Math.floor(rng() * range),
      ]),
  );
}

function ensureProfiles(
  store: MiddlewareAPI<Dispatch<UnknownAction>>,
  game: GameState,
): Record<string, unknown> {
  let profiles = ((store.getState() as StateWithGame).publicOpinion?.profiles ?? {});
  if (Object.keys(profiles).length === 0 && game.players?.length > 0) {
    store.dispatch(initializeProfiles(game.players.map((p) => p.id)));
    profiles = ((store.getState() as StateWithGame).publicOpinion?.profiles ?? {});
  }
  return profiles;
}

function applyCompetitionResultPublicOpinion(
  store: MiddlewareAPI<Dispatch<UnknownAction>>,
  game: GameState,
  prevPhase: string | undefined,
  newPhase: string | undefined,
): void {
  if (!game) return;

  const profiles = ensureProfiles(store, game);
  const week = game.week ?? 1;

  if (prevPhase === 'loh_comp' && newPhase === 'loh_results') {
    if (
      week === 1 &&
      shouldRandomizeOpeningApprovals(profiles, game.players.map((p) => p.id))
    ) {
      store.dispatch(setProfileApprovals(buildOpeningApprovalMap(game.players, game.seed ?? 0)));
    }

    if (game.lohId) {
      store.dispatch(
        updateApproval({
          playerId: game.lohId,
          delta: publicOpinionConfig.competitionImpact.hohWin,
          reason: 'hoh_win',
          week,
          eventType: 'hoh_win',
        }),
      );
    }
  }

  if (prevPhase === 'pos_comp' && newPhase === 'pos_results' && game.posWinnerId) {
    store.dispatch(
      updateApproval({
        playerId: game.posWinnerId,
        delta: publicOpinionConfig.competitionImpact.povWin,
        reason: 'pov_win',
        week,
        eventType: 'pov_win',
      }),
    );
  }
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
    // Human LOH nominated a set of players.
    // Payload is the array of nominee IDs committed by the human player.
    const nominees = (actionPayload as string[] | undefined) ?? [];
    const week = game.week ?? 1;
    const lohId = game.lohId;
    if (lohId && nominees.length > 0) {
      // Event-driven approval reactions: LOH backlash + nominee sympathy.
      // Run against the updated game state so nomineeIds are current.
      const profiles = nextState.publicOpinion?.profiles ?? {};
      const approvals = buildApprovalMap(profiles);
      const reactions = computeNominationReactions({
        nomineeIds: nominees,
        lohId,
        approvals,
        week,
      });
      dispatchReactionDeltas(store, reactions, week);

      // Mission progress
      for (const targetId of nominees) {
        dispatchMissionProgress(store, {
          type: 'nominated_target',
          actorId: lohId,
          targetId,
          week,
        });
      }
      dispatchMissionProgress(store, {
        type: 'bold_move',
        actorId: lohId,
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
    // Derive competition type from prevPhase, which is 'loh_comp' or 'pos_comp' when
    // this action is dispatched.
    const payload = actionPayload as { winnerId?: string } | undefined;
    const week = game.week ?? 1;
    const winnerId = payload?.winnerId;
    if (winnerId) {
      const eventType = prevPhase === 'pos_comp'
        ? 'pov_win'
        : prevPhase === 'loh_comp'
        ? 'hoh_win'
        : 'won_competition';
      dispatchMissionProgress(store, { type: eventType, actorId: winnerId, week });
    }
    applyCompetitionResultPublicOpinion(store, game, prevPhase, newPhase);
    return result;
  }

  if (actionType === 'game/completeMinigame') {
    // Some reducers can finalize HoH/PoV results (e.g. transition loh_comp → loh_results
    // or pos_comp → pos_results) via this action. When a winner is present, we should
    // also advance public-opinion missions for competition wins, similar to
    // game/applyMinigameWinner.
    const payload = actionPayload as
      | {
          winnerId?: string;
          competitionType?: string | null;
        }
      | undefined;
    const week = game.week ?? 1;
    const winnerId = payload?.winnerId;

    if (winnerId) {
      // Prefer an explicit competitionType from the payload if provided, otherwise
      // infer from prevPhase (loh_comp/pos_comp), falling back to a generic win event.
      let eventType: MissionGameEvent['type'];
      const competitionType = (payload?.competitionType || '').toLowerCase();

      if (competitionType === 'pov') {
        eventType = 'pov_win';
      } else if (competitionType === 'hoh') {
        eventType = 'hoh_win';
      } else if (prevPhase === 'pos_comp') {
        eventType = 'pov_win';
      } else if (prevPhase === 'loh_comp') {
        eventType = 'hoh_win';
      } else {
        eventType = 'won_competition';
      }

      dispatchMissionProgress(store, {
        type: eventType,
        actorId: winnerId,
        week,
      });
    }
    applyCompetitionResultPublicOpinion(store, game, prevPhase, newPhase);
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
    ensureProfiles(store, game);

    if (prevPhase !== newPhase) {
      const week = game.week ?? 1;
      applyCompetitionResultPublicOpinion(store, game, prevPhase, newPhase);

      if (prevPhase === 'loh_comp' && newPhase === 'loh_results' && game.lohId) {
        // Mission progress: LOH win
        dispatchMissionProgress(store, {
          type: 'hoh_win',
          actorId: game.lohId,
          week,
        });
      }

      if (prevPhase === 'pos_comp' && newPhase === 'pos_results' && game.posWinnerId) {
        dispatchMissionProgress(store, {
          type: 'pov_win',
          actorId: game.posWinnerId,
          week,
        });
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
        // Dispatch mission progress for AI votes cast during live_vote.
        // Human vote is already handled via submitHumanVote; to avoid double-counting,
        // we skip any votes cast by human players here.
        const humanVoterIds =
          (game.players ?? [])
            .filter((player: Player & { isHuman?: boolean }) => player.isHuman)
            .map((player) => player.id);

        for (const [voterId, nomineeId] of Object.entries(game.votes ?? {})) {
          if (humanVoterIds.includes(voterId)) {
            continue;
          }
          dispatchMissionProgress(store, {
            type: 'voted_to_evict',
            actorId: voterId,
            targetId: nomineeId,
            week,
          });
        }
      }

      // nomination_results: dispatch approval reactions and mission progress for AI LOH nominations.
      // Human LOH reactions are handled earlier via `game/commitNominees`; firing them again here
      // would double-apply backlash/sympathy. Only run when awaitingNominations is false
      // (the AI LOH path: nominations were set automatically before this phase was entered).
      if (newPhase === 'nomination_results' && !game.awaitingNominations && game.lohId) {
        const profiles = nextState.publicOpinion?.profiles ?? {};
        const approvals = buildApprovalMap(profiles);
        const nomineeIds = game.nomineeIds ?? [];

        if (nomineeIds.length > 0) {
          // Event-driven approval reactions: LOH backlash + nominee sympathy
          const reactions = computeNominationReactions({
            nomineeIds,
            lohId: game.lohId,
            approvals,
            week,
          });
          dispatchReactionDeltas(store, reactions, week);

          // Mission progress
          for (const nomineeId of nomineeIds) {
            dispatchMissionProgress(store, {
              type: 'nominated_target',
              actorId: game.lohId,
              targetId: nomineeId,
              week,
            });
          }
          dispatchMissionProgress(store, {
            type: 'bold_move',
            actorId: game.lohId,
            week,
          });
        }
      }

      // pos_ceremony_results: if POS was used, apply save reactions.
      if (newPhase === 'pos_ceremony_results' && game.povSavedId) {
        const profiles = nextState.publicOpinion?.profiles ?? {};
        const approvals = buildApprovalMap(profiles);
        const reactions = computePovSaveReactions({
          savedPlayerId: game.povSavedId,
          saviorId: game.posWinnerId ?? null,
          approvals,
          week,
          isPublicSave: false,
        });
        dispatchReactionDeltas(store, reactions, week);
      }

      if (newPhase === 'week_start') {
        // Reset daily feed budget at the start of a new day so event-driven reactions
        // get a fresh slot budget.
        store.dispatch(resetDailyFeedBudget({ week }));

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

  // ── Eviction commit: apply eviction reactions when a player is evicted ────────
  // finalizePendingEviction commits the actual eviction (sets player status to
  // 'evicted'/'jury'). We hook here to apply immediate event-driven reactions
  // based on how liked/disliked the evicted player was at the time of eviction.
  if (actionType === 'game/finalizePendingEviction') {
    const evicteeId = actionPayload as string | undefined;
    if (evicteeId) {
      const week = game.week ?? 1;
      // At this point `next(action)` has already run (game state updated with
      // the evictee's new status), but publicOpinion profiles have not changed
      // yet — so nextState.publicOpinion.profiles holds the correct pre-reaction
      // approval standings.
      const approvals = buildApprovalMap(nextState.publicOpinion?.profiles ?? {});
      const reactions = computeEvictionReactions({
        evicteeId,
        lohId: game.lohId,
        povHolderId: game.povSavedId ? (game.posWinnerId ?? null) : null,
        approvals,
        week,
      });
      dispatchReactionDeltas(store, reactions, week);
    }
  }

  // ── Public-save twist: apply save reactions when commitPublicSave fires ───────
  if (actionType === 'game/commitPublicSave') {
    const savedId =
      typeof actionPayload === 'string'
        ? actionPayload
        : typeof actionPayload === 'object' && actionPayload !== null && 'savedId' in actionPayload
          ? String(actionPayload.savedId)
          : undefined;
    if (savedId) {
      const week = game.week ?? 1;
      const profiles = nextState.publicOpinion?.profiles ?? {};
      const approvals = buildApprovalMap(profiles);
      const reactions = computePovSaveReactions({
        savedPlayerId: savedId,
        saviorId: null, // public save has no individual savior
        approvals,
        week,
        isPublicSave: true,
      });
      dispatchReactionDeltas(store, reactions, week);
    }
  }

  return result;
};
