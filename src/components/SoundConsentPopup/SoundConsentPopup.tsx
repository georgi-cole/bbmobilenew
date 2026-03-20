import { useState } from 'react';
import './SoundConsentPopup.css';

export const HUB_MUSIC_CONSENT_KEY = 'bb:hubMusicConsent';

export interface SoundConsentPopupProps {
  onEnable: () => void;
  onDismiss: () => void;
}

export default function SoundConsentPopup({ onEnable, onDismiss }: SoundConsentPopupProps) {
  const [remember, setRemember] = useState(false);

  const handleEnable = () => {
    if (remember) {
      try {
        localStorage.setItem(HUB_MUSIC_CONSENT_KEY, 'granted');
      } catch {
        // localStorage unavailable — ignore and keep this session only
      }
    }
    onEnable();
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
            onClick={onDismiss}
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
