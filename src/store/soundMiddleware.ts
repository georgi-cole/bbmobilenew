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
 *                              → phase-driven music / SFX policy applied
 *   - game/submitHumanVote     → ui:navigate (eviction vote)
 *   - game/submitPovSaveTarget → ui:confirm
 *   - game/activateBattleBack  → tv:battleback
 *   - finale/castVote          → ui:jury_vote
 *   - finale/finalizeFinale    → tv:winner_reveal
 *   - social/openSocialPanel   → music:social_module (saves previous track)
 *   - social/closeSocialPanel  → stop social music, restore previous track
 *   - social/openIncomingInbox → music:social_module (saves previous track)
 *   - social/closeIncomingInbox→ stop social music, restore previous track
 *
 * Phase-driven music policy
 * ─────────────────────────
 *   hoh_comp / hoh_results          → music:hoh_comp_general (loop)
 *   pov_comp / pov_results          → music:hoh_comp_general (loop)
 *   nominations / nomination_results→ music:nominations_main (loop)
 *   pov_ceremony                    → tv:veto_ceremony (stinger, once)
 *                                      + music:veto_phase (loop)
 *   pov_ceremony_results            → music:veto_phase (loop, no stinger)
 *   live_vote                       → tv:voting_eviction (stinger)
 *   eviction_results / final4_eviction → (no audio — evicted SFX deferred to
 *                                        game/setEvictionOverlay, see below)
 *   game/setEvictionOverlay(id)     → player:evicted (one-shot, null→id transition
 *                                        only; Battle Back returns are excluded)
 *   game/clearEvictionOverlay       → resets the evicted-SFX idempotency guard
 */

import type { Middleware } from '@reduxjs/toolkit';
import { SoundManager } from '../services/sound/SoundManager';

interface BattleBackInfo {
  /** True once the twist has been used this season. */
  used: boolean;
  /** ID of the juror who won the Battle Back competition (null before resolved). */
  winnerId: string | null;
}

interface GameState {
  phase: string;
  /** Player whose eviction cinematic is currently being shown (null when none). */
  evictionOverlayPlayerId?: string | null;
  /** Battle Back twist state — used to distinguish return cinematics from evictions. */
  battleBack?: BattleBackInfo | null;
}

interface StateWithGame {
  game: GameState;
  social?: { panelOpen?: boolean; incomingInboxOpen?: boolean };
}

/**
 * Phases that should trigger / maintain the HOH / general competition music.
 * Includes hoh_results and pov_results so the track keeps playing through the
 * results screen without an abrupt cut.
 */
const HOH_MUSIC_PHASES = new Set<string>([
  'hoh_comp',
  'hoh_results',
  'pov_comp',
  'pov_results',
]);

/**
 * Phases that should trigger / maintain the nominations ceremony music.
 */
const NOMINATIONS_MUSIC_PHASES = new Set<string>([
  'nominations',
  'nomination_results',
]);

/**
 * Phases where all phase music should be stopped (clean week boundary).
 */
const MUSIC_STOP_PHASES = new Set<string>(['week_start', 'week_end']);

/**
 * Music key that was playing before the Social module opened, so it can be
 * restored when the module closes.  Tracked as module-level state so it
 * persists across re-renders without being stored in Redux.
 */
let _preSocialMusicKey: string | null = null;
/** Whether the social module music is currently active. */
let _socialMusicActive = false;

/**
 * The player id for which `player:evicted` was most recently played.
 * Used to guard against double-play in two scenarios:
 *   1. Final3Ceremony dispatches setEvictionOverlay(id) explicitly, then
 *      SpotlightEvictionOverlay dispatches it again on mount — the second
 *      dispatch is id→id (not null→id) and is therefore skipped.
 *   2. React StrictMode double-runs mount effects in DEV — the first call sets
 *      this variable; the second call finds the id unchanged and skips.
 * Reset to null whenever the overlay is fully cleared so the next genuine
 * eviction can trigger the SFX again.
 */
let _lastEvictionSfxId: string | null = null;

/**
 * Returns true when the given player id is the Battle Back winner returning to
 * the house.  SpotlightEvictionOverlay (variant="return") dispatches
 * setEvictionOverlay for the returning juror, but we must NOT play the eviction
 * SFX for their return — they haven't been evicted, they're coming back.
 *
 * Detection: after completeBattleBack resolves, battleBack.used is set to true
 * and battleBack.winnerId holds the returning player's id.  These two flags
 * together reliably distinguish a return overlay from an eviction overlay.
 */
function _isBattleBackReturn(
  battleBack: BattleBackInfo | null | undefined,
  playerId: string,
): boolean {
  return battleBack?.used === true && battleBack?.winnerId === playerId;
}

/**
 * Apply phase-driven music / SFX transitions.
 * Called after the action has been committed so `newPhase` reflects the
 * updated game state.
 */
function _applyPhaseAudio(newPhase: string): void {
  if (HOH_MUSIC_PHASES.has(newPhase)) {
    // Play the results stinger only on results screens, not on comp start
    if (newPhase === 'hoh_results' || newPhase === 'pov_results') {
      void SoundManager.play('tv:event');
    }
    if (!_socialMusicActive) {
      void SoundManager.playMusic('music:hoh_comp_general');
    }
  } else if (NOMINATIONS_MUSIC_PHASES.has(newPhase)) {
    if (!_socialMusicActive) {
      void SoundManager.playMusic('music:nominations_main');
    }
  } else if (newPhase === 'pov_ceremony') {
    // Play veto ceremony stinger once (on ceremony start only), then start veto loop
    void SoundManager.play('tv:veto_ceremony');
    if (!_socialMusicActive) {
      void SoundManager.playMusic('music:veto_phase');
    }
  } else if (newPhase === 'pov_ceremony_results') {
    // Continue veto loop; do NOT replay the stinger
    if (!_socialMusicActive) {
      void SoundManager.playMusic('music:veto_phase');
    }
  } else if (newPhase === 'live_vote') {
    // Voting ceremony stinger; keep any existing background music
    void SoundManager.play('tv:voting_eviction');
  } else if (MUSIC_STOP_PHASES.has(newPhase)) {
    // Clean week boundary — stop any lingering phase music
    if (!_socialMusicActive) {
      SoundManager.stopMusic();
    }
  }
  // eviction_results / final4_eviction: player:evicted is triggered by
  // game/setEvictionOverlay (when the cinematic overlay actually begins),
  // NOT on the phase transition, to avoid playing before the vote reveal ends.
}

export const soundMiddleware: Middleware = (api) => (next) => (action) => {
  if (typeof action !== 'object' || action === null || !('type' in action)) {
    return next(action);
  }

  const { type } = action as { type: string };

  // ── Advance: react to incoming phase ─────────────────────────────────────
  if (type === 'game/advance') {
    const result = next(action);
    const newPhase = (api.getState() as StateWithGame).game?.phase;

    // Play minigame:start SFX when a competition begins
    if (newPhase === 'hoh_comp' || newPhase === 'pov_comp') {
      void SoundManager.play('minigame:start');
    }

    // Apply phase-driven music / SFX policy
    _applyPhaseAudio(newPhase);

    return result;
  }

  // ── Explicit phase set (DebugPanel / forcePhase) ──────────────────────────
  if (type === 'game/setPhase' || type === 'game/forcePhase') {
    const newPhase = (action as { type: string; payload: string }).payload;
    const result = next(action);

    // Apply phase-driven music / SFX policy
    _applyPhaseAudio(newPhase);

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

  // ── Eviction cinematic begins ─────────────────────────────────────────────
  // player:evicted is played here (when SpotlightEvictionOverlay mounts and
  // dispatches setEvictionOverlay) rather than on the eviction_results phase
  // transition.  This ensures the SFX fires only when the cinematic actually
  // begins — i.e. after the vote-reveal modal has been dismissed.
  //
  // Guards applied to avoid false positives:
  //
  //   null→id only: SpotlightEvictionOverlay (variant="return") is reused for
  //     Battle Back returns and also dispatches setEvictionOverlay on mount.
  //     By reading the state *before* next(), we can detect when the overlay id
  //     was already set (id→id) and skip the SFX.
  //
  //   Battle Back return exclusion: when the Battle Back winner's id is set as
  //     the overlay player *and* battleBack.used is true, this is a return
  //     animation, not an eviction cinematic.
  //
  //   Idempotency tracker (_lastEvictionSfxId): Final3Ceremony explicitly
  //     dispatches setEvictionOverlay(id) before mounting SpotlightEviction
  //     Overlay (which dispatches it again on mount), and React StrictMode
  //     double-runs effects in DEV.  Storing the last-played id prevents the
  //     second identical dispatch from replaying the SFX.
  if (type === 'game/setEvictionOverlay') {
    const prevGame = (api.getState() as StateWithGame).game;
    const prevOverlayId = prevGame?.evictionOverlayPlayerId ?? null;
    const newId = (action as { type: string; payload: string | null }).payload;
    const result = next(action);

    if (
      newId !== null &&
      newId !== undefined &&
      // Only fire on a null→id transition (overlay wasn't already showing someone)
      prevOverlayId === null &&
      // Idempotency: don't re-play if the SFX already fired for this id
      newId !== _lastEvictionSfxId &&
      // Exclude Battle Back return: the returning juror's id is set as the
      // overlay player after completeBattleBack (battleBack.used=true), and the
      // SpotlightEvictionOverlay runs with variant="return".  We must not play
      // the eviction sting for their return to the house.
      !_isBattleBackReturn(prevGame?.battleBack, newId)
    ) {
      _lastEvictionSfxId = newId;
      void SoundManager.play('player:evicted');
    }

    // When explicitly clearing the overlay (null payload), reset the tracker
    // so the next genuine eviction can trigger the SFX again.
    if (newId === null) {
      _lastEvictionSfxId = null;
    }

    return result;
  }

  // ── Eviction overlay cleared (safety-net unmount cleanup) ─────────────────
  // clearEvictionOverlay is dispatched by SpotlightEvictionOverlay on unmount.
  // Reset the idempotency tracker so the next eviction triggers the SFX.
  if (type === 'game/clearEvictionOverlay') {
    const result = next(action);
    _lastEvictionSfxId = null;
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
