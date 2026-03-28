/**
 * AudioGate.tsx — Silent audio unlock gate for the first user gesture.
 *
 * Render once near the top of your component tree (e.g. in App.tsx).
 * It listens for the first interaction so audio can unlock without showing
 * a full-screen prompt.
 */

import { useState, useEffect, useCallback } from 'react';
import { SoundManager } from '../../services/sound/SoundManager';
import { detectDebugMode } from '../../utils/debugMode';

export interface AudioGateProps {
  /** Called once when the user gesture unlocks audio. */
  onUnlock?: () => void;
  /** Retained for API compatibility; no prompt is rendered. */
  promptText?: string;
}

export default function AudioGate({ onUnlock }: AudioGateProps) {
  const [unlocked, setUnlocked] = useState(() => detectDebugMode());

  const handleUnlock = useCallback(() => {
    if (unlocked) return;
    setUnlocked(true);
    SoundManager.unlockOnUserGesture();
    onUnlock?.();
  }, [unlocked, onUnlock]);

  useEffect(() => {
    if (unlocked) {
      SoundManager.unlockOnUserGesture();
      onUnlock?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  return null;
}
