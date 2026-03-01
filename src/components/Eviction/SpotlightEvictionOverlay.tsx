import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '../../types';
import { resolveAvatarCandidates, isEmoji } from '../../utils/avatar';
import './SpotlightEvictionOverlay.css';

// ── Timing constants (ms, relative to component mount) ────────────────────
//
// Beat:   0 ms         grid dims + spotlight locks
//        750 ms        LIVE bug fades in
//        900 ms        tile expansion begins (3000 ms, slow ease-out)
//       3900 ms        expansion done → EVICTED badge + desaturate/vignette begin
//       4400 ms        onDone fires → AnimatePresence exits (reverse, 3000 ms)
//       7400 ms        match-cut shrink complete
//
const LIVE_BUG_AT     = 750;   // LIVE bug fades in
const EXPAND_START    = 900;   // shared-layout expansion begins
const DESAT_AT        = 3900;  // desaturation + vignette (with badge, at expansion end)
const LOWER_THIRD_AT  = 3900;  // EVICTED badge slides in (at expansion end)
const HOLD_START      = 3900;  // expansion done; suspense hold begins
const DONE_AT         = 4400;  // onDone fires; AnimatePresence triggers reverse (3000 ms)

// Reduced-motion: collapse the whole sequence to a short hold
const REDUCED_DONE_AT = 600;

// Cinematic filter applied to the portrait during the holding phase
const CINEMATIC_FILTER = 'saturate(0.15) contrast(1.1) brightness(0.82)';

// Portrait layout transition: camera-push ease-out over 3000 ms (slow cinematic).
// Used for both the enter (expand) and exit (shrink) layout animations via layoutId.
const PORTRAIT_SPRING = { duration: 3.0, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] };

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
 *  0–900 ms     spotlight   grid dims, radial spotlight mask animates
 *  750 ms                   LIVE bug appears
 *  900–3900 ms  expanding   shared-layout tile expands fullscreen (3000 ms, slow ease-out)
 *  3900 ms                  image desaturates + vignette settles, "EVICTED" stamp slides in
 *  3900–4400 ms holding     suspense pause (500 ms)
 *  4400 ms      done        onDone() fires; AnimatePresence reverse plays (3000 ms)
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
    const t0 = Date.now();
    const dbg = import.meta.env.DEV
      ? (label: string) => console.debug(`[SEO] +${Date.now() - t0}ms  ${label}`)
      : () => {};

    if (prefersReducedMotion) {
      // Simplified: skip transitions, jump straight to holding state then done
      setPhase('holding');
      setShowLowerThird(true);
      setDesaturated(true);
      timers.push(setTimeout(() => { setPhase('done'); fire(); dbg('done (reduced-motion)'); }, REDUCED_DONE_AT));
      return () => timers.forEach(clearTimeout);
    }

    // Full cinematic sequence
    dbg('mount – spotlight phase');
    timers.push(setTimeout(() => { setShowLiveBug(true); dbg('LIVE bug'); }, LIVE_BUG_AT));
    timers.push(setTimeout(() => { setPhase('expanding'); dbg('expanding'); }, EXPAND_START));
    timers.push(setTimeout(() => { setDesaturated(true); dbg('desaturate + vignette'); }, DESAT_AT));
    timers.push(setTimeout(() => { setShowLowerThird(true); dbg('lower-third'); }, LOWER_THIRD_AT));
    timers.push(setTimeout(() => { setPhase('holding'); dbg('holding'); }, HOLD_START));
    timers.push(setTimeout(() => { setPhase('done'); fire(); dbg('done'); }, DONE_AT));

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
        className={`seo__portrait${phase === 'expanding' || phase === 'holding' || phase === 'done' ? ' seo__portrait--expanded' : ''}`}
        layoutId={layoutId}
        style={{ borderRadius: phase === 'spotlight' ? 'var(--tile-radius, 12px)' : 0 }}
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
                ? { scale: 1.04, filter: CINEMATIC_FILTER, y: 0 }
                : phase === 'expanding'
                  ? { scale: 1.02, filter: 'saturate(0.9) contrast(1) brightness(0.95) blur(1.5px)', y: -6 }
                  : { scale: 1, filter: 'saturate(1) contrast(1) brightness(1)', y: 0 }
            }
            transition={noMotion ?? { duration: 0.5, ease: 'easeOut' }}
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
            <h1 className="seo__name">{evictee.name}</h1>
          </motion.div>
        )}
      </AnimatePresence>

      {/* EVICTED stamp with impact bounce */}
      <AnimatePresence>
        {showLowerThird && (
          <motion.div
            className="seo__stamp"
            initial={{ scale: 1.6, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: -12 }}
            exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }}
            transition={
              noMotion ?? { duration: 1.2, ease: 'easeOut', delay: 0.06 }
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
