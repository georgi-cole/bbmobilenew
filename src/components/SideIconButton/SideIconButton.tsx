import { useState } from 'react';
import './SideIconButton.css';

export type SideIconName =
  | 'housemates'
  | 'music'
  | 'sound'
  | 'achievements'
  | 'news'
  | 'settings'
  | 'share'
  | 'feedback'
  | 'social'
  | 'shop';

type SideIconState = 'normal' | 'hover' | 'pressed' | 'disabled';

interface SideIconButtonProps {
  icon: SideIconName;
  ariaLabel: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

function resolveIcon(icon: SideIconName, state: SideIconState): string {
  return `${BASE}/assets/icons/${icon}_${state}.svg`;
}

export default function SideIconButton({
  icon,
  ariaLabel,
  disabled = false,
  onClick,
  className,
}: SideIconButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const state: SideIconState = disabled
    ? 'disabled'
    : isPressed
    ? 'pressed'
    : isHovered
    ? 'hover'
    : 'normal';

  const src = resolveIcon(icon, state);

  const cls = ['side-icon-btn', className].filter(Boolean).join(' ');

  return (
    <button
      className={cls}
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => { if (!disabled) setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => { if (!disabled) setIsPressed(true); }}
      onMouseUp={() => setIsPressed(false)}
      onTouchStart={() => { if (!disabled) setIsPressed(true); }}
      onTouchEnd={() => setIsPressed(false)}
      onTouchCancel={() => setIsPressed(false)}
      onBlur={() => { setIsHovered(false); setIsPressed(false); }}
    >
      <img
        className="side-icon-bg"
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    </button>
  );
}
