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
 *   Background music starts on the first true value and stops when it reverts
 *   to false or the component unmounts, then restores whatever was playing.
 */
export function useQuickTapRaceAudio(isPlaying: boolean): UseQuickTapRaceAudioReturn {
  // Start looping background music when the playing phase begins;
  // stop it and restore the previous track when the phase ends or on unmount.
  useEffect(() => {
    if (!isPlaying) return;
    const prevKey = SoundManager.currentMusicKey;
    void SoundManager.playMusic(QTR_MUSIC_KEY);
    return () => {
      if (SoundManager.currentMusicKey !== QTR_MUSIC_KEY) return;
      SoundManager.stopMusic();
      // Restore the track that was playing before QTR started (e.g. LOH comp
      // general) so phase music continues seamlessly after the minigame.
      if (prevKey && prevKey !== QTR_MUSIC_KEY) {
        void SoundManager.playMusic(prevKey);
      }
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
