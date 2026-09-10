import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  type CSSProperties,
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Player } from '../../types'
import { resolveAvatarCandidates, isEmoji } from '../../utils/avatar'
import { resolvePresentationAvatarCandidates } from '../../utils/presentationAvatar'
import { useAppDispatch } from '../../store/hooks'
import { setEvictionOverlay, clearEvictionOverlay } from '../../store/gameSlice'
import './SpotlightEvictionOverlay.css'

const LIVE_BUG_AT = 750
const EXPAND_START = 900
const DESAT_AT = 1800
const LOWER_THIRD_AT = 2100
const HOLD_START = 3000
const DONE_AT = 5400

const RETURN_CLEAR_AT = 650
const RETURN_SPOTLIGHT_AT = 1300
const RETURN_DONE_AT = 1900

const REDUCED_DONE_AT = 600
const ELIMINATED_STAMP_SRC = `${import.meta.env.BASE_URL}assets/eliminated_stamp.svg`
const EVICTION_MARK_SRC = `${(import.meta.env.BASE_URL ?? '').replace(/\/$/, '')}/evictionmark/evictionmark.png`

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

type Phase = 'spotlight' | 'expanding' | 'holding' | 'done'
type OverlayVariant = 'eviction' | 'return'
type ManualFlipStyle = CSSProperties & {
  '--seo-flip-x': string
  '--seo-flip-y': string
  '--seo-flip-scale': string
}

function getLowerThirdLabel(isReturn: boolean, labelText: string, contextLabel?: string): string {
  return isReturn || !contextLabel ? labelText : contextLabel
}

interface Props {
  evictee: Player
  contextLabel?: string
  /** Retained as the stable match-cut identity for callers/debugging. */
  layoutId?: string
  onDone: () => void
  devSkip?: boolean
  variant?: OverlayVariant
}

/**
 * Cinematic eviction choreography.
 *
 * The roster-to-fullscreen portrait now uses a manually captured FLIP transform:
 * one layout read before first paint, followed by a CSS transform transition.
 * This avoids Framer Motion shared-layout projection during the heaviest frame window.
 */
export default function SpotlightEvictionOverlay({
  evictee,
  contextLabel,
  layoutId,
  onDone,
  devSkip,
  variant = 'eviction',
}: Props) {
  const dispatch = useAppDispatch()
  const [candidates] = useState(() =>
    resolveAvatarCandidates(evictee).flatMap(resolvePresentationAvatarCandidates)
  )
  const [candidateIdx, setCandidateIdx] = useState(0)
  const [showFallback, setShowFallback] = useState(false)

  const isReturn = variant === 'return'
  const optimizedForAppleTouch = isAppleTouchDevice()
  const [phase, setPhase] = useState<Phase>(isReturn ? 'holding' : 'spotlight')
  const [showLiveBug, setShowLiveBug] = useState(false)
  const [showLowerThird, setShowLowerThird] = useState(false)
  const [showReturnStrike, setShowReturnStrike] = useState(isReturn)
  const [desaturated, setDesaturated] = useState(isReturn)
  const [portraitStyle, setPortraitStyle] = useState<ManualFlipStyle | null>(null)
  const [stampAssetState, setStampAssetState] = useState<'loading' | 'ready' | 'error'>(
    isReturn ? 'error' : 'loading'
  )

  const firedRef = useRef(false)
  const avatarSrc = candidates[candidateIdx] ?? ''

  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  const fire = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    onDone()
  }, [onDone])

  // Capture the evictee tile once before first paint. The portrait keeps the
  // source tile's geometry and expands with a transform only, so there are no
  // repeated layout measurements during the camera push.
  useLayoutEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const playerTiles = document.querySelectorAll<HTMLElement>('[data-player-id]')
    const playerTile = Array.from(playerTiles).find(
      (element) => element.dataset.playerId === String(evictee.id)
    )
    const sourceTile = playerTile?.querySelector<HTMLElement>('[data-ceremony-tile="true"]')
    const rect = sourceTile?.getBoundingClientRect()
    const viewportWidth = Math.max(1, window.innerWidth)
    const viewportHeight = Math.max(1, window.innerHeight)

    if (!rect || rect.width <= 0 || rect.height <= 0) {
      setPortraitStyle({
        left: 0,
        top: 0,
        right: 'auto',
        bottom: 'auto',
        width: '100vw',
        height: '100vh',
        '--seo-flip-x': '0px',
        '--seo-flip-y': '0px',
        '--seo-flip-scale': '1',
      })
      return
    }

    const scale = Math.max(viewportWidth / rect.width, viewportHeight / rect.height)
    const sourceCenterX = rect.left + rect.width / 2
    const sourceCenterY = rect.top + rect.height / 2

    setPortraitStyle({
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      '--seo-flip-x': `${viewportWidth / 2 - sourceCenterX}px`,
      '--seo-flip-y': `${viewportHeight / 2 - sourceCenterY}px`,
      '--seo-flip-scale': String(scale),
    })
  }, [evictee.id])

  // Start image decode/upload as soon as the overlay mounts, before expansion.
  // A decode miss should never block the choreography or switch avatar candidates.
  useEffect(() => {
    if (!avatarSrc || typeof window === 'undefined') return
    const image = new window.Image()
    image.src = avatarSrc
    if (typeof image.decode === 'function') {
      void image.decode().catch(() => undefined)
    }
  }, [avatarSrc])

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[SpotlightEvictionOverlay] mount', {
        evicteeId: evictee.id,
        layoutId,
        variant,
        transition: 'manual-flip',
      })
    }
    dispatch(setEvictionOverlay(evictee.id))
    return () => {
      if (import.meta.env.DEV) {
        console.debug('[SpotlightEvictionOverlay] unmount', { evicteeId: evictee.id })
      }
      dispatch(clearEvictionOverlay(evictee.id))
    }
    // Stable for the lifetime of this overlay instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isReturn || typeof window === 'undefined') {
      setStampAssetState('error')
      return undefined
    }

    let active = true
    const stampImage = new window.Image()
    stampImage.onload = () => {
      if (active) setStampAssetState('ready')
    }
    stampImage.onerror = () => {
      if (active) setStampAssetState('error')
    }
    stampImage.src = ELIMINATED_STAMP_SRC

    return () => {
      active = false
    }
  }, [isReturn])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    const t0 = Date.now()
    const dbg = import.meta.env.DEV
      ? (label: string) => console.debug(`[SEO] +${Date.now() - t0}ms  ${label}`)
      : () => {}

    if (prefersReducedMotion) {
      setPhase('holding')
      if (isReturn) {
        setShowReturnStrike(false)
        setDesaturated(false)
      } else {
        setShowLowerThird(true)
        setShowLiveBug(true)
        setDesaturated(true)
      }
      timers.push(
        setTimeout(() => {
          setPhase('done')
          fire()
          dbg('done (reduced-motion)')
        }, REDUCED_DONE_AT)
      )
      return () => timers.forEach(clearTimeout)
    }

    if (isReturn) {
      dbg('mount – reverse eviction holding')
      timers.push(
        setTimeout(() => {
          setShowReturnStrike(false)
          setDesaturated(false)
          dbg('return strike removed + portrait restored')
        }, RETURN_CLEAR_AT)
      )
      timers.push(
        setTimeout(() => {
          setPhase('spotlight')
          dbg('return FLIP to roster')
        }, RETURN_SPOTLIGHT_AT)
      )
      timers.push(
        setTimeout(() => {
          setPhase('done')
          fire()
          dbg('done (return)')
        }, RETURN_DONE_AT)
      )
      return () => timers.forEach(clearTimeout)
    }

    dbg('mount – spotlight phase')
    timers.push(
      setTimeout(() => {
        setShowLiveBug(true)
        dbg('LIVE bug')
      }, LIVE_BUG_AT)
    )
    timers.push(
      setTimeout(() => {
        setPhase('expanding')
        dbg('manual FLIP expanding')
      }, EXPAND_START)
    )
    timers.push(
      setTimeout(() => {
        setDesaturated(true)
        dbg('cinematic grade + vignette')
      }, DESAT_AT)
    )
    timers.push(
      setTimeout(() => {
        setShowLowerThird(true)
        dbg('lower-third')
      }, LOWER_THIRD_AT)
    )
    timers.push(
      setTimeout(() => {
        setPhase('holding')
        dbg('holding')
      }, HOLD_START)
    )
    timers.push(
      setTimeout(() => {
        setPhase('done')
        fire()
        dbg('done')
      }, DONE_AT)
    )

    return () => timers.forEach(clearTimeout)
    // fire is stable; these presentation preferences are intentionally read once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleImgError() {
    if (candidateIdx < candidates.length - 1) {
      setCandidateIdx((i) => i + 1)
    } else {
      setShowFallback(true)
    }
  }

  const fallbackText = isEmoji(evictee.avatar ?? '')
    ? evictee.avatar
    : evictee.name.charAt(0).toUpperCase()

  const isDev = import.meta.env.DEV || devSkip
  const noMotion = prefersReducedMotion ? { duration: 0 } : undefined
  const labelText = 'ELIMINATED'
  const lowerThirdLabel = getLowerThirdLabel(false, labelText, contextLabel)
  const portraitExpanded = phase === 'expanding' || phase === 'holding' || phase === 'done'
  const rootClassName = [
    'seo',
    `seo--${phase}`,
    isReturn ? 'seo--return' : '',
    optimizedForAppleTouch ? 'seo--ios' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={rootClassName}
      role="dialog"
      aria-modal="true"
      aria-label={
        isReturn
          ? `${evictee.name} is returning to the house`
          : `${evictee.name} has been eliminated`
      }
    >
      <motion.div
        className="seo__dim"
        initial={isReturn ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={noMotion ?? { duration: 0.2 }}
      />

      <AnimatePresence>
        {phase === 'spotlight' && (
          <motion.div
            className="seo__spotlight"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={noMotion ?? { duration: 0.25 }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isReturn && showLiveBug && (
          <motion.div
            className="seo__live-bug"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={noMotion ?? { duration: 0.18, ease: 'easeOut' }}
          >
            🔴 LIVE
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={[
          'seo__portrait',
          portraitExpanded ? 'seo__portrait--expanded' : '',
          desaturated ? 'seo__portrait--desaturated' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          ...(portraitStyle ?? {}),
          borderRadius: phase === 'spotlight' ? 'var(--tile-radius, 12px)' : 0,
        }}
        data-layout-id={layoutId}
      >
        {showFallback ? (
          <span className="seo__fallback" aria-hidden="true">
            {fallbackText}
          </span>
        ) : (
          <img
            className="seo__photo"
            src={avatarSrc}
            alt={evictee.name}
            onError={handleImgError}
          />
        )}

        <AnimatePresence>
          {isReturn && showReturnStrike && (
            <motion.img
              src={EVICTION_MARK_SRC}
              alt=""
              aria-hidden="true"
              initial={false}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 1.2, rotate: -4 }}
              transition={noMotion ?? { duration: 0.4, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                inset: '4%',
                width: '92%',
                height: '92%',
                objectFit: 'contain',
                pointerEvents: 'none',
                zIndex: 5,
              }}
            />
          )}
        </AnimatePresence>

        <motion.div
          className="seo__vignette"
          initial={isReturn ? false : { opacity: 0 }}
          animate={{ opacity: desaturated ? 1 : 0 }}
          transition={noMotion ?? { duration: 0.35 }}
        />

        <div className="seo__scanlines" aria-hidden="true" />
      </div>

      <AnimatePresence>
        {!isReturn && showLowerThird && (
          <motion.div
            className="seo__lower-third"
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '110%', opacity: 0 }}
            transition={noMotion ?? { duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <p className="seo__label">{lowerThirdLabel}</p>
            <h1 className="seo__name">{evictee.name}</h1>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isReturn && showLowerThird && (
          <motion.div
            className={`seo__stamp${stampAssetState === 'ready' ? ' seo__stamp--asset' : ''}`}
            initial={{ scale: 2.4, opacity: 0, rotate: -14, x: '-50%', y: '-50%' }}
            animate={{ scale: 1, opacity: 1, rotate: -12, x: '-50%', y: '-50%' }}
            exit={{
              scale: 0,
              opacity: 0,
              x: '-50%',
              y: '-50%',
              transition: { duration: 0.12 },
            }}
            transition={noMotion ?? { type: 'spring', stiffness: 340, damping: 22, delay: 0.06 }}
            aria-hidden="true"
          >
            {stampAssetState === 'ready' ? (
              <img className="seo__stamp-image" src={ELIMINATED_STAMP_SRC} alt="" />
            ) : (
              labelText
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {isDev && (
        <button
          className="seo__skip-btn"
          onClick={fire}
          type="button"
          aria-label="Skip eviction animation (dev only)"
        >
          ⏭ Skip
        </button>
      )}
    </div>
  )
}
