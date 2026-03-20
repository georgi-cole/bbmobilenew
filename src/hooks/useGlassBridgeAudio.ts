/**
 * useGlassBridgeAudio — manages all audio for the Glass Bridge minigame.
 *
 * Background music starts when `shouldPlayMusic` becomes true and stops when it
 * becomes false or the component unmounts.  One-shot SFX callbacks are
 * returned for the caller to invoke at the correct game moments.
 *
 * Usage:
 *   const { playSafeStep, playDeath, playWinner, playNewTurn } =
 *     useGlassBridgeAudio(gb.phase !== 'idle');
 */

import { useCallback, useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

const GB_MUSIC_KEY = 'music:gb_main';
const GB_SAFE_STEP_KEY = 'minigame:gb_safe_step';
const GB_DEATH_KEY = 'minigame:gb_death';
const GB_WINNER_KEY = 'minigame:gb_winner';
const GB_NEW_TURN_KEY = 'minigame:gb_new_turn';

export interface UseGlassBridgeAudioReturn {
  playSafeStep: () => void;
  playDeath: () => void;
  playWinner: () => void;
  playNewTurn: () => void;
}

/**
 * @param shouldPlayMusic - true while the Glass Bridge minigame is active.
 *   Background music starts on the first true value and stops when it reverts
 *   to false or the component unmounts.
 */
export function useGlassBridgeAudio(shouldPlayMusic: boolean): UseGlassBridgeAudioReturn {
  // Start looping background music when the minigame becomes active;
  // stop it when leaving or on unmount.
  useEffect(() => {
    if (!shouldPlayMusic) return;
    void SoundManager.playMusic(GB_MUSIC_KEY);
    return () => {
      SoundManager.stopMusic();
    };
  }, [shouldPlayMusic]);

  const playSafeStep = useCallback(() => {
    void SoundManager.play(GB_SAFE_STEP_KEY);
  }, []);

  const playDeath = useCallback(() => {
    void SoundManager.play(GB_DEATH_KEY);
  }, []);

  const playWinner = useCallback(() => {
    void SoundManager.play(GB_WINNER_KEY);
  }, []);

  const playNewTurn = useCallback(() => {
    void SoundManager.play(GB_NEW_TURN_KEY);
  }, []);

  return { playSafeStep, playDeath, playWinner, playNewTurn };
}
