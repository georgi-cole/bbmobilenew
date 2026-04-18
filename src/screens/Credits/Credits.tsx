import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import creditsData from '../../data/credits';
import CreditsScene from './CreditsScene';
import './Credits.css';

const EXIT_FADE_MS = 420;

type Status = 'loading' | 'ready' | 'error';

export default function Credits() {
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const exitTimeoutRef = useRef<number | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  const credits = useMemo(
    () => [
      ...creditsData.map(({ role, name }) => `${role}\n${name}`),
      'The Big Eye\nThanks for playing',
    ],
    [],
  );

  const onExit = useCallback(() => {
    if (isExiting) {
      return;
    }

    setIsExiting(true);
    exitTimeoutRef.current = window.setTimeout(() => {
      navigate('/');
    }, EXIT_FADE_MS);
  }, [isExiting, navigate]);

  const onRetry = useCallback(() => {
    setIsExiting(false);
    setStatus('loading');
    setErrorMessage(null);
    setReloadKey((value) => value + 1);
  }, []);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) {
      return undefined;
    }

    let cancelled = false;
    const scene = new CreditsScene({ host, credits });

    void scene.init().then(() => {
      if (cancelled) {
        return;
      }

      setStatus('ready');
    }).catch((error) => {
      if (cancelled) {
        return;
      }

      console.error('[CreditsScene] canvas init error', {
        message: error instanceof Error ? error.message : String(error),
      });
      setStatus('error');
      setErrorMessage('Credits unavailable on this device. You can retry or go back.');
    });

    return () => {
      cancelled = true;
      scene.destroy();
    };
  }, [credits, reloadKey]);

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
        ref={hostRef}
        className="credits-stage"
        data-status={status}
        aria-label={status === 'ready' ? 'Tap to exit credits' : 'Animated credits scene'}
        role={status === 'ready' ? 'button' : 'img'}
        tabIndex={status === 'ready' ? 0 : -1}
        onClick={status === 'ready' ? onExit : undefined}
        onKeyDown={status === 'ready' ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onExit();
          }
        } : undefined}
      />
      {status !== 'ready' ? (
        <div className="credits-overlay" role={status === 'error' ? 'alert' : 'status'}>
          <span>{errorMessage ?? 'Loading credits…'}</span>
          {status === 'error' ? (
            <div className="credits-actions">
              <button className="credits-action" onClick={onRetry} type="button">
                Retry scene
              </button>
              <button className="credits-action" onClick={onExit} type="button">
                Back to home
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
