import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { shallowEqual, useSelector } from 'react-redux'
import type { RootState } from '../../store/store'
import { SoundManager } from './SoundManager'
import { resolveDesiredMusicCue, type MusicResolverState } from './resolveDesiredMusic'
import { SILENT_MUSIC, type ResolvedMusicCue } from './musicConfig'
import {
  createMusicTrackOverrideSound,
  getDynamicMusicSoundEntries,
  type MusicTrackAssetOverride,
} from './musicCatalog'
import { buildEffectiveMusicConfig, mergeMusicTrackAssets } from './musicRuntimeConfig'
import { resolveRuntimeMusicMix } from './musicMix'
import {
  completeGameplayAudioExit,
  isGameplayAudioHandoffPending,
  subscribeToGameplayAudioHandoff,
} from './audioRouteOwnership'
import { HOUSE_MENU_AUDIO_EVENT } from './audioRouteOwnership'

type AudioStateSyncProps = {
  hash: string
}

function createSilentCue(assignmentId: string): ResolvedMusicCue {
  return {
    track: 'none',
    selection: SILENT_MUSIC,
    assignmentId,
    source: 'fallback',
    inheritedAssignments: [],
  }
}

function cueReason(cue: ResolvedMusicCue): string {
  return `${cue.source}:${cue.assignmentId}`
}

function isGameplayHash(hash: string): boolean {
  return /^#\/game(?:[/?#]|$)/.test(hash)
}

/**
 * The only runtime controller for state-driven music. It resolves one cue
 * from the current app state and asks SoundManager to make that cue audible.
 * Fades, cancellation, and late media callbacks stay inside SoundManager.
 */
export default function AudioStateSync({ hash }: AudioStateSyncProps) {
  const handoffPending = useSyncExternalStore(
    subscribeToGameplayAudioHandoff,
    isGameplayAudioHandoffPending,
    isGameplayAudioHandoffPending
  )
  const [houseMenuOpen, setHouseMenuOpen] = useState(false)
  useEffect(() => {
    const onHouseMenuAudio = (event: Event) => {
      setHouseMenuOpen((event as CustomEvent<{ open?: boolean }>).detail?.open === true)
    }
    window.addEventListener(HOUSE_MENU_AUDIO_EVENT, onHouseMenuAudio)
    return () => window.removeEventListener(HOUSE_MENU_AUDIO_EVENT, onHouseMenuAudio)
  }, [])
  const musicMix = useSelector((root: RootState) => resolveRuntimeMusicMix(root.game))
  const musicState = useSelector(
    (root: RootState) => ({
      gamePhase: root.game.phase,
      gameId: root.game.gameId,
      gameMode: root.game.mode ?? 'classic',
      gameStatus: root.game.status,
      spectatorActive: root.game.spectatorActive,
      seasonFinalePhase: root.game.seasonFinale?.phase ?? null,
      pendingChallengePhase: root.challenge.pending?.phase ?? null,
      pendingChallengeVariant: root.challenge.pending?.musicVariant ?? 'normal',
      pendingChallengeGameKey: root.challenge.pending?.game?.key ?? null,
      pendingChallengeGameCategory: root.challenge.pending?.game?.category ?? null,
      socialPanelOpen: root.social.panelOpen,
      incomingInboxOpen: root.social.incomingInboxOpen,
      musicScene: root.ui.musicScene,
      confessionalMusicMode: root.ui.confessionalMusicMode ?? 'normal',
      musicVolume: root.settings.audio.musicVolume,
      localMusicOverrides: root.settings.audio.musicConfigOverrides,
      localMusicTrackAssets: root.settings.audio.musicTrackAssets,
      remoteMusic: root.remoteConfig?.config?.season?.music ?? null,
    }),
    shallowEqual
  )

  const effectiveConfig = useMemo(
    () =>
      buildEffectiveMusicConfig(
        musicState.remoteMusic?.assignments,
        musicState.localMusicOverrides
      ),
    [musicState.localMusicOverrides, musicState.remoteMusic?.assignments]
  )
  const effectiveTrackAssets = useMemo<MusicTrackAssetOverride[]>(
    () => mergeMusicTrackAssets(musicState.remoteMusic, musicState.localMusicTrackAssets),
    [musicState.localMusicTrackAssets, musicState.remoteMusic]
  )
  const resolverState = useMemo<MusicResolverState>(
    () => ({
      game: {
        phase: musicState.gamePhase,
        gameId: musicState.gameId,
        mode: musicState.gameMode,
        status: musicState.gameStatus,
        spectatorActive: musicState.spectatorActive,
        seasonFinale:
          musicState.seasonFinalePhase != null ? { phase: musicState.seasonFinalePhase } : null,
      },
      challenge: {
        pending:
          musicState.pendingChallengePhase == null
            ? null
            : {
                phase: musicState.pendingChallengePhase,
                musicVariant: musicState.pendingChallengeVariant,
                game: {
                  key: musicState.pendingChallengeGameKey,
                  category: musicState.pendingChallengeGameCategory,
                },
              },
      },
      social: {
        panelOpen: musicState.socialPanelOpen,
        incomingInboxOpen: musicState.incomingInboxOpen,
      },
      ui: {
        musicScene: musicState.musicScene,
        houseMenuOpen,
        confessionalMusicMode: musicState.confessionalMusicMode,
      },
    }),
    [houseMenuOpen, musicState]
  )

  const desiredCue = useMemo<ResolvedMusicCue>(() => {
    if (handoffPending) return createSilentCue('route.gameplay-handoff')
    return resolveDesiredMusicCue(resolverState, hash, effectiveConfig)
  }, [effectiveConfig, handoffPending, hash, resolverState])

  useEffect(() => {
    for (const sound of getDynamicMusicSoundEntries()) SoundManager.registerDynamic(sound)
  }, [])

  useEffect(() => {
    SoundManager.setMusicTrackOverrides(
      effectiveTrackAssets.map((asset) => ({
        track: asset.track,
        sound: createMusicTrackOverrideSound(asset),
      }))
    )
  }, [effectiveTrackAssets])

  useEffect(() => {
    if (handoffPending && isGameplayHash(hash)) completeGameplayAudioExit()
  }, [handoffPending, hash])

  useEffect(() => {
    const mixFactor = musicMix === 'muted' ? 0 : musicMix === 'ducked' ? 0.12 : 1
    SoundManager.setMusicVolume(musicState.musicVolume * mixFactor)
    void SoundManager.setDesiredMusicCue(desiredCue, cueReason(desiredCue))
  }, [desiredCue, musicMix, musicState.musicVolume])

  return null
}
