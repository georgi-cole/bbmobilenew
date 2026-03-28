import { useState } from 'react';
import './GameControlDock.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type NodeState = 'normal' | 'hover' | 'pressed' | 'disabled';

function assetUrl(file: string): string {
  return `${BASE}/assets/glossy_dock/${file}`;
}

function nodeShellUrl(variant: 'play' | 'side', state: NodeState, role?: string): string {
  if (variant === 'play') {
    return assetUrl(`play_node_${state}_glossy_v4.svg`);
  }
  // Side nodes use per-role shells; disabled state is shared across all roles
  if (state === 'disabled') {
    return assetUrl('side_node_disabled_glossy_v4.svg');
  }
  return assetUrl(`side_node_${role ?? 'chat'}_${state}_glossy_v4.svg`);
}

interface DockNodeProps {
  variant: 'play' | 'side';
  /** Role name used to pick the correct side-node shell (e.g. 'chat', 'log', 'stats', 'action') */
  role?: string;
  glyphFile: string;
  ariaLabel: string;
  disabled?: boolean;
  onClick?: () => void;
  badge?: number;
  className?: string;
}

function DockNode({
  variant,
  role,
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

  const shellSrc = nodeShellUrl(variant, state, role);
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
  const shellSrc = assetUrl('dock_shell_glossy_v4.svg');

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
          role="chat"
          glyphFile="chat_glossy_v4.svg"
          ariaLabel={`Social${chatBadgeCount ? ` (${chatBadgeCount})` : ''}`}
          disabled={disabled}
          onClick={onChatClick}
          badge={chatBadgeCount}
          className={chatFlash ? 'dock-node--flash' : ''}
        />

        {/* Left 2: Log / Inbox */}
        <DockNode
          variant="side"
          role="log"
          glyphFile="log_glossy_v4.svg"
          ariaLabel={`Log${logBadgeCount ? ` (${logBadgeCount})` : ''}`}
          disabled={disabled}
          onClick={onLogClick}
          badge={logBadgeCount}
        />

        {/* Center: Primary play/advance */}
        <DockNode
          variant="play"
          glyphFile="play_glossy_v4.svg"
          ariaLabel="Advance to next phase"
          disabled={primaryDisabled}
          onClick={onPrimaryActionClick}
          className={primaryPulse ? 'dock-node--pulse' : ''}
        />

        {/* Right 1: Stats / Public Meter */}
        <DockNode
          variant="side"
          role="stats"
          glyphFile="stats_glossy_v4.svg"
          ariaLabel={`Stats${statsBadgeCount ? ` (${statsBadgeCount})` : ''}`}
          disabled={disabled}
          onClick={onStatsClick}
          badge={statsBadgeCount}
        />

        {/* Right 2: Action / Diary Room */}
        <DockNode
          variant="side"
          role="action"
          glyphFile="action_glossy_v4.svg"
          ariaLabel="Confessional"
          disabled={disabled}
          onClick={onToolClick}
        />
      </div>
    </div>
  );
}
