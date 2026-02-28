import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '../../types';
import { resolveAvatarCandidates, isEmoji } from '../../utils/avatar';
import './SpotlightEvictionOverlay.css';

// ── Timing constants (ms, relative to component mount) ────────────────────
const LIVE_BUG_AT     = 250;   // LIVE bug fades in
const EXPAND_START    = 300;   // shared-layout expansion begins
const DESAT_AT        = 600;   // desaturation + vignette settle (300 ms after expand)
const LOWER_THIRD_AT  = 700;   // lower-third slides in (400 ms after expand)
const HOLD_START      = 1000;  // expansion done; suspense hold begins
const DONE_AT         = 2000;  // onDone fires; AnimatePresence triggers reverse

// Reduced-motion: collapse the whole sequence to a short hold
const REDUCED_DONE_AT = 600;

// Cinematic filter applied to the portrait during the holding phase
const CINEMATIC_FILTER = 'saturate(0.15) contrast(1.1) brightness(0.82)';

// Spring config shared by the portrait layout transition
const PORTRAIT_SPRING = { type: 'spring' as const, stiffness: 180, damping: 26 };

type Phase = 'spotlight' | 'expanding' | 'holding' | 'done';

interface Props {
  /** Player being evicted. */
  evictee: Player;
  /**
   * Framer Motion layoutId matching the AvatarTile's avatarWrap.
   * Required for the shared-layout match-cut animation.
   */
  layoutId: string;
  /** Called once the choreography completes (before the reverse animation). */
  onDone: () => void;
}

/**
 * SpotlightEvictionOverlay — cinematic eviction choreography.
 *
 * Beat sequence:
 *  0–300 ms   spotlight   grid dims, radial spotlight mask animates
 *  250 ms                 LIVE bug appears
 *  300–1000 ms expanding  shared-layout tile expands fullscreen (match-cut)
 *  600 ms                 image desaturates + vignette settles
 *  700 ms                 "EVICTED" lower-third + stamp slide in
 *  1000–2000 ms holding   suspense pause
 *  2000 ms    done        onDone() fires; AnimatePresence reverse plays (300 ms)
 *
 * Accessibility: prefers-reduced-motion collapses the sequence to a 600 ms hold.
 * Dev-only Skip button appears when import.meta.env.DEV is true.
 */
export default function SpotlightEvictionOverlay({ evictee, layoutId, onDone }: Props) {
  const [candidates] = useState(() => resolveAvatarCandidates(evictee));
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [showFallback, setShowFallback] = useState(false);

  const [phase, setPhase] = useState<Phase>('spotlight');
  const [showLiveBug, setShowLiveBug] = useState(false);
  const [showLowerThird, setShowLowerThird] = useState(false);
  const [desaturated, setDesaturated] = useState(false);

  const firedRef = useRef(false);

  const prefersReducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  const fire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    if (prefersReducedMotion) {
      // Simplified: skip transitions, jump straight to holding state then done
      setPhase('holding');
      setShowLowerThird(true);
      setDesaturated(true);
      timers.push(setTimeout(() => { setPhase('done'); fire(); }, REDUCED_DONE_AT));
      return () => timers.forEach(clearTimeout);
    }

    // Full cinematic sequence
    timers.push(setTimeout(() => setShowLiveBug(true), LIVE_BUG_AT));
    timers.push(setTimeout(() => setPhase('expanding'), EXPAND_START));
    timers.push(setTimeout(() => setDesaturated(true), DESAT_AT));
    timers.push(setTimeout(() => setShowLowerThird(true), LOWER_THIRD_AT));
    timers.push(setTimeout(() => setPhase('holding'), HOLD_START));
    timers.push(setTimeout(() => { setPhase('done'); fire(); }, DONE_AT));

    return () => timers.forEach(clearTimeout);
  // fire is stable (guarded by firedRef); prefersReducedMotion is read once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleImgError() {
    if (candidateIdx < candidates.length - 1) {
      setCandidateIdx((i) => i + 1);
    } else {
      setShowFallback(true);
    }
  }

  const avatarSrc = candidates[candidateIdx] ?? '';
  const fallbackText = isEmoji(evictee.avatar ?? '')
    ? evictee.avatar
    : evictee.name.charAt(0).toUpperCase();

  const isDev = import.meta.env.DEV;
  const noMotion = prefersReducedMotion ? { duration: 0 } : undefined;

  return (
    <div
      className="seo"
      role="dialog"
      aria-modal="true"
      aria-label={`${evictee.name} has been evicted`}
    >
      {/* Dim overlay — fades in immediately */}
      <motion.div
        className="seo__dim"
        initial={{ opacity: 0 }}
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

      {/* LIVE bug — top-left broadcast indicator */}
      <AnimatePresence>
        {showLiveBug && (
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
        className="seo__portrait"
        layoutId={layoutId}
        transition={prefersReducedMotion ? { duration: 0 } : PORTRAIT_SPRING}
      >
        {showFallback ? (
          <span className="seo__fallback" aria-hidden="true">
            {fallbackText}
          </span>
        ) : (
          <motion.img
            className="seo__photo"
            src={avatarSrc}
            alt={evictee.name}
            onError={handleImgError}
            animate={
              desaturated
                ? { scale: 1.04, filter: CINEMATIC_FILTER }
                : { scale: 1, filter: 'saturate(1) contrast(1) brightness(1)' }
            }
            transition={noMotion ?? { duration: 0.4, ease: 'easeOut' }}
          />
        )}

        {/* Vignette — settles as image desaturates */}
        <motion.div
          className="seo__vignette"
          initial={{ opacity: 0 }}
          animate={{ opacity: desaturated ? 1 : 0 }}
          transition={noMotion ?? { duration: 0.35 }}
        />

        {/* Film-grain scanlines */}
        <div className="seo__scanlines" aria-hidden="true" />
      </motion.div>

      {/* EVICTED lower-third — slides up from bottom */}
      <AnimatePresence>
        {showLowerThird && (
          <motion.div
            className="seo__lower-third"
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '110%', opacity: 0 }}
            transition={noMotion ?? { duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <p className="seo__label">EVICTED</p>
            <h1 className="seo__name">{evictee.name}</h1>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EVICTED stamp with impact bounce */}
      <AnimatePresence>
        {showLowerThird && (
          <motion.div
            className="seo__stamp"
            initial={{ scale: 2.4, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: -12 }}
            exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }}
            transition={
              noMotion ?? { type: 'spring', stiffness: 340, damping: 22, delay: 0.06 }
            }
            aria-hidden="true"
          >
            EVICTED
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
  );
}
