/**
 * useMinigameResultsSound — returns a stable callback that plays the
 * minigame-over / results stinger.
 *
 * Usage:
 *   const playMinigameResults = useMinigameResultsSound();
 *   // call when results modal appears:
 *   playMinigameResults();
 */
import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function useMinigameResultsSound(): () => void {
  return useCallback(() => {
    void SoundManager.play('minigame:results');
  }, []);
}
