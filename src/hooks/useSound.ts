/**
 * useSound.ts — React hook that exposes the SoundManager API.
 *
 * Usage:
 *   const { play, playMusic, stopMusic, setCategoryEnabled, setCategoryVolume } = useSound();
 *   play('ui:confirm');
 */

import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';
import type { PlayOptions } from '../services/sound/SoundManager';
import type { SoundCategory } from '../services/sound/sounds';

export interface UseSoundReturn {
  play: (key: string, opts?: PlayOptions) => void;
  playMusic: (key: string, opts?: PlayOptions) => void;
  stopMusic: () => void;
  setCategoryEnabled: (category: SoundCategory, enabled: boolean) => void;
  setCategoryVolume: (category: SoundCategory, volume: number) => void;
}

/**
 * Returns stable callbacks that delegate to the singleton SoundManager.
 * The hook does not manage any state — it is a thin ergonomic wrapper.
 */
export default function useSound(): UseSoundReturn {
  const play = useCallback((key: string, opts?: PlayOptions) => {
    void SoundManager.play(key, opts);
  }, []);

  const playMusic = useCallback((key: string, opts?: PlayOptions) => {
    void SoundManager.playMusic(key, opts);
  }, []);

  const stopMusic = useCallback(() => {
    SoundManager.stopMusic();
  }, []);

  const setCategoryEnabled = useCallback(
    (category: SoundCategory, enabled: boolean) => {
      SoundManager.setCategoryEnabled(category, enabled);
    },
    [],
  );

  const setCategoryVolume = useCallback(
    (category: SoundCategory, volume: number) => {
      SoundManager.setCategoryVolume(category, volume);
    },
    [],
  );

  return { play, playMusic, stopMusic, setCategoryEnabled, setCategoryVolume };
}
