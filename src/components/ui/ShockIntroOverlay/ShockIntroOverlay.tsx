import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useReducedMotion } from 'framer-motion';
import TvAnnouncementOverlay, { type Announcement } from '../TvAnnouncementOverlay/TvAnnouncementOverlay';
import './ShockIntroOverlay.css';

/** Duration (ms) for the full-motion stinger. */
const SHOCK_INTRO_DURATION_MS = 1100;
/** Duration (ms) for reduced-motion users — brief flash, no elaborate animation. */
const SHOCK_INTRO_REDUCED_DURATION_MS = 400;

/** Fallback announcement copy when the parent has not passed a full announcement object. */
const SHOCK_ANNOUNCEMENTS: Record<string, Announcement> = {
  twist: { key: 'twist', title: 'Shock Alert!', subtitle: 'The Big Eye has a surprise.', isLive: true, autoDismissMs: null },
  double_eviction: { key: 'double_eviction', title: 'Double Elimination!', subtitle: 'Tonight the LOH nominates three. Two will be eliminated.', isLive: true, autoDismissMs: null },
  vip_veto: { key: 'vip_veto', title: 'Double Trouble!', subtitle: 'The holder may use the power twice this ceremony. 👑', isLive: true, autoDismissMs: null },
  diamond_pov: { key: 'diamond_pov', title: 'Halo Exchange!', subtitle: 'The holder may name the backup nominee. 😇', isLive: true, autoDismissMs: null },
  coup_detat: { key: 'coup_detat', title: 'Detox!', subtitle: 'Both nominees cleared. Holder names two backup nominees. ⚡', isLive: true, autoDismissMs: null },
  spotlight_veto: { key: 'spotlight_veto', title: 'Force Majeure!', subtitle: 'The holder is forced to use the power this ceremony. ✨', isLive: true, autoDismissMs: null },
  battle_back: { key: 'battle_back', title: 'Back 2 the Game', subtitle: 'Eliminated players compete for a second chance.', isLive: true, autoDismissMs: null },
  battle_back_shock: { key: 'battle_back_shock', title: 'Shock Twist', subtitle: 'Back 2 the Game has been activated. A return to the game is now on the table.', isLive: true, autoDismissMs: null },
  battle_back_rules: { key: 'battle_back_rules', title: 'Back 2 the Game Rules', subtitle: 'Tribunal members will face off. Only one can win the right to return to the house.', isLive: true, autoDismissMs: null },
  battle_back_challenge: { key: 'battle_back_challenge', title: 'Back 2 the Game Challenge', subtitle: 'The challenge is ready. Press play to begin the Back 2 the Game showdown.', isLive: true, autoDismissMs: null },
};

const FALLBACK_STINGER = SHOCK_ANNOUNCEMENTS.twist;

export interface ShockIntroOverlayProps {
  /** Whether the stinger is currently active. */
  active: boolean;
  /** The announcement key used to select the stinger icon and title. */
  shockKey: string;
  /** Optional full announcement metadata so the fullscreen intro matches the TV vision exactly. */
  announcement?: Announcement | null;
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
export default function ShockIntroOverlay({
  active,
  shockKey,
  announcement = null,
  onComplete,
}: ShockIntroOverlayProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!active) return;
    const duration = prefersReducedMotion ? SHOCK_INTRO_REDUCED_DURATION_MS : SHOCK_INTRO_DURATION_MS;
    const timer = window.setTimeout(onComplete, duration);
    return () => window.clearTimeout(timer);
  }, [active, shockKey, onComplete, prefersReducedMotion]);

  if (!active || typeof document === 'undefined') return null;

  const displayAnnouncement = announcement ?? SHOCK_ANNOUNCEMENTS[shockKey] ?? {
    ...FALLBACK_STINGER,
    key: shockKey || FALLBACK_STINGER.key,
  };

  return createPortal(
    <div
      className={['shock-intro', prefersReducedMotion ? 'shock-intro--reduced' : ''].filter(Boolean).join(' ')}
      aria-hidden="true"
      data-testid="shock-intro-overlay"
    >
      <div className="shock-intro__vision-stage">
        <TvAnnouncementOverlay
          announcement={displayAnnouncement}
          onInfo={() => {}}
          onDismiss={() => {}}
          paused
          showInfoButton={false}
        />
      </div>
    </div>,
    document.body,
  );
}
