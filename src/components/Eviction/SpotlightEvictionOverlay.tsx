import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Player } from '../../types'
import { resolveAvatarCandidates, isEmoji } from '../../utils/avatar'
import { resolvePresentationAvatarCandidates } from '../../utils/presentationAvatar'
import { useAppDispatch } from '../../store/hooks'
import { setEvictionOverlay, clearEvictionOverlay } from '../../store/gameSlice'
import './SpotlightEvictionOverlay.css'

// ── Timing constants (ms, relative to component mount) ────────────────────
//
// Beat:   0 ms         grid dims + spotlight locks
//        750 ms        LIVE bug fades in
//        900 ms        tile expansion begins (600 ms, smooth ease-out)
//       1800 ms        desaturate + vignette settle
//       2100 ms        lower-third slides in
//       3000 ms        expansion done → suspense hold begins
//       5400 ms        onDone fires → AnimatePresence exits (reverse, 400 ms)
//       5800 ms        match-cut shrink complete
//
const LIVE_BUG_AT = 750 // LIVE bug fades in
const EXPAND_START = 900 // shared-layout expansion begins
const DESAT_AT = 1800 // desaturation + vignette settle
const LOWER_THIRD_AT = 2100 // lower-third slides in
const HOLD_START = 3000 // expansion done; suspense hold begins
const DONE_AT = 5400 // onDone fires; AnimatePresence triggers reverse (400 ms)

// Return (reverse) sequence: start fully evicted, clear the strike and colour,
// then rewind the shared-layout portrait into its active roster tile.
const RETURN_CLEAR_AT = 650
const RETURN_SPOTLIGHT_AT = 1300
const RETURN_DONE_AT = 1900

// Reduced-motion: collapse the whole sequence to a short hold
const REDUCED_DONE_AT = 600
const ELIMINATED_STAMP_SRC = `${import.meta.env.BASE_URL}assets/eliminated_stamp.svg`
const EVICTION_MARK_SRC = `${(import.meta.env.BASE_URL ?? '').replace(/\/$/, '')}/evictionmark/evictionmark.png`

// Cinematic filter applied to the portrait during the holding phase
const CINEMATIC_FILTER = 'saturate(0.15) contrast(1.1) brightness(0.82)'

// Portrait layout transition: camera-push ease-out over 600 ms
const PORTRAIT_SPRING = {
  duration: 0.48,
  ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
}

type Phase = 'spotlight' | 'expanding' | 'holding' | 'done'
type OverlayVariant = 'eviction' | 'return'

function getLowerThirdLabel(isReturn: boolean, labelText: string, contextLabel?: string): string {
  return isReturn || !contextLabel ? labelText : contextLabel
}

interface Props {
  /** Player being evicted. */
  evictee: Player
  /** Optional contextual kicker shown above the evictee name in the lower-third. */
  contextLabel?: string
  /**
   * Framer Motion layoutId matching the AvatarTile's avatarWrap.
   * When provided, enables the shared-layout match-cut animation.
   * When omitted, the portrait still animates but without a hero match-cut.
   */
  layoutId?: string
  /** Called once the choreography completes (before the reverse animation). */
  onDone: () => void
  /** When true, renders the Skip button regardless of DEV mode (e.g. CI). */
  devSkip?: boolean
  /** When set to "return", the animation runs in reverse for Battle Back returns. */
  variant?: OverlayVariant
}

/**
 * SpotlightEvictionOverlay — cinematic eviction choreography.
 *
 * Beat sequence:
 *  0–900 ms     spotlight   grid dims, radial spotlight mask animates
 *  750 ms                   LIVE bug appears
 *  900–1500 ms  expanding   shared-layout tile expands fullscreen (600 ms, ease-out)
 *  1800 ms                  image desaturates + vignette settles
 *  2100 ms                  "EVICTED" lower-third + stamp slide in
 *  3000–5400 ms holding     suspense pause
 *  5400 ms      done        onDone() fires; AnimatePresence reverse plays (400 ms)
 *
 * Return mode begins from the fully evicted visual state, removes the red strike,
 * restores colour and proportions, and settles directly into the roster tile.
 * It intentionally renders no second LIVE bug, lower-third, stamp or announcement.
 *
 * Accessibility: prefers-reduced-motion collapses the sequence to a 600 ms hold.
 * Dev-only Skip button appears when import.meta.env.DEV is true.
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
  const [phase, setPhase] = useState<Phase>(isReturn ? 'holding' : 'spotlight')
  const [showLiveBug, setShowLiveBug] = useState(false)
  const [showLowerThird, setShowLowerThird] = useState(false)
  const [showReturnStrike, setShowReturnStrike] = useState(isReturn)
  const [desaturated, setDesaturated] = useState(isReturn)
  const [stampAssetState, setStampAssetState] = useState<'loading' | 'ready' | 'error'>(
    isReturn ? 'error' : 'loading'
  )

  const firedRef = useRef(false)

  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  const fire = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    onDone()
  }, [onDone])

  // ── Mount / unmount: register overlay player in store ─────────────────────
  // Ensures AvatarTile hides itself (isEvicting) for this player while the
  // overlay is active, preventing a duplicated fullscreen match-cut tile.
  // The owning component (GameScreen or Final3Ceremony) explicitly clears this
  // flag in their onDone handlers; this cleanup is a safety net for the case
  // where the component unmounts unexpectedly (e.g. navigation away mid-cinematic).
  // clearEvictionOverlay is used (not setEvictionOverlay(null)) so a stale unmount
  // cannot clear a subsequently-mounted overlay for a different player.
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug('[SpotlightEvictionOverlay] mount', {
        evicteeId: evictee.id,
        layoutId,
        variant,
      })
    }
    dispatch(setEvictionOverlay(evictee.id))
    return () => {
      if (import.meta.env.DEV) {
        console.debug('[SpotlightEvictionOverlay] unmount', { evicteeId: evictee.id })
      }
      dispatch(clearEvictionOverlay(evictee.id))
    }
    // evictee.id, layoutId and variant are stable for the lifetime of this overlay instance
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
          dbg('return match-cut to roster')
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

    // Full cinematic sequence
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
        dbg('expanding')
        if (import.meta.env.DEV) {
          console.debug('[SpotlightEvictionOverlay] shared-layout expansion begins', {
            evicteeId: evictee.id,
            layoutId,
          })
        }
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
    // fire is stable (guarded by firedRef); prefersReducedMotion/isReturn read once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleImgError() {
    if (candidateIdx < candidates.length - 1) {
      setCandidateIdx((i) => i + 1)
    } else {
      setShowFallback(true)
    }
  }

  const avatarSrc = candidates[candidateIdx] ?? ''
  const fallbackText = isEmoji(evictee.avatar ?? '')
    ? evictee.avatar
    : evictee.name.charAt(0).toUpperCase()

  const isDev = import.meta.env.DEV || devSkip
  const noMotion = prefersReducedMotion ? { duration: 0 } : undefined

  const labelText = 'ELIMINATED'
  const lowerThirdLabel = getLowerThirdLabel(false, labelText, contextLabel)

  return (
    <div
      className={`seo${isReturn ? ' seo--return' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={
        isReturn
          ? `${evictee.name} is returning to the house`
          : `${evictee.name} has been eliminated`
      }
    >
      {/* Dim overlay — fades in immediately */}
      <motion.div
        className="seo__dim"
        initial={isReturn ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={noMotion ?? { duration: 0.2 }}
      />

      {/* Radial spotlight mask — visible only during spotlight phase */}
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

      {/* LIVE bug — eviction only; return mode must not replay an announcement. */}
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

      {/* Shared-layout portrait (match-cut hero) */}
      <motion.div
        className={`seo__portrait${phase === 'expanding' || phase === 'holding' || phase === 'done' ? ' seo__portrait--expanded' : ''}`}
        layoutId={layoutId}
        style={{ borderRadius: phase === 'spotlight' ? 'var(--tile-radius, 12px)' : 0 }}
        transition={prefersReducedMotion ? { duration: 0 } : PORTRAIT_SPRING}
      >
        {showFallback ? (
          <motion.span
            className="seo__fallback"
            aria-hidden="true"
            animate={
              isReturn && desaturated
                ? {
                    scale: 1,
                    filter: CINEMATIC_FILTER,
                  }
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
                  ? {
                      scale: 1,
                      filter: CINEMATIC_FILTER,
                      y: 0,
                    }
                  : { scale: 1.04, filter: CINEMATIC_FILTER, y: 0 }
                : phase === 'expanding'
                  ? {
                      scale: 1.02,
                      scaleX: 1,
                      scaleY: 1,
                      filter: 'saturate(0.9) contrast(1) brightness(0.95) blur(1.5px)',
                      y: -6,
                    }
                  : {
                      scale: 1,
                      scaleX: 1,
                      scaleY: 1,
                      filter: 'saturate(1) contrast(1) brightness(1)',
                      y: 0,
                    }
            }
            transition={noMotion ?? { duration: 0.5, ease: 'easeOut' }}
          />
        )}

        {/* Return mode begins with the standard red eviction strike, then removes it. */}
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

        {/* Vignette — settles as image desaturates */}
        <motion.div
          className="seo__vignette"
          initial={isReturn ? false : { opacity: 0 }}
          animate={{ opacity: desaturated ? 1 : 0 }}
          transition={noMotion ?? { duration: 0.35 }}
        />

        {/* Film-grain scanlines */}
        <div className="seo__scanlines" aria-hidden="true" />
      </motion.div>

      {/* Lower-third — eviction only. Return mode is deliberately announcement-free. */}
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

      {/* Stamp with impact bounce — eviction only. */}
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

      {/* Dev-only Skip button */}
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

