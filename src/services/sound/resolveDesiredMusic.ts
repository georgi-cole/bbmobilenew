/**
 * resolveDesiredMusic.ts — Pure function that resolves the desired background
 * music track from current application state.
 *
 * Resolution priority (highest → lowest):
 *  1. MusicScene override (ui.musicScene) — covers finale acts and cinematic scenes.
 *     'tribunal_part1' and 'jury_voting' both return the jury_voting track.
 *     'season_recap' returns the dedicated season recap track.
 *     'public_voting' returns the dedicated public-voting track.
 *  2. seasonFinale.phase === 'seasonComplete' — final modal music as soon as
 *     the finale fully completes, even before navigation finishes.
 *  3. `#/game-over` route — final modal music on the season results screen.
 *  4. Active minigame (challenge.pending.phase === 'playing') — per-game track.
 *  5. Spectator mode active — spectator track.
 *  6. Social module open (panel or inbox) — social track.
 *  7. Game phase (loh_comp/results, nominations, pos_ceremony etc.).
 *  8. Fallback — 'none' (silence).
 *
 * The complete phase model and audio rules are documented in:
 *   src/services/sound/audioPhases.ts
 *   docs/AUDIO_PHASE_SYSTEM.md
 */
import type { RootState } from '../../store/store';
import type { MusicTrack } from './musicTracks';
import type { MusicScene } from '../../store/uiSlice';

export interface MusicResolverState {
  game: Pick<RootState['game'], 'gameId' | 'phase' | 'spectatorActive'> & {
    seasonFinale?: Pick<NonNullable<RootState['game']['seasonFinale']>, 'phase'> | null;
  };
  challenge: {
    pending?: {
      phase?: string | null;
      game?: { key?: string | null };
    } | null;
  };
  social: Pick<RootState['social'], 'panelOpen' | 'incomingInboxOpen'>;
  ui: { musicScene: MusicScene };
}

/**
 * Game phases that use the competition (LOH / HOH general) music track.
 * Including results screens so the track keeps playing through them without
 * an abrupt cut when the phase advances.
 */
const COMPETITION_PHASES = new Set(['loh_comp', 'loh_results', 'pos_comp', 'pos_results']);

/**
 * Game phases that use the nominations music track.
 * Includes nomination_results and pre_veto_public_save so the track is
 * continuous through the nominations flow before veto.
 */
const NOMINATION_PHASES = new Set([
  'nominations',
  'nomination_results',
  'pre_veto_public_save',
]);

/**
 * Game phases that use the veto (POS ceremony) music track.
 * Includes pos_ceremony_results so the track is continuous.
 */
const VETO_PHASES = new Set(['pos_ceremony', 'pos_ceremony_results']);

/**
 * Maps a MusicScene override to the desired MusicTrack.
 *
 * 'tribunal_part1'  — FinalFaceoff 'clues' act (hidden votes).  Uses the
 *                     same jury_voting track as 'revealVotes' so there is no
 *                     jarring silence while jurors send their cryptic messages.
 * 'jury_voting'     — FinalFaceoff 'revealVotes' act; vote chips revealed.
 * 'season_recap'    — FinalFaceoff 'recap' act; plays the dedicated
 *                     season recap music track.
 * 'public_voting'   — SeasonFinaleOverlay public-favourite flow.
 * 'none'            — No override; resolver falls through to game-phase logic.
 */
function trackForMusicScene(scene: MusicScene): MusicTrack {
  switch (scene) {
    case 'season_recap':
      return 'season_recap';
    case 'tribunal_part1':
      return 'jury_voting';
    case 'jury_voting':
      return 'jury_voting';
    case 'public_voting':
      return 'public_voting';
    default:
      return 'none';
  }
}

function isGameOverHash(hash: string): boolean {
  return /^#\/game-?over(?:[/?#]|$)/.test(hash);
}

function trackForMinigame(gameKey: string | null | undefined): MusicTrack {
  switch (gameKey) {
    case 'riskWheel':
      return 'risk_wheel';
    case 'glass_bridge_brutal':
    case 'crystal_path_shattered':
      return 'glass_bridge';
    case 'quickTap':
    case 'laneRacers':
    case 'memoryMatch':
      return 'quick_tap';
    case 'wildcardWestern':
      return 'wildcard_western';
    case 'bigSpender':
    case 'snake':
    case 'castleRescue':
    case 'batteryLow':
      return 'challenge_group_1';
    default:
      return 'none';
  }
}

/**
 * Resolve the desired background music track from current application state.
 *
 * This is a **pure function** with no side effects.  It is called by
 * AudioStateSync on every relevant state change and the result is forwarded
 * to SoundManager.setDesiredMusic().
 *
 * @param state    Slice of Redux state needed for resolution.
 * @param _hash    Current window.location.hash.
 * @returns The desired MusicTrack, or 'none' for silence.
 */
export function resolveDesiredMusic(
  state: MusicResolverState,
  _hash: string,
): MusicTrack {
  const sceneTrack = trackForMusicScene(state.ui.musicScene);
  if (sceneTrack !== 'none') {
    return sceneTrack;
  }

  if (state.game.seasonFinale?.phase === 'seasonComplete') {
    return 'final_modal';
  }

  if (isGameOverHash(_hash)) {
    return 'final_modal';
  }

  const minigameTrack =
    state.challenge.pending?.phase === 'playing'
      ? trackForMinigame(state.challenge.pending.game?.key)
      : 'none';
  if (minigameTrack !== 'none') {
    return minigameTrack;
  }

  if (state.game.spectatorActive) {
    return 'spectator';
  }

  if (state.social.panelOpen || state.social.incomingInboxOpen) {
    return 'social';
  }

  if (COMPETITION_PHASES.has(state.game.phase)) {
    return 'competition';
  }
  if (NOMINATION_PHASES.has(state.game.phase)) {
    return 'nominations';
  }
  if (VETO_PHASES.has(state.game.phase)) {
    return 'veto';
  }

  return 'none';
}
