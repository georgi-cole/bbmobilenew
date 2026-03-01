/**
 * AssetPreloaderOverlay — shown while gameplay assets are being preloaded.
 *
 * Displayed when the user presses "Play". Preloads the gameplay background
 * and all houseguest avatar images using the same paths the game UI will
 * later request, then navigates to /game.
 *
 * IMPORTANT — background-first ordering:
 *   The gameplay background is requested first (awaited before avatars) so
 *   the game UI never renders naked buttons over an empty background.
 *   Only after the background resolves do we kick off the avatar preloads.
 *
 * Error/timeout cases are treated as done so the overlay never stalls.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { preloadImage, preloadImages } from '../../utils/preload';
import { resolveAvatar } from '../../utils/avatar';
import { getAll } from '../../data/houseguests';
import './AssetPreloaderOverlay.css';

/** Path for the gameplay background image. */
const GAMEPLAY_BG = '/assets/bb-gameplay-bg.svg';

/** Collect avatar URLs (without the background — that's preloaded first). */
function getAvatarUrls(): string[] {
  return getAll().map((hg) =>
    resolveAvatar({ id: hg.id, name: hg.name, avatar: '' }),
  );
}

export default function AssetPreloaderOverlay() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0); // 0–100
  const doneFiredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Step 1 — background first: await it before loading anything else so
      // the game UI will never show buttons over an empty background.
      await preloadImage(GAMEPLAY_BG);
      if (cancelled) return;

      // Progress after background loaded (counts as 1 of total = 1 + avatars).
      const avatarUrls = getAvatarUrls();
      const total = 1 + avatarUrls.length;
      let loaded = 1; // background already done
      setProgress(total > 0 ? Math.round((loaded / total) * 100) : 100);

      // Step 2 — avatars: preload concurrently now that background is ready.
      await preloadImages(avatarUrls, (avatarLoaded) => {
        loaded = 1 + avatarLoaded;
        setProgress(Math.round((loaded / total) * 100));
      });

      if (cancelled) return;
      if (doneFiredRef.current) return;
      doneFiredRef.current = true;
      navigate('/game');
    }

    void run();
    return () => {
      cancelled = true;
    };
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
