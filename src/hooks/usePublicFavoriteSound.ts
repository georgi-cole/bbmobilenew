/**
 * usePublicFavoriteSound — returns a stable callback that plays the
 * "Public's Favorite Player" twist stinger.
 *
 * Usage:
 *   const playPublicFavorite = usePublicFavoriteSound();
 *   // call when the Public's Favorite twist overlay appears:
 *   playPublicFavorite();
 */
import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function usePublicFavoriteSound(): () => void {
  return useCallback(() => {
    void SoundManager.play('tv:public_favorite');
  }, []);
}
