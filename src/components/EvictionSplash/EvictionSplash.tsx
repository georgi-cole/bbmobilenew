import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Player } from '../../types';
import { resolveAvatarCandidates, isEmoji } from '../../utils/avatar';
import './EvictionSplash.css';

interface Props {
  evictee: Player;
  /** Called when the animation completes and the tile should return to the grid */
  onDone: () => void;
  /**
   * Framer Motion layoutId matching the AvatarTile's avatarWrap.
   * When provided the avatar tile expands to fullscreen via shared layout animation
   * (match-cut). Without it the component falls back to a simple CSS fade-in.
   */
  layoutId?: string;
}

/**
 * EvictionSplash — match-cut cinematic eviction animation.
 *
 * Phase sequence (total ≈ 1.3 s when layoutId provided):
 *  1. Expand  (0 – 300 ms)   : shared-layout hero expands tile to fullscreen
 *  2. Hold    (300 – 800 ms) : lower-third + stamp appear with bounce
 *  3. Reverse (800 ms)       : lower-third exits, onDone fires, shared-layout
 *                               reverse plays as AnimatePresence exits
 *
 * Without layoutId falls back to the original 3.2 s colour → B&W sequence.
 */

// ── Timing constants (ms) ─────────────────────────────────────────────────
const EXPAND_MS  = 300;
const HOLD_MS    = 500;
const REVERSE_MS = 300;
// Legacy fallback timing
const LEGACY_DURATION    = 3200;
const LEGACY_FADE_OUT_MS = 600;

// Cinematic desaturation applied to the portrait image during the hold phase.
// Drains colour gradually instead of snapping to full B&W — keeps the broadcast
// look (subtle grain/vignette from scanlines finishes the effect).
const CINEMATIC_FILTER = 'saturate(0.2) contrast(1.08) brightness(0.88)';

// Spring transition shared by the portrait motion.div
const PORTRAIT_SPRING = { type: 'spring' as const, stiffness: 220, damping: 28 };

type Phase = 'expanding' | 'holding' | 'done';

export default function EvictionSplash({ evictee, onDone, layoutId }: Props) {
  const [candidates] = useState(() => resolveAvatarCandidates(evictee));
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [showFallback, setShowFallback] = useState(false);

  // ── Match-cut path (layoutId provided) ──────────────────────────────────
  const [phase, setPhase] = useState<Phase>('expanding');
  const firedRef = useRef(false);

  const fire = useCallback(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (!layoutId) return; // legacy path handles its own timers
    const t1 = setTimeout(() => setPhase('holding'), EXPAND_MS);
    const t2 = setTimeout(() => { setPhase('done'); fire(); }, EXPAND_MS + HOLD_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [layoutId, fire]);

  // ── Legacy fallback (no layoutId) ────────────────────────────────────────
  const [greyscale, setGreyscale]  = useState(false);
  const [fading,    setFading]     = useState(false);

  useEffect(() => {
    if (layoutId) return;
    const halfId  = setTimeout(() => setGreyscale(true), LEGACY_DURATION / 2);
    const fadeId  = setTimeout(() => setFading(true), LEGACY_DURATION - LEGACY_FADE_OUT_MS);
    const doneId  = setTimeout(fire, LEGACY_DURATION);
    return () => { clearTimeout(halfId); clearTimeout(fadeId); clearTimeout(doneId); };
    // fire is stable (guarded by firedRef); LEGACY_DURATION is a module-level constant
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleImgError() {
    if (candidateIdx < candidates.length - 1) {
      setCandidateIdx((i) => i + 1);
    } else {
      setShowFallback(true);
    }
  }

  const avatarSrc    = candidates[candidateIdx] ?? '';
  const fallbackText = isEmoji(evictee.avatar ?? '')
    ? evictee.avatar
    : evictee.name.charAt(0).toUpperCase();

  // ── Render: legacy path ──────────────────────────────────────────────────
  if (!layoutId) {
    return (
      <div
        className={`eviction-splash${fading ? ' eviction-splash--fading' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${evictee.name} has been evicted`}
        onClick={fire}
      >
        <div className="eviction-splash__overlay" />
        <div className={`eviction-splash__photo-wrap${greyscale ? ' eviction-splash__photo-wrap--bw' : ''}`}>
          {showFallback ? (
            <span className="eviction-splash__fallback" aria-hidden="true">{fallbackText}</span>
          ) : (
            <img className="eviction-splash__photo" src={avatarSrc} alt={evictee.name} onError={handleImgError} />
          )}
        </div>
        <div className="eviction-splash__content">
          <p className="eviction-splash__label">EVICTED</p>
          <h1 className="eviction-splash__name">{evictee.name}</h1>
          <p className="eviction-splash__goodbye">Goodbye from the Big Brother house 🚪</p>
          <p className="eviction-splash__skip">tap to continue</p>
        </div>
      </div>
    );
  }

  // ── Render: match-cut path ───────────────────────────────────────────────
  const showBroadcast = phase === 'holding';

  return (
    <div
      className="eviction-splash eviction-splash--matchcut"
      role="dialog"
      aria-modal="true"
      aria-label={`${evictee.name} has been evicted`}
      onClick={fire}
    >
      {/* Dim overlay over the rest of the grid */}
      <motion.div
        className="eviction-splash__overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      />

      {/* ── Shared-layout portrait (the match-cut tile) ─────────────────── */}
      {/* layoutId matches AvatarTile's motion.div — Framer Motion handles the
          hero expansion from tile rect to fixed fullscreen and the reverse. */}
      <motion.div
        className="eviction-splash__portrait"
        layoutId={layoutId}
        transition={PORTRAIT_SPRING}
      >
        {showFallback ? (
          <span className="eviction-splash__fallback" aria-hidden="true">{fallbackText}</span>
        ) : (
          <motion.img
            className="eviction-splash__photo"
            src={avatarSrc}
            alt={evictee.name}
            onError={handleImgError}
            animate={
              phase === 'holding'
                ? { scale: 1.04, filter: CINEMATIC_FILTER }
                : { scale: 1, filter: 'saturate(1) contrast(1) brightness(1)' }
            }
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        )}

        {/* Subtle scanlines / film-grain overlay */}
        <div className="eviction-splash__scanlines" aria-hidden="true" />
      </motion.div>

      {/* ── Broadcast lower-third ──────────────────────────────────────── */}
      <AnimatePresence>
        {showBroadcast && (
          <motion.div
            className="eviction-splash__lower-third"
            initial={{ y: '110%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '110%', opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <p className="eviction-splash__label">EVICTED</p>
            <h1 className="eviction-splash__name">{evictee.name}</h1>
            <p className="eviction-splash__goodbye">Goodbye from the Big Brother house 🚪</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── "EVICTED" stamp with impact bounce ────────────────────────── */}
      <AnimatePresence>
        {showBroadcast && (
          <motion.div
            className="eviction-splash__stamp"
            initial={{ scale: 2.4, opacity: 0, rotate: -14 }}
            animate={{ scale: 1, opacity: 1, rotate: -12 }}
            exit={{ scale: 0, opacity: 0, transition: { duration: 0.12 } }}
            transition={{ type: 'spring', stiffness: 340, damping: 22, delay: 0.06 }}
            aria-hidden="true"
          >
            EVICTED
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip hint fades in during hold */}
      <AnimatePresence>
        {showBroadcast && (
          <motion.p
            className="eviction-splash__skip"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.3, duration: 0.2 }}
          >
            tap to continue
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Exported timing constants let callers (e.g. tests) assert phase durations.
 * REVERSE_MS is the expected duration for the framer-motion shared-layout
 * reverse animation (portrait shrinking back into the tile) that plays after
 * onDone fires and AnimatePresence exits the component.
 */
export { EXPAND_MS, HOLD_MS, REVERSE_MS };
