/**
 * useIntroHubMusic — plays the looping intro-hub ambient track while the
 * HomeHub screen is mounted, and stops it on unmount.
 *
 * Autoplay policy:
 *   If the user has previously consented (localStorage 'bb:hubMusicConsent'
 *   === 'granted'), playback is attempted immediately. Otherwise playback is
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
    let hasConsent = false;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        hasConsent = window.localStorage.getItem(HUB_MUSIC_CONSENT_KEY) === 'granted';
      }
    } catch {
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
