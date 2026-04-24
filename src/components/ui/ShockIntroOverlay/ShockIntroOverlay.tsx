import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import './ShockIntroOverlay.css';

/** Duration (ms) for the full-motion stinger. */
const SHOCK_INTRO_DURATION_MS = 1100;
/** Duration (ms) for reduced-motion users — brief flash, no elaborate animation. */
const SHOCK_INTRO_REDUCED_DURATION_MS = 400;

/** Visual config per shock key. Falls back to generic shock values. */
const SHOCK_STINGER_CONFIG: Record<string, { icon: string; title: string; theme: string }> = {
  twist:            { icon: '🌀', title: 'SHOCK ALERT',        theme: 'amber' },
  double_eviction:  { icon: '⚡', title: 'DOUBLE ELIMINATION', theme: 'red' },
  vip_veto:         { icon: '👑', title: 'DOUBLE TROUBLE',     theme: 'amber' },
  diamond_pov:      { icon: '😇', title: 'HALO EXCHANGE',      theme: 'blue' },
  coup_detat:       { icon: '⚡', title: 'DETOX',              theme: 'red' },
  spotlight_veto:   { icon: '✨', title: 'FORCE MAJEURE',      theme: 'amber' },
  battle_back:      { icon: '🔥', title: 'BACK 2 THE GAME',    theme: 'orange' },
};

const FALLBACK_STINGER = { icon: '🌀', title: 'SHOCK ALERT', theme: 'amber' };

export interface ShockIntroOverlayProps {
  /** Whether the stinger is currently active. */
  active: boolean;
  /** The announcement key used to select the stinger icon and title. */
  shockKey: string;
  /** Called when the stinger animation has completed and the UI should proceed. */
  onComplete: () => void;
}

/**
 * ShockIntroOverlay — full-screen cinematic stinger shown at the start of any
 * shock/twist announcement sequence.
 *
 * - Mounts via React portal to `document.body`.
 * - Runs for ~1.1s (reduced to ~0.4s for `prefers-reduced-motion` users).
 * - Calls `onComplete` when the timer fires so the parent can transition to the
 *   next phase (TV announcement + info-button spotlight).
 */
export default function ShockIntroOverlay({ active, shockKey, onComplete }: ShockIntroOverlayProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!active) return;
    const duration = prefersReducedMotion ? SHOCK_INTRO_REDUCED_DURATION_MS : SHOCK_INTRO_DURATION_MS;
    const timer = window.setTimeout(onComplete, duration);
    return () => window.clearTimeout(timer);
  }, [active, onComplete, prefersReducedMotion]);

  if (!active || typeof document === 'undefined') return null;

  const config = SHOCK_STINGER_CONFIG[shockKey] ?? FALLBACK_STINGER;

  return createPortal(
    <div
      className={[
        'shock-intro',
        `shock-intro--${config.theme}`,
        prefersReducedMotion ? 'shock-intro--reduced' : '',
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
      data-testid="shock-intro-overlay"
    >
      <div className="shock-intro__content">
        <span className="shock-intro__icon" role="img" aria-hidden="true">{config.icon}</span>
        <p className="shock-intro__title">{config.title}</p>
        <div className="shock-intro__flash" aria-hidden="true" />
      </div>
    </div>,
    document.body,
  );
}
