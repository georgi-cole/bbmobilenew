/**
 * useWinnerRevealSound — returns a stable callback that plays the winner-
 * announcement fanfare when the final winner modal appears.
 *
 * Usage:
 *   const playWinnerReveal = useWinnerRevealSound();
 *   // call when the winner overlay is shown:
 *   playWinnerReveal();
 */
import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function useWinnerRevealSound(): () => void {
  return useCallback(() => {
    void SoundManager.play('tv:winner_reveal');
  }, []);
}
