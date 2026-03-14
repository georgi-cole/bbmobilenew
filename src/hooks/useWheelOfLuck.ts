/**
 * useWheelOfLuck.ts — Audio hook for the Risk Wheel spin animation.
 *
 * Exposes `startWheelSound()` and `stopWheelSound()` so callers can play
 * (and stop) the looping spin track keyed as 'minigame:wheelofluck'.
 * The audio asset path is /assets/sounds/minigame_wheelofluck.mp3; until the
 * file is added the hook is a no-op (SoundManager silently handles missing files).
 *
 * The spin track is played via `playMusic` so it loops automatically.
 * `stopWheelSound` calls `stopMusic`, which stops the active music track.
 * This is safe inside the Risk Wheel minigame since no other music should be
 * playing while a spin is in progress.
 *
 * Usage:
 *   const { startWheelSound, stopWheelSound } = useWheelOfLuck();
 *   // When wheel starts spinning:
 *   startWheelSound();
 *   // When wheel lands / component unmounts:
 *   stopWheelSound();
 */

import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export interface UseWheelOfLuckReturn {
  /** Play the wheel-spin loop. Safe to call even if the asset is not yet present. */
  startWheelSound: () => void;
  /** Stop the wheel-spin loop. */
  stopWheelSound: () => void;
}

export function useWheelOfLuck(): UseWheelOfLuckReturn {
  const startWheelSound = useCallback(() => {
    void SoundManager.playMusic('minigame:wheelofluck');
  }, []);

  const stopWheelSound = useCallback(() => {
    SoundManager.stopMusic();
  }, []);

  return { startWheelSound, stopWheelSound };
}
