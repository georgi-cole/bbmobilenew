import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CREDITS_POSTER_SOURCE, CREDITS_VIDEO_SOURCES } from './creditsAssetPaths';
import './Credits.css';

function getPosterSourceForVideo(videoSource: string) {
  if (!videoSource) {
    return CREDITS_POSTER_SOURCE;
  }

  const normalizedPosterSource = CREDITS_POSTER_SOURCE.split(/[?#]/, 1)[0];
  const posterFileName = normalizedPosterSource.slice(normalizedPosterSource.lastIndexOf('/') + 1);

  if (!posterFileName) {
    return CREDITS_POSTER_SOURCE;
  }

  const sourcePath = videoSource.split(/[?#]/, 1)[0];
  const lastSlashIndex = sourcePath.lastIndexOf('/');

  if (lastSlashIndex < 0) {
    return CREDITS_POSTER_SOURCE;
  }

  return `${sourcePath.slice(0, lastSlashIndex + 1)}${posterFileName}`;
}

export default function Credits() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const navigate = useNavigate();
  const videoSources = useMemo(() => CREDITS_VIDEO_SOURCES, []);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentSource = videoSources[sourceIndex] ?? videoSources[videoSources.length - 1] ?? '';
  const posterSource = useMemo(() => getPosterSourceForVideo(currentSource), [currentSource]);

  function onDone() {
    navigate('/');
  }

  function onVideoReady() {
    setStatus('ready');
    setErrorMessage(null);
  }

  function onVideoError() {
    const attemptedSource = currentSource;
    const nextSource = videoSources[sourceIndex + 1];

    if (nextSource) {
      console.error('[Credits] Failed to load video source, retrying fallback source.', {
        attemptedSource,
        nextSource,
      });
      setStatus('loading');
      setErrorMessage('Retrying video load…');
      setSourceIndex((index) => index + 1);
      return;
    }

    console.error('[Credits] Failed to load credits video.', {
      attemptedSource,
      candidates: videoSources,
    });
    setStatus('error');
    setErrorMessage('Credits video could not be loaded on this device. You can retry or skip.');
  }

  function onRetry() {
    setStatus('loading');
    setErrorMessage(null);
    setSourceIndex(0);
    setReloadKey((key) => key + 1);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDone();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentSource) {
      return;
    }

    console.error('[Credits] No video source candidates available.');
    setStatus('error');
    setErrorMessage('Credits video source is unavailable. You can retry or skip.');
  }, [currentSource]);

  return (
    <div className="credits-container">
      <div className="credits-player" data-status={status}>
        <video
          key={`${currentSource}-${reloadKey}`}
          ref={videoRef}
          className="credits-video"
          src={currentSource}
          poster={posterSource}
          autoPlay
          muted
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={onVideoReady}
          onEnded={onDone}
          onError={onVideoError}
        />
        {status !== 'ready' ? (
          <div className="credits-overlay" role={status === 'error' ? 'alert' : 'status'}>
            <span>{errorMessage ?? 'Loading credits…'}</span>
            {status === 'error' ? (
              <button className="credits-retry" onClick={onRetry}>
                Retry video
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
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
