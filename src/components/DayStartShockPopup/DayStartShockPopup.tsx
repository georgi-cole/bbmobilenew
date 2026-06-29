import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import type { Player } from '../../types';
import PlayerAvatar from '../ui/PlayerAvatar';
import './DayStartShockPopup.css';

interface DayStartShockPopupProps {
  player: Player;
  reason: string;
  onConfirm: () => void;
}

/**
 * DayStartShockPopup - a dramatic morning shock interstitial.
 *
 * Shows the selected housemate portrait centered at the top, followed by the
 * broadcast reason and a single confirmation button that hands the game over
 * to the standard eviction animation.
 */
export default function DayStartShockPopup({ player, reason, onConfirm }: DayStartShockPopupProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="day-start-shock" role="presentation" data-testid="day-start-shock-popup">
      <motion.div
        className="day-start-shock__backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: prefersReducedMotion ? 0.12 : 0.28, ease: 'easeOut' }}
      >
        <motion.section
          className="day-start-shock__card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="day-start-shock-title"
          aria-describedby="day-start-shock-reason"
          initial={prefersReducedMotion ? { opacity: 0.96 } : { opacity: 0, scale: 0.92, y: 18 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0.96 } : { opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: prefersReducedMotion ? 0.18 : 0.38, ease: [0.2, 0.9, 0.2, 1] }}
        >
          <div className="day-start-shock__flare" aria-hidden="true" />
          <div className="day-start-shock__eyebrow">Morning shock</div>
          <div className="day-start-shock__portrait">
            <PlayerAvatar player={player} size="lg" />
          </div>
          <h2 className="day-start-shock__title" id="day-start-shock-title">
            {player.name}
          </h2>
          <p className="day-start-shock__subhead">
            A housemate is being removed before the day can continue.
          </p>
          <p className="day-start-shock__reason" id="day-start-shock-reason">
            {reason}
          </p>
          <button className="day-start-shock__confirm" type="button" onClick={onConfirm}>
            Trigger eviction sequence
          </button>
        </motion.section>
      </motion.div>
    </div>,
    document.body,
  );
}
