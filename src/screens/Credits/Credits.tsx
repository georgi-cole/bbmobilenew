/**
 * Credits.tsx
 *
 * Plays the end-credits video (public/assets/endcredtiskq.mp4).
 * Navigates back to '/' when the video ends or the user presses Skip / Esc.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Credits.css';

export default function Credits() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const navigate = useNavigate();

  function onDone() {
    navigate('/');
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDone();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="credits-container">
      <video
        ref={videoRef}
        className="credits-video"
        src="/assets/endcredtiskq.mp4"
        autoPlay
        playsInline
        onEnded={onDone}
      />
      <button
        className="credits-skip"
        onClick={onDone}
        aria-label="Skip credits (Esc)"
      >
        Skip
      </button>
    </div>
  );
}