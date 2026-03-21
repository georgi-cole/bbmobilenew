import { useCallback, useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';
import { useWheelOfLuck } from './useWheelOfLuck';

const RISK_WHEEL_MUSIC_KEY = 'music:risk_wheel_loop';
const RISK_WHEEL_GOOD_KEY = 'minigame:risk_wheel_good';
const RISK_WHEEL_BAD_KEY = 'minigame:risk_wheel_bad';
const RISK_WHEEL_666_KEY = 'minigame:risk_wheel_666';
const RISK_WHEEL_BANKRUPT_OR_SKIP_KEY = 'minigame:risk_wheel_bankrupt_or_skip';
const RISK_WHEEL_SCOREBOARD_KEY = 'minigame:risk_wheel_scoreboard';
const RISK_WHEEL_WINNER_KEY = 'minigame:risk_wheel_winner';
const RISK_WHEEL_STOP_AND_BANK_KEY = 'ui:risk_wheel_stop_and_bank';
const RISK_WHEEL_CLICK_KEY = 'ui:risk_wheel_click';

export interface UseRiskWheelAudioReturn {
  startWheelSound: () => void;
  stopWheelSound: () => void;
  playGoodRewardSound: () => void;
  playBadRewardSound: () => void;
  /** Plays when the player lands on the 666 devil sector. */
  play666Sound: () => void;
  /** Plays when the player lands on a Bankrupt or Skip sector. */
  playBankruptOrSkipSound: () => void;
  playScoreboardRevealSound: () => void;
  playWinnerRevealSound: () => void;
  /** Plays when the player taps the Stop & Bank button. */
  playStopAndBankSound: () => void;
  /** Plays for generic button presses (Continue, Start Round, etc.). */
  playClickSound: () => void;
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

  const play666Sound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_666_KEY);
  }, []);

  const playBankruptOrSkipSound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_BANKRUPT_OR_SKIP_KEY);
  }, []);

  const playScoreboardRevealSound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_SCOREBOARD_KEY);
  }, []);

  const playWinnerRevealSound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_WINNER_KEY);
  }, []);

  const playStopAndBankSound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_STOP_AND_BANK_KEY);
  }, []);

  const playClickSound = useCallback(() => {
    void SoundManager.play(RISK_WHEEL_CLICK_KEY);
  }, []);

  return {
    startWheelSound,
    stopWheelSound,
    playGoodRewardSound,
    playBadRewardSound,
    play666Sound,
    playBankruptOrSkipSound,
    playScoreboardRevealSound,
    playWinnerRevealSound,
    playStopAndBankSound,
    playClickSound,
  };
}
