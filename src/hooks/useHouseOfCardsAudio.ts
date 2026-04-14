import { useCallback, useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

const HOC_MUSIC_KEY = 'music:quicktap_main';
const HOC_FLIP_KEY = 'minigame:quicktap_tap';
const HOC_MATCH_KEY = 'minigame:quicktap_booster';
const HOC_MISMATCH_KEY = 'ui:error';
const HOC_PEEK_KEY = 'tv:event';
const HOC_COMPLETE_KEY = 'minigame:risk_wheel_winner';

export interface UseHouseOfCardsAudioReturn {
  playFlip: () => void;
  playMatch: () => void;
  playMismatch: () => void;
  playPeek: () => void;
  playComplete: () => void;
}

/**
 * Requests House of Cards music while the minigame is active and returns
 * one-shot callbacks for gameplay events.
 */
export function useHouseOfCardsAudio(isPlaying: boolean): UseHouseOfCardsAudioReturn {
  useEffect(() => {
    if (!isPlaying) return;
    SoundManager.requestBgm(HOC_MUSIC_KEY, 'minigame');
    return () => {
      SoundManager.releaseBgm('minigame');
    };
  }, [isPlaying]);

  const playFlip = useCallback(() => {
    void SoundManager.play(HOC_FLIP_KEY);
  }, []);

  const playMatch = useCallback(() => {
    void SoundManager.play(HOC_MATCH_KEY);
  }, []);

  const playMismatch = useCallback(() => {
    void SoundManager.play(HOC_MISMATCH_KEY);
  }, []);

  const playPeek = useCallback(() => {
    void SoundManager.play(HOC_PEEK_KEY);
  }, []);

  const playComplete = useCallback(() => {
    void SoundManager.play(HOC_COMPLETE_KEY);
  }, []);

  return { playFlip, playMatch, playMismatch, playPeek, playComplete };
}
