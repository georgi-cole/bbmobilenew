import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './KolequantSplash.css';

interface Props {
  /** Minimum visible time in ms before the splash may exit. */
  duration?: number;
  /** Keeps the splash visible until the caller's preload work is complete. */
  ready?: boolean;
  progress?: number;
  status?: string;
  messages?: readonly string[];
  onFinish?: () => void;
}

const LOGO_SRC = `${import.meta.env.BASE_URL}assets/kolequant.png`;
const EXIT_MS = 360;

const DEFAULT_MESSAGES = [
  'Starting the Kolequant engine.',
  'Mapping today\'s strategy board.',
  'Calibrating the signal.',
  'Warming up the challenge floor.',
  'Stacking the social energy chips.',
  'Calling the camera drone into position.',
  'Preparing the live floor.',
] as const;

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function KolequantSplash({
  duration = 2200,
  ready = true,
  progress = 0,
  status,
  messages = DEFAULT_MESSAGES,
  onFinish,
}: Props) {
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const exitStartedRef = useRef(false);
  const clampedProgress = clampProgress(progress);
  const activeMessages = useMemo(
    () => (messages.length > 0 ? messages : DEFAULT_MESSAGES),
    [messages],
  );
  const progressLabel = status ?? activeMessages[messageIndex];

  useEffect(() => {
    exitStartedRef.current = false;
    const timer = window.setTimeout(() => setMinimumElapsed(true), duration);
    return () => window.clearTimeout(timer);
  }, [duration]);

  useEffect(() => {
    if (activeMessages.length <= 1 || exiting) return;
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % activeMessages.length);
    }, 1350);
    return () => window.clearInterval(timer);
  }, [activeMessages.length, exiting]);

  useEffect(() => {
    if (!ready || !minimumElapsed || exitStartedRef.current) return;

    exitStartedRef.current = true;
    let finishTimer: number | undefined;
    const exitTimer = window.setTimeout(() => {
      setExiting(true);
      finishTimer = window.setTimeout(() => onFinish?.(), EXIT_MS);
    }, 0);

    return () => {
      window.clearTimeout(exitTimer);
      if (finishTimer != null) {
        window.clearTimeout(finishTimer);
      }
    };
  }, [minimumElapsed, onFinish, ready]);

  const splashStyle = {
    '--kq-splash-min-duration': `${duration}ms`,
    '--kq-splash-progress': `${clampedProgress}%`,
  } as CSSProperties;
  const className = `kq-splash${exiting ? ' kq-splash--exiting' : ''}`;

  return (
    <div
      className={className}
      style={splashStyle}
      role="status"
      aria-live="polite"
      aria-label={`${progressLabel} ${clampedProgress}%`}
    >
      <div className="kq-splash__skyline" aria-hidden="true" />
      <div className="kq-splash__logo-wrap">
        <img
          src={LOGO_SRC}
          alt="Kolequant"
          className="kq-splash__logo"
          draggable={false}
          decoding="async"
        />
        <img
          src={LOGO_SRC}
          alt=""
          className="kq-splash__dna-glow"
          draggable={false}
          aria-hidden="true"
        />
      </div>
      <div className="kq-splash__preload" aria-hidden="true">
        <div className="kq-splash__preload-row">
          <span>{activeMessages[messageIndex]}</span>
          <span>{clampedProgress}%</span>
        </div>
        <div className="kq-splash__bar-track">
          <div className="kq-splash__bar-fill" />
        </div>
      </div>
      <div className="kq-splash__copyright">© 2026</div>
    </div>
  );
}
