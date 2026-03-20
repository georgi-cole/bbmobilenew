/**
 * useIntroHubMusic — plays the looping intro-hub ambient track while the
 * HomeHub screen is mounted, and stops it on unmount.
 *
 * Autoplay policy:
 *   If the user has previously consented (localStorage 'bb:hubMusicConsent'
 *   === 'granted'), playback is attempted immediately.  Otherwise playback is
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
    // Only autoplay if the user has previously granted persistent consent.
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
      void SoundManager.playMusic('music:intro_hub_loop');
    }
    return () => {
      SoundManager.stopMusic();
    };
  }, []);
}
