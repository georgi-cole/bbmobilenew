/**
 * useIntroHubMusic — requests the looping intro-hub ambient track while the
 * HomeHub screen is mounted, and releases it on unmount.
 *
 * Uses requestBgm/releaseBgm with the 'introhub' owner so the existing music
 * hook assignment remains in place even while the SoundManager runtime is
 * intentionally disabled.
 *
 * When the remote live-config provides an introTrackUrl, that remote track
 * (registered as 'music:remote_intro') is used instead of the bundled loop.
 *
 * Usage:
 *   // Inside HomeHub component
 *   useIntroHubMusic();
 */
import { useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';
import { useAppSelector } from '../store/hooks';
import { selectRemoteIntroMusicUrl } from '../remoteConfig/remoteConfigSlice';

export default function useIntroHubMusic(): void {
  const remoteIntroUrl = useAppSelector(selectRemoteIntroMusicUrl);

  useEffect(() => {
    // Use the remote key if a URL was provided (and registered), otherwise
    // fall back to the bundled intro-hub loop.
    const hubMusicKey = remoteIntroUrl ? 'music:remote_intro' : 'music:intro_hub_loop';
    SoundManager.requestBgm(hubMusicKey, 'introhub');
    return () => {
      SoundManager.releaseBgm('introhub');
    };
  }, [remoteIntroUrl]);
}
