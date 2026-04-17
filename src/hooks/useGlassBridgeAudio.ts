/**
 * useGlassBridgeAudio — returns one-shot SFX callbacks for the Glass Bridge
 * minigame. Background music is resolved centrally at the app root.
 */

import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

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

export function useGlassBridgeAudio(_shouldPlayMusic: boolean): UseGlassBridgeAudioReturn {
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
