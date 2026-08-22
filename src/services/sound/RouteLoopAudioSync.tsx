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

let introHubFadeGeneration = 0

function isIntroHubHash(hash: string): boolean {
  return hash === '' || hash === '#' || hash === '#/'
}

function isSelfEvictedHash(hash: string): boolean {
  return /^#\/self-evicted(?:[/?#]|$)/.test(hash)
}

function isHumanEviction(humanId: string | null, overlayId: string | null): boolean {
  return humanId != null && overlayId === humanId
}

function getIntroHubAudioElements(): HTMLAudioElement[] {
  return Array.from(document.querySelectorAll<HTMLAudioElement>('audio')).filter((el) => {
    const src = el.currentSrc || el.src
    if (!src) return false

    try {
      return new URL(src, window.location.href).pathname.endsWith(INTRO_HUB_AUDIO_PATH)
    } catch {
      return src.includes('Intro_hub_loop.mp3')
    }
  })
}

function cancelIntroHubFade(): void {
  introHubFadeGeneration += 1
}

function pauseIntroHubLoop(): void {
  cancelIntroHubFade()
  for (const el of getIntroHubAudioElements()) el.pause()
}

function resumeIntroHubLoop(musicVolume: number): boolean {
  cancelIntroHubFade()
  const el = getIntroHubAudioElements().find((candidate) => candidate.currentTime > 0)
  if (!el) return false

  el.volume = Math.max(0, Math.min(1, INTRO_HUB_VOLUME * musicVolume))
  if (el.paused) void el.play().catch(() => undefined)
  return true
}

function startIntroHubLoop(musicVolume: number): void {
  if (resumeIntroHubLoop(musicVolume)) return

  // Keep this play request synchronous. Safari/iOS and some WebViews only
  // allow media playback during the transient user-activation call stack.
  SoundManager.stopAllMusic()
  void SoundManager.play(INTRO_HUB_LOOP_KEY, {
    volume: INTRO_HUB_VOLUME * musicVolume,
  })
}

function fadeOutAndResetIntroHubLoop(durationMs = INTRO_HUB_FADE_MS): void {
  const elements = getIntroHubAudioElements().filter((el) => !el.paused)
  if (elements.length === 0 || durationMs <= 0) {
    cancelIntroHubFade()
    SoundManager.stop(INTRO_HUB_LOOP_KEY)
    return
  }

  const generation = ++introHubFadeGeneration
  const startedAt = performance.now()
  const startVolumes = elements.map((el) => el.volume)

  const tick = (now: number) => {
    if (generation !== introHubFadeGeneration) return

    const progress = Math.min(1, (now - startedAt) / durationMs)
    elements.forEach((el, index) => {
      el.volume = Math.max(0, startVolumes[index]! * (1 - progress))
    })

    if (progress < 1) {
      window.requestAnimationFrame(tick)
      return
    }

    SoundManager.stop(INTRO_HUB_LOOP_KEY)
  }

  window.requestAnimationFrame(tick)
}

function isHubAudioTakeoverControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const control = target.closest('button, a')
  const label = control?.textContent?.trim().toLowerCase() ?? ''
  return label.includes('credits') || label.includes('housemates') || label.includes('hubmates')
}

/**
 * Owns the two long-form loops that are tied to route/overlay visibility rather
 * than a normal gameplay phase.
 *
 * The Intro Hub loop pauses in-place for the user's music toggle, but fades and
 * resets when another hub-owned soundtrack takes over. That makes mute/unmute
 * behave like a true pause/resume while returning from Credits or Hubmates feels
 * like re-entering the hub.
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
  const [introHubSuppressed, setIntroHubSuppressed] = useState(false)

  const introHubActive = isIntroHubHash(hash)
  const playerEvictionActive =
    isSelfEvictedHash(hash) || isHumanEviction(humanPlayerId, evictionOverlayPlayerId)

  useEffect(() => {
    SoundManager.registerDynamic({
      key: INTRO_HUB_LOOP_KEY,
      category: 'music',
      src: `${BASE}${INTRO_HUB_AUDIO_PATH}`,
      preload: false,
      volume: INTRO_HUB_VOLUME,
      loop: true,
    })
    SoundManager.registerDynamic({
      key: PLAYER_EVICTION_LOOP_KEY,
      category: 'player',
      src: `${BASE}/assets/sounds/events/player_self_evict.mp3`,
      preload: false,
      volume: 1,
      loop: true,
    })

    return () => {
      cancelIntroHubFade()
      SoundManager.stop(INTRO_HUB_LOOP_KEY)
      SoundManager.stop(PLAYER_EVICTION_LOOP_KEY)
    }
  }, [])

  useEffect(() => {
    if (!introHubActive) return undefined

    const handleTakeoverClick = (event: Event) => {
      if (!isHubAudioTakeoverControl(event.target)) return
      fadeOutAndResetIntroHubLoop()
    }

    // Capture phase runs before the destination's React click handler, so the
    // hub bed starts fading before Credits/Hubmates starts its own soundtrack.
    document.addEventListener('click', handleTakeoverClick, true)
    return () => document.removeEventListener('click', handleTakeoverClick, true)
  }, [introHubActive])

  useEffect(() => {
    if (!introHubActive) return undefined

    const syncHubmatesSuppression = () => {
      setIntroHubSuppressed(document.querySelector('.hbc') != null)
    }

    syncHubmatesSuppression()
    const observer = new MutationObserver(syncHubmatesSuppression)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [introHubActive])

  useEffect(() => {
    if (!introHubActive || playerEvictionActive || introHubSuppressed) {
      fadeOutAndResetIntroHubLoop()
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
      document.removeEventListener('pointerdown', startAfterGesture)
      document.removeEventListener('keydown', startAfterGesture)
    }
    document.addEventListener('pointerdown', startAfterGesture, { once: true })
    document.addEventListener('keydown', startAfterGesture, { once: true })

    return () => {
      document.removeEventListener('pointerdown', startAfterGesture)
      document.removeEventListener('keydown', startAfterGesture)
    }
  }, [introHubActive, introHubSuppressed, musicOn, musicVolume, playerEvictionActive])

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
