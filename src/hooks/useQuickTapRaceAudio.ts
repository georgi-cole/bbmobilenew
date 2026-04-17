/**
 * useQuickTapRaceAudio — returns one-shot SFX callbacks for the Quick Tap Race
 * minigame. Background music is resolved centrally at the app root.
 */

import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

const QTR_TAP_KEY = 'minigame:quicktap_tap';
const QTR_BOOSTER_KEY = 'minigame:quicktap_booster';
const QTR_HALF_TAP_KEY = 'minigame:quicktap_half_tap';

export interface UseQuickTapRaceAudioReturn {
  /** Play the per-tap SFX. */
  playTap: () => void;
  /** Play the booster stinger (beneficial multiplier activated). */
  playBooster: () => void;
  /** Play the half-tap stinger (½× fumble multiplier activated). */
  playHalfTap: () => void;
}

export function useQuickTapRaceAudio(_isPlaying: boolean): UseQuickTapRaceAudioReturn {
  const playTap = useCallback(() => {
    void SoundManager.play(QTR_TAP_KEY);
  }, []);

  const playBooster = useCallback(() => {
    void SoundManager.play(QTR_BOOSTER_KEY);
  }, []);

  const playHalfTap = useCallback(() => {
    void SoundManager.play(QTR_HALF_TAP_KEY);
  }, []);

  return { playTap, playBooster, playHalfTap };
}
