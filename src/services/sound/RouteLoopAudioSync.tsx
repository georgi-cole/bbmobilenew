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

let introHubAudio: HTMLAudioElement | null = null
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

function startIntroHubLoop(musicVolume: number): void {
  cancelIntroHubFade()

  // The hub is outside gameplay. Clear central gameplay BGM and any legacy
  // pooled Intro Hub copy before touching the one dedicated hub element.
  SoundManager.stopAllMusic()
  SoundManager.stop(INTRO_HUB_LOOP_KEY)

  const el = ensureIntroHubAudio(musicVolume)
  if (!el.paused) return

  // Keep play() in the user-activation call stack when this runs from the
  // pointer/key retry below. Safari/iOS can reject delayed media playback.
  void el.play().catch(() => undefined)
}

function resetIntroHubLoop(): void {
  cancelIntroHubFade()
  SoundManager.stop(INTRO_HUB_LOOP_KEY)

  const el = introHubAudio
  if (!el) return
  el.pause()
  try {
    el.currentTime = 0
  } catch {
    // Some WebViews reject currentTime while media state is settling.
  }
}

function fadeOutAndResetIntroHubLoop(durationMs = INTRO_HUB_FADE_MS): void {
  // Always clean up the old pooled path as well as the dedicated element.
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

/**
 * Owns the two long-form loops that are tied to route/overlay visibility rather
 * than a normal gameplay phase.
 *
 * Intro Hub deliberately uses one dedicated HTMLAudioElement instead of the
 * generic SoundManager.play() pool. A looping background bed must be singleton:
 * mute/unmute pauses/resumes that exact element, while route/cinematic takeover
 * fades and resets it before the next owner starts.
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
    // Clean up any pooled Intro Hub instance left by the pre-hotfix implementation.
    SoundManager.stop(INTRO_HUB_LOOP_KEY)
    SoundManager.registerDynamic({
      key: PLAYER_EVICTION_LOOP_KEY,
      category: 'player',
      src: `${BASE}/assets/sounds/events/player_self_evict.mp3`,
      preload: false,
      volume: 1,
      loop: true,
    })

    return () => {
      resetIntroHubLoop()
      introHubAudio = null
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
