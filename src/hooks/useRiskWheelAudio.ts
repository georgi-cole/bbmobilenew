import { useCallback, useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';
import { useWheelOfLuck } from './useWheelOfLuck';

const RISK_WHEEL_MUSIC_KEY = 'music:risk_wheel_loop';
const RISK_WHEEL_GOOD_KEY = 'minigame:risk_wheel_good';
const RISK_WHEEL_BAD_KEY = 'minigame:risk_wheel_bad';
const RISK_WHEEL_SCOREBOARD_KEY = 'minigame:risk_wheel_scoreboard';
const RISK_WHEEL_WINNER_KEY = 'minigame:risk_wheel_winner';

export interface UseRiskWheelAudioReturn {
  startWheelSound: () => void;
  stopWheelSound: () => void;
  playGoodRewardSound: () => void;
  playBadRewardSound: () => void;
  playScoreboardRevealSound: () => void;
  playWinnerRevealSound: () => void;
}

export function useRiskWheelAudio(): UseRiskWheelAudioReturn {
  const { startWheelSound, stopWheelSound } = useWheelOfLuck();

  // Start background music when the Risk Wheel mounts; stop on unmount.
  useEffect(() => {
    void SoundManager.playMusic(RISK_WHEEL_MUSIC_KEY);
    return () => {
      stopWheelSound();
      SoundManager.stopMusic();
    };
  }, [stopWheelSound]);

  const playGoodRewardSound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_GOOD_KEY);
  }, []);

  const playBadRewardSound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_BAD_KEY);
  }, []);

  const playScoreboardRevealSound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_SCOREBOARD_KEY);
  }, []);

  const playWinnerRevealSound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_WINNER_KEY);
  }, []);

  return {
    startWheelSound,
    stopWheelSound,
    playGoodRewardSound,
    playBadRewardSound,
    playScoreboardRevealSound,
    playWinnerRevealSound,
  };
}
