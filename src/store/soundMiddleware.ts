/**
 * soundMiddleware.ts — Redux middleware that maps game events to semantic
 * sound keys and plays them via the singleton SoundManager.
 *
 * Listens for:
 *   - game/advance             → plays sounds based on the new phase
 *   - game/evictPlayer         → player:evicted
 *   - game/completeMinigame    → ui:confirm (result)
 *   - game/applyMinigameWinner → ui:confirm
 *   - game/skipMinigame        → ui:error
 *   - game/setPhase / game/forcePhase
 *                              → tv:event when entering eviction_results
 *   - game/castVote            → ui:navigate
 *   - game/submitPovSaveTarget → ui:confirm
 */

import type { Middleware } from '@reduxjs/toolkit';
import { SoundManager } from '../services/sound/SoundManager';

interface GameState {
  phase: string;
}

interface StateWithGame {
  game: GameState;
}

const EVICTION_PHASES = new Set<string>(['eviction_results', 'final4_eviction']);

export const soundMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) {
    return next(action);
  }

  const { type } = action as { type: string };

  // ── Advance: react to incoming phase ─────────────────────────────────────
  if (type === 'game/advance') {
    const result = next(action);
    const newPhase = (api.getState() as StateWithGame).game?.phase;

    if (EVICTION_PHASES.has(newPhase)) {
      void SoundManager.play('player:evicted');
    } else if (newPhase === 'hoh_results' || newPhase === 'pov_results') {
      void SoundManager.play('tv:event');
    } else if (newPhase === 'hoh_comp' || newPhase === 'pov_comp') {
      void SoundManager.play('minigame:start');
    } else if (newPhase === 'nominations' || newPhase === 'pov_ceremony') {
      void SoundManager.play('ui:navigate');
    }

    return result;
  }

  // ── Explicit phase set (DebugPanel / forcePhase) ──────────────────────────
  if (type === 'game/setPhase' || type === 'game/forcePhase') {
    const newPhase = (action as { type: string; payload: string }).payload;
    const result = next(action);

    if (EVICTION_PHASES.has(newPhase)) {
      void SoundManager.play('player:evicted');
    } else if (newPhase === 'hoh_results' || newPhase === 'pov_results') {
      void SoundManager.play('tv:event');
    }

    return result;
  }

  // ── Minigame complete / winner applied ────────────────────────────────────
  if (type === 'game/completeMinigame' || type === 'game/applyMinigameWinner') {
    const result = next(action);
    void SoundManager.play('ui:confirm');
    return result;
  }

  // ── Minigame skipped ──────────────────────────────────────────────────────
  if (type === 'game/skipMinigame') {
    const result = next(action);
    void SoundManager.play('ui:error');
    return result;
  }

  // ── Vote cast ─────────────────────────────────────────────────────────────
  if (type === 'game/castVote') {
    const result = next(action);
    void SoundManager.play('ui:navigate');
    return result;
  }

  // ── POV save ─────────────────────────────────────────────────────────────
  if (type === 'game/submitPovSaveTarget') {
    const result = next(action);
    void SoundManager.play('ui:confirm');
    return result;
  }

  return next(action);
};
