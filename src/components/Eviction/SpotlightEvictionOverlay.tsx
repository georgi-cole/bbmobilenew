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

// ── Timing constants (ms, relative to component mount) ────────────────────
//
// Beat:   0 ms         hero clone is pinned to the roster tile
//        750 ms        LIVE bug fades in
//        900 ms        tile detaches and zooms (transform-only, 600 ms)
//       1500 ms        native fullscreen portrait crossfades in
//       1800 ms        desaturate + vignette settle
//       2100 ms        lower-third + ELIMINATED stamp land
//       3000 ms        suspense hold
//       4650 ms        grade/stamp clear before the return move
//       4740 ms        transform hero replaces fullscreen portrait
//       4800 ms        hero returns to the roster tile
//       5400 ms        return completes, then onDone commits the eviction
//
const LIVE_BUG_AT = 750
const EXPAND_START = 900
const CAMERA_SETTLED_AT = 1500
const HERO_HIDE_AT = 1640
const DESAT_AT = 1800
const LOWER_THIRD_AT = 2100
const HOLD_START = 3000
const PRE_RETURN_AT = 4650
const HERO_RETURN_PREP_AT = 4710
const FULLSCREEN_HIDE_AT = 4740
const RETURN_TO_TILE_AT = 4800
const DONE_AT = 5400

// Battle Back return sequence: start fullscreen in the evicted treatment, restore
// colour, crossfade to the transform hero, then shrink into the active roster tile.
const RETURN_CLEAR_AT = 650
const RETURN_HERO_PREP_AT = 1200
const RETURN_FULLSCREEN_HIDE_AT = 1260
const RETURN_SPOTLIGHT_AT = 1300
const RETURN_DONE_AT = 1900

const REDUCED_DONE_AT = 600
const ELIMINATED_STAMP_SRC = `${import.meta.env.BASE_URL}assets/eliminated_stamp.svg`
const EVICTION_MARK_SRC = `${(import.meta.env.BASE_URL ?? '').replace(/\/$/, '')}/evictionmark/evictionmark.png`
const CINEMATIC_FILTER = 'saturate(0.15) contrast(1.1) brightness(0.82)'

type Phase = 'spotlight' | 'expanding' | 'holding' | 'returning' | 'done'
type OverlayVariant = 'eviction' | 'return'
type PortraitRect = { top: number; left: number; width: number; height: number }
type PortraitGeometry = {
  source: PortraitRect | null
  viewport: { width: number; height: number }
  ready: boolean
}
type HeroStyle = CSSProperties & {
  '--seo-hero-x'?: string
  '--seo-hero-y'?: string
  '--seo-hero-scale'?: string
}

function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

function getLowerThirdLabel(isReturn: boolean, labelText: string, contextLabel?: string): string {
  return isReturn || !contextLabel ? labelText : contextLabel
}

function findRosterPortraitRect(playerId: string): PortraitRect | null {
  if (typeof document === 'undefined') return null
  const host = Array.from(document.querySelectorAll<HTMLElement>('[data-player-id]')).find(
    (element) => element.dataset.playerId === playerId
  )
  const portrait = host?.querySelector<HTMLElement>('[data-ceremony-tile="true"]')
  const rect = portrait?.getBoundingClientRect()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
}

interface Props {
  /** Player being evicted. */
  evictee: Player
  /** Optional contextual kicker shown above the evictee name in the lower-third. */
  contextLabel?: string
  /** Stable identity retained for callers/debugging; geometry is measured directly. */
  layoutId?: string
  /** Called only after the portrait has visibly returned to the roster tile. */
  onDone: () => void
  /** When true, renders the Skip button regardless of DEV mode (e.g. CI). */
  devSkip?: boolean
  /** When set to "return", the animation runs in reverse for Battle Back returns. */
  variant?: OverlayVariant
}

/**
 * SpotlightEvictionOverlay — cinematic eviction choreography.
 *
 * Geometry motion and fullscreen image treatment are deliberately split:
 * - a source-sized hero clone handles detach/return using only transform + opacity;
 * - a native fullscreen portrait handles desaturation, vignette and stamp quality.
 *
 * This removes Framer shared-layout projection from the camera move and avoids
 * animating top/left/width/height while preserving the high-quality hold frame.
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
  const [showHeroPortrait, setShowHeroPortrait] = useState(!isReturn)
  const [showFullscreenPortrait, setShowFullscreenPortrait] = useState(isReturn)
  const [geometry, setGeometry] = useState<PortraitGeometry>(() => ({
    source: null,
    viewport: {
      width: typeof window === 'undefined' ? 1 : Math.max(1, window.innerWidth),
      height: typeof window === 'undefined' ? 1 : Math.max(1, window.innerHeight),
    },
    ready: false,
  }))
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

  // Read the source tile once before first paint. Opacity does not affect DOM
  // geometry, so this remains valid while AvatarTile hides its duplicate image.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      setGeometry((current) => ({ ...current, ready: true }))
      return
    }
    setGeometry({
      source: findRosterPortraitRect(String(evictee.id)),
      viewport: {
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight),
      },
      ready: true,
    })
  }, [evictee.id])

  // Warm the portrait image before the camera push. Decode failure is harmless;
  // the normal candidate/fallback path remains authoritative.
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
        transition: 'transform-hero',
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
      setShowFullscreenPortrait(true)
      setShowHeroPortrait(false)
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
          setShowHeroPortrait(true)
          dbg('return hero prepared at fullscreen zoom')
        }, RETURN_HERO_PREP_AT)
      )
      timers.push(
        setTimeout(() => {
          setShowFullscreenPortrait(false)
          dbg('fullscreen portrait handed to hero')
        }, RETURN_FULLSCREEN_HIDE_AT)
      )
      timers.push(
        setTimeout(() => {
          setPhase('returning')
          dbg('return hero to roster')
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
        dbg('transform hero detach + zoom')
      }, EXPAND_START)
    )
    timers.push(
      setTimeout(() => {
        setShowFullscreenPortrait(true)
        dbg('native fullscreen portrait crossfade in')
      }, CAMERA_SETTLED_AT)
    )
    timers.push(
      setTimeout(() => {
        setShowHeroPortrait(false)
        dbg('detach hero parked')
      }, HERO_HIDE_AT)
    )
    timers.push(
      setTimeout(() => {
        setDesaturated(true)
        dbg('desaturate + vignette')
      }, DESAT_AT)
    )
    timers.push(
      setTimeout(() => {
        setShowLowerThird(true)
        dbg('lower-third + stamp')
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
        setShowLowerThird(false)
        setShowLiveBug(false)
        setDesaturated(false)
        dbg('prepare return')
      }, PRE_RETURN_AT)
    )
    timers.push(
      setTimeout(() => {
        setShowHeroPortrait(true)
        dbg('return hero restored at fullscreen zoom')
      }, HERO_RETURN_PREP_AT)
    )
    timers.push(
      setTimeout(() => {
        setShowFullscreenPortrait(false)
        dbg('fullscreen portrait handed back to hero')
      }, FULLSCREEN_HIDE_AT)
    )
    timers.push(
      setTimeout(() => {
        setPhase('returning')
        dbg('transform hero return to roster')
      }, RETURN_TO_TILE_AT)
    )
    timers.push(
      setTimeout(() => {
        setPhase('done')
        fire()
        dbg('done after visible return')
      }, DONE_AT)
    )

    return () => timers.forEach(clearTimeout)
    // Presentation preferences are intentionally captured once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleImgError() {
    if (candidateIdx < candidates.length - 1) {
      setCandidateIdx((index) => index + 1)
    } else {
      setShowFallback(true)
    }
  }

  const fallbackText = isEmoji(evictee.avatar ?? '')
    ? evictee.avatar
    : evictee.name.charAt(0).toUpperCase()

  const isDev = import.meta.env.DEV || devSkip
  const noMotion = prefersReducedMotion ? { duration: 0 } : undefined
  const cinematicFilter = optimizedForAppleTouch
    ? 'saturate(0.65) contrast(1.03) brightness(0.9)'
    : CINEMATIC_FILTER

  const labelText = 'ELIMINATED'
  const lowerThirdLabel = getLowerThirdLabel(false, labelText, contextLabel)
  const source = geometry.source
  const heroExpanded = phase === 'expanding' || phase === 'holding'
  const heroStyle: HeroStyle | undefined = source
    ? {
        top: source.top,
        left: source.left,
        width: source.width,
        height: source.height,
        visibility: geometry.ready ? 'visible' : 'hidden',
        '--seo-hero-x': `${geometry.viewport.width / 2 - (source.left + source.width / 2)}px`,
        '--seo-hero-y': `${geometry.viewport.height / 2 - (source.top + source.height / 2)}px`,
        '--seo-hero-scale': String(
          Math.max(geometry.viewport.width / source.width, geometry.viewport.height / source.height)
        ),
      }
    : undefined

  const rootClassName = [
    'seo',
    `seo--${phase}`,
    isReturn ? 'seo--return' : '',
    optimizedForAppleTouch ? ' seo--ios' : '',
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

      {source && (
        <div
          className={[
            'seo__hero',
            heroExpanded ? 'seo__hero--expanded' : '',
            showHeroPortrait ? '' : 'seo__hero--hidden',
          ]
            .filter(Boolean)
            .join(' ')}
          style={heroStyle}
          data-layout-id={layoutId}
          data-phase={phase}
          aria-hidden="true"
        >
          {showFallback ? (
            <span className="seo__fallback">{fallbackText}</span>
          ) : (
            <img className="seo__hero-photo" src={avatarSrc} alt="" />
          )}
        </div>
      )}

      <div
        className={`seo__portrait${showFullscreenPortrait ? '' : ' seo__portrait--hidden'}`}
        aria-hidden={!showFullscreenPortrait}
      >
        {showFallback ? (
          <motion.span
            className="seo__fallback"
            aria-hidden="true"
            animate={
              desaturated
                ? { scale: isReturn ? 1 : 1.04, filter: cinematicFilter }
                : { scale: 1, filter: 'none' }
            }
            transition={noMotion ?? { duration: 0.5, ease: 'easeOut' }}
          >
            {fallbackText}
          </motion.span>
        ) : (
          <motion.img
            className="seo__photo"
            src={avatarSrc}
            alt={evictee.name}
            onError={handleImgError}
            animate={
              desaturated
                ? isReturn
                  ? { scale: 1, filter: cinematicFilter, y: 0 }
                  : { scale: 1.04, filter: cinematicFilter, y: 0 }
                : { scale: 1, filter: 'none', y: 0 }
            }
            transition={noMotion ?? { duration: 0.5, ease: 'easeOut' }}
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
