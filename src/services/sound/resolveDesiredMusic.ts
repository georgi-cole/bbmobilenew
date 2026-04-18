import type { RootState } from '../../store/store';
import type { MusicTrack } from './musicTracks';
import type { MusicScene } from '../../store/uiSlice';

export interface MusicResolverState {
  game: Pick<RootState['game'], 'phase' | 'spectatorActive'>;
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
const NOMINATION_PHASES = new Set(['nominations', 'nomination_results']);
const VETO_PHASES = new Set(['pos_ceremony', 'pos_ceremony_results']);

function trackForMusicScene(scene: MusicScene): MusicTrack {
  switch (scene) {
    case 'season_recap':
      return 'season_recap';
    case 'jury_voting':
      return 'jury_voting';
    default:
      return 'none';
  }
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

export function resolveDesiredMusic(state: MusicResolverState, hash: string): MusicTrack {
  const sceneTrack = trackForMusicScene(state.ui.musicScene);
  if (sceneTrack !== 'none') {
    return sceneTrack;
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

  if (hash === '' || hash === '#' || hash === '#/') {
    return 'introhub';
  }

  return 'none';
}
