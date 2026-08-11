import type { Ref } from 'react';
import './GameControlDock.css';

export interface GameControlDockProps {
  dockRef?: Ref<HTMLDivElement>;
  onChatClick?: () => void;
  onIncomingRequestsClick?: () => void;
  onPrimaryActionClick?: () => void;
  onPublicMeterClick?: () => void;
  onToolClick?: () => void;
  disabled?: boolean;
  primaryDisabled?: boolean;
  socialDisabled?: boolean;
  incomingRequestsDisabled?: boolean;
  publicMeterDisabled?: boolean;
  chatBadgeCount?: number;
  chatFlash?: boolean;
  incomingRequestsBadgeCount?: number;
  publicMeterBadgeCount?: number;
  primaryPulse?: boolean;
  confessionalBadgeCount?: number;
  confessionalFlash?: boolean;
  confessionalFlashTick?: number;
  confessionalPersistentFlash?: boolean;
  confessionalIconRef?: Ref<HTMLImageElement>;
}

function ChatGlyph() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M14 16h36a6 6 0 0 1 6 6v20a6 6 0 0 1-6 6H31l-11 8 2-8h-8a6 6 0 0 1-6-6V22a6 6 0 0 1 6-6Z" />
      <path d="M20 28h24M20 36h17" />
    </svg>
  );
}

function CrownGlyph() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="m10 23 10 9 12-18 12 18 10-9-5 25H15l-5-25Z" />
      <path d="M17 53h30" />
      <circle cx="10" cy="20" r="2.8" />
      <circle cx="32" cy="11" r="2.8" />
      <circle cx="54" cy="20" r="2.8" />
    </svg>
  );
}

function CountBadge({ value, mission = false }: { value?: number; mission?: boolean }) {
  if (value == null || value <= 0) return null;
  return (
    <span className={`game-command-dock__badge${mission ? ' game-command-dock__badge--mission' : ''}`} aria-hidden="true">
      {value > 99 ? '99+' : value}
    </span>
  );
}

export default function GameControlDock({
  dockRef,
  onChatClick,
  onIncomingRequestsClick,
  onPrimaryActionClick,
  onPublicMeterClick,
  onToolClick,
  disabled = false,
  primaryDisabled = false,
  socialDisabled = false,
  incomingRequestsDisabled = false,
  publicMeterDisabled = false,
  chatBadgeCount,
  chatFlash = false,
  incomingRequestsBadgeCount,
  publicMeterBadgeCount,
  primaryPulse = false,
  confessionalBadgeCount,
  confessionalFlash = false,
  confessionalFlashTick = 0,
  confessionalPersistentFlash = false,
  confessionalIconRef,
}: GameControlDockProps) {
  const leftBadge = incomingRequestsBadgeCount ?? chatBadgeCount;

  return (
    <div
      ref={dockRef}
      className="game-control-dock game-command-dock"
      role="toolbar"
      aria-label="Game actions"
    >
      <span className="game-command-dock__top-chevron" aria-hidden="true" />
      <span className="game-command-dock__inner-rim" aria-hidden="true" />

      <button
        className={`game-command-dock__side game-command-dock__side--feed${socialDisabled ? ' game-command-dock__side--unavailable' : ''}${chatFlash ? ' game-command-dock__side--flash' : ''}`}
        type="button"
        aria-label={`Social${chatBadgeCount ? ` (${chatBadgeCount})` : ''}`}
        aria-disabled={socialDisabled || disabled}
        disabled={disabled}
        onClick={disabled ? undefined : onChatClick}
      >
        <span className="game-command-dock__hex" aria-hidden="true">
          <span className="game-command-dock__hex-inner">
            <ChatGlyph />
          </span>
          <CountBadge value={leftBadge} />
        </span>
        <span className="game-command-dock__side-label">FEED</span>
        <span className="game-command-dock__side-underline" aria-hidden="true" />
      </button>

      <button
        className="game-command-dock__subhit game-command-dock__subhit--inbox"
        type="button"
        aria-label={`Incoming requests${incomingRequestsBadgeCount ? ` (${incomingRequestsBadgeCount})` : ''}`}
        aria-disabled={incomingRequestsDisabled || disabled}
        disabled={disabled}
        onClick={disabled ? undefined : onIncomingRequestsClick}
      />

      <button
        className={`game-command-dock__primary${primaryPulse ? ' game-command-dock__primary--pulse' : ''}`}
        type="button"
        aria-label="Advance to next phase"
        disabled={primaryDisabled}
        onClick={primaryDisabled ? undefined : onPrimaryActionClick}
      >
        <span className="game-command-dock__honeycomb" aria-hidden="true" />
        <span className="game-command-dock__primary-title">CONTINUE</span>
        <span className="game-command-dock__primary-subtitle">Advance to Results</span>
      </button>

      <button
        className={`game-command-dock__side game-command-dock__side--strategy${publicMeterDisabled ? ' game-command-dock__side--unavailable' : ''}`}
        type="button"
        aria-label={`Public meter${publicMeterBadgeCount ? ` (${publicMeterBadgeCount})` : ''}`}
        aria-disabled={publicMeterDisabled || disabled}
        disabled={disabled}
        onClick={disabled ? undefined : onPublicMeterClick}
      >
        <span
          className={`game-command-dock__hex${confessionalFlash ? ` game-command-dock__hex--flash game-command-dock__hex--flash-${confessionalFlashTick % 2}` : ''}${confessionalPersistentFlash ? ' game-command-dock__hex--persistent' : ''}`}
          aria-hidden="true"
        >
          <span className="game-command-dock__hex-inner game-command-dock__hex-inner--crown">
            <CrownGlyph />
          </span>
          <CountBadge value={confessionalBadgeCount} mission />
          <img ref={confessionalIconRef} className="game-command-dock__spotlight-target" alt="" aria-hidden="true" />
        </span>
        <span className="game-command-dock__side-label">STRATEGY</span>
        <span className="game-command-dock__side-underline" aria-hidden="true" />
        {publicMeterBadgeCount != null && publicMeterBadgeCount > 0 && (
          <span className="game-command-dock__public-count" aria-hidden="true">
            {publicMeterBadgeCount > 99 ? '99+' : publicMeterBadgeCount}
          </span>
        )}
      </button>

      <button
        className="game-command-dock__subhit game-command-dock__subhit--diary"
        type="button"
        aria-label={`Confessional${confessionalBadgeCount ? ` (${confessionalBadgeCount})` : ''}`}
        disabled={disabled}
        onClick={disabled ? undefined : onToolClick}
      />
    </div>
  );
}
