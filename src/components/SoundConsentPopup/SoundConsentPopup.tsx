/**
 * SoundConsentPopup — one-time popup asking the user to enable hub music.
 *
 * Autoplay policy in modern browsers means music cannot start without a prior
 * user gesture.  This popup provides that gesture and lets the user opt-in.
 *
 * Behaviour (Option B):
 *  - Shown on every hub load UNLESS the user previously clicked "Enable" AND
 *    checked "Remember my choice".
 *  - "Enable sounds" → unlocks audio context, starts hub music.
 *      If "Remember" is checked: persist consent to localStorage so the popup
 *      is never shown again.
 *      If "Remember" is NOT checked: enable for this session only.
 *  - "Not now" → dismiss without persisting. The popup will re-appear on the
 *      next hub load (Option B — denial is never persisted).
 *
 * localStorage key: 'bb:hubMusicConsent'
 *   'granted' → user previously enabled with "Remember"; skip popup.
 *   absent    → show popup (covers both "never asked" and "Not now" cases).
 */

import { useState } from 'react';
import './SoundConsentPopup.css';

export const HUB_MUSIC_CONSENT_KEY = 'bb:hubMusicConsent';

export interface SoundConsentPopupProps {
  /** Called when the user enables sounds (after unlocking + starting music). */
  onEnable: () => void;
  /** Called when the user dismisses without enabling. */
  onDismiss: () => void;
}

export default function SoundConsentPopup({ onEnable, onDismiss }: SoundConsentPopupProps) {
  const [remember, setRemember] = useState(false);

  const handleEnable = () => {
    if (remember) {
      try {
        localStorage.setItem(HUB_MUSIC_CONSENT_KEY, 'granted');
      } catch {
        // localStorage unavailable — ignore, session-only consent
      }
    }
    onEnable();
  };

  const handleDismiss = () => {
    // Option B: do NOT persist the dismissal — ask again next time.
    onDismiss();
  };

  return (
    <div
      className="sound-consent-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sound-consent-title"
    >
      <div className="sound-consent-popup">
        <div className="sound-consent-popup__icon" aria-hidden="true">🔊</div>
        <h2 id="sound-consent-title" className="sound-consent-popup__title">
          Enable sounds?
        </h2>
        <p className="sound-consent-popup__desc">
          The game plays music and sound effects. Enable audio for the best experience.
        </p>
        <div className="sound-consent-popup__actions">
          <button
            type="button"
            className="sound-consent-popup__btn sound-consent-popup__btn--enable"
            onClick={handleEnable}
          >
            Enable sounds
          </button>
          <button
            type="button"
            className="sound-consent-popup__btn sound-consent-popup__btn--dismiss"
            onClick={handleDismiss}
          >
            Not now
          </button>
        </div>
        <label className="sound-consent-popup__remember" htmlFor="sound-consent-remember">
          <input
            id="sound-consent-remember"
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="sound-consent-popup__remember-input"
          />
          <span className="sound-consent-popup__remember-label">Remember my choice</span>
        </label>
      </div>
    </div>
  );
}
