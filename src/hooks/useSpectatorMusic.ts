/**
 * useSpectatorMusic — requests the looping spectator-mode ambient track while
 * the component is mounted (e.g. the challenge observer view), and releases it
 * on unmount.
 *
 * Uses requestBgm/releaseBgm with the 'phase' owner so the SoundManager can
 * enforce the single-BGM-channel invariant.
 *
 * Usage:
 *   // Inside the challenge spectator component
 *   useSpectatorMusic();
 */
import { useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function useSpectatorMusic(): void {
  useEffect(() => {
    SoundManager.requestBgm('music:spectator_loop', 'phase');
    return () => {
      SoundManager.releaseBgm('phase');
    };
  }, []);
}
