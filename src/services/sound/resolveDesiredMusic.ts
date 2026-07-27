/**
 * resolveDesiredMusic.ts — Pure function that resolves the desired background
 * music track from current application state.
 *
 * Resolution priority (highest → lowest):
 *  1. MusicScene override (ui.musicScene) — covers finale acts and cinematic scenes.
 *  2. seasonFinale.phase === 'seasonComplete'.
 *  3. `#/game-over` route.
 *  4. Configured minigame ownership — silence before gameplay, configured track while playing.
 *  5. Other active minigames — per-game track.
 *  6. Spectator mode active.
 *  7. Social module open.
 *  8. Game phase.
 *  9. Fallback — 'none' (silence).
 */
import type { RootState } from '../../store/store';
import type { MusicTrack } from './musicTracks';
import type { MusicScene } from '../../store/uiSlice';
import { getMinigameMusicConfig } from './minigameMusicConfig';

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

const COMPETITION_PHASES = new Set(['loh_comp', 'loh_results', 'pos_comp', 'pos_results']);
const NOMINATION_PHASES = new Set([
  'nominations',
  'nomination_results',
  'pre_veto_public_save',
]);
const VETO_PHASES = new Set(['pos_ceremony', 'pos_ceremony_results']);

function trackForMusicScene(scene: MusicScene): MusicTrack {
  switch (scene) {
    case 'season_recap':
      return 'season_recap';
    case 'tribunal_part1':
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
    default:
      return 'none';
  }
}

export function resolveDesiredMusic(
  state: MusicResolverState,
  hash: string,
): MusicTrack {
  const sceneTrack = trackForMusicScene(state.ui.musicScene);
  if (sceneTrack !== 'none') return sceneTrack;

  if (state.game.seasonFinale?.phase === 'seasonComplete') return 'final_modal';
  if (isGameOverHash(hash)) return 'final_modal';

  const pendingChallenge = state.challenge.pending;
  const configuredMinigame = getMinigameMusicConfig(pendingChallenge?.game?.key);
  if (configuredMinigame) {
    return pendingChallenge?.phase === 'playing' ? configuredMinigame.track : 'none';
  }

  const minigameTrack =
    pendingChallenge?.phase === 'playing'
      ? trackForMinigame(pendingChallenge.game?.key)
      : 'none';
  if (minigameTrack !== 'none') return minigameTrack;

  if (state.game.spectatorActive) return 'spectator';
  if (state.social.panelOpen || state.social.incomingInboxOpen) return 'social';
  if (COMPETITION_PHASES.has(state.game.phase)) return 'competition';
  if (NOMINATION_PHASES.has(state.game.phase)) return 'nominations';
  if (VETO_PHASES.has(state.game.phase)) return 'veto';

  return 'none';
}
