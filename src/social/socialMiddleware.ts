/**
 * socialMiddleware — Redux middleware that hooks the SocialEngine into the
 * game phase lifecycle and dispatches social resource deltas for game events.
 *
 * Listens for:
 *   - game/setPhase            (explicit phase override, e.g. from DebugPanel)
 *   - game/forcePhase          (dev-only forced transition)
 *   - game/advance             (normal gameplay phase progression)
 *   - game/completeMinigame    (HOH/POV winner from tap-race; zero-score penalty)
 *   - game/applyMinigameWinner (HOH/POV winner from challenge flow)
 *   - game/skipMinigame        (competition skipped: -3 energy to all alive)
 *   - social/updateRelationship (alliance formed: +2 energy +200 influence;
 *                                betrayal: -3 energy to actor)
 *
 * Event delta rules:
 *   HOH win               → +5  energy to winner
 *   POV win               → +3  energy to winner
 *   Survived nomination   → +4  energy to remaining nominees (entering live_vote)
 *   New alliance formed   → +2  energy + influence +200 to both parties
 *   Saved by POV          → +2  energy to saved player
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
} from './socialSlice';
import { seedWeekRelationships } from './weekSocialSeed';

const SOCIAL_PHASES = new Set<string>(['social_1', 'social_2']);

const PHASE_SET_ACTIONS = new Set(['game/setPhase', 'game/forcePhase']);

interface GameState {
  phase: string;
  hohId: string | null;
  povWinnerId: string | null;
  nomineeIds: string[];
  players: Array<{ id: string; status: string; isUser?: boolean }>;
}

interface StateWithGame {
  game: GameState;
}

type MiddlewareAPI = { dispatch: (a: unknown) => unknown; getState: () => unknown };

/** Seed week-start background affinities, then snapshot relationships as baseline. */
function handleWeekStart(api: MiddlewareAPI): void {
  seedWeekRelationships(api);
  api.dispatch(snapshotWeekRelationships());
}

/** Dispatch energy delta to a player, clamped so result never goes negative. */
function grantEnergy(api: MiddlewareAPI, playerId: string, delta: number): void {
  api.dispatch(applyEnergyDelta({ playerId, delta }));
}

/** Dispatch influence delta (integer pts ×100) to a player. */
function grantInfluence(api: MiddlewareAPI, playerId: string, delta: number): void {
  api.dispatch(applyInfluenceDelta({ playerId, delta }));
}

/** Apply HOH-win energy bonus if the HOH changed. */
function applyHohBonus(api: MiddlewareAPI, prevHohId: string | null, newHohId: string | null): void {
  if (newHohId && newHohId !== prevHohId) {
    grantEnergy(api, newHohId, 5);
  }
}

/** Apply POV-win energy bonus if the POV winner changed. */
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

/** Grant +2 energy to any player removed from the nomination block (saved by POV). */
function applySavedByPovBonus(
  api: MiddlewareAPI,
  prevNominees: string[],
  newNominees: string[],
): void {
  const saved = prevNominees.filter((id) => !newNominees.includes(id));
  for (const id of saved) {
    grantEnergy(api, id, 2);
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

  // ── completeMinigame: HOH/POV bonus + zero-score penalty ─────────────────
  if (type === 'game/completeMinigame') {
    const prevState = api.getState() as StateWithGame;
    const prevHohId = prevState.game?.hohId ?? null;
    const prevPovId = prevState.game?.povWinnerId ?? null;
    const prevPhase = prevState.game?.phase;
    // Identify the human player to apply zero-score penalty if relevant.
    const humanPlayer = (prevState.game?.players ?? []).find((p) => p.isUser);
    const humanScore = (action as { payload: number }).payload;

    const result = next(action);

    const afterState = api.getState() as StateWithGame;
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.hohId ?? null);
    applyPovBonus(api as unknown as MiddlewareAPI, prevPovId, afterState.game?.povWinnerId ?? null);

    // Zero-score penalty: human player scored 0 in a competition phase.
    if (humanScore === 0 && humanPlayer && (prevPhase === 'hoh_comp' || prevPhase === 'pov_comp')) {
      grantEnergy(api as unknown as MiddlewareAPI, humanPlayer.id, -2);
    }

    return result;
  }

  // ── applyMinigameWinner: HOH/POV bonus from challenge flow ────────────────
  if (type === 'game/applyMinigameWinner') {
    const prevState = api.getState() as StateWithGame;
    const prevHohId = prevState.game?.hohId ?? null;
    const prevPovId = prevState.game?.povWinnerId ?? null;

    const result = next(action);

    const afterState = api.getState() as StateWithGame;
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.hohId ?? null);
    applyPovBonus(api as unknown as MiddlewareAPI, prevPovId, afterState.game?.povWinnerId ?? null);

    return result;
  }

  // ── Advance action (phase determined by comparing before/after state) ───────
  if (type === 'game/advance') {
    const prevState = api.getState() as StateWithGame;
    const prevPhase = prevState.game?.phase;
    const prevHohId = prevState.game?.hohId ?? null;
    const prevPovId = prevState.game?.povWinnerId ?? null;
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
    }

    // HOH / POV win bonuses (advance() sets these during hoh_results / pov_results)
    applyHohBonus(api as unknown as MiddlewareAPI, prevHohId, afterState.game?.hohId ?? null);
    applyPovBonus(api as unknown as MiddlewareAPI, prevPovId, afterState.game?.povWinnerId ?? null);

    // Survived nomination: nominees entering live_vote get +4 energy.
    applySurvivedNomBonus(api as unknown as MiddlewareAPI, newPhase, afterState);

    // Saved by POV: players removed from the block get +2 energy.
    applySavedByPovBonus(
      api as unknown as MiddlewareAPI,
      prevNominees,
      afterState.game?.nomineeIds ?? [],
    );

    return result;
  }

  // ── Alliance formed / betrayal: relationship-tag-driven deltas ───────────
  if (type === 'social/updateRelationship') {
    const payload = (action as {
      payload: { source: string; target: string; tags?: string[] };
    }).payload;
    const result = next(action);
    if (payload.tags) {
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

  return next(action);
};
