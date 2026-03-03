/**
 * PermissionPrompts — pretty modal chips for location and sound permissions.
 *
 * Shown while the intro splash is visible, before the main UI is revealed.
 * Decisions are optionally persisted to localStorage so they are not shown
 * again on subsequent visits.
 *
 * localStorage keys:
 *   'bb:allowLocation'  → 'granted' | 'denied'
 *   'bb:enableSound'    → 'granted' | 'denied'
 */

import { useCallback, useEffect, useState } from 'react';
import './PermissionPrompts.css';

export type PermissionValue = 'granted' | 'denied' | 'skipped';

export interface PermissionChoices {
  location: PermissionValue;
  sound: PermissionValue;
}

export interface PermissionPromptsProps {
  /** Called once all permissions have been resolved. */
  onComplete?: (choices: PermissionChoices) => void;
  /**
   * Whether to show the sound permission prompt.
   * Set to false on HomeHub so the sound prompt never appears there;
   * sound is handled instead as part of the Play gesture.
   * Defaults to true.
   */
  showSoundPrompt?: boolean;
}

const LS_LOCATION = 'bb:allowLocation';
const LS_SOUND = 'bb:enableSound';

/** Warm up geolocation permission silently after user grants it. */
function warmLocation(): void {
  try {
    navigator.geolocation?.getCurrentPosition(
      () => {},
      () => {},
      { timeout: 5_000 },
    );
  } catch {
    // geolocation unavailable — ignore
  }
}

/** Warm up audio context after user grants sound (respects browser autoplay policy). */
function warmSound(): void {
  try {
    const ctx = new AudioContext();
    // Immediately suspend and close — we just want to initialise the context
    // after an explicit user gesture so the browser unlocks audio later.
    void ctx.resume().finally(() => ctx.close());
  } catch {
    // AudioContext unavailable — ignore
  }
}

interface SinglePromptProps {
  icon: string;
  title: string;
  description: string;
  remember: boolean;
  onRememberChange: (v: boolean) => void;
  onAllow: () => void;
  onDeny: () => void;
}

function SinglePrompt({
  icon,
  title,
  description,
  remember,
  onRememberChange,
  onAllow,
  onDeny,
}: SinglePromptProps) {
  const rememberCheckId = `perm-remember-${title.replace(/\s+/g, '-').toLowerCase()}`;
  const titleId = rememberCheckId.replace('remember', 'title');
  return (
    <div className="perm-prompt__card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="perm-prompt__icon" aria-hidden="true">{icon}</div>
      <h2 id={titleId} className="perm-prompt__title">{title}</h2>
      <p className="perm-prompt__desc">{description}</p>
      <div className="perm-prompt__actions">
        <button
          type="button"
          className="perm-prompt__btn perm-prompt__btn--allow"
          onClick={onAllow}
        >
          Allow
        </button>
        <button
          type="button"
          className="perm-prompt__btn perm-prompt__btn--deny"
          onClick={onDeny}
        >
          Deny
        </button>
      </div>
      <label className="perm-prompt__remember" htmlFor={rememberCheckId}>
        <input
          id={rememberCheckId}
          type="checkbox"
          checked={remember}
          onChange={(e) => onRememberChange(e.target.checked)}
          className="perm-prompt__remember-input"
        />
        <span className="perm-prompt__remember-label">Remember my choice</span>
      </label>
    </div>
  );
}

type Step = 'location' | 'sound' | 'done';

export default function PermissionPrompts({ onComplete, showSoundPrompt = true }: PermissionPromptsProps) {
  const [step, setStep] = useState<Step>(() => {
    const locStored = localStorage.getItem(LS_LOCATION) as PermissionValue | null;
    const sndStored = localStorage.getItem(LS_SOUND) as PermissionValue | null;
    if (!locStored) return 'location';
    // Skip sound step if showSoundPrompt is false or sound already stored.
    if (!showSoundPrompt || sndStored) return 'done';
    return 'sound';
  });

  const [choices, setChoices] = useState<Partial<PermissionChoices>>(() => {
    const result: Partial<PermissionChoices> = {};
    const loc = localStorage.getItem(LS_LOCATION) as PermissionValue | null;
    const snd = localStorage.getItem(LS_SOUND) as PermissionValue | null;
    if (loc) result.location = loc;
    if (snd) result.sound = snd;
    return result;
  });

  const [rememberLocation, setRememberLocation] = useState(false);
  const [rememberSound, setRememberSound] = useState(false);

  // If both already resolved from localStorage (or sound is skipped), fire onComplete immediately.
  useEffect(() => {
    if (step === 'done' && choices.location) {
      onComplete?.({
        location: choices.location,
        sound: showSoundPrompt ? (choices.sound ?? 'skipped') : 'skipped',
      });
    }
  // Only run on mount (step/choices are initialised synchronously above).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decideLocation = useCallback(
    (value: PermissionValue) => {
      if (rememberLocation) localStorage.setItem(LS_LOCATION, value);
      if (value === 'granted') warmLocation();
      const next = { ...choices, location: value };
      setChoices(next);
      if (!showSoundPrompt) {
        // Sound prompt disabled — resolve immediately with sound skipped.
        setStep('done');
        onComplete?.({ location: value, sound: 'skipped' });
      } else {
        setStep('sound');
      }
    },
    [choices, rememberLocation, showSoundPrompt, onComplete],
  );

  const decideSound = useCallback(
    (value: PermissionValue) => {
      if (rememberSound) localStorage.setItem(LS_SOUND, value);
      if (value === 'granted') warmSound();
      const next = { ...choices, sound: value } as PermissionChoices;
      setChoices(next);
      setStep('done');
      onComplete?.(next);
    },
    [choices, rememberSound, onComplete],
  );

  if (step === 'done') return null;

  return (
    <div className="perm-prompts" role="region" aria-label="Permission requests">
      {step === 'location' && (
        <SinglePrompt
          icon="📍"
          title="Allow location"
          description="Used to personalise your experience. We never share your location."
          remember={rememberLocation}
          onRememberChange={setRememberLocation}
          onAllow={() => decideLocation('granted')}
          onDeny={() => decideLocation('denied')}
        />
      )}
      {step === 'sound' && (
        <SinglePrompt
          icon="🔊"
          title="Enable sound"
          description="Plays music and effects during the game. You can change this in Settings."
          remember={rememberSound}
          onRememberChange={setRememberSound}
          onAllow={() => decideSound('granted')}
          onDeny={() => decideSound('denied')}
        />
      )}
    </div>
  );
}
