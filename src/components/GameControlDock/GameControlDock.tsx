import { useState } from 'react';
import './GameControlDock.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type NodeState = 'normal' | 'hover' | 'pressed' | 'disabled';

function assetUrl(file: string): string {
  return `${BASE}/assets/control_dock/${file}`;
}

function nodeShellUrl(variant: 'play' | 'side', state: NodeState): string {
  return assetUrl(`${variant}_node_${state}.svg`);
}

interface DockNodeProps {
  variant: 'play' | 'side';
  glyphFile: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick?: () => void;
  badge?: number;
  className?: string;
}

function DockNode({
  variant,
  glyphFile,
  ariaLabel,
  disabled = false,
  onClick,
  badge,
  className = '',
}: DockNodeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const state: NodeState = disabled
    ? 'disabled'
    : isPressed
    ? 'pressed'
    : isHovered
    ? 'hover'
    : 'normal';

  const shellSrc = nodeShellUrl(variant, state);
  const glyphSrc = assetUrl(glyphFile);

  return (
    <button
      className={`dock-node dock-node--${variant} ${className}`.trim()}
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => { if (!disabled) setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => { if (!disabled) setIsPressed(true); }}
      onMouseUp={() => setIsPressed(false)}
      onTouchStart={() => { if (!disabled) setIsPressed(true); }}
      onTouchEnd={() => { setIsPressed(false); }}
      onTouchCancel={() => { setIsPressed(false); }}
      onBlur={() => { setIsHovered(false); setIsPressed(false); }}
    >
      <img
        className="dock-node__shell"
        src={shellSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <img
        className="dock-node__glyph"
        src={glyphSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {badge != null && badge > 0 && (
        <span className="dock-node__badge" aria-hidden="true">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

export interface GameControlDockProps {
  onChatClick?: () => void;
  onLogClick?: () => void;
  onPrimaryActionClick?: () => void;
  onStatsClick?: () => void;
  onToolClick?: () => void;
  disabled?: boolean;
  primaryDisabled?: boolean;
  chatBadgeCount?: number;
  /** Extra class name for the flash animation on chat node */
  chatFlash?: boolean;
  /** Badge count for the log/inbox node */
  logBadgeCount?: number;
  /** Badge count for the stats node */
  statsBadgeCount?: number;
  /** Whether the center button should pulse */
  primaryPulse?: boolean;
}

export default function GameControlDock({
  onChatClick,
  onLogClick,
  onPrimaryActionClick,
  onStatsClick,
  onToolClick,
  disabled = false,
  primaryDisabled = false,
  chatBadgeCount,
  chatFlash = false,
  logBadgeCount,
  statsBadgeCount,
  primaryPulse = false,
}: GameControlDockProps) {
  const shellSrc = assetUrl('control_dock_shell.svg');

  return (
    <div
      className="game-control-dock"
      role="toolbar"
      aria-label="Game actions"
    >
      {/* Background shell */}
      <img
        className="game-control-dock__shell"
        src={shellSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
      />

      {/* Node row */}
      <div className="game-control-dock__nodes">
        {/* Left 1: Chat / Social */}
        <DockNode
          variant="side"
          glyphFile="chat.svg"
          ariaLabel={`Social${chatBadgeCount ? ` (${chatBadgeCount})` : ''}`}
          disabled={disabled}
          onClick={onChatClick}
          badge={chatBadgeCount}
          className={chatFlash ? 'dock-node--flash' : ''}
        />

        {/* Left 2: Log / Inbox */}
        <DockNode
          variant="side"
          glyphFile="log.svg"
          ariaLabel={`Log${logBadgeCount ? ` (${logBadgeCount})` : ''}`}
          disabled={disabled}
          onClick={onLogClick}
          badge={logBadgeCount}
        />

        {/* Center: Primary play/advance */}
        <DockNode
          variant="play"
          glyphFile="play.svg"
          ariaLabel="Advance to next phase"
          disabled={primaryDisabled}
          onClick={onPrimaryActionClick}
          className={primaryPulse ? 'dock-node--pulse' : ''}
        />

        {/* Right 1: Stats / Public Meter */}
        <DockNode
          variant="side"
          glyphFile="stats.svg"
          ariaLabel={`Stats${statsBadgeCount ? ` (${statsBadgeCount})` : ''}`}
          disabled={disabled}
          onClick={onStatsClick}
          badge={statsBadgeCount}
        />

        {/* Right 2: Action / Diary Room */}
        <DockNode
          variant="side"
          glyphFile="action.svg"
          ariaLabel="Confessional"
          disabled={disabled}
          onClick={onToolClick}
        />
      </div>
    </div>
  );
}
