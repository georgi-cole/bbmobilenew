import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import creditsData from '../../data/credits';
import { createCinematicAudio } from '../../services/sound/cinematicAudio';
import { buildCreditsAssetCandidates } from './creditsAssetPaths';
import './Credits.css';

const EXIT_FADE_MS = 420;
const CREDITS_TOTAL_MS = 19_600;
const CREDIT_CYCLE_MS = creditsData.length > 0 ? Math.floor(CREDITS_TOTAL_MS / creditsData.length) : CREDITS_TOTAL_MS;

export default function Credits() {
  const navigate = useNavigate();
  const advanceTimeoutRef = useRef<number | null>(null);
  const autoExitTimeoutRef = useRef<number | null>(null);
  const exitTimeoutRef = useRef<number | null>(null);
  const audioRef = useRef<ReturnType<typeof createCinematicAudio> | null>(null);
  const [activeCreditIndex, setActiveCreditIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  const backgroundImageUrl = buildCreditsAssetCandidates('assets/credits/credits-background.png')[0];
  const currentCredit = creditsData[activeCreditIndex] ?? creditsData[0] ?? '';

  const onExit = useCallback(() => {
    if (isExiting) {
      return;
    }

    if (advanceTimeoutRef.current != null) {
      window.clearTimeout(advanceTimeoutRef.current);
    }
    if (autoExitTimeoutRef.current != null) {
      window.clearTimeout(autoExitTimeoutRef.current);
    }

    setIsExiting(true);
    audioRef.current?.fadeOutAndStop(EXIT_FADE_MS);
    exitTimeoutRef.current = window.setTimeout(() => {
      navigate('/');
    }, EXIT_FADE_MS);
  }, [isExiting, navigate]);

  useEffect(() => {
    const audio = createCinematicAudio(`${import.meta.env.BASE_URL}assets/sounds/credits_sound.mp3`);
    audioRef.current = audio;
    audio.play();

    return () => {
      audioRef.current = null;
      audio.dispose();
    };
  }, []);

  useEffect(() => {
    if (isExiting || activeCreditIndex >= creditsData.length - 1) {
      return;
    }

    advanceTimeoutRef.current = window.setTimeout(() => {
      setActiveCreditIndex((current) => Math.min(current + 1, creditsData.length - 1));
    }, CREDIT_CYCLE_MS);

    return () => {
      if (advanceTimeoutRef.current != null) {
        window.clearTimeout(advanceTimeoutRef.current);
      }
    };
  }, [activeCreditIndex, isExiting]);

  useEffect(() => {
    if (isExiting) {
      return;
    }

    autoExitTimeoutRef.current = window.setTimeout(() => {
      onExit();
    }, CREDITS_TOTAL_MS);

    return () => {
      if (autoExitTimeoutRef.current != null) {
        window.clearTimeout(autoExitTimeoutRef.current);
      }
    };
  }, [isExiting, onExit]);

  useEffect(() => () => {
    if (advanceTimeoutRef.current != null) {
      window.clearTimeout(advanceTimeoutRef.current);
    }
    if (autoExitTimeoutRef.current != null) {
      window.clearTimeout(autoExitTimeoutRef.current);
    }
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
          <p key={`${activeCreditIndex}-${currentCredit}`} className="credits-copy-item">
            {currentCredit}
          </p>
        </div>
      </div>
    </div>
  );
}
