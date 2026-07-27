import { Player, type PlayerRef } from '@remotion/player'
import { type SyntheticEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  getCreditsSoundtrackFrame,
  isCreditsSoundtrackPlaying,
  startCreditsSoundtrackFromGesture,
  stopCreditsSoundtrack,
} from '../../cinematic/audio/creditsSoundtrack'
import { CinematicComposition } from '../../cinematic/components/CinematicComposition'
import {
  CINEMATIC_CONFIG,
  CINEMATIC_CREDITS,
  type CreditCard,
} from '../../cinematic/config/cinematicConfig'
import {
  loadCreditsContent,
  type CreditsContentLoadResult,
} from '../../cinematic/credits/creditsContent'
import CreditsFallback, { CreditsRenderBoundary } from './CreditsFallback'
import './Credits.css'

const EXIT_FADE_MS = 420

export default function Credits() {
  const navigate = useNavigate()
  const exitTimeoutRef = useRef<number | null>(null)
  const playerRef = useRef<PlayerRef | null>(null)
  const blackoutRef = useRef<HTMLDivElement | null>(null)
  const [initialFrame] = useState(getCreditsSoundtrackFrame)
  const [isExiting, setIsExiting] = useState(false)
  const [needsStart, setNeedsStart] = useState(() => !isCreditsSoundtrackPlaying())
  const [renderFailed, setRenderFailed] = useState(false)
  const [creditCards, setCreditCards] = useState<readonly CreditCard[]>(CINEMATIC_CREDITS)
  const [contentState, setContentState] = useState<CreditsContentLoadResult>(() => ({
    cards: CINEMATIC_CREDITS,
    source: 'fallback',
    url: 'bundled',
  }))

  const onExit = useCallback(
    (instantBlackout = false) => {
      if (isExiting) return

      const blackout = blackoutRef.current
      if (instantBlackout) blackout?.classList.add('is-instant')
      blackout?.classList.add('is-visible')
      setIsExiting(true)
      playerRef.current?.pause()
      stopCreditsSoundtrack()
      exitTimeoutRef.current = window.setTimeout(() => {
        navigate('/')
      }, EXIT_FADE_MS)
    },
    [isExiting, navigate]
  )

  const handleStart = useCallback(
    (event: SyntheticEvent) => {
      if (!needsStart || renderFailed) return

      setNeedsStart(false)
      playerRef.current?.seekTo(0)
      playerRef.current?.play(event)

      void startCreditsSoundtrackFromGesture().catch((error) => {
        console.warn('[Credits] Soundtrack playback was blocked.', error)
        playerRef.current?.pause()
        playerRef.current?.seekTo(0)
        setNeedsStart(true)
      })
    },
    [needsStart, renderFailed]
  )

  const handleRenderFailure = useCallback((error: Error) => {
    console.warn('[Credits] Cinematic renderer failed. Showing placeholder fallback.', error)
    playerRef.current?.pause()
    stopCreditsSoundtrack()
    setNeedsStart(false)
    setRenderFailed(true)
  }, [])

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
    const player = playerRef.current
    if (player == null || renderFailed) return

    const onPlayerEnded = () => onExit(true)
    player.addEventListener('ended', onPlayerEnded)

    if (!needsStart && !player.isPlaying()) {
      player.play()
    }

    return () => {
      player.removeEventListener('ended', onPlayerEnded)
    }
  }, [needsStart, onExit, renderFailed])

  useEffect(
    () => () => {
      if (exitTimeoutRef.current != null) {
        window.clearTimeout(exitTimeoutRef.current)
      }
      playerRef.current?.pause()
      stopCreditsSoundtrack()
    },
    []
  )

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onExit()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onExit])

  return (
    <div className={`credits-container${isExiting ? ' is-exiting' : ''}`}>
      <div className="credits-stage" aria-label="Credits cinematic">
        <div
          className="credits-webgl"
          aria-label="WebGL credits cinematic"
          data-content-source={contentState.source}
        >
          {renderFailed ? (
            <CreditsFallback />
          ) : (
            <CreditsRenderBoundary onFailure={handleRenderFailure}>
              <Player
                ref={playerRef}
                component={CinematicComposition}
                inputProps={{ audioMode: 'external', credits: creditCards }}
                durationInFrames={CINEMATIC_CONFIG.durationInFrames}
                compositionWidth={CINEMATIC_CONFIG.width}
                compositionHeight={CINEMATIC_CONFIG.height}
                fps={CINEMATIC_CONFIG.fps}
                initialFrame={initialFrame}
                controls={false}
                loop={false}
                autoPlay={!needsStart}
                clickToPlay={false}
                doubleClickToFullscreen={false}
                spaceKeyToPlayOrPause={false}
                moveToBeginningWhenEnded={false}
                acknowledgeRemotionLicense
                style={{ width: '100%', height: '100%' }}
              />
            </CreditsRenderBoundary>
          )}
        </div>

        {needsStart && !renderFailed && (
          <button
            className="credits-start-prompt"
            type="button"
            onClick={handleStart}
            aria-label="Tap to start credits"
          >
            <strong>Tap to begin</strong>
            <span>Sound on</span>
          </button>
        )}
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
        ref={blackoutRef}
        className="credits-end-guard"
        data-testid="credits-end-guard"
        aria-hidden="true"
      />
    </div>
  )
}
