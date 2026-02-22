import { useState, useEffect } from 'react';
import type { Player } from '../../types';
import { resolveAvatar, getDicebear } from '../../utils/avatar';
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
 */
export default function EvictionSplash({ evictee, onDone, duration = 3200 }: Props) {
  const [avatarSrc, setAvatarSrc] = useState(() => resolveAvatar(evictee));
  const [showFallback, setShowFallback] = useState(false);
  const [greyscale, setGreyscale] = useState(false);

  // Start colour→B&W transition halfway through the duration
  useEffect(() => {
    const halfId = setTimeout(() => setGreyscale(true), duration / 2);
    const doneId = setTimeout(onDone, duration);
    return () => {
      clearTimeout(halfId);
      clearTimeout(doneId);
    };
  }, [duration, onDone]);

  function handleImgError() {
    const dicebear = getDicebear(evictee.name);
    if (avatarSrc !== dicebear) {
      setAvatarSrc(dicebear);
    } else {
      setShowFallback(true);
    }
  }

  return (
    <div
      className="eviction-splash"
      role="dialog"
      aria-modal="true"
      aria-label={`${evictee.name} has been evicted`}
      onClick={onDone}
    >
      <div className="eviction-splash__overlay" />

      <div className={`eviction-splash__photo-wrap${greyscale ? ' eviction-splash__photo-wrap--bw' : ''}`}>
        {showFallback ? (
          <span className="eviction-splash__fallback" aria-hidden="true">
            {evictee.avatar}
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
