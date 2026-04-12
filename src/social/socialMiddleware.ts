/**
 * socialMiddleware — Redux middleware that hooks the SocialEngine into the
 * game phase lifecycle and dispatches social resource deltas for game events.
 *
 * Listens for:
 *   - game/setPhase              (explicit phase override, e.g. from DebugPanel)
 *   - game/forcePhase            (dev-only forced transition)
 *   - game/advance               (normal gameplay phase progression)
 *   - game/completeMinigame      (LOH/POS winner from tap-race; zero-score penalty)
 *   - game/applyMinigameWinner   (LOH/POS winner from challenge flow)
 *   - game/skipMinigame          (competition skipped: -3 energy to all alive)
 *   - game/submitPovSaveTarget   (POS holder saves a nominee: +2 energy to saved player)
 *   - social/updateRelationship  (alliance formed: +2 energy +200 influence;
 *                                 betrayal: -3 energy to actor)
 *
 * Event delta rules:
 *   LOH win               → +5  energy to winner
 *   POS win               → +3  energy to winner
 *   Survived nomination   → +4  energy to remaining nominees (entering live_vote)
 *   New alliance formed   → +2  energy + influence +200 to both parties
 *   Saved by POS          → +2  energy to saved player
 *   Competition skipped   → -3  energy to all alive players
 *   Zero score (minigame) → -2  energy to the scoring player
 *   Broke alliance        → -3  energy to the actor (betrayal tag)
 */

import type { Middleware } from '@reduxjs/toolkit';
import { SocialEngine } from './SocialEngine';
import {
  snapshotWeekRelationships,
  applyEnergyDelta,
  applyInfluenceDelta,
  decaySocialMemory,
  drainEvictedPlayerSocial,
  setEnergyBankEntry,
} from './socialSlice';
import { autoResolveExpiredIncomingInteractionsForWeek } from './incomingInteractions';
import { scheduleIncomingInteractionsForPhase, ELIGIBLE_PHASES } from './incomingInteractionAutonomy';
import type { AutonomyStore } from './incomingInteractionAutonomy';
import { deliverScheduledIncomingInteractionsForPhase } from './incomingInteractionScheduler';
import { seedWeekRelationships } from './weekSocialSeed';
import { DEFAULT_ENERGY } from './constants';

const SOCIAL_PHASES = new Set<string>(['social_1', 'social_2']);

const PHASE_SET_ACTIONS = new Set(['game/setPhase', 'game/forcePhase']);

interface GameState {
  phase: string;
  week: number;
  lohId: string | null;
  prevHohId: string | null;
  posWinnerId: string | null;
  povSavedId?: string | null;
  nomineeIds: string[];
  votes?: Record<string, string>;
  pendingEviction?: { evicteeId: string; evictionMessage: string } | null;
  doubleEviction?: { weekActive?: boolean };
  specialVeto?: { activeType?: string | null };
  players: Array<{ id: string; name?: string; status: string; isUser?: boolean }>;
}

interface StateWithGame {
  game: GameState;
  social?: { energyBank?: Record<string, number> };
}

type MiddlewareAPI = { dispatch: (a: unknown) => unknown; getState: () => unknown };

/** Seed week-start background affinities, then snapshot relationships as baseline. */
function handleWeekStart(api: MiddlewareAPI): void {
  const state = api.getState() as StateWithGame;
  const week = state.game?.week ?? 1;
  api.dispatch(decaySocialMemory());
  api.dispatch(autoResolveExpiredIncomingInteractionsForWeek(week));
  seedWeekRelationships(api);
  api.dispatch(snapshotWeekRelationships());
  scheduleIncomingInteractionsForPhase('week_start', api as unknown as AutonomyStore, {
    lohId: state.game?.lohId ?? null,
    prevHohId: state.game?.prevHohId ?? null,
    nomineeIds: state.game?.nomineeIds ?? [],
    posWinnerId: state.game?.posWinnerId ?? null,
    povSavedId: state.game?.povSavedId ?? null,
    votes: state.game?.votes ?? {},
    pendingEvictionId: state.game?.pendingEviction?.evicteeId ?? null,
    // eviction_results interactions fire before finalizePendingEviction commits the exit,
    // so the pending evictee is also the best available “recent eviction” context.
    recentEvicteeId: state.game?.pendingEviction?.evicteeId ?? null,
    isDoubleEviction: state.game?.doubleEviction?.weekActive === true,
    specialVeto: state.game?.specialVeto?.activeType ?? null,
  });
  deliverScheduledIncomingInteractionsForPhase('week_start', api as unknown as AutonomyStore, {
    week,
  });
}

/**
 * Schedule incoming interactions for phases that are eligible but not
 * week_start (which is handled by handleWeekStart above).
 */
function handleAutonomyPhase(api: AutonomyStore, phase: string): void {
  const state = api.getState() as StateWithGame;
  scheduleIncomingInteractionsForPhase(phase, api, {
    lohId: state.game?.lohId ?? null,
    prevHohId: state.game?.prevHohId ?? null,
    nomineeIds: state.game?.nomineeIds ?? [],
    posWinnerId: state.game?.posWinnerId ?? null,
    povSavedId: state.game?.povSavedId ?? null,
    votes: state.game?.votes ?? {},
    pendingEvictionId: state.game?.pendingEviction?.evicteeId ?? null,
    // eviction_results interactions fire before finalizePendingEviction commits the exit,
    // so the pending evictee is also the best available “recent eviction” context.
    recentEvicteeId: state.game?.pendingEviction?.evicteeId ?? null,
    isDoubleEviction: state.game?.doubleEviction?.weekActive === true,
    specialVeto: state.game?.specialVeto?.activeType ?? null,
  });
  deliverScheduledIncomingInteractionsForPhase(phase, api);
}

/**
 * Dispatch an energy delta to a player, clamped so the result never goes negative.
 * Reads the current bank value from state before dispatching so negative deltas
 * cannot drive energy below zero.
 */
function grantEnergy(api: MiddlewareAPI, playerId: string, delta: number): void {
  if (delta === 0) return;
  if (delta < 0) {
    const state = api.getState() as StateWithGame;
    const current = state.social?.energyBank?.[playerId] ?? 0;
    const clamped = Math.max(delta, -current); // delta that won't push energy below 0
    if (clamped === 0) return;
    api.dispatch(applyEnergyDelta({ playerId, delta: clamped }));
  } else {
    api.dispatch(applyEnergyDelta({ playerId, delta }));
  }
}

/** Dispatch influence delta (integer pts ×100) to a player. */
function grantInfluence(api: MiddlewareAPI, playerId: string, delta: number): void {
  api.dispatch(applyInfluenceDelta({ playerId, delta }));
}

/** Apply LOH-win energy bonus if the LOH changed. */
function applyHohBonus(api: MiddlewareAPI, prevHohId: string | null, newHohId: string | null): void {
  if (newHohId && newHohId !== prevHohId) {
    grantEnergy(api, newHohId, 5);
  }
}

/** Apply POS-win energy bonus if the POS winner changed. */
function applyPovBonus(api: MiddlewareAPI, prevPovId: string | null, newPovId: string | null): void {
  if (newPovId && newPovId !== prevPovId) {
    grantEnergy(api, newPovId, 3);
  }
}

/** Grant +4 energy to all players still on the nomination block when entering live_vote. */
function applySurvivedNomBonus(api: MiddlewareAPI, newPhase: string, state: StateWithGame): void {
  if (newPhase === 'live_vote') {
    for (const id of state.game.nomineeIds) {
      grantEnergy(api, id, 4);
    }
  }
}

export const socialMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) {
    return next(action);
  }

  const { type } = action as { type: string };

  // ── Explicit phase-set actions (payload carries the new phase) ──────────────
  if (PHASE_SET_ACTIONS.has(type)) {
    const prevPhase = (api.getState() as StateWithGame).game?.phase;
    const nextPhase = (action as { type: string; payload: string }).payload;

    if (SOCIAL_PHASES.has(prevPhase) && prevPhase !== nextPhase) {
      SocialEngine.endPhase(prevPhase);
    }

    const result = next(action);

    if (nextPhase === 'week_start' && prevPhase !== 'week_start') {
      handleWeekStart(api as unknown as MiddlewareAPI);
    }

    if (SOCIAL_PHASES.has(nextPhase) && prevPhase !== nextPhase) {
      SocialEngine.startPhase(nextPhase);
    }

    // Autonomy: schedule incoming interactions only for eligible explicit phase sets.
    if (nextPhase !== 'week_start' && prevPhase !== nextPhase && ELIGIBLE_PHASES.has(nextPhase)) {
      handleAutonomyPhase(api as unknown as AutonomyStore, nextPhase);
    }

    return result;
  }

  // ── Competition skipped: -3 energy to all alive players ──────────────────
  if (type === 'game/skipMinigame') {
    const state = api.getState() as StateWithGame;
    const alivePlayers = (state.game?.players ?? []).filter(
      (p) => p.status !== 'evicted' && p.status !== 'jury',
    );
    const result = next(action);
    for (const p of alivePlayers) {
      grantEnergy(api as unknown as MiddlewareAPI, p.id, -3);
    }
    return result;
  }

  // ── completeMinigame: LOH/POS bonus + zero-score penalty ─────────────────
  if (type === 'game/completeMinigame') {
    const prevState = api.getState() as StateWithGame;
    const prevHohId = prevState.game?.lohId ?? null;
    const prevPovId = prevState.game?.posWinnerId ?? null;
    const prevPhase = prevState.game?.phase;
    // Identify the human player to apply zero-score penalty if relevant.
    const humanPlayer = (prevState.game?.players ?? []).find((p) => p.isUser);
    const humanScore = (action as unknown as { payload: number }).payload;

    const result = next(action);

    const afterState = api.getState() as StateWithGame;
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.lohId ?? null);
    applyPovBonus(api as unknown as MiddlewareAPI, prevPovId, afterState.game?.posWinnerId ?? null);

    // Zero-score penalty: human player scored 0 in a competition phase.
    if (humanScore === 0 && humanPlayer && (prevPhase === 'loh_comp' || prevPhase === 'pos_comp')) {
      grantEnergy(api as unknown as MiddlewareAPI, humanPlayer.id, -2);
    }

    return result;
  }

  // ── applyMinigameWinner: LOH/POS bonus from challenge flow ────────────────
  if (type === 'game/applyMinigameWinner') {
    const prevState = api.getState() as StateWithGame;
    const prevHohId = prevState.game?.lohId ?? null;
    const prevPovId = prevState.game?.posWinnerId ?? null;

    const result = next(action);

    const afterState = api.getState() as StateWithGame;
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.lohId ?? null);
    applyPovBonus(api as unknown as MiddlewareAPI, prevPovId, afterState.game?.posWinnerId ?? null);

    return result;
  }

  // ── applyF3MinigameWinner: Final LOH energy bonus when Part 3 winner is crowned ─
  // Mirrors the applyMinigameWinner handler for LOH/POS comps.
  // Only the Final LOH (Part 3 winner) receives the LOH energy bonus;
  // Parts 1 and 2 are intermediate comps that don't change the lohId.
  if (type === 'game/applyF3MinigameWinner') {
    const prevState = api.getState() as StateWithGame;
    const prevHohId = prevState.game?.lohId ?? null;

    const result = next(action);

    const afterState = api.getState() as StateWithGame;
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.lohId ?? null);

    return result;
  }

  // ── submitPovSaveTarget: saved-by-POS bonus (+2 energy to the saved player) ─
  // Handles the explicit human-POS-holder saves a nominee case.
  // The auto-save case (nominee wins POS themselves, pos_ceremony_results advance)
  // is handled by comparing nomineeIds before/after in the game/advance handler.
  if (type === 'game/submitPovSaveTarget') {
    const prevState = api.getState() as StateWithGame;
    const prevNominees = prevState.game?.nomineeIds ?? [];
    const saveId = (action as unknown as { payload: string }).payload;

    const result = next(action);

    // Verify the save actually happened (action guard may have rejected it)
    const afterNominees = (api.getState() as StateWithGame).game?.nomineeIds ?? [];
    if (!afterNominees.includes(saveId) && prevNominees.includes(saveId)) {
      grantEnergy(api as unknown as MiddlewareAPI, saveId, 2);
    }

    return result;
  }

  // ── Advance action (phase determined by comparing before/after state) ───────
  if (type === 'game/advance') {
    const prevState = api.getState() as StateWithGame;
    const prevPhase = prevState.game?.phase;
    const prevHohId = prevState.game?.lohId ?? null;
    const prevPovId = prevState.game?.posWinnerId ?? null;
    // Track POS-auto-save: nominee who wins POS saves themselves in pos_ceremony_results.
    const prevNominees = prevState.game?.nomineeIds ?? [];

    const result = next(action);

    const afterState = api.getState() as StateWithGame;
    const newPhase = afterState.game?.phase;

    // Social engine lifecycle
    if (prevPhase !== newPhase) {
      if (SOCIAL_PHASES.has(prevPhase)) {
        SocialEngine.endPhase(prevPhase);
      }

      if (newPhase === 'week_start') {
        handleWeekStart(api as unknown as MiddlewareAPI);
      }

      if (SOCIAL_PHASES.has(newPhase)) {
        SocialEngine.startPhase(newPhase);
      }

      // Autonomy: schedule incoming interactions on eligible phase transitions.
      if (newPhase !== 'week_start' && ELIGIBLE_PHASES.has(newPhase)) {
        handleAutonomyPhase(api as unknown as AutonomyStore, newPhase);
      }
    }

    // LOH / POS win bonuses (advance() sets these during loh_results / pos_results)
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.lohId ?? null);
    applyPovBonus(api as unknown as MiddlewareAPI, prevPovId, afterState.game?.posWinnerId ?? null);

    // Survived nomination: nominees entering live_vote get +4 energy.
    applySurvivedNomBonus(api as unknown as MiddlewareAPI, newPhase, afterState);

    // POS auto-save: during pos_ceremony_results a nominee who won POS saves themselves.
    // We detect this by checking if a nominee was removed from the block during that
    // specific phase transition only, to avoid false positives during evictions.
    if (prevPhase === 'pos_ceremony_results') {
      const afterNominees = afterState.game?.nomineeIds ?? [];
      const autoSaved = prevNominees.filter((id) => !afterNominees.includes(id));
      for (const id of autoSaved) {
        grantEnergy(api as unknown as MiddlewareAPI, id, 2);
      }
    }

    return result;
  }

  // ── Alliance formed / betrayal: relationship-tag-driven deltas ───────────
  if (type === 'social/updateRelationship') {
    const payload = (action as unknown as {
      payload: { source: string; target: string; tags?: string[]; actionSource?: 'manual' | 'system' };
    }).payload;
    const result = next(action);
    // Only apply game-event bonuses for manual (human) actions.
    // System/AI actions must not trigger alliance or betrayal resource grants —
    // they are the root cause of influence/energy inflation when many AI players
    // target the human player with 'ally' actions each phase.
    if (payload.tags && payload.actionSource !== 'system') {
      if (payload.tags.includes('alliance')) {
        // New alliance formed: both parties get +2 energy and +200 influence pts.
        grantEnergy(api as unknown as MiddlewareAPI, payload.source, 2);
        grantEnergy(api as unknown as MiddlewareAPI, payload.target, 2);
        grantInfluence(api as unknown as MiddlewareAPI, payload.source, 200);
        grantInfluence(api as unknown as MiddlewareAPI, payload.target, 200);
      } else if (payload.tags.includes('betrayal')) {
        // Broke alliance: actor loses 3 energy.
        grantEnergy(api as unknown as MiddlewareAPI, payload.source, -3);
      }
    }
    return result;
  }

  // ── Eviction: drain social resources for the evicted user player ─────────
  // Handles both normal evictions (finalizePendingEviction) and self-evictions.
  if (type === 'game/finalizePendingEviction' || type === 'game/selfEvict') {
    const prevState = api.getState() as StateWithGame;
    const evicteeId = (action as unknown as { payload: string }).payload;
    const evictee = (prevState.game?.players ?? []).find((p) => p.id === evicteeId);
    const week = prevState.game?.week;

    const result = next(action);

    // Only drain for the human/user player — AI players manage their own state.
    if (evictee?.isUser) {
      api.dispatch(drainEvictedPlayerSocial({ playerId: evicteeId, week }));
    }

    return result;
  }

  // ── Battle Back win: restore energy for the user player who returns ─────
  // When the user wins the Battle Back, they re-enter the house as an active
  // player. Energy is reset to DEFAULT_ENERGY using a direct set (not an
  // additive delta) so the value is always exactly DEFAULT_ENERGY regardless
  // of any residual energy the player may carry.
  if (type === 'game/completeBattleBack') {
    const prevState = api.getState() as StateWithGame;
    const winnerId = (action as unknown as { payload: string }).payload;
    const winner = (prevState.game?.players ?? []).find((p) => p.id === winnerId);

    const result = next(action);

    if (winner?.isUser) {
      api.dispatch(setEnergyBankEntry({ playerId: winnerId, value: DEFAULT_ENERGY }));
    }

    return result;
  }

  return next(action);
};
