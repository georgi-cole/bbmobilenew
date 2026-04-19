import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import creditsData from '../../data/credits';
import { buildCreditsAssetCandidates } from './creditsAssetPaths';
import './Credits.css';

const EXIT_FADE_MS = 420;

export default function Credits() {
  const navigate = useNavigate();
  const exitTimeoutRef = useRef<number | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  const backgroundImageUrl = buildCreditsAssetCandidates('assets/credits/credits-background.png')[0];

  const onExit = useCallback(() => {
    if (isExiting) {
      return;
    }

    setIsExiting(true);
    exitTimeoutRef.current = window.setTimeout(() => {
      navigate('/');
    }, EXIT_FADE_MS);
  }, [isExiting, navigate]);

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
        style={{ backgroundImage: `url("${backgroundImageUrl}")` }}
      >
        <div className="credits-copy" aria-label="Credits">
          {creditsData.map((credit, index) => (
            <p key={`${index}-${credit}`} className="credits-copy-item">
              {credit}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
