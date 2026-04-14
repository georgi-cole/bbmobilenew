/**
 * useSpectatorMusic — requests the looping spectator-mode ambient track while
 * the component is mounted (e.g. the challenge observer view), and releases it
 * on unmount.
 *
 * Uses requestBgm/releaseBgm with the 'spectator' owner (distinct from the
 * 'phase' owner used by soundMiddleware) so that unmounting the spectator view
 * does not accidentally stop unrelated phase BGM.  The 'spectator' owner has
 * higher priority than 'phase' so it correctly overrides the phase track while
 * the spectator view is visible.
 *
 * Usage:
 *   // Inside the challenge spectator component
 *   useSpectatorMusic();
 */
import { useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function useSpectatorMusic(): void {
  useEffect(() => {
    SoundManager.requestBgm('music:spectator_loop', 'spectator');
    return () => {
      SoundManager.releaseBgm('spectator');
    };
  }, []);
}
