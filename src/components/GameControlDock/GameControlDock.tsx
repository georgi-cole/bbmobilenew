import type { Ref } from 'react';
import './GameControlDock.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function assetUrl(file: string): string {
  return `${BASE}/assets/clean_glassy_dock/${file}`;
}

export interface GameControlDockProps {
  /** Ref to the dock shell for responsive placement within the game screen. */
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
  /** Extra class name for the flash animation on chat node */
  chatFlash?: boolean;
  /** Badge count for the incoming requests node */
  incomingRequestsBadgeCount?: number;
  /** Badge count for the public meter node */
  publicMeterBadgeCount?: number;
  /** Whether the center button should pulse */
  primaryPulse?: boolean;
  /** Count of actionable Confessional alerts shown in the Turkish blue badge */
  confessionalBadgeCount?: number;
  /** Whether the Confessional icon/badge should play its alert animation */
  confessionalFlash?: boolean;
  /** Alternates to force the Confessional flash animation to restart */
  confessionalFlashTick?: number;
  /** Keeps the Confessional icon/badge pulsing until the player opens it */
  confessionalPersistentFlash?: boolean;
  /** Ref to the visible Confessional icon for guided overlays/tutorials */
  confessionalIconRef?: Ref<HTMLImageElement>;
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
  const shellSrc = assetUrl('fab_shell_clean.svg');
  const playSrc = assetUrl('fab_center_play_clean.svg');
  const socialUnavailableClass = socialDisabled ? ' dock-hit-area--unavailable' : '';
  const requestsUnavailableClass = incomingRequestsDisabled ? ' dock-hit-area--unavailable' : '';
  const publicUnavailableClass = publicMeterDisabled ? ' dock-hit-area--unavailable' : '';

  return (
    <div
      ref={dockRef}
      className="game-control-dock fab-clean"
      role="toolbar"
      aria-label="Game actions"
    >
      <img
        className="game-control-dock__shell fab-shell"
        src={shellSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className={`game-control-dock__play fab-play${primaryPulse ? ' game-control-dock__play--pulse' : ''}${primaryDisabled ? ' game-control-dock__play--disabled' : ''}`}
        src={playSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className={`game-control-dock__icon fab-icon social${chatFlash ? ' game-control-dock__icon--flash' : ''}${socialDisabled ? ' game-control-dock__icon--unavailable' : ''}`}
        src={assetUrl('fab_icon_social_clean.svg')}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className={`game-control-dock__icon fab-icon requests${incomingRequestsDisabled ? ' game-control-dock__icon--unavailable' : ''}`}
        src={assetUrl('fab_icon_requests_clean.svg')}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className={`game-control-dock__icon fab-icon stats${publicMeterDisabled ? ' game-control-dock__icon--unavailable' : ''}`}
        src={assetUrl('fab_icon_stats_clean.svg')}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className={`game-control-dock__icon fab-icon confessional${confessionalFlash ? ` game-control-dock__icon--confessional-flash game-control-dock__icon--confessional-flash-${confessionalFlashTick % 2}` : ''}${confessionalPersistentFlash ? ' game-control-dock__icon--confessional-persistent' : ''}`}
        src={assetUrl('fab_icon_confessional_clean.svg')}
        alt=""
        aria-hidden="true"
        draggable={false}
        ref={confessionalIconRef}
      />

      <button
        className={`dock-hit-area hit-social dock-hit-area--social${chatFlash ? ' dock-hit-area--flash dock-node--flash' : ''}${socialUnavailableClass}`}
        type="button"
        aria-label={`Social${chatBadgeCount ? ` (${chatBadgeCount})` : ''}`}
        aria-disabled={socialDisabled || disabled}
        disabled={disabled}
        onClick={disabled ? undefined : onChatClick}
      >
        {chatBadgeCount != null && chatBadgeCount > 0 && !socialDisabled && (
          <span className="dock-hit-area__badge" aria-hidden="true">
            {chatBadgeCount > 99 ? '99+' : chatBadgeCount}
          </span>
        )}
      </button>
      <button
        className={`dock-hit-area hit-requests dock-hit-area--requests${requestsUnavailableClass}`}
        type="button"
        aria-label={`Incoming requests${incomingRequestsBadgeCount ? ` (${incomingRequestsBadgeCount})` : ''}`}
        aria-disabled={incomingRequestsDisabled || disabled}
        disabled={disabled}
        onClick={disabled ? undefined : onIncomingRequestsClick}
      >
        {incomingRequestsBadgeCount != null && incomingRequestsBadgeCount > 0 && !incomingRequestsDisabled && (
          <span className="dock-hit-area__badge" aria-hidden="true">
            {incomingRequestsBadgeCount > 99 ? '99+' : incomingRequestsBadgeCount}
          </span>
        )}
      </button>
      <button
        className={`dock-hit-area hit-play dock-hit-area--play${primaryPulse ? ' dock-hit-area--pulse dock-node--pulse' : ''}`}
        type="button"
        aria-label="Advance to next phase"
        disabled={primaryDisabled}
        onClick={primaryDisabled ? undefined : onPrimaryActionClick}
      />
      <button
        className={`dock-hit-area hit-stats dock-hit-area--stats${publicUnavailableClass}`}
        type="button"
        aria-label={`Public meter${publicMeterBadgeCount ? ` (${publicMeterBadgeCount})` : ''}`}
        aria-disabled={publicMeterDisabled || disabled}
        disabled={disabled}
        onClick={disabled ? undefined : onPublicMeterClick}
      >
        {publicMeterBadgeCount != null && publicMeterBadgeCount > 0 && !publicMeterDisabled && (
          <span className="dock-hit-area__badge" aria-hidden="true">
            {publicMeterBadgeCount > 99 ? '99+' : publicMeterBadgeCount}
          </span>
        )}
      </button>
      <button
        className={`dock-hit-area hit-confessional dock-hit-area--confessional${confessionalFlash ? ` dock-hit-area--confessional-flash dock-hit-area--confessional-flash-${confessionalFlashTick % 2}` : ''}${confessionalPersistentFlash ? ' dock-hit-area--confessional-persistent' : ''}`}
        type="button"
        aria-label={`Confessional${confessionalBadgeCount ? ` (${confessionalBadgeCount})` : ''}`}
        disabled={disabled}
        onClick={disabled ? undefined : onToolClick}
      >
        {confessionalBadgeCount != null && confessionalBadgeCount > 0 && (
          <span className="dock-hit-area__badge dock-hit-area__badge--mission" aria-hidden="true">
            {confessionalBadgeCount > 99 ? '99+' : confessionalBadgeCount}
          </span>
        )}
      </button>
    </div>
  );
}
