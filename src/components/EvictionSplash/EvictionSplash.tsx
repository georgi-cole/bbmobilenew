import { useState, useEffect, useRef } from 'react';
import type { Player } from '../../types';
import { resolveAvatar, getDicebear, isEmoji } from '../../utils/avatar';
import './EvictionSplash.css';

interface Props {
  evictee: Player;
  /** Called when the animation completes and the user taps to continue */
  onDone: () => void;
  /** Total animation duration in ms. Default: 3200 */
  duration?: number;
}

/**
 * EvictionSplash — cinematic eviction animation.
 *
 * Plays a two-phase full-screen sequence:
 *  1. Color: the evictee's photo fills the screen at full color
 *  2. Greyscale: CSS filter transition fades the image to black-and-white
 *     over the second half of `duration`, symbolising their eviction
 *
 * Automatically calls onDone after `duration` ms. Tappable to skip.
 * onDone is guarded internally — it fires at most once.
 */
export default function EvictionSplash({ evictee, onDone, duration = 3200 }: Props) {
  const [avatarSrc, setAvatarSrc] = useState(() => resolveAvatar(evictee));
  const [showFallback, setShowFallback] = useState(false);
  const [greyscale, setGreyscale] = useState(false);
  const firedRef = useRef(false);

  function fire() {
    if (firedRef.current) return;
    firedRef.current = true;
    onDone();
  }

  // Start colour→B&W transition halfway through the duration; call onDone at the end.
  // Timers are cleared on unmount or when the user taps to skip.
  useEffect(() => {
    const halfId = setTimeout(() => setGreyscale(true), duration / 2);
    const doneId = setTimeout(fire, duration);
    return () => {
      clearTimeout(halfId);
      clearTimeout(doneId);
    };
    // fire is stable within this render; eslint-disable below is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  function handleImgError() {
    const dicebear = getDicebear(evictee.name);
    if (avatarSrc !== dicebear) {
      setAvatarSrc(dicebear);
    } else {
      setShowFallback(true);
    }
  }

  const fallbackText = isEmoji(evictee.avatar ?? '')
    ? evictee.avatar
    : evictee.name.charAt(0).toUpperCase();

  return (
    <div
      className="eviction-splash"
      role="dialog"
      aria-modal="true"
      aria-label={`${evictee.name} has been evicted`}
      onClick={fire}
    >
      <div className="eviction-splash__overlay" />

      <div className={`eviction-splash__photo-wrap${greyscale ? ' eviction-splash__photo-wrap--bw' : ''}`}>
        {showFallback ? (
          <span className="eviction-splash__fallback" aria-hidden="true">
            {fallbackText}
          </span>
        ) : (
          <img
            className="eviction-splash__photo"
            src={avatarSrc}
            alt={evictee.name}
            onError={handleImgError}
          />
        )}
      </div>

      <div className="eviction-splash__content">
        <p className="eviction-splash__label">EVICTED</p>
        <h1 className="eviction-splash__name">{evictee.name}</h1>
        <p className="eviction-splash__goodbye">Goodbye from the Big Brother house 🚪</p>
        <p className="eviction-splash__skip">tap to continue</p>
      </div>
    </div>
  );
}
