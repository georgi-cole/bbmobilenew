/**
 * useQuickTapRaceAudio — manages all audio for the Quick Tap Race minigame.
 *
 * Background music starts when `isPlaying` becomes true and stops (restoring
 * the previous track) when it reverts to false or the component unmounts.
 * One-shot SFX callbacks are returned for the caller to invoke at the correct
 * game moments.
 *
 * Usage:
 *   const { playTap, playBooster, playHalfTap } =
 *     useQuickTapRaceAudio(gamePhase === 'playing');
 */

import { useCallback, useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

const QTR_MUSIC_KEY = 'music:quicktap_main';
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

/**
 * @param isPlaying - true while the Quick Tap Race playing phase is active.
 *   Background music is requested while true and released when it reverts to
 *   false or the component unmounts.
 */
export function useQuickTapRaceAudio(isPlaying: boolean): UseQuickTapRaceAudioReturn {
  // Request/release minigame BGM ownership only while the playing phase is
  // active so the track is tied to the minigame lifecycle, not the phase slot.
  useEffect(() => {
    if (!isPlaying) return;
    SoundManager.requestBgm(QTR_MUSIC_KEY, 'minigame');
    return () => {
      SoundManager.releaseBgm('minigame');
    };
  }, [isPlaying]);

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
