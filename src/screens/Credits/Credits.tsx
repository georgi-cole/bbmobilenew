import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CREDITS_VIDEO_SOURCES } from './creditsAssetPaths';
import './Credits.css';

const EXIT_FADE_MS = 420;

const creditsVideoUrl = CREDITS_VIDEO_SOURCES[0];
let hasPreloadedCreditsVideo = false;

function ensureCreditsVideoPreload() {
  if (hasPreloadedCreditsVideo || typeof document === 'undefined' || !creditsVideoUrl) {
    return;
  }

  const existingPreload = document.querySelector<HTMLLinkElement>(
    `link[rel="preload"][href="${creditsVideoUrl}"]`,
  );
  if (existingPreload != null) {
    hasPreloadedCreditsVideo = true;
    return;
  }

  const preloadLink = document.createElement('link');
  preloadLink.rel = 'preload';
  preloadLink.as = 'fetch';
  preloadLink.href = creditsVideoUrl;
  document.head.appendChild(preloadLink);
  hasPreloadedCreditsVideo = true;
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
