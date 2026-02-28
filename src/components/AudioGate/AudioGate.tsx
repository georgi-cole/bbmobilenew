/**
 * AudioGate.tsx — Overlay that unlocks the Web Audio API on the first user
 * gesture, satisfying browser autoplay policies.
 *
 * Render once near the top of your component tree (e.g. in App.tsx).
 * The gate is invisible after unlock; it renders a tap-to-continue prompt
 * only when the audio context has not yet been unlocked.
 *
 * Usage:
 *   <AudioGate onUnlock={() => SoundManager.playMusic('music:menu_loop')} />
 */

import { useState, useEffect, useCallback } from 'react';
import { SoundManager } from '../../services/sound/SoundManager';
import styles from './AudioGate.module.css';

export interface AudioGateProps {
  /** Called once when the user gesture unlocks audio. */
  onUnlock?: () => void;
  /** Custom prompt text. Defaults to "Tap anywhere to enable audio". */
  promptText?: string;
}

export default function AudioGate({ onUnlock, promptText }: AudioGateProps) {
  const [unlocked, setUnlocked] = useState(false);

  const handleUnlock = useCallback(() => {
    if (unlocked) return;
    setUnlocked(true);
    SoundManager.unlockOnUserGesture();
    onUnlock?.();
  }, [unlocked, onUnlock]);

  useEffect(() => {
    if (unlocked) return;
    // Also listen at document level so any interaction unlocks audio even
    // if the user doesn't click the overlay directly.
    document.addEventListener('click', handleUnlock, { once: true });
    document.addEventListener('keydown', handleUnlock, { once: true });
    document.addEventListener('touchstart', handleUnlock, { once: true });
    return () => {
      document.removeEventListener('click', handleUnlock);
      document.removeEventListener('keydown', handleUnlock);
      document.removeEventListener('touchstart', handleUnlock);
    };
  }, [unlocked, handleUnlock]);

  if (unlocked) return null;

  return (
    <div
      className={styles.overlay}
      onClick={handleUnlock}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleUnlock()}
      aria-label="Enable audio"
    >
      <span className={styles.prompt}>
        {promptText ?? 'Tap anywhere to enable audio'}
      </span>
    </div>
  );
}
