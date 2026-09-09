/**
 * usePublicFavoriteSound — returns a stable callback that starts the
 * "Public's Favorite Player" music cue.
 *
 * Usage:
 *   const playPublicFavorite = usePublicFavoriteSound();
 *   // call when the Public's Favorite voting overlay appears:
 *   playPublicFavorite();
 */
import { useCallback } from 'react'

export default function usePublicFavoriteSound(): () => void {
  // Public voting is a normal UI music scene. AudioStateSync owns it through
  // the scene state, so this legacy hook deliberately has no playback side
  // effect if an older component still calls it.
  return useCallback(() => {}, [])
}
