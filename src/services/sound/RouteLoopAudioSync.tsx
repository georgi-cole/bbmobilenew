import { useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '../../store/store'
import { SoundManager } from './SoundManager'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

const INTRO_HUB_LOOP_KEY = 'music:intro_hub_loop'
const PLAYER_EVICTION_LOOP_KEY = 'player:self_evict_loop'
const INTRO_HUB_AUDIO_PATH = '/assets/sounds/cinematic/Intro_hub_loop.mp3'
const INTRO_HUB_VOLUME = 0.55
const INTRO_HUB_FADE_MS = 260
const INTRO_HUB_GAMEPLAY_EXIT_EVENT = 'introhub:gameplay-exit'

const INTRO_HUB_AUDIO_PATHS = new Set([
  '/',
  '/rules',
  '/vox-populi-rules',
  '/profile',
  '/profile-edit',
  '/profile-picker',
  '/leaderboard',
  '/settings',
  '/store',
  '/legal',
  '/public-meter',
])

let introHubAudio: HTMLAudioElement | null = null
let introHubFadeGeneration = 0
let introHubGameplayExitPending = false

function normalizedHashPath(hash: string): string {
  const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash
  const path = withoutHash.split(/[?#]/, 1)[0] || '/'
  if (path === '/') return '/'
  return path.replace(/\/+$/, '') || '/'
}

function isIntroHubAudioHash(hash: string): boolean {
  return INTRO_HUB_AUDIO_PATHS.has(normalizedHashPath(hash))
}

function isGameplayStoreHash(hash: string): boolean {
  return normalizedHashPath(hash) === '/store'
}

function isCreditsHash(hash: string): boolean {
  return /^#\/credits(?:[/?#]|$)/.test(hash)
}

function isSelfEvictedHash(hash: string): boolean {
  return /^#\/self-evicted(?:[/?#]|$)/.test(hash)
}

function isHumanEviction(humanId: string | null, overlayId: string | null): boolean {
  return humanId != null && overlayId === humanId
}

function cancelIntroHubFade(): void {
  introHubFadeGeneration += 1
}

function ensureIntroHubAudio(musicVolume: number): HTMLAudioElement {
  if (!introHubAudio) {
    introHubAudio = document.createElement('audio')
    introHubAudio.src = `${BASE}${INTRO_HUB_AUDIO_PATH}`
    introHubAudio.loop = true
    introHubAudio.preload = 'none'
  }

  introHubAudio.volume = Math.max(0, Math.min(1, INTRO_HUB_VOLUME * musicVolume))
  return introHubAudio
}

function pauseIntroHubLoop(): void {
  cancelIntroHubFade()
  introHubAudio?.pause()
  // #1375/#1376 used SoundManager.play(), which put this loop in the SFX pool.
  // Stop any legacy pooled copy so a stale duplicate can never survive mute.
  SoundManager.stop(INTRO_HUB_LOOP_KEY)
}

function resetIntroHubLoop(): void {
  cancelIntroHubFade()
  SoundManager.stop(INTRO_HUB_LOOP_KEY)

  const el = introHubAudio
  if (!el) return
  el.pause()
  el.muted = false
  try {
    el.currentTime = 0
  } catch {
    // Some WebViews reject currentTime while media state is settling.
  }
}

function primeIntroHubPermissionFromCreditsGesture(musicVolume: number): void {
  const el = ensureIntroHubAudio(musicVolume)
  try {
    el.currentTime = 0
  } catch {
    // Some WebViews reject currentTime while media state is settling.
  }

  // Credits exits only after its fade. Touch the already-singleton media
  // element during the actual Skip/Escape gesture, but keep it muted and pause
  // it again immediately. This preserves the browser media permission without
  // allowing Intro Hub audio to remain playing underneath Credits.
  el.muted = true
  void el
    .play()
    .then(() => {
      if (!isIntroHubAudioHash(window.location.hash)) {
        el.pause()
        try {
          el.currentTime = 0
        } catch {
          // Some WebViews reject currentTime while media state is settling.
        }
      }
      el.muted = false
    })
    .catch(() => {
      el.muted = false
    })
}

function startIntroHubLoop(musicVolume: number): void {
  // Intro Hub music owns the whole hub utility family, but never gameplay or
  // a screen/cinematic that owns its own audio. A late gesture callback must
  // re-check the live route instead of trusting stale React state.
  if (
    introHubGameplayExitPending ||
    !isIntroHubAudioHash(window.location.hash) ||
    document.querySelector('.hbc') != null
  ) {
    resetIntroHubLoop()
    return
  }

  cancelIntroHubFade()

  // Hub-family screens are outside gameplay. Clear central gameplay BGM and
  // any legacy pooled Intro Hub copy before touching the dedicated singleton.
  SoundManager.stopAllMusic()
  SoundManager.stop(INTRO_HUB_LOOP_KEY)

  const el = ensureIntroHubAudio(musicVolume)
  el.muted = false
  if (!el.paused) return

  void el.play().catch(() => undefined)
}

function fadeOutAndResetIntroHubLoop(durationMs = INTRO_HUB_FADE_MS): void {
  SoundManager.stop(INTRO_HUB_LOOP_KEY)

  const el = introHubAudio
  if (!el || el.paused || durationMs <= 0) {
    resetIntroHubLoop()
    return
  }

  const generation = ++introHubFadeGeneration
  const startedAt = performance.now()
  const startVolume = el.volume

  const tick = (now: number) => {
    if (generation !== introHubFadeGeneration) return

    const progress = Math.min(1, (now - startedAt) / durationMs)
    el.volume = Math.max(0, startVolume * (1 - progress))

    if (progress < 1) {
      window.requestAnimationFrame(tick)
      return
    }

    resetIntroHubLoop()
  }

  window.requestAnimationFrame(tick)
}

function isHubAudioTakeoverControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const control = target.closest('button, a')
  const label = control?.textContent?.trim().toLowerCase() ?? ''
  return label.includes('credits') || label.includes('housemates') || label.includes('hubmates')
}

function isCreditsExitControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const control = target.closest('button, a')
  if (!control) return false
  const label = `${control.getAttribute('aria-label') ?? ''} ${control.textContent ?? ''}`
    .trim()
    .toLowerCase()
  return control.classList.contains('credits-exit') || label.includes('skip credits')
}

/**
 * Owns long-form loops tied to route/overlay visibility rather than a normal
 * gameplay phase.
 *
 * Intro Hub deliberately uses one dedicated HTMLAudioElement instead of the
 * generic SoundManager.play() pool. That singleton belongs to the whole Intro
 * Hub utility family (Home, Rules, Profile, Leaderboard, Settings, Store, etc.)
 * and keeps playing continuously while navigating among those screens. Credits,
 * Hubmates and gameplay take audio ownership, so they stop/reset it. The Store
 * is the exception when it is opened from a live game: it is a brief purchase
 * detour and deliberately leaves the current gameplay bed running. Returning
 * from one of those owners starts the singleton fresh once. The music toggle
 * pauses/resumes the same instance in place.
 */
export default function RouteLoopAudioSync({ hash }: { hash: string }) {
  const musicOn = useSelector((state: RootState) => state.settings.audio.musicOn)
  const musicVolume = useSelector((state: RootState) => state.settings.audio.musicVolume)
  const sfxOn = useSelector((state: RootState) => state.settings.audio.sfxOn)
  const evictionOverlayPlayerId = useSelector(
    (state: RootState) => state.game.evictionOverlayPlayerId ?? null
  )
  const humanPlayerId = useSelector(
    (state: RootState) => state.game.players.find((player) => player.isUser)?.id ?? null
  )
  const gameActive = useSelector((state: RootState) => state.game.status === 'active')
  const [introHubSuppressed, setIntroHubSuppressed] = useState(false)

  const introHubAudioEligible =
    isIntroHubAudioHash(hash) && !(gameActive && isGameplayStoreHash(hash))
  const playerEvictionActive =
    isSelfEvictedHash(hash) || isHumanEviction(humanPlayerId, evictionOverlayPlayerId)

  useEffect(() => {
    SoundManager.stop(INTRO_HUB_LOOP_KEY)
    SoundManager.registerDynamic({
      key: PLAYER_EVICTION_LOOP_KEY,
      category: 'player',
      src: `${BASE}/assets/sounds/events/player_self_evict.mp3`,
      preload: false,
      volume: 1,
      loop: true,
    })

    const handleGameplayExit = () => {
      // New-game preloading temporarily retains a hub-family URL. The preloader
      // emits this event so gameplay takes audio ownership immediately.
      introHubGameplayExitPending = true
      resetIntroHubLoop()
    }

    const enforceLiveRouteOwnership = () => {
      if (isIntroHubAudioHash(window.location.hash)) {
        // Entering any normal hub-family screen ends gameplay-exit suppression.
        // Navigation within the family leaves the same audio instance untouched.
        introHubGameplayExitPending = false
        return
      }
      resetIntroHubLoop()
    }

    window.addEventListener(INTRO_HUB_GAMEPLAY_EXIT_EVENT, handleGameplayExit)
    window.addEventListener('hashchange', enforceLiveRouteOwnership)
    enforceLiveRouteOwnership()

    return () => {
      window.removeEventListener(INTRO_HUB_GAMEPLAY_EXIT_EVENT, handleGameplayExit)
      window.removeEventListener('hashchange', enforceLiveRouteOwnership)
      resetIntroHubLoop()
      introHubGameplayExitPending = false
      introHubAudio = null
      SoundManager.stop(PLAYER_EVICTION_LOOP_KEY)
    }
  }, [])

  useEffect(() => {
    if (!isCreditsHash(hash) || !musicOn) return undefined

    const handleCreditsReturnClick = (event: Event) => {
      if (!isCreditsExitControl(event.target)) return
      primeIntroHubPermissionFromCreditsGesture(musicVolume)
    }
    const handleCreditsReturnKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      primeIntroHubPermissionFromCreditsGesture(musicVolume)
    }

    document.addEventListener('click', handleCreditsReturnClick, true)
    document.addEventListener('keydown', handleCreditsReturnKey, true)
    return () => {
      document.removeEventListener('click', handleCreditsReturnClick, true)
      document.removeEventListener('keydown', handleCreditsReturnKey, true)
    }
  }, [hash, musicOn, musicVolume])

  useEffect(() => {
    if (!introHubAudioEligible) return undefined

    const handleTakeoverClick = (event: Event) => {
      if (!isHubAudioTakeoverControl(event.target)) return
      fadeOutAndResetIntroHubLoop()
    }

    document.addEventListener('click', handleTakeoverClick, true)
    return () => document.removeEventListener('click', handleTakeoverClick, true)
  }, [introHubAudioEligible])

  useEffect(() => {
    if (!introHubAudioEligible) return undefined

    const syncHubmatesSuppression = () => {
      const suppressed = document.querySelector('.hbc') != null
      if (suppressed) resetIntroHubLoop()
      setIntroHubSuppressed(suppressed)
    }

    syncHubmatesSuppression()
    const observer = new MutationObserver(syncHubmatesSuppression)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [introHubAudioEligible])

  useEffect(() => {
    if (!introHubAudioEligible || playerEvictionActive || introHubSuppressed) {
      resetIntroHubLoop()
      return
    }

    if (!musicOn) {
      pauseIntroHubLoop()
      return
    }

    SoundManager.unlockOnUserGesture()
    startIntroHubLoop(musicVolume)

    const startAfterGesture = () => {
      startIntroHubLoop(musicVolume)
    }
    document.addEventListener('click', startAfterGesture, { once: true })
    document.addEventListener('keydown', startAfterGesture, { once: true })

    return () => {
      document.removeEventListener('click', startAfterGesture)
      document.removeEventListener('keydown', startAfterGesture)
    }
  }, [introHubAudioEligible, introHubSuppressed, musicOn, musicVolume, playerEvictionActive])

  useEffect(() => {
    if (playerEvictionActive && sfxOn) {
      void SoundManager.play(PLAYER_EVICTION_LOOP_KEY)
    } else {
      SoundManager.stop(PLAYER_EVICTION_LOOP_KEY)
    }

    return () => SoundManager.stop(PLAYER_EVICTION_LOOP_KEY)
  }, [playerEvictionActive, sfxOn])

  return null
}
