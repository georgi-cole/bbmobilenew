/**
 * soundMiddleware.ts — Redux middleware that maps game events to semantic
 * sound keys and plays them via the singleton SoundManager.
 *
 * Listens for:
 *   - game/advance             → plays sounds based on the new phase
 *   - game/completeMinigame    → minigame:results
 *   - game/applyMinigameWinner → ui:confirm
 *   - game/skipMinigame        → ui:error
 *   - game/setPhase / game/forcePhase
 *                              → tv:event when entering eviction_results
 *   - game/submitHumanVote     → ui:navigate (eviction vote)
 *   - game/submitPovSaveTarget → ui:confirm
 *   - game/activateBattleBack  → tv:battleback
 *   - finale/castVote          → ui:jury_vote
 *   - finale/finalizeFinale    → tv:winner_reveal
 *   - social/openSocialPanel   → music:social_module (saves previous track)
 *   - social/closeSocialPanel  → stop social music, restore previous track
 *   - social/openIncomingInbox → music:social_module (saves previous track)
 *   - social/closeIncomingInbox→ stop social music, restore previous track
 */

import type { Middleware } from '@reduxjs/toolkit';
import { SoundManager } from '../services/sound/SoundManager';

interface GameState {
  phase: string;
}

interface StateWithGame {
  game: GameState;
  social?: { panelOpen?: boolean; incomingInboxOpen?: boolean };
}

const EVICTION_PHASES = new Set<string>(['eviction_results', 'final4_eviction']);

/**
 * Music key that was playing before the Social module opened, so it can be
 * restored when the module closes.  Tracked as module-level state so it
 * persists across re-renders without being stored in Redux.
 */
let _preSocialMusicKey: string | null = null;
/** Whether the social module music is currently active. */
let _socialMusicActive = false;

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

  // ── Minigame complete ─────────────────────────────────────────────────────
  if (type === 'game/completeMinigame') {
    const result = next(action);
    void SoundManager.play('minigame:results');
    return result;
  }

  // ── Minigame winner applied ───────────────────────────────────────────────
  if (type === 'game/applyMinigameWinner') {
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

  // ── Vote cast (eviction vote by human player) ─────────────────────────────
  if (type === 'game/submitHumanVote') {
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

  // ── Battle Back twist activated ───────────────────────────────────────────
  if (type === 'game/activateBattleBack') {
    const result = next(action);
    void SoundManager.play('tv:battleback');
    return result;
  }

  // ── Finale: jury member casts their vote ──────────────────────────────────
  if (type === 'finale/castVote') {
    const result = next(action);
    void SoundManager.play('ui:jury_vote');
    return result;
  }

  // ── Finale: winner declared ───────────────────────────────────────────────
  if (type === 'finale/finalizeFinale') {
    const result = next(action);
    void SoundManager.play('tv:winner_reveal');
    return result;
  }

  // ── Social module opened (outgoing panel or incoming inbox) ───────────────
  if (type === 'social/openSocialPanel' || type === 'social/openIncomingInbox') {
    const result = next(action);
    if (!_socialMusicActive) {
      _preSocialMusicKey = SoundManager.currentMusicKey;
      _socialMusicActive = true;
      void SoundManager.playMusic('music:social_module');
    }
    return result;
  }

  // ── Social module closed (outgoing panel or incoming inbox) ───────────────
  if (type === 'social/closeSocialPanel' || type === 'social/closeIncomingInbox') {
    const result = next(action);
    if (_socialMusicActive) {
      const state = api.getState() as StateWithGame;
      const panelOpen = state.social?.panelOpen ?? false;
      const inboxOpen = state.social?.incomingInboxOpen ?? false;
      // Only restore once both the panel and inbox are closed
      if (!panelOpen && !inboxOpen) {
        _socialMusicActive = false;
        const prev = _preSocialMusicKey;
        _preSocialMusicKey = null;
        // Only stop music if it's still the social module track (another part
        // of the app may have already transitioned to a different track)
        if (SoundManager.currentMusicKey === 'music:social_module') {
          SoundManager.stopMusic();
          if (prev) {
            void SoundManager.playMusic(prev);
          }
        }
      }
    }
    return result;
  }

  return next(action);
};
