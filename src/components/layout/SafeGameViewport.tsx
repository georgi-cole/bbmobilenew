import type { ReactNode } from 'react';
import './SafeGameViewport.css';

type SafeGameViewportProps = {
  children: ReactNode;
  className?: string;
  debug?: boolean;
};

function readSafeViewportDebugFlag(): boolean {
  if (typeof window === 'undefined') return false;

  const pageParams = new URLSearchParams(window.location.search);
  const hashQueryStart = window.location.hash.indexOf('?');
  const hashParams = new URLSearchParams(
    hashQueryStart >= 0 ? window.location.hash.slice(hashQueryStart + 1) : '',
  );

  return pageParams.has('safeViewportDebug') || hashParams.has('safeViewportDebug');
}

/**
 * Mandatory gameplay viewport contract.
 * The outer shell covers the physical screen; the inner content is the only
 * rectangle where game UI may render, inset by the device safe-area variables.
 */
export default function SafeGameViewport({ children, className = '', debug }: SafeGameViewportProps) {
  const debugEnabled = debug ?? (import.meta.env.DEV && readSafeViewportDebugFlag());
  const classes = [
    'safe-game-viewport',
    debugEnabled ? 'safe-game-viewport--debug' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} data-safe-game-viewport="outer">
      <div className="safe-game-viewport__bleed" aria-hidden="true" />
      <div className="safe-game-viewport__content" data-safe-game-viewport="content">
        {children}
      </div>
    </div>
  );
}
