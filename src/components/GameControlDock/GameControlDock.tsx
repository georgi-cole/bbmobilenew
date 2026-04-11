import './GameControlDock.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function assetUrl(file: string): string {
  return `${BASE}/assets/clean_glassy_dock/${file}`;
}

export interface GameControlDockProps {
  onChatClick?: () => void;
  onIncomingRequestsClick?: () => void;
  onPrimaryActionClick?: () => void;
  onPublicMeterClick?: () => void;
  onToolClick?: () => void;
  disabled?: boolean;
  primaryDisabled?: boolean;
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
}

export default function GameControlDock({
  onChatClick,
  onIncomingRequestsClick,
  onPrimaryActionClick,
  onPublicMeterClick,
  onToolClick,
  disabled = false,
  primaryDisabled = false,
  chatBadgeCount,
  chatFlash = false,
  incomingRequestsBadgeCount,
  publicMeterBadgeCount,
  primaryPulse = false,
  confessionalBadgeCount,
  confessionalFlash = false,
  confessionalFlashTick = 0,
  confessionalPersistentFlash = false,
}: GameControlDockProps) {
  const shellSrc = assetUrl('fab_shell_clean.svg');
  const playSrc = assetUrl('fab_center_play_clean.svg');

  return (
    <div
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
        className={`game-control-dock__icon fab-icon social${chatFlash ? ' game-control-dock__icon--flash' : ''}`}
        src={assetUrl('fab_icon_social_clean.svg')}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className="game-control-dock__icon fab-icon requests"
        src={assetUrl('fab_icon_requests_clean.svg')}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className="game-control-dock__icon fab-icon stats"
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
      />

      <button
        className={`dock-hit-area hit-social dock-hit-area--social${chatFlash ? ' dock-hit-area--flash dock-node--flash' : ''}`}
        type="button"
        aria-label={`Social${chatBadgeCount ? ` (${chatBadgeCount})` : ''}`}
        disabled={disabled}
        onClick={disabled ? undefined : onChatClick}
      >
        {chatBadgeCount != null && chatBadgeCount > 0 && (
          <span className="dock-hit-area__badge" aria-hidden="true">
            {chatBadgeCount > 99 ? '99+' : chatBadgeCount}
          </span>
        )}
      </button>
      <button
        className="dock-hit-area hit-requests dock-hit-area--requests"
        type="button"
        aria-label={`Incoming requests${incomingRequestsBadgeCount ? ` (${incomingRequestsBadgeCount})` : ''}`}
        disabled={disabled}
        onClick={disabled ? undefined : onIncomingRequestsClick}
      >
        {incomingRequestsBadgeCount != null && incomingRequestsBadgeCount > 0 && (
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
        className="dock-hit-area hit-stats dock-hit-area--stats"
        type="button"
        aria-label={`Public meter${publicMeterBadgeCount ? ` (${publicMeterBadgeCount})` : ''}`}
        disabled={disabled}
        onClick={disabled ? undefined : onPublicMeterClick}
      >
        {publicMeterBadgeCount != null && publicMeterBadgeCount > 0 && (
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
