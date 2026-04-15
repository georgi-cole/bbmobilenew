/**
 * useIntroHubMusic — requests the looping intro-hub ambient track while the
 * HomeHub screen is mounted, and releases it on unmount.
 *
 * Uses requestBgm/releaseBgm with the 'introhub' owner so the existing music
 * hook assignment remains in place even while the SoundManager runtime is
 * intentionally disabled.
 *
 * The runtime SoundManager is currently disabled, so these calls are safe
 * no-ops that preserve the hook wiring without starting playback.
 *
 * Usage:
 *   // Inside HomeHub component
 *   useIntroHubMusic();
 */
import { useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';

export default function useIntroHubMusic(): void {
  useEffect(() => {
    const hubMusicKey = 'music:intro_hub_loop';
    // Keep the intro-hub music hook in place even while runtime audio is disabled.
    SoundManager.requestBgm(hubMusicKey, 'introhub');
    return () => {
      // Release the hook assignment on unmount.
      SoundManager.releaseBgm('introhub');
    };
  }, []);
}
