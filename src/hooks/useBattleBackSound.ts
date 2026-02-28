/**
 * useBattleBackSound — returns a stable callback that plays the Battle Back
 * twist stinger.
 *
 * Usage:
 *   const playBattleBack = useBattleBackSound();
 *   // call when the Battle Back overlay activates:
 *   playBattleBack();
 */
import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function useBattleBackSound(): () => void {
  return useCallback(() => {
    void SoundManager.play('tv:battleback');
  }, []);
}
