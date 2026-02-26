/**
 * AssetPreloaderOverlay — shown while gameplay assets are being preloaded.
 *
 * Displayed when the user presses "Play". Preloads the gameplay background
 * and all houseguest avatar images using the same paths the game UI will
 * later request, then navigates to /game.
 *
 * Error/timeout cases are treated as done so the overlay never stalls.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { preloadImages } from '../../utils/preload';
import { resolveAvatar } from '../../utils/avatar';
import { getAll } from '../../data/houseguests';
import './AssetPreloaderOverlay.css';

/** Path for the gameplay background image. */
const GAMEPLAY_BG = '/assets/bb-gameplay-bg.svg';

/** Collect all URLs to preload: gameplay bg + every houseguest avatar. */
function getPreloadUrls(): string[] {
  const urls: string[] = [GAMEPLAY_BG];
  for (const hg of getAll()) {
    urls.push(resolveAvatar({ id: hg.id, name: hg.name, avatar: '' }));
  }
  return urls;
}

export default function AssetPreloaderOverlay() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0); // 0–100
  const doneFiredRef = useRef(false);

  useEffect(() => {
    const urls = getPreloadUrls();

    preloadImages(
      urls,
      (loaded, total) => {
        setProgress(total > 0 ? Math.round((loaded / total) * 100) : 100);
      },
    ).then(() => {
      if (doneFiredRef.current) return;
      doneFiredRef.current = true;
      navigate('/game');
    });
  }, [navigate]);

  return (
    <div
      className="asset-preloader-overlay"
      role="status"
      aria-live="polite"
      aria-label={`Loading game assets… ${progress}%`}
    >
      <div className="asset-preloader-overlay__inner">
        <p className="asset-preloader-overlay__label">Loading…</p>
        <div
          className="asset-preloader-overlay__bar-track"
          aria-hidden="true"
        >
          <div
            className="asset-preloader-overlay__bar-fill"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="asset-preloader-overlay__pct" aria-hidden="true">
          {progress}%
        </p>
      </div>
    </div>
  );
}
