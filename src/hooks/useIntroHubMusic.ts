/**
 * useIntroHubMusic — plays the looping intro-hub ambient track while the
 * HomeHub screen is mounted, and stops it on unmount.
 *
 * Usage:
 *   // Inside HomeHub component
 *   useIntroHubMusic();
 */
import { useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function useIntroHubMusic(): void {
  useEffect(() => {
    void SoundManager.playMusic('music:intro_hub_loop');
    return () => {
      SoundManager.stopMusic();
    };
  }, []);
}
