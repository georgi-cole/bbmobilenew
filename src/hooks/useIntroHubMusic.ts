/**
 * useIntroHubMusic — requests the looping intro-hub ambient track while the
 * HomeHub screen is mounted, and releases it on unmount.
 *
 * Uses requestBgm/releaseBgm with the 'introhub' owner so the SoundManager can
 * enforce the single-BGM-channel invariant and prevent overlap with phase music.
 *
 * Autoplay policy:
 *   The desired BGM is always registered on mount (safe while audio is locked —
 *   the SoundManager only stores the intent without playing).  This ensures
 *   that when the SoundConsentPopup calls unlockAndPlayMusicOnly() for
 *   first-time visitors, the hub track is already set as the desired BGM and
 *   will start immediately on unlock.
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
    // Always register the desired BGM on mount — safe while audio is locked
    // (SoundManager stores the intent without playing).  This covers both the
    // returning-visitor path (consent already granted, audio auto-unlocked) and
    // the first-time-visitor path (consent popup will call unlockAndPlayMusicOnly,
    // which starts the stored desired BGM in the gesture context).
    SoundManager.requestBgm(hubMusicKey, 'introhub');
    return () => {
      // Release introhub ownership — stops music if it is playing; removes the
      // desired BGM entry so it does not restart after unlock if we've navigated away.
      SoundManager.releaseBgm('introhub');
    };
  }, []);
}
