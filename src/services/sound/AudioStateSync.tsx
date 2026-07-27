import { useEffect, useMemo, useRef, useState } from 'react'
import { shallowEqual, useSelector } from 'react-redux'
import type { RootState } from '../../store/store'
import { SoundManager } from './SoundManager'
import { resolveDesiredMusicCue, type MusicResolverState } from './resolveDesiredMusic'
import { SILENT_MUSIC, getMinigameMusicProfile, type ResolvedMusicCue } from './musicConfig'
import { getDynamicMusicSoundEntries } from './musicCatalog'
import { observeHostedMinigamePlaying } from './minigameHostPhaseObserver'

const VOLUME_RAMP_STEP_MS = 50

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

export default function AudioStateSync() {
  const musicState = useSelector(
    (root: RootState) => ({
      gamePhase: root.game.phase,
      gameId: root.game.gameId,
      gameMode: root.game.mode ?? 'classic',
      spectatorActive: root.game.spectatorActive,
      seasonFinalePhase: root.game.seasonFinale?.phase ?? null,
      pendingChallengePhase: root.challenge.pending?.phase ?? null,
      pendingChallengeGameKey: root.challenge.pending?.game?.key ?? null,
      pendingChallengeGameCategory: root.challenge.pending?.game?.category ?? null,
      socialPanelOpen: root.social.panelOpen,
      incomingInboxOpen: root.social.incomingInboxOpen,
      musicScene: root.ui.musicScene,
      musicOn: root.settings.audio.musicOn,
      musicVolume: root.settings.audio.musicVolume,
    }),
    shallowEqual
  )
  const [hash, setHash] = useState(() => window.location.hash)
  const [hostedMinigameState, setHostedMinigameState] = useState<{
    gameKey: string | null
    playing: boolean
  }>({ gameKey: null, playing: false })
  const previousDesiredRef = useRef<ResolvedMusicCue>(createSilentCue('initial'))
  const latestDesiredRef = useRef<ResolvedMusicCue>(createSilentCue('initial'))
  const heldConfiguredCueRef = useRef<ResolvedMusicCue | null>(null)
  const fadeInTimerRef = useRef<number | null>(null)
  const postGameTimerRef = useRef<number | null>(null)
  const transitionTokenRef = useRef(0)

  useEffect(() => {
    for (const sound of getDynamicMusicSoundEntries()) {
      SoundManager.registerDynamic(sound)
    }
  }, [])

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  useEffect(() => {
    const profile = getMinigameMusicProfile(musicState.pendingChallengeGameKey, musicState.gameMode)
    if (!profile?.transition?.managedLifecycle) return undefined

    const gameKey = musicState.pendingChallengeGameKey
    return observeHostedMinigamePlaying((playing) => {
      setHostedMinigameState({ gameKey, playing })
    })
  }, [musicState.gameMode, musicState.pendingChallengeGameKey])

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
      },
    }),
    [musicState]
  )

  const resolvedCue = useMemo<ResolvedMusicCue>(() => {
    if (!musicState.musicOn) return createSilentCue('settings.music-off')
    return resolveDesiredMusicCue(resolverState, hash)
  }, [hash, musicState.musicOn, resolverState])

  const desiredCue = useMemo<ResolvedMusicCue>(() => {
    if (
      musicState.musicOn &&
      hostedMinigameState.playing &&
      hostedMinigameState.gameKey === musicState.pendingChallengeGameKey &&
      resolverState.challenge.pending
    ) {
      return resolveDesiredMusicCue(
        {
          ...resolverState,
          challenge: {
            pending: {
              ...resolverState.challenge.pending,
              phase: 'playing',
            },
          },
        },
        hash
      )
    }

    // The shared host still owns its visual lifecycle locally. Until that phase
    // is promoted into Redux, the semantic resolver receives a playing-stage
    // override from the compatibility observer above.
    return resolvedCue
  }, [
    hash,
    hostedMinigameState,
    musicState.musicOn,
    musicState.pendingChallengeGameKey,
    resolvedCue,
    resolverState,
  ])

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

    if (!musicState.musicOn) {
      clearPostGameTimer()
      heldConfiguredCueRef.current = null
      SoundManager.setMusicVolume(musicState.musicVolume)
      void SoundManager.setDesiredMusic('none', cueReason(desiredCue))
      return
    }

    if (enteringManagedCue && desiredCue.transition) {
      clearPostGameTimer()
      heldConfiguredCueRef.current = null

      if (
        previousCue.track === desiredCue.track &&
        previousCue.assignmentId === desiredCue.assignmentId
      ) {
        SoundManager.setMusicVolume(musicState.musicVolume)
        return
      }

      SoundManager.setMusicVolume(0)
      void SoundManager.setDesiredMusic(desiredCue.track, cueReason(desiredCue)).then(() => {
        if (transitionTokenRef.current !== transitionToken) return
        if (desiredCue.transition!.fadeInMs <= 0) {
          SoundManager.setMusicVolume(musicState.musicVolume)
          return
        }

        const steps = Math.max(1, Math.ceil(desiredCue.transition!.fadeInMs / VOLUME_RAMP_STEP_MS))
        let step = 0
        fadeInTimerRef.current = window.setInterval(() => {
          step += 1
          SoundManager.setMusicVolume(musicState.musicVolume * Math.min(1, step / steps))
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
        void SoundManager.fadeOutMusic(previousCue.transition!.fadeOutMs).then(() => {
          if (transitionTokenRef.current !== transitionToken) return
          heldConfiguredCueRef.current = null
          SoundManager.setMusicVolume(musicState.musicVolume)
          const nextCue = latestDesiredRef.current
          if (isManagedMinigameCue(nextCue)) return
          previousDesiredRef.current = nextCue
          void SoundManager.setDesiredMusic(nextCue.track, cueReason(nextCue))
        })
      }, previousCue.transition.postGameHoldMs)
      return
    }

    clearPostGameTimer()
    SoundManager.setMusicVolume(musicState.musicVolume)
    void SoundManager.setDesiredMusic(desiredCue.track, cueReason(desiredCue))
  }, [desiredCue, musicState.musicOn, musicState.musicVolume])

  useEffect(
    () => () => {
      transitionTokenRef.current += 1
      heldConfiguredCueRef.current = null
      if (fadeInTimerRef.current != null) window.clearInterval(fadeInTimerRef.current)
      if (postGameTimerRef.current != null) window.clearTimeout(postGameTimerRef.current)
    },
    []
  )

  return null
}
