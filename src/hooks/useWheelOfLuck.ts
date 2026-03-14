/**
 * useWheelOfLuck.ts — Audio hook for the Risk Wheel spin animation.
 *
 * Exposes `startWheelSound()` and `stopWheelSound()` so callers can play
 * (and stop) the looping spin track keyed as 'minigame:wheelofluck'.
 * The audio asset path is /assets/sounds/minigame_wheelofluck.mp3; until the
 * file is added the hook is a no-op (SoundManager silently handles missing files).
 *
 * The spin track is played via `SoundManager.play()` so it is gated by the
 * **minigame** category (not the music channel), meaning it will not interrupt
 * any background hub/menu music and respects minigame SFX volume settings.
 * Looping is configured on the SoundEntry (`loop: true`).
 *
 * `stopWheelSound` uses the targeted `SoundManager.stop(key)` API so only this
 * specific track is stopped, leaving any other audio channels untouched.
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

const WHEEL_SOUND_KEY = 'minigame:wheelofluck';

export interface UseWheelOfLuckReturn {
  /** Play the wheel-spin loop. Safe to call even if the asset is not yet present. */
  startWheelSound: () => void;
  /** Stop the wheel-spin loop without affecting other audio channels. */
  stopWheelSound: () => void;
}

export function useWheelOfLuck(): UseWheelOfLuckReturn {
  const startWheelSound = useCallback(() => {
    void SoundManager.play(WHEEL_SOUND_KEY);
  }, []);

  const stopWheelSound = useCallback(() => {
    SoundManager.stop(WHEEL_SOUND_KEY);
  }, []);

  return { startWheelSound, stopWheelSound };
}
