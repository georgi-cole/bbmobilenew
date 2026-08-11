import { useEffect, useMemo, useRef, useState } from 'react'
import { shallowEqual, useSelector } from 'react-redux'
import type { RootState } from '../../store/store'
import { SoundManager } from './SoundManager'
import { resolveDesiredMusicCue, type MusicResolverState } from './resolveDesiredMusic'
import {
  SILENT_MUSIC,
  getMinigameMusicProfile,
  type MusicConfigDocument,
  type ResolvedMusicCue,
} from './musicConfig'
import {
  createMusicTrackOverrideSound,
  getDynamicMusicSoundEntries,
  type MusicTrackAssetOverride,
} from './musicCatalog'
import { buildEffectiveMusicConfig, mergeMusicTrackAssets } from './musicRuntimeConfig'

const VOLUME_RAMP_STEP_MS = 50
const SAFETY_SEQUENCE_DUCK_LEVEL = 0.12
const SAFETY_SEQUENCE_DUCK_MS = 1200
const SAFETY_SEQUENCE_RESUME_MS = 900
const SAFETY_SEQUENCE_DAY_END_FADE_MS = 1500

function createSilentCue(assignmentId: string): ResolvedMusicCue {
  return {
    track: 'none',
    selection: SILENT_MUSIC,
    assignmentId,
    source: 'fallback',
    inheritedAssignments: [],
  }
}

function isManagedMinigameCue(cue: ResolvedMusicCue): boolean {
  return (
    cue.source === 'minigame' &&
    cue.selection.kind === 'track' &&
    cue.transition?.managedLifecycle === true
  )
}

function cueReason(cue: ResolvedMusicCue): string {
  return `${cue.source}:${cue.assignmentId}`
}

import { hasSameResolvedPlayback, shouldCrossfadeManagedMinigameCue } from './musicCueTransitions'

function enrichMinigameTransition(
  cue: ResolvedMusicCue,
  gameKey: string | null,
  mode: 'classic' | 'survival',
  config: MusicConfigDocument
): ResolvedMusicCue {
  if (cue.source !== 'minigame' || cue.transition || !gameKey) return cue
  const transition = getMinigameMusicProfile(gameKey, mode, config)?.transition
  return transition ? { ...cue, transition } : cue
}

export default function AudioStateSync() {
  const musicMix = useSelector((root: RootState) => root.ui.musicMix ?? 'normal')
  const musicState = useSelector(
    (root: RootState) => ({
      gamePhase: root.game.phase,
      gameId: root.game.gameId,
      gameMode: root.game.mode ?? 'classic',
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
      musicOn: root.settings.audio.musicOn,
      musicVolume: root.settings.audio.musicVolume,
      localMusicOverrides: root.settings.audio.musicConfigOverrides,
      localMusicTrackAssets: root.settings.audio.musicTrackAssets,
      remoteMusic: root.remoteConfig?.config?.season?.music ?? null,
    }),
    shallowEqual
  )
  const [hash, setHash] = useState(() => window.location.hash)
  const previousDesiredRef = useRef<ResolvedMusicCue>(createSilentCue('initial'))
  const latestDesiredRef = useRef<ResolvedMusicCue>(createSilentCue('initial'))
  const heldConfiguredCueRef = useRef<ResolvedMusicCue | null>(null)
  const fadeInTimerRef = useRef<number | null>(null)
  const postGameTimerRef = useRef<number | null>(null)
  const mixRampTimerRef = useRef<number | null>(null)
  const transitionTokenRef = useRef(0)
  const previousGamePhaseRef = useRef(musicState.gamePhase)
  const musicMixRef = useRef(musicMix)
  const previousMusicMixRef = useRef(musicMix)

  useEffect(() => {
    musicMixRef.current = musicMix
  }, [musicMix])

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

  useEffect(() => {
    for (const sound of getDynamicMusicSoundEntries()) {
      SoundManager.registerDynamic(sound)
    }
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
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const resolverState = useMemo<MusicResolverState>(
    () => ({
      game: {
        phase: musicState.gamePhase,
        gameId: musicState.gameId,
        mode: musicState.gameMode,
        spectatorActive: musicState.spectatorActive,
        seasonFinale:
          musicState.seasonFinalePhase != null ? { phase: musicState.seasonFinalePhase } : null,
      },
      challenge: {
        pending:
          musicState.pendingChallengePhase !== null
            ? {
                phase: musicState.pendingChallengePhase,
                musicVariant: musicState.pendingChallengeVariant,
                game: {
                  key: musicState.pendingChallengeGameKey,
                  category: musicState.pendingChallengeGameCategory,
                },
              }
            : null,
      },
      social: {
        panelOpen: musicState.socialPanelOpen,
        incomingInboxOpen: musicState.incomingInboxOpen,
      },
      ui: {
        musicScene: musicState.musicScene,
        confessionalMusicMode: musicState.confessionalMusicMode,
      },
    }),
    [musicState]
  )

  const resolveCue = useMemo(
    () => (state: MusicResolverState) =>
      enrichMinigameTransition(
        resolveDesiredMusicCue(state, hash, effectiveConfig),
        musicState.pendingChallengeGameKey,
        musicState.gameMode,
        effectiveConfig
      ),
    [effectiveConfig, hash, musicState.gameMode, musicState.pendingChallengeGameKey]
  )

  const desiredCue = useMemo<ResolvedMusicCue>(() => {
    if (!musicState.musicOn) return createSilentCue('settings.music-off')
    return resolveCue(resolverState)
  }, [musicState.musicOn, resolveCue, resolverState])

  useEffect(() => {
    latestDesiredRef.current = desiredCue
    const enteringManagedCue = isManagedMinigameCue(desiredCue)

    // Once a managed track begins its winner-badge hold/fade, later resolver
    // updates are remembered as the eventual fallback but cannot interrupt it.
    if (musicState.musicOn && heldConfiguredCueRef.current && !enteringManagedCue) {
      return
    }

    const previousCue = previousDesiredRef.current
    previousDesiredRef.current = desiredCue
    const previousGamePhase = previousGamePhaseRef.current
    previousGamePhaseRef.current = musicState.gamePhase
    const leavingManagedCue = isManagedMinigameCue(previousCue)
    const transitionToken = ++transitionTokenRef.current

    const clearFadeIn = () => {
      if (fadeInTimerRef.current != null) {
        window.clearInterval(fadeInTimerRef.current)
        fadeInTimerRef.current = null
      }
    }
    const clearPostGameTimer = () => {
      if (postGameTimerRef.current != null) {
        window.clearTimeout(postGameTimerRef.current)
        postGameTimerRef.current = null
      }
    }

    clearFadeIn()

    const mixedMusicVolume =
      musicState.musicVolume * (musicMixRef.current === 'ducked' ? SAFETY_SEQUENCE_DUCK_LEVEL : 1)

    if (!musicState.musicOn) {
      clearPostGameTimer()
      heldConfiguredCueRef.current = null
      SoundManager.setMusicVolume(mixedMusicVolume)
      void SoundManager.setDesiredMusic('none', cueReason(desiredCue))
      return
    }

    if (enteringManagedCue && desiredCue.transition) {
      clearPostGameTimer()
      heldConfiguredCueRef.current = null

      if (hasSameResolvedPlayback(previousCue, desiredCue)) {
        SoundManager.setMusicVolume(mixedMusicVolume)
        return
      }

      if (
        shouldCrossfadeManagedMinigameCue(previousCue, desiredCue) ||
        (desiredCue.playbackCue?.fadeInMs ?? 0) > 0
      ) {
        SoundManager.setMusicVolume(mixedMusicVolume)
        void SoundManager.setDesiredMusicCue(desiredCue, cueReason(desiredCue))
        return
      }

      SoundManager.setMusicVolume(0)
      void SoundManager.setDesiredMusicCue(desiredCue, cueReason(desiredCue)).then(() => {
        if (transitionTokenRef.current !== transitionToken) return
        if (desiredCue.transition!.fadeInMs <= 0) {
          SoundManager.setMusicVolume(mixedMusicVolume)
          return
        }

        const steps = Math.max(1, Math.ceil(desiredCue.transition!.fadeInMs / VOLUME_RAMP_STEP_MS))
        let step = 0
        fadeInTimerRef.current = window.setInterval(() => {
          step += 1
          SoundManager.setMusicVolume(mixedMusicVolume * Math.min(1, step / steps))
          if (step >= steps) clearFadeIn()
        }, VOLUME_RAMP_STEP_MS)
      })
      return
    }

    if (leavingManagedCue && previousCue.transition) {
      clearPostGameTimer()
      heldConfiguredCueRef.current = previousCue
      postGameTimerRef.current = window.setTimeout(() => {
        postGameTimerRef.current = null
        const configuredFadeOut = previousCue.playbackCue?.fadeOutMs ?? 0
        const fadeOutMs =
          configuredFadeOut > 0 ? configuredFadeOut : previousCue.transition!.fadeOutMs
        void SoundManager.fadeOutMusic(fadeOutMs).then(() => {
          if (transitionTokenRef.current !== transitionToken) return
          heldConfiguredCueRef.current = null
          SoundManager.setMusicVolume(mixedMusicVolume)
          const nextCue = latestDesiredRef.current
          if (isManagedMinigameCue(nextCue)) return
          previousDesiredRef.current = nextCue
          void SoundManager.setDesiredMusicCue(nextCue, cueReason(nextCue))
        })
      }, previousCue.transition.postGameHoldMs)
      return
    }

    clearPostGameTimer()
    if (
      previousGamePhase === 'week_end' &&
      musicState.gamePhase === 'week_start' &&
      previousCue.track === 'veto' &&
      desiredCue.track === 'none'
    ) {
      void SoundManager.fadeOutMusic(SAFETY_SEQUENCE_DAY_END_FADE_MS)
      return
    }
    SoundManager.setMusicVolume(mixedMusicVolume)
    void SoundManager.setDesiredMusicCue(desiredCue, cueReason(desiredCue))
  }, [desiredCue, musicState.gamePhase, musicState.musicOn, musicState.musicVolume])

  useEffect(() => {
    if (mixRampTimerRef.current != null) window.clearInterval(mixRampTimerRef.current)
    mixRampTimerRef.current = null
    if (!musicState.musicOn) return

    const previousMix = previousMusicMixRef.current
    previousMusicMixRef.current = musicMix
    if (previousMix === musicMix) return

    const startVolume =
      musicState.musicVolume * (previousMix === 'ducked' ? SAFETY_SEQUENCE_DUCK_LEVEL : 1)
    const targetVolume =
      musicState.musicVolume * (musicMix === 'ducked' ? SAFETY_SEQUENCE_DUCK_LEVEL : 1)
    const durationMs = musicMix === 'ducked' ? SAFETY_SEQUENCE_DUCK_MS : SAFETY_SEQUENCE_RESUME_MS
    const steps = Math.max(1, Math.ceil(durationMs / VOLUME_RAMP_STEP_MS))
    let step = 0

    mixRampTimerRef.current = window.setInterval(() => {
      step += 1
      const progress = Math.min(1, step / steps)
      SoundManager.setMusicVolume(startVolume + (targetVolume - startVolume) * progress)
      if (step >= steps && mixRampTimerRef.current != null) {
        window.clearInterval(mixRampTimerRef.current)
        mixRampTimerRef.current = null
      }
    }, VOLUME_RAMP_STEP_MS)

    return () => {
      if (mixRampTimerRef.current != null) window.clearInterval(mixRampTimerRef.current)
      mixRampTimerRef.current = null
    }
  }, [musicMix, musicState.musicOn, musicState.musicVolume])

  useEffect(
    () => () => {
      transitionTokenRef.current += 1
      heldConfiguredCueRef.current = null
      if (fadeInTimerRef.current != null) window.clearInterval(fadeInTimerRef.current)
      if (postGameTimerRef.current != null) window.clearTimeout(postGameTimerRef.current)
      if (mixRampTimerRef.current != null) window.clearInterval(mixRampTimerRef.current)
    },
    []
  )

  return null
}
