import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  fadeOutCreditsSoundtrack,
  getCreditsSoundtrackTime,
  isCreditsSoundtrackPlaying,
  startCreditsSoundtrackFromGesture,
  stopCreditsSoundtrack,
  syncCreditsSoundtrackToTime,
} from '../../cinematic/audio/creditsSoundtrack'
import '../../cinematic/components/cinematic.css'
import {
  CINEMATIC_CONFIG,
  CINEMATIC_CREDITS,
  type CreditCard,
} from '../../cinematic/config/cinematicConfig'
import {
  loadCreditsContent,
  type CreditsContentLoadResult,
} from '../../cinematic/credits/creditsContent'
import { CreditsOverlay } from '../../cinematic/credits/CreditsOverlay'
import { getTimelineState } from '../../cinematic/timeline/timeline'
import { CREDITS_POSTER_SOURCES, CREDITS_VIDEO_SOURCES } from './creditsAssetPaths'
import CreditsFallback from './CreditsFallback'
import './Credits.css'

const EXIT_FADE_MS = 420
const DURATION_SECONDS = CINEMATIC_CONFIG.durationInFrames / CINEMATIC_CONFIG.fps

type CreditsProps = {
  /** Starts playback as soon as the credits mount after the finale. */
  autoPlay?: boolean
  /** Called after an embedded credits run finishes or is skipped. */
  onComplete?: () => void
}

export default function Credits({ onComplete }: CreditsProps) {
  const navigate = useNavigate()
  const exitTimeoutRef = useRef<number | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const fallbackStartedAtRef = useRef<number | null>(null)
  const [isExiting, setIsExiting] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [renderFailed, setRenderFailed] = useState(false)
  const [currentFrame, setCurrentFrame] = useState(() =>
    Math.min(
      CINEMATIC_CONFIG.durationInFrames - 1,
      Math.round(getCreditsSoundtrackTime() * CINEMATIC_CONFIG.fps)
    )
  )
  const [creditCards, setCreditCards] = useState<readonly CreditCard[]>(CINEMATIC_CREDITS)
  const [contentState, setContentState] = useState<CreditsContentLoadResult>(() => ({
    cards: CINEMATIC_CREDITS,
    source: 'fallback',
    url: 'bundled',
  }))

  const onExit = useCallback(
    (instantBlackout = false) => {
      if (isExiting) return

      setIsExiting(true)
      setIsPlaying(false)
      if (instantBlackout) {
        videoRef.current?.pause()
        stopCreditsSoundtrack()
      } else {
        fadeOutCreditsSoundtrack(EXIT_FADE_MS)
      }
      exitTimeoutRef.current = window.setTimeout(() => {
        if (onComplete) {
          onComplete()
          return
        }
        navigate('/')
      }, EXIT_FADE_MS)
    },
    [isExiting, navigate, onComplete]
  )

  const startVisualPlayback = useCallback(() => {
    const video = videoRef.current
    if (video == null || renderFailed) return

    const soundtrackTime = getCreditsSoundtrackTime()
    if (soundtrackTime > 0.05 && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      video.currentTime = Math.min(soundtrackTime, DURATION_SECONDS - 0.05)
    }

    void video.play().catch((error) => {
      console.warn('[Credits] Background video playback was blocked.', error)
    })
  }, [renderFailed])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    void loadCreditsContent({ signal: controller.signal }).then((result) => {
      if (!active) return
      setCreditCards(result.cards)
      setContentState(result)
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [])

  useEffect(() => {
    startVisualPlayback()
  }, [startVisualPlayback])

  useEffect(() => {
    if (!isPlaying || renderFailed) return

    let animationFrame = 0
    const updateFromVideo = () => {
      const video = videoRef.current
      if (video == null || video.paused || video.ended) return

      const elapsed = Math.min(DURATION_SECONDS, Math.max(0, video.currentTime))
      setCurrentFrame(
        Math.min(CINEMATIC_CONFIG.durationInFrames - 1, Math.round(elapsed * CINEMATIC_CONFIG.fps))
      )
      syncCreditsSoundtrackToTime(elapsed, true)
      animationFrame = window.requestAnimationFrame(updateFromVideo)
    }

    animationFrame = window.requestAnimationFrame(updateFromVideo)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [isPlaying, renderFailed])

  useEffect(() => {
    if (!renderFailed || isExiting) return

    const initialElapsed = Math.min(DURATION_SECONDS, getCreditsSoundtrackTime())
    fallbackStartedAtRef.current = performance.now() - initialElapsed * 1000
    let animationFrame = 0
    const updateFallback = (now: number) => {
      const origin = fallbackStartedAtRef.current ?? now
      const elapsed = Math.min(DURATION_SECONDS, Math.max(0, (now - origin) / 1000))
      setCurrentFrame(
        Math.min(CINEMATIC_CONFIG.durationInFrames - 1, Math.round(elapsed * CINEMATIC_CONFIG.fps))
      )
      syncCreditsSoundtrackToTime(elapsed, true)
      if (elapsed >= DURATION_SECONDS) {
        onExit(true)
        return
      }
      animationFrame = window.requestAnimationFrame(updateFallback)
    }

    animationFrame = window.requestAnimationFrame(updateFallback)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [isExiting, onExit, renderFailed])

  useEffect(
    () => () => {
      if (exitTimeoutRef.current != null) window.clearTimeout(exitTimeoutRef.current)
      videoRef.current?.pause()
      stopCreditsSoundtrack()
    },
    []
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onExit()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onExit])

  const handlePlay = useCallback(() => {
    setIsPlaying(true)
    const elapsed = videoRef.current?.currentTime ?? 0
    if (isCreditsSoundtrackPlaying()) {
      syncCreditsSoundtrackToTime(elapsed, true)
      return
    }
    void startCreditsSoundtrackFromGesture(elapsed).catch((error) => {
      // A direct URL may not carry a user gesture. The silent video still starts immediately.
      console.warn('[Credits] Soundtrack playback was blocked.', error)
    })
  }, [])

  const handleRenderFailure = useCallback(() => {
    console.warn('[Credits] Pre-rendered background unavailable. Using city-lights fallback.')
    videoRef.current?.pause()
    setIsPlaying(false)
    setRenderFailed(true)
  }, [])

  const timelineState = getTimelineState(currentFrame)

  return (
    <div className={`credits-container${isExiting ? ' is-exiting' : ''}`}>
      <div className="credits-stage" aria-label="Credits cinematic">
        <div
          className="credits-media"
          data-content-source={contentState.source}
          data-cinematic-renderer="prerendered-video"
        >
          <CreditsFallback posterUrl={CREDITS_POSTER_SOURCES[0]} />
          {!renderFailed && (
            <video
              ref={videoRef}
              className={`credits-video${videoReady ? ' is-ready' : ''}`}
              aria-label="Credits background video"
              src={CREDITS_VIDEO_SOURCES[0]}
              poster={CREDITS_POSTER_SOURCES[0]}
              autoPlay
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              onCanPlay={() => setVideoReady(true)}
              onLoadedMetadata={startVisualPlayback}
              onPlay={handlePlay}
              onPlaying={() => setIsPlaying(true)}
              onPause={() => {
                setIsPlaying(false)
                syncCreditsSoundtrackToTime(videoRef.current?.currentTime ?? 0, false)
              }}
              onWaiting={() =>
                syncCreditsSoundtrackToTime(videoRef.current?.currentTime ?? 0, false)
              }
              onEnded={() => onExit(true)}
              onError={handleRenderFailure}
            />
          )}
          <div className="credits-overlay-track">
            <CreditsOverlay frame={currentFrame} state={timelineState} credits={creditCards} />
          </div>
        </div>
      </div>

      <button
        type="button"
        className="credits-exit"
        onClick={() => onExit()}
        aria-label="Skip credits"
      >
        <span>Skip</span>
        <span aria-hidden="true">×</span>
      </button>

      <div
        className={`credits-end-guard${isExiting ? ' is-visible' : ''}`}
        data-testid="credits-end-guard"
        aria-hidden="true"
      />
    </div>
  )
}
