/**
 * Pure music resolver. Policy data lives in musicConfig.ts; this adapter only
 * translates Redux-shaped state into a serializable resolver context.
 */
import type { GameMode } from '../../modes/modeTypes'
import type { GameCategory } from '../../minigames/registry'
import type { RootState } from '../../store/store'
import type { ConfessionalMusicMode, MusicScene } from '../../store/uiSlice'
import {
  DEFAULT_MUSIC_CONFIG,
  resolveMusicCue,
  type MusicConfigDocument,
  type MusicMinigameVariant,
  type ResolvedMusicCue,
} from './musicConfig'
import type { MusicTrack } from './musicTracks'
import { resolveSpecialMusicCue } from './specialMusicCues'

const HOUSE_MENU_DESTINATION_ROUTES = new Set([
  'settings',
  'profile',
  'rules',
  'vox-populi-rules',
  'leaderboard',
  'store',
])

function isHouseMenuDestination(hash: string): boolean {
  const route = hash.replace(/^#/, '').split('?')[0]?.replace(/^\//, '') ?? ''
  return HOUSE_MENU_DESTINATION_ROUTES.has(route)
}

export interface MusicResolverState {
  game: Pick<RootState['game'], 'gameId' | 'phase' | 'spectatorActive'> & {
    mode?: GameMode
    status?: RootState['game']['status']
    voteResults?: RootState['game']['voteResults']
    evictionOverlayPlayerId?: RootState['game']['evictionOverlayPlayerId']
    seasonFinale?: Pick<NonNullable<RootState['game']['seasonFinale']>, 'phase'> | null
  }
  challenge: {
    pending?: {
      phase?: string | null
      musicVariant?: MusicMinigameVariant | null
      game?: {
        key?: string | null
        category?: GameCategory | null
      }
    } | null
  }
  social: Pick<RootState['social'], 'panelOpen' | 'incomingInboxOpen'>
  ui: {
    musicScene: MusicScene
    houseMenuOpen?: boolean
    confessionalMusicMode?: ConfessionalMusicMode
  }
}

export function resolveDesiredMusicCue(
  state: MusicResolverState,
  hash: string,
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG
): ResolvedMusicCue {
  const pendingChallenge = state.challenge.pending
  const baseCue = resolveMusicCue(
    {
      mode: state.game.mode ?? 'classic',
      gamePhase: state.game.phase,
      routeHash: hash,
      gameActive: state.game.status === 'active',
      musicScene: state.ui.musicScene,
      finalePhase: state.game.seasonFinale?.phase ?? null,
      spectatorActive: Boolean(state.game.spectatorActive),
      socialOpen: state.social.panelOpen || state.social.incomingInboxOpen,
      minigame: pendingChallenge
        ? {
            gameKey: pendingChallenge.game?.key ?? null,
            category: pendingChallenge.game?.category ?? null,
            stage: pendingChallenge.phase ?? null,
            variant: pendingChallenge.musicVariant ?? 'normal',
          }
        : null,
    },
    config
  )

  const cue =
    resolveSpecialMusicCue({
      baseCue,
      gamePhase: state.game.phase,
      hash,
      confessionalMusicMode: state.ui.confessionalMusicMode ?? 'normal',
      config,
    }) ?? baseCue

  // The room filter belongs to presentation surfaces only. Vote results can
  // remain in Redux after the reveal, so gate the tally effect by its ceremony
  // phases instead of treating every non-null result as active. Utility routes
  // entered from an active game own the room effect for their full route lifetime.
  const voteTallyActive =
    state.game.voteResults != null &&
    (state.game.phase === 'live_vote' || state.game.phase === 'eviction_results')
  const eliminationAnimationActive = state.game.evictionOverlayPlayerId != null
  const houseMenuDestinationActive =
    state.game.status === 'active' && isHouseMenuDestination(hash)
  const roomEffectActive =
    state.ui.houseMenuOpen === true ||
    houseMenuDestinationActive ||
    voteTallyActive ||
    eliminationAnimationActive
  if (!roomEffectActive || !cue.playbackCue || cue.playbackCue.effectPreset !== 'none') {
    return cue
  }

  return {
    ...cue,
    playbackCue: { ...cue.playbackCue, effectPreset: 'muffled' },
  }
}

export function resolveDesiredMusic(
  state: MusicResolverState,
  hash: string,
  config: MusicConfigDocument = DEFAULT_MUSIC_CONFIG
): MusicTrack {
  return resolveDesiredMusicCue(state, hash, config).track
}
