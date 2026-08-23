import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { TwinShockRevealAnimation } from '../../types';
import { SoundManager } from '../../services/sound/SoundManager';
import {
  createCinematicAudio,
  type CinematicAudioController,
} from '../../services/sound/cinematicAudio';
import './TwinShockIntroCinematic.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
export const TWIN_SHOCK_INTRO_DURATION_MS = 16_200;
const REDUCED_DURATION_MS = 6_200;
const CINEMATIC_FADE_OUT_MS = 1_200;
const SKIP_FADE_OUT_MS = 420;

type CinematicStage = 'signal' | 'childhood' | 'grown' | 'reveal' | 'verdict';

interface TwinShockIntroCinematicProps {
  reveal: TwinShockRevealAnimation;
  onComplete: () => void;
}

interface IntroHubAudioWindow extends Window {
  _introhubMusicOn?: boolean;
}

function asset(path: string): string {
  return `${BASE}${path}`;
}

function stageAt(elapsedMs: number, reducedMotion: boolean): CinematicStage {
  if (reducedMotion) {
    if (elapsedMs < 500) return 'signal';
    if (elapsedMs < 1_300) return 'childhood';
    if (elapsedMs < 2_100) return 'grown';
    if (elapsedMs < 3_000) return 'reveal';
    return 'verdict';
  }
  if (elapsedMs < 1_400) return 'signal';
  if (elapsedMs < 4_200) return 'childhood';
  if (elapsedMs < 7_100) return 'grown';
  if (elapsedMs < 10_800) return 'reveal';
  return 'verdict';
}

export default function TwinShockIntroCinematic({
  reveal,
  onComplete,
}: TwinShockIntroCinematicProps) {
  const prefersReducedMotion = useReducedMotion() ?? false;
  const durationMs = prefersReducedMotion ? REDUCED_DURATION_MS : TWIN_SHOCK_INTRO_DURATION_MS;
  const [elapsedMs, setElapsedMs] = useState(0);
  const onCompleteRef = useRef(onComplete);
  const completedRef = useRef(false);
  const fadeStartedRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
  const audioRef = useRef<CinematicAudioController | null>(null);
  const skipRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current();
  }, []);

  const skip = useCallback(() => {
    if (completedRef.current || completionTimerRef.current != null) return;
    fadeStartedRef.current = true;
    audioRef.current?.fadeOutAndStop(SKIP_FADE_OUT_MS);
    completionTimerRef.current = window.setTimeout(complete, SKIP_FADE_OUT_MS);
  }, [complete]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skipRef.current?.focus();

    const audio = createCinematicAudio(asset('/assets/sounds/cinematic/Twin_shock_presentation.mp4'), 0.62);
    audioRef.current = audio;
    if ((window as IntroHubAudioWindow)._introhubMusicOn !== false) audio.play();

    const startedAt = performance.now();
    const intervalId = window.setInterval(() => {
      const nextElapsed = performance.now() - startedAt;
      setElapsedMs(Math.min(durationMs, nextElapsed));
      if (!fadeStartedRef.current && nextElapsed >= durationMs - CINEMATIC_FADE_OUT_MS) {
        fadeStartedRef.current = true;
        audio.fadeOutAndStop(CINEMATIC_FADE_OUT_MS);
      }
      if (nextElapsed >= durationMs) {
        window.clearInterval(intervalId);
        complete();
      }
    }, 60);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearInterval(intervalId);
      if (completionTimerRef.current != null) window.clearTimeout(completionTimerRef.current);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      audio.dispose();
      audioRef.current = null;
      void SoundManager.syncMusic();
    };
  }, [complete, durationMs, skip]);

  const stage = useMemo(
    () => stageAt(elapsedMs, prefersReducedMotion),
    [elapsedMs, prefersReducedMotion],
  );
  const progress = Math.min(1, elapsedMs / durationMs);
  const isAliEntering = reveal.type === 'ali_enters';

  return (
    <section
      className={`twin-intro twin-intro--${stage}${prefersReducedMotion ? ' twin-intro--reduced' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Lia and Ali Twin Shock introduction"
      data-stage={stage}
    >
      <div className="twin-intro__photo twin-intro__photo--childhood" aria-hidden="true" />
      <div className="twin-intro__photo twin-intro__photo--grown" aria-hidden="true" />
      <div className="twin-intro__photo twin-intro__photo--reveal" aria-hidden="true" />
      <div className="twin-intro__scan" aria-hidden="true" />
      <div className="twin-intro__grain" aria-hidden="true" />

      <button ref={skipRef} className="twin-intro__skip" type="button" onClick={skip}>
        Skip <span aria-hidden="true">×</span>
      </button>

      <div className="twin-intro__counter" aria-hidden="true">
        <span>Secret family archive</span>
        <strong>02 / 01</strong>
      </div>

      <div className="twin-intro__signal" aria-hidden={stage !== 'signal'}>
        <div className="twin-intro__eye"><span /></div>
        <p>House signal intercepted</p>
        <h2>Identity<br />breach</h2>
      </div>

      <div className="twin-intro__chapter twin-intro__chapter--childhood" aria-hidden={stage !== 'childhood'}>
        <span>Chapter one · The beginning</span>
        <h2>Double trouble<br />from day one.</h2>
        <p>Same birthday. Same smile. One very suspicious missing slice of cake.</p>
      </div>

      <div className="twin-intro__chapter twin-intro__chapter--grown" aria-hidden={stage !== 'grown'}>
        <span>Chapter two · Perfecting the act</span>
        <h2>They always knew<br />how to play it cool.</h2>
        <p>Almost always.</p>
      </div>

      <div className="twin-intro__chapter twin-intro__chapter--reveal" aria-hidden={stage !== 'reveal'}>
        <span>Twin Shock · Present day</span>
        <h2>Lia <i>&</i> Ali</h2>
        <div className="twin-intro__names" aria-label="Lia and Ali">
          <p><strong>Lia</strong><small>You knew her face.</small></p>
          <p><strong>Ali</strong><small>She was the other half of the game.</small></p>
        </div>
      </div>

      <div className="twin-intro__verdict" aria-hidden={stage !== 'verdict'}>
        <span>{isAliEntering ? 'Secret mission complete' : 'The secret was exposed'}</span>
        <h2>{isAliEntering ? 'Ali enters the House.' : 'Lia & Ali play as one.'}</h2>
        <p>One face. Two players. The House will never look at Lia the same way again.</p>
      </div>

      <div className="twin-intro__progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress})` }} />
      </div>
    </section>
  );
}
