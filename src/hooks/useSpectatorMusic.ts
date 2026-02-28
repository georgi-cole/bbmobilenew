/**
 * useSpectatorMusic — plays the looping spectator-mode ambient track while
 * the component is mounted (e.g. the challenge observer view), and stops it
 * on unmount.
 *
 * Usage:
 *   // Inside the challenge spectator component
 *   useSpectatorMusic();
 */
import { useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function useSpectatorMusic(): void {
  useEffect(() => {
    void SoundManager.playMusic('music:spectator_loop');
    return () => {
      SoundManager.stopMusic();
    };
  }, []);
}
