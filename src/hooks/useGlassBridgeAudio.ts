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
 *   Background music is requested while true and released when it reverts to
 *   false or the component unmounts.
 */
export function useGlassBridgeAudio(shouldPlayMusic: boolean): UseGlassBridgeAudioReturn {
  // Request/release minigame BGM ownership while Glass Bridge is active so the
  // track stays attributed to the minigame lifecycle.
  useEffect(() => {
    if (!shouldPlayMusic) return;
    SoundManager.requestBgm(GB_MUSIC_KEY, 'minigame');
    return () => {
      SoundManager.releaseBgm('minigame');
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
