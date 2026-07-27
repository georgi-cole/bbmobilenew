/**
 * Pure music resolver. Policy data lives in musicConfig.ts; this adapter only
 * translates Redux-shaped state into a serializable resolver context.
 */
import type { GameMode } from '../../modes/modeTypes';
import type { GameCategory } from '../../minigames/registry';
import type { RootState } from '../../store/store';
import type { MusicScene } from '../../store/uiSlice';
import {
  DEFAULT_MUSIC_CONFIG,
  resolveMusicCue,
  type MusicConfigDocument,
  type ResolvedMusicCue,
} from './musicConfig';
import type { MusicTrack } from './musicTracks';

export interface MusicResolverState {
  game: Pick<RootState['game'], 'gameId' | 'phase' | 'spectatorActive'> & {
    mode?: GameMode;
    seasonFinale?: Pick<NonNullable<RootState['game']['seasonFinale']>, 'phase'> | null;
  };
  challenge: {
    pending?: {
      phase?: string | null;
      game?: {
        key?: string | null;
        category?: GameCategory | null;
      };
    } | null;
  };
  social: Pick<RootState['social'], 'panelOpen' | 'incomingInboxOpen'>;
  ui: { musicScene: MusicScene };
}

export function resolveDesiredMusicCue(
  state: MusicResolverState,
  hash: string,
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG,
): ResolvedMusicCue {
  const pendingChallenge = state.challenge.pending;

  return resolveMusicCue(
    {
      mode: state.game.mode ?? 'classic',
      gamePhase: state.game.phase,
      routeHash: hash,
      musicScene: state.ui.musicScene,
      finalePhase: state.game.seasonFinale?.phase ?? null,
      spectatorActive: Boolean(state.game.spectatorActive),
      socialOpen: state.social.panelOpen || state.social.incomingInboxOpen,
      minigame: pendingChallenge
        ? {
            gameKey: pendingChallenge.game?.key ?? null,
            category: pendingChallenge.game?.category ?? null,
            stage: pendingChallenge.phase ?? null,
          }
        : null,
    },
    config,
  );
}

export function resolveDesiredMusic(
  state: MusicResolverState,
  hash: string,
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG,
): MusicTrack {
  return resolveDesiredMusicCue(state, hash, config).track;
}
