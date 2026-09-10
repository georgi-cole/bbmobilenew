/**
 * usePublicFavoriteSound — returns a stable callback that starts the
 * "Public's Favorite Player" music cue.
 *
 * Usage:
 *   const playPublicFavorite = usePublicFavoriteSound();
 *   // call when the Public's Favorite voting overlay appears:
 *   playPublicFavorite();
 */
import { useCallback } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function usePublicFavoriteSound(): () => void {
  return useCallback(() => {
    void SoundManager.playMusic('public_voting');
  }, []);
}
