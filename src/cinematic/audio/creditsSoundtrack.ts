import { CINEMATIC_AUDIO, CINEMATIC_CONFIG } from '../config/cinematicConfig'
import { getTimelineState } from '../timeline/timeline'

let soundtrack: HTMLAudioElement | null = null
let volumeAnimationFrame: number | null = null

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const cancelVolumeAnimation = () => {
  if (volumeAnimationFrame != null) {
    window.cancelAnimationFrame(volumeAnimationFrame)
    volumeAnimationFrame = null
  }
}

const seekToConfiguredStart = (audio: HTMLAudioElement) => {
  audio.currentTime = CINEMATIC_AUDIO.sourceStartInSeconds
}

const seekToCinematicTime = (audio: HTMLAudioElement, elapsedSeconds: number) => {
  audio.currentTime = CINEMATIC_AUDIO.sourceStartInSeconds + Math.max(0, elapsedSeconds)
}

const getSoundtrackVolume = (elapsedSeconds: number): number => {
  const duration = CINEMATIC_CONFIG.durationInFrames / CINEMATIC_CONFIG.fps
  const frame = Math.min(
    CINEMATIC_CONFIG.durationInFrames - 1,
    Math.max(0, Math.round(elapsedSeconds * CINEMATIC_CONFIG.fps))
  )
  const fadeIn = clamp01(elapsedSeconds / CINEMATIC_AUDIO.fadeInSeconds)
  const configuredFadeOut = clamp01((duration - elapsedSeconds) / CINEMATIC_AUDIO.fadeOutSeconds)
  const cinematicFadeOut = 1 - getTimelineState(frame).fadeToDark
  return CINEMATIC_AUDIO.volume * Math.min(fadeIn, configuredFadeOut, cinematicFadeOut)
}

const updateSoundtrackVolume = () => {
  if (soundtrack == null || soundtrack.paused) {
    volumeAnimationFrame = null
    return
  }

  const elapsed = soundtrack.currentTime - CINEMATIC_AUDIO.sourceStartInSeconds
  const duration = CINEMATIC_CONFIG.durationInFrames / CINEMATIC_CONFIG.fps
  soundtrack.volume = getSoundtrackVolume(elapsed)

  if (elapsed >= duration) {
    soundtrack.pause()
    volumeAnimationFrame = null
    return
  }

  volumeAnimationFrame = window.requestAnimationFrame(updateSoundtrackVolume)
}

export const prepareCreditsSoundtrack = (): HTMLAudioElement | null => {
  if (typeof document === 'undefined') {
    return null
  }

  const source = new URL(CINEMATIC_AUDIO.source, document.baseURI).toString()
  if (soundtrack?.src === source) {
    return soundtrack
  }

  soundtrack = new Audio(source)
  soundtrack.preload = 'auto'
  soundtrack.volume = 0
  soundtrack.load()
  return soundtrack
}

export const startCreditsSoundtrackFromGesture = (elapsedSeconds = 0): Promise<void> => {
  const audio = prepareCreditsSoundtrack()
  if (audio == null) {
    return Promise.reject(new Error('Credits soundtrack is unavailable.'))
  }

  cancelVolumeAnimation()
  audio.pause()
  audio.volume = 0

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    seekToCinematicTime(audio, elapsedSeconds)
  } else {
    audio.addEventListener(
      'loadedmetadata',
      () => {
        seekToCinematicTime(audio, elapsedSeconds)
      },
      { once: true }
    )
  }

  const playback = audio.play()
  void playback
    .then(() => {
      volumeAnimationFrame = window.requestAnimationFrame(updateSoundtrackVolume)
    })
    .catch(() => {
      // The caller handles playback failures; this branch prevents a duplicate unhandled rejection.
    })
  return playback
}

export const isCreditsSoundtrackPlaying = (): boolean =>
  soundtrack != null && !soundtrack.paused && !soundtrack.ended

export const getCreditsSoundtrackFrame = (): number => {
  if (soundtrack == null) {
    return 0
  }

  const elapsed = Math.max(0, soundtrack.currentTime - CINEMATIC_AUDIO.sourceStartInSeconds)
  return Math.min(CINEMATIC_CONFIG.durationInFrames - 1, Math.round(elapsed * CINEMATIC_CONFIG.fps))
}

export const getCreditsSoundtrackTime = (): number => {
  if (soundtrack == null) return 0
  return Math.max(0, soundtrack.currentTime - CINEMATIC_AUDIO.sourceStartInSeconds)
}

export const syncCreditsSoundtrackToTime = (elapsedSeconds: number, shouldPlay: boolean) => {
  if (soundtrack == null) return

  const desiredTime = CINEMATIC_AUDIO.sourceStartInSeconds + Math.max(0, elapsedSeconds)
  if (soundtrack.readyState >= HTMLMediaElement.HAVE_METADATA) {
    // Re-seeking an HTMLAudioElement several times per second causes audible
    // gaps on mobile WebKit. Normal playback remains in sync; only correct a
    // genuine discontinuity such as a pause/resume or an explicit seek.
    if (Math.abs(soundtrack.currentTime - desiredTime) > 1) {
      soundtrack.currentTime = desiredTime
    }
    soundtrack.volume = getSoundtrackVolume(elapsedSeconds)
  }

  if (shouldPlay && soundtrack.paused) {
    void soundtrack.play().catch(() => undefined)
  } else if (!shouldPlay && !soundtrack.paused) {
    soundtrack.pause()
  }
}

export const fadeOutCreditsSoundtrack = (durationMs: number) => {
  if (soundtrack == null || soundtrack.paused) return

  cancelVolumeAnimation()
  const audio = soundtrack
  const initialVolume = audio.volume
  const startedAt = performance.now()
  const fade = (now: number) => {
    const progress = clamp01((now - startedAt) / Math.max(1, durationMs))
    audio.volume = initialVolume * (1 - progress)
    if (progress >= 1) {
      audio.pause()
      volumeAnimationFrame = null
      return
    }
    volumeAnimationFrame = window.requestAnimationFrame(fade)
  }
  volumeAnimationFrame = window.requestAnimationFrame(fade)
}

export const stopCreditsSoundtrack = () => {
  cancelVolumeAnimation()
  if (soundtrack == null) {
    return
  }

  soundtrack.pause()
  soundtrack.volume = 0
  if (soundtrack.readyState >= HTMLMediaElement.HAVE_METADATA) {
    seekToConfiguredStart(soundtrack)
  }
}
