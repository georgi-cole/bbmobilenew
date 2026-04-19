/**
 * useSound.ts — React hook that exposes the SoundManager API.
 *
 * Usage:
 *   const { play, setCategoryEnabled, setCategoryVolume } = useSound();
 *   play('ui:confirm');
 *
 * BGM (background music) is NOT managed through this hook.
 * Background music is controlled exclusively by AudioStateSync via the
 * centralized resolveDesiredMusic() resolver.  Do not call requestBgm or
 * releaseBgm from components — those are legacy APIs no longer in use.
 */

import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';
import type { PlayOptions } from '../services/sound/SoundManager';
import type { SoundCategory } from '../services/sound/sounds';

export interface UseSoundReturn {
  play: (key: string, opts?: PlayOptions) => void;
  setCategoryEnabled: (category: SoundCategory, enabled: boolean) => void;
  setCategoryVolume: (category: SoundCategory, volume: number) => void;
}

/**
 * Returns stable callbacks that delegate to the singleton SoundManager.
 * The hook does not manage any state — it is a thin ergonomic wrapper.
 *
 * Background music must be driven through AudioStateSync / resolveDesiredMusic,
 * not through direct SoundManager BGM calls.
 */
export default function useSound(): UseSoundReturn {
  const play = useCallback((key: string, opts?: PlayOptions) => {
    void SoundManager.play(key, opts);
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

  return { play, setCategoryEnabled, setCategoryVolume };
}
