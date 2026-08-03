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
const SKYLINE_SRC = `${import.meta.env.BASE_URL}assets/splash-city-skyline-photographic.png`;
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
  const [loadedArtwork, setLoadedArtwork] = useState(0);
  const onFinishRef = useRef(onFinish);
  const clampedProgress = clampProgress(progress);
  const activeMessages = useMemo(
    () => (messages.length > 0 ? messages : DEFAULT_MESSAGES),
    [messages],
  );
  const progressLabel = status ?? activeMessages[messageIndex];
  const artworkReady = loadedArtwork === 7;

  function markArtworkSettled(bit: number) {
    setLoadedArtwork((current) => current | bit);
  }

  function markArtworkDecoded(image: HTMLImageElement, bit: number) {
    if (typeof image.decode !== 'function') {
      markArtworkSettled(bit);
      return;
    }

    void image.decode().catch(() => undefined).then(() => markArtworkSettled(bit));
  }

  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    if (!artworkReady) return;
    setMinimumElapsed(false);
    const timer = window.setTimeout(() => setMinimumElapsed(true), duration);
    return () => window.clearTimeout(timer);
  }, [artworkReady, duration]);

  useEffect(() => {
    if (status || activeMessages.length <= 1 || exiting) return;
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % activeMessages.length);
    }, 1350);
    return () => window.clearInterval(timer);
  }, [activeMessages.length, exiting, status]);

  useEffect(() => {
    if (!ready || !artworkReady || !minimumElapsed || exiting) return;
    setExiting(true);
  }, [artworkReady, exiting, minimumElapsed, ready]);

  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => onFinishRef.current?.(), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [exiting]);

  const splashStyle = {
    '--kq-splash-min-duration': `${duration}ms`,
    '--kq-splash-progress': `${clampedProgress}%`,
  } as CSSProperties;
  const className = `kq-splash${artworkReady ? ' kq-splash--artwork-ready' : ''}${exiting ? ' kq-splash--exiting' : ''}`;

  return (
    <div
      className={className}
      style={splashStyle}
      role="status"
      aria-live="polite"
      aria-label={`${progressLabel} ${clampedProgress}%`}
    >
      <div className="kq-splash__composition">
        <div className="kq-splash__skyline" aria-hidden="true">
          <img
            src={SKYLINE_SRC}
            alt=""
            draggable={false}
            decoding="async"
            fetchPriority="high"
            onLoad={(event) => markArtworkDecoded(event.currentTarget, 1)}
            onError={() => markArtworkSettled(1)}
          />
        </div>
        <div className="kq-splash__logo-wrap">
          <img
            src={LOGO_SRC}
            alt="Kolequant"
            className="kq-splash__logo"
            draggable={false}
            decoding="async"
            fetchPriority="high"
            onLoad={(event) => markArtworkDecoded(event.currentTarget, 2)}
            onError={() => markArtworkSettled(2)}
          />
          <img
            src={LOGO_SRC}
            alt=""
            className="kq-splash__dna-glow"
            draggable={false}
            aria-hidden="true"
            decoding="async"
            onLoad={(event) => markArtworkDecoded(event.currentTarget, 4)}
            onError={() => markArtworkSettled(4)}
          />
        </div>
        <div className="kq-splash__preload" aria-hidden="true">
          <div className="kq-splash__preload-row">
            <span>{progressLabel}</span>
            <span>{clampedProgress}%</span>
          </div>
          <div className="kq-splash__bar-track">
            <div className="kq-splash__bar-fill" />
          </div>
        </div>
        <div className="kq-splash__copyright">© 2026</div>
      </div>
    </div>
  );
}
