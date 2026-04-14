/**
 * useIntroHubMusic — requests the looping intro-hub ambient track while the
 * HomeHub screen is mounted, and releases it on unmount.
 *
 * Uses requestBgm/releaseBgm with the 'introhub' owner so the SoundManager can
 * enforce the single-BGM-channel invariant and prevent overlap with phase music.
 *
 * Autoplay policy:
 *   If the user has previously consented (localStorage 'bb:hubMusicConsent'
 *   === 'granted'), playback is requested immediately.  Otherwise playback is
 *   deferred to a user gesture (the SoundConsentPopup shown in HomeHub).
 *
 * Usage:
 *   // Inside HomeHub component
 *   useIntroHubMusic();
 */
import { useEffect } from 'react';
import { SoundManager } from '../services/sound/SoundManager';
import { HUB_MUSIC_CONSENT_KEY } from '../components/SoundConsentPopup/SoundConsentPopup';

export default function useIntroHubMusic(): void {
  useEffect(() => {
    const hubMusicKey = 'music:intro_hub_loop';
    // Only request autoplay if the user has previously granted persistent consent.
    // Without consent the SoundConsentPopup will start music via a user gesture.
    let hasConsent = false;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        hasConsent = window.localStorage.getItem(HUB_MUSIC_CONSENT_KEY) === 'granted';
      }
    } catch {
      // Treat any failure to access localStorage (e.g. privacy mode) as "no consent".
      hasConsent = false;
    }
    if (hasConsent) {
      // requestBgm stores the desired track even when audio is still locked;
      // the SoundManager will start it after the first user gesture.
      SoundManager.requestBgm(hubMusicKey, 'introhub');
    }
    return () => {
      // Release introhub ownership — stops music if it is playing; clears the
      // desired BGM so it does not restart after unlock if we've navigated away.
      SoundManager.releaseBgm('introhub');
    };
  }, []);
}
