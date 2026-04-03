import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CREDITS_POSTER_SOURCES, CREDITS_VIDEO_SOURCES } from './creditsAssetPaths';
import './Credits.css';

export default function Credits() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const navigate = useNavigate();
  const [sourceIndex, setSourceIndex] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSoundPrompt, setShowSoundPrompt] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const currentSource = CREDITS_VIDEO_SOURCES[sourceIndex] ?? CREDITS_VIDEO_SOURCES[CREDITS_VIDEO_SOURCES.length - 1] ?? '';
  const posterSource = CREDITS_POSTER_SOURCES[sourceIndex] ?? CREDITS_POSTER_SOURCES[CREDITS_POSTER_SOURCES.length - 1] ?? '';

  function onDone() {
    navigate('/');
  }

  /**
   * Starts credits playback in the most permissive mode for mobile browsers/WebViews:
   * muted autoplay first, then optional user-initiated unmute to restore sound.
   */
  async function tryStartPlayback(options?: { unmute?: boolean }) {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const { unmute = false } = options ?? {};
    video.muted = !unmute;

    try {
      await video.play();

      if (unmute) {
        setSoundEnabled(true);
        setShowSoundPrompt(false);
        return;
      }

      setShowSoundPrompt(true);
    } catch (error) {
      video.muted = true;
      setSoundEnabled(false);
      console.warn('[Credits] Playback requires user interaction.', {
        attemptedSource: currentSource,
        error: error instanceof Error ? error.message : String(error),
      });
      setShowSoundPrompt(true);
    }
  }

  function onVideoReady() {
    setStatus('ready');
    setErrorMessage(null);
    void tryStartPlayback();
  }

  function onVideoError() {
    const attemptedSource = currentSource;
    const nextSource = CREDITS_VIDEO_SOURCES[sourceIndex + 1];

    if (nextSource) {
      console.warn('[Credits] Failed to load video source, retrying fallback source.', {
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
      candidates: CREDITS_VIDEO_SOURCES,
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

  function onEnableSound() {
    void tryStartPlayback({ unmute: true });
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

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = true;
    }
    setShowSoundPrompt(false);
    setSoundEnabled(false);
  }, [currentSource, reloadKey]);

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
          muted={!soundEnabled}
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
        {status === 'ready' && showSoundPrompt && !soundEnabled ? (
          <button className="credits-sound-toggle" onClick={onEnableSound} type="button">
            Tap for sound
          </button>
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
