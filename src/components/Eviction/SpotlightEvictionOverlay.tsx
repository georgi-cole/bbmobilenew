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
import './SpotlightEvictionOverlayParity.css'

// ── Timing constants (ms, relative to component mount) ────────────────────
//
// The Sep 9 shared-layout portrait began its geometry projection as soon as the
// overlay mounted. The later 900 ms beat changed the image treatment; it did not
// start the tile-to-screen geometry move. Keep that distinction here.
//
// Beat:   0 ms         hero is pinned exactly over the live roster portrait
//         ~1 frame      tile-to-screen geometry move begins (~480 ms)
//        750 ms         LIVE bug fades in
//        900 ms         subtle camera-push treatment begins
//       1800 ms         desaturate + vignette settle
//       2100 ms         lower-third + ELIMINATED stamp land
//       3000 ms         suspense hold
//       4650 ms         grade/stamp clear before the return move
//       4800 ms         same hero returns to the roster tile
//       5400 ms         return complete -> onDone commits the eviction
//
const LIVE_BUG_AT = 750
const EXPAND_START = 900
const DESAT_AT = 1800
const LOWER_THIRD_AT = 2100
const HOLD_START = 3000
const PRE_RETURN_AT = 4650
const RETURN_TO_TILE_AT = 4800
const DONE_AT = 5400

// Battle Back return sequence still starts from a native fullscreen portrait,
// then hands to the transform hero before shrinking into the active roster tile.
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
  sourceImageSrc: string | null
  viewport: { width: number; height: number }
  ready: boolean
}
type HeroStyle = CSSProperties & {
  '--seo-hero-x'?: string
  '--seo-hero-y'?: string
  '--seo-hero-scale'?: string
}

type RosterPortraitSnapshot = {
  source: PortraitRect | null
  imageSrc: string | null
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

function findRosterPortraitSnapshot(playerId: string): RosterPortraitSnapshot {
  if (typeof document === 'undefined') return { source: null, imageSrc: null }

  const host = Array.from(document.querySelectorAll<HTMLElement>('[data-player-id]')).find(
    (element) => element.dataset.playerId === playerId
  )
  const portrait = host?.querySelector<HTMLElement>('[data-ceremony-tile="true"]')
  const rect = portrait?.getBoundingClientRect()
  const image = portrait?.querySelector<HTMLImageElement>('img')
  const imageSrc = image?.currentSrc || image?.src || null

  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { source: null, imageSrc }
  }

  return {
    source: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    imageSrc,
  }
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
 * The Sep 9 implementation used one Framer shared-layout identity from the live
 * roster portrait to the fullscreen target. Re-running that layout projection is
 * too expensive on the devices that originally exposed the animation jank, so
 * this version keeps the deterministic transform hero but matches the old visual
 * contract more closely:
 * - capture the exact image URL currently painted inside the roster tile;
 * - begin the geometry move immediately, like the old layout projection;
 * - keep one hero image through the normal eviction hold and return;
 * - retain the separate fullscreen portrait only for Battle Back return mode.
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
  const [cameraExpanded, setCameraExpanded] = useState(isReturn)
  const [showLiveBug, setShowLiveBug] = useState(false)
  const [showLowerThird, setShowLowerThird] = useState(false)
  const [showReturnStrike, setShowReturnStrike] = useState(isReturn)
  const [desaturated, setDesaturated] = useState(isReturn)
  const [showHeroPortrait, setShowHeroPortrait] = useState(!isReturn)
  const [showFullscreenPortrait, setShowFullscreenPortrait] = useState(isReturn)
  const [geometry, setGeometry] = useState<PortraitGeometry>(() => ({
    source: null,
    sourceImageSrc: null,
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
  const heroAvatarSrc = geometry.sourceImageSrc || avatarSrc

  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  const fire = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    onDone()
  }, [onDone])

  // Capture both the live tile rectangle and the exact image resource painted in
  // it before the Redux overlay flag fades that source tile out. This prevents a
  // source-variant/crop discontinuity when the transform hero takes over.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      setGeometry((current) => ({ ...current, ready: true }))
      return
    }

    const snapshot = findRosterPortraitSnapshot(String(evictee.id))
    setGeometry({
      source: snapshot.source,
      sourceImageSrc: snapshot.imageSrc,
      viewport: {
        width: Math.max(1, window.innerWidth),
        height: Math.max(1, window.innerHeight),
      },
      ready: true,
    })
  }, [evictee.id])

  // Warm the fallback presentation candidate. The live source image, when found,
  // is already decoded because it is visibly painted in the roster.
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
        transition: 'transform-hero-sep9-cadence',
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
      setCameraExpanded(true)
      setPhase('holding')
      if (isReturn) {
        setShowFullscreenPortrait(true)
        setShowHeroPortrait(false)
        setShowReturnStrike(false)
        setDesaturated(false)
      } else {
        setShowHeroPortrait(true)
        setShowFullscreenPortrait(false)
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
          setCameraExpanded(false)
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

    // Framer's Sep 9 shared-layout target began projecting almost immediately
    // after mount. Trigger the compositor hero on the next frame rather than
    // holding it static until the 900 ms image-treatment beat.
    timers.push(
      setTimeout(() => {
        setCameraExpanded(true)
        dbg('camera geometry projection begins')
      }, 16)
    )
    timers.push(
      setTimeout(() => {
        setShowLiveBug(true)
        dbg('LIVE bug')
      }, LIVE_BUG_AT)
    )
    timers.push(
      setTimeout(() => {
        setPhase('expanding')
        dbg('Sep 9 image camera-push treatment')
      }, EXPAND_START)
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
        setCameraExpanded(false)
        setPhase('returning')
        dbg('same hero returns to roster')
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
  const heroExpanded = cameraExpanded
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
            <img className="seo__hero-photo" src={heroAvatarSrc} alt="" />
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
