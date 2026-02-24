/**
 * socialMiddleware — Redux middleware that hooks the SocialEngine into the
 * game phase lifecycle.
 *
 * Listens for:
 *   - game/setPhase   (explicit phase override, e.g. from DebugPanel)
 *   - game/forcePhase (dev-only forced transition)
 *   - game/advance    (normal gameplay phase progression)
 *
 * Rules:
 *   • Entering social_1 or social_2  → SocialEngine.startPhase(newPhase)
 *   • Leaving  social_1 or social_2  → SocialEngine.endPhase(prevPhase)
 *   • Direct social → social (debug only) → endPhase(prev) + startPhase(next)
 *   • Entering week_start             → snapshot relationships + seed background affinities
 */

import type { Middleware } from '@reduxjs/toolkit';
import { SocialEngine } from './SocialEngine';
import { snapshotWeekRelationships } from './socialSlice';
import { seedWeekRelationships } from './weekSocialSeed';

const SOCIAL_PHASES = new Set<string>(['social_1', 'social_2']);

const PHASE_SET_ACTIONS = new Set(['game/setPhase', 'game/forcePhase']);

interface StateWithGame {
  game: { phase: string };
}

type MiddlewareAPI = { dispatch: (a: unknown) => unknown; getState: () => unknown };

/** Snapshot relationships and seed week-start background affinities. */
function handleWeekStart(api: MiddlewareAPI): void {
  api.dispatch(snapshotWeekRelationships());
  seedWeekRelationships(api);
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

  // ── Advance action (phase determined by comparing before/after state) ───────
  if (type === 'game/advance') {
    const prevPhase = (api.getState() as StateWithGame).game?.phase;
    const result = next(action);
    const newPhase = (api.getState() as StateWithGame).game?.phase;

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

    return result;
  }

  return next(action);
};
