import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CREDITS_VIDEO_SOURCES } from './creditsAssetPaths';
import './Credits.css';

const EXIT_FADE_MS = 420;

const creditsVideoUrl = CREDITS_VIDEO_SOURCES[0];
let creditsVideoPreloader: HTMLVideoElement | null = null;

function ensureCreditsVideoPreload() {
  if (creditsVideoPreloader != null || typeof document === 'undefined' || !creditsVideoUrl) {
    return;
  }

  const existingPreloader = document.querySelector<HTMLVideoElement>('video[data-credits-preload="true"]');
  if (existingPreloader != null) {
    creditsVideoPreloader = existingPreloader;
    return;
  }

  const preloadVideo = document.createElement('video');
  preloadVideo.preload = 'auto';
  preloadVideo.muted = true;
  preloadVideo.playsInline = true;
  preloadVideo.src = creditsVideoUrl;
  preloadVideo.setAttribute('data-credits-preload', 'true');
  preloadVideo.setAttribute('aria-hidden', 'true');
  preloadVideo.style.display = 'none';
  document.body.appendChild(preloadVideo);
  creditsVideoPreloader = preloadVideo;
}

ensureCreditsVideoPreload();

export default function Credits() {
  const navigate = useNavigate();
  const exitTimeoutRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const onExit = useCallback(() => {
    if (isExiting) {
      return;
    }

    setIsExiting(true);
    videoRef.current?.pause();
    exitTimeoutRef.current = window.setTimeout(() => {
      navigate('/');
    }, EXIT_FADE_MS);
  }, [isExiting, navigate]);

  useEffect(() => {
    ensureCreditsVideoPreload();

    const video = videoRef.current;
    if (video == null) {
      return;
    }

    video.defaultMuted = false;
    video.muted = false;

    void video.play().catch(async () => {
      // Some browsers reject autoplay once the route has mounted outside the
      // original click gesture. Fall back to muted playback so the credits
      // still start instantly instead of waiting for a second tap.
      video.defaultMuted = true;
      video.muted = true;
      await video.play().catch(() => {});
    });

    return () => {
      video.pause();
    };
  }, []);

  useEffect(() => () => {
    if (exitTimeoutRef.current != null) {
      window.clearTimeout(exitTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onExit();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onExit]);

  return (
    <div className={`credits-container${isExiting ? ' is-exiting' : ''}`}>
      <div
        className="credits-stage"
        role="button"
        tabIndex={0}
        aria-label="Tap to exit credits"
        onClick={onExit}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onExit();
          }
        }}
      >
        <video
          ref={videoRef}
          className="credits-video"
          aria-label="Credits video"
          src={creditsVideoUrl}
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          onEnded={onExit}
        />
      </div>
    </div>
  );
}
