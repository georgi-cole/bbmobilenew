import type { CSSProperties } from 'react';
import './GameLoadingSplash.css';

interface Props {
  progress: number;
  status: string;
}

const LOGO_SRC = `${import.meta.env.BASE_URL}assets/kolequant.png`;

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export default function GameLoadingSplash({ progress, status }: Props) {
  const value = clampProgress(progress);
  const eyePath = 'M10 62C52 16 158 16 200 62C158 108 52 108 10 62Z';
  const style = { '--game-loading-progress': `${value}%` } as CSSProperties;

  return (
    <div
      className="game-loading"
      style={style}
      role="status"
      aria-live="polite"
      aria-label={`${status} ${value}%`}
    >
      <div className="game-loading__center" aria-hidden="true">
        <div className="game-loading__eye">
          <svg className="game-loading__eye-svg" viewBox="0 0 210 124" fill="none">
            <defs>
              <linearGradient id="game-loading-gradient" x1="10" y1="38" x2="200" y2="86" gradientUnits="userSpaceOnUse">
                <stop stopColor="#9957ff" />
                <stop offset="0.52" stopColor="#6378ff" />
                <stop offset="1" stopColor="#22d7df" />
              </linearGradient>
              <radialGradient id="game-loading-iris" cx="43%" cy="38%" r="70%">
                <stop stopColor="#18213b" />
                <stop offset="1" stopColor="#070b15" />
              </radialGradient>
              <filter id="game-loading-glow" x="-25%" y="-35%" width="150%" height="170%">
                <feGaussianBlur stdDeviation="1.6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>

            <path className="game-loading__eye-surface" d={eyePath} />
            <circle className="game-loading__iris-bed" cx="105" cy="62" r="37" />
            <circle className="game-loading__iris-ring" cx="105" cy="62" r="33" />
            <g className="game-loading__iris-rotor">
              {Array.from({ length: 8 }, (_, index) => (
                <path
                  key={index}
                  className="game-loading__aperture-blade"
                  d="M105 30A32 32 0 0 1 125 37L113 55L105 62Z"
                  transform={`rotate(${index * 45} 105 62)`}
                />
              ))}
            </g>
            <circle className="game-loading__pupil-ring" cx="105" cy="62" r="15" />
            <circle className="game-loading__pupil" cx="105" cy="62" r="8" />
            <circle className="game-loading__glint" cx="102" cy="59" r="1.5" />

            <path className="game-loading__eye-track" d={eyePath} pathLength="100" />
            <path
              className="game-loading__eye-progress"
              d={eyePath}
              pathLength="100"
              style={{ strokeDasharray: `${value} ${100 - value}` }}
            />
            <path className="game-loading__eye-sweep" d={eyePath} pathLength="100" />
          </svg>
        </div>
        <div className="game-loading__status">
          <span>{status.replace(/\.+$/, '')}…</span>
          <span>{value}%</span>
        </div>
      </div>

      <div className="game-loading__brand">
        <img src={LOGO_SRC} alt="Kolequant" className="game-loading__logo" draggable={false} decoding="async" />
        <span className="game-loading__tagline">Life&apos;s short, let&apos;s change that</span>
      </div>
    </div>
  );
}
