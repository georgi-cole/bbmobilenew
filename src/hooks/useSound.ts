/**
 * useSound.ts — React hook that exposes the SoundManager API.
 *
 * Usage:
 *   const { play, requestBgm, releaseBgm, setCategoryEnabled, setCategoryVolume } = useSound();
 *   play('ui:confirm');
 *   requestBgm('music:intro_hub_loop', 'introhub');
 *   releaseBgm('introhub');
 */

import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';
import type { PlayOptions, BgmOwner } from '../services/sound/SoundManager';
import type { SoundCategory } from '../services/sound/sounds';

export interface UseSoundReturn {
  play: (key: string, opts?: PlayOptions) => void;
  /** @deprecated Prefer requestBgm/releaseBgm for centralized BGM ownership. */
  playMusic: (key: string, opts?: PlayOptions) => void;
  /** @deprecated Prefer releaseBgm for centralized BGM ownership. */
  stopMusic: () => void;
  /** Request a background music track with an ownership scope. */
  requestBgm: (key: string | null, owner: BgmOwner) => void;
  /** Release BGM ownership for the given scope. */
  releaseBgm: (owner: BgmOwner) => void;
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

  const requestBgm = useCallback((key: string | null, owner: BgmOwner) => {
    SoundManager.requestBgm(key, owner);
  }, []);

  const releaseBgm = useCallback((owner: BgmOwner) => {
    SoundManager.releaseBgm(owner);
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

  return { play, playMusic, stopMusic, requestBgm, releaseBgm, setCategoryEnabled, setCategoryVolume };
}
