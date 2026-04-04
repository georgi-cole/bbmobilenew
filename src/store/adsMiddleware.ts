/**
 * adsMiddleware — observes game actions to trigger automatic ad events.
 *
 * Responsibilities:
 *  1. Detect when the user finishes last in a LOH or POS competition and
 *     record it so GameScreen can show a competition_retry prompt.
 *
 * This middleware reads pre-action state (phase / players) before calling
 * next(action) to avoid depending on the post-action state shape.
 *
 * Note: we deliberately do NOT import RootState from store.ts here to avoid
 * a circular module dependency (store → adsMiddleware → store).  We use
 * `unknown` for the state type and cast as needed.
 */

import type { Middleware } from '@reduxjs/toolkit';
import { recordLastCompLastPlace } from './adsSlice';

interface GamePlayer {
  id: string;
  isUser?: boolean;
}

interface GameStateSlice {
  phase?: string;
  players?: GamePlayer[];
}

interface StoreStateSlice {
  game?: GameStateSlice;
}

interface CompleteMinigamePayload {
  humanScore?: number;
  winnerId?: string;
  lastPlaceId?: string;
  [key: string]: unknown;
}

interface ApplyMinigameWinnerPayload {
  winnerId?: string;
  lastPlaceId?: string;
  participants?: string[];
  scores?: Record<string, number>;
  [key: string]: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const adsMiddleware: Middleware =
  (api) => (next) => (action) => {
    const state = api.getState() as StoreStateSlice;
    const phase = state.game?.phase;
    const humanPlayer = state.game?.players?.find((p) => p.isUser);
    const humanId = humanPlayer?.id;

    const typedAction = action as { type?: unknown; payload?: unknown };

    // ── Detect user finishing last in a LOH competition ─────────────────────
    // `game/completeMinigame` fires when the human player submits their score.
    // Before the reducer runs the phase is still loh_comp / pos_comp.
    if (typedAction.type === 'game/completeMinigame' && humanId) {
      if (phase === 'loh_comp' || phase === 'loh_comp_announcement') {
        const payload =
          typedAction.payload !== null &&
          typeof typedAction.payload === 'object'
            ? (typedAction.payload as CompleteMinigamePayload)
            : null;
        const lastPlaceId = payload?.lastPlaceId;
        const result = next(action);
        if (lastPlaceId === humanId) {
          api.dispatch(recordLastCompLastPlace('loh'));
        }
        return result;
      }

      if (phase === 'pos_comp') {
        const payload =
          typedAction.payload !== null &&
          typeof typedAction.payload === 'object'
            ? (typedAction.payload as CompleteMinigamePayload)
            : null;
        const lastPlaceId = payload?.lastPlaceId;
        const result = next(action);
        if (lastPlaceId === humanId) {
          api.dispatch(recordLastCompLastPlace('pos'));
        }
        return result;
      }
    }

    // ── Detect user finishing last via applyMinigameWinner ──────────────────
    // Some competition paths go through applyMinigameWinner instead of
    // completeMinigame (e.g. spectator-only or AI-resolved comps with a
    // human participant).
    if (typedAction.type === 'game/applyMinigameWinner' && humanId) {
      const payload =
        typedAction.payload !== null &&
        typeof typedAction.payload === 'object'
          ? (typedAction.payload as ApplyMinigameWinnerPayload)
          : null;

      const lastPlaceId = payload?.lastPlaceId;
      const participants = payload?.participants ?? [];
      const scores = payload?.scores;
      const winnerId = payload?.winnerId;

      let derivedLastPlace: string | null = null;

      if (lastPlaceId && participants.includes(lastPlaceId)) {
        derivedLastPlace = lastPlaceId;
      } else if (scores && winnerId) {
        const nonWinners = participants.filter((id) => id !== winnerId);
        if (nonWinners.length > 0) {
          derivedLastPlace = nonWinners.reduce(
            (worst, id) =>
              (scores[id] ?? 0) < (scores[worst] ?? 0) ? id : worst,
            nonWinners[0],
          );
        }
      }

      const result = next(action);

      if (derivedLastPlace === humanId) {
        if (phase === 'loh_comp') {
          api.dispatch(recordLastCompLastPlace('loh'));
        } else if (phase === 'pos_comp') {
          api.dispatch(recordLastCompLastPlace('pos'));
        }
      }

      return result;
    }

    return next(action);
  };
