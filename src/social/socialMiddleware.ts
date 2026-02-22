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
 */

import type { Middleware } from '@reduxjs/toolkit';
import { SocialEngine } from './SocialEngine';

const SOCIAL_PHASES = new Set<string>(['social_1', 'social_2']);

const PHASE_SET_ACTIONS = new Set(['game/setPhase', 'game/forcePhase']);

interface StateWithGame {
  game: { phase: string };
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

    if (SOCIAL_PHASES.has(prevPhase) && !SOCIAL_PHASES.has(nextPhase)) {
      SocialEngine.endPhase(prevPhase);
    }

    const result = next(action);

    if (SOCIAL_PHASES.has(nextPhase) && !SOCIAL_PHASES.has(prevPhase)) {
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
      if (SOCIAL_PHASES.has(prevPhase) && !SOCIAL_PHASES.has(newPhase)) {
        SocialEngine.endPhase(prevPhase);
      }
      if (SOCIAL_PHASES.has(newPhase) && !SOCIAL_PHASES.has(prevPhase)) {
        SocialEngine.startPhase(newPhase);
      }
    }

    return result;
  }

  return next(action);
};
