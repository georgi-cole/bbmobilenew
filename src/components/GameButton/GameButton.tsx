import { type ReactNode, useState } from 'react';
import './GameButton.css';
import { SoundManager } from '../../services/sound/SoundManager';

export type GameButtonVariant =
  | 'primary_large'
  | 'secondary_medium'
  | 'secondary_wide'
  | 'secondary_small';

type GameButtonState = 'normal' | 'hover' | 'pressed' | 'disabled';

interface GameButtonProps {
  label: string;
  icon?: ReactNode;
  variant: GameButtonVariant;
  disabled?: boolean;
  onClick?: () => void;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function resolveAsset(variant: GameButtonVariant, state: GameButtonState): string {
  return `${BASE}/assets/buttons/${variant}_${state}.svg`;
}

export default function GameButton({
  label,
  icon,
  variant,
  disabled = false,
  onClick,
}: GameButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const state: GameButtonState = disabled
    ? 'disabled'
    : isPressed
    ? 'pressed'
    : isHovered
    ? 'hover'
    : 'normal';

  const src = resolveAsset(variant, state);

  function handleClick() {
    void SoundManager.play('ui:navigate');
    onClick?.();
  }

  return (
    <button
      className={`game-btn game-btn--${variant}${disabled ? ' game-btn--disabled' : ''}${!disabled && isPressed ? ' game-btn--pressed' : ''}`}
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : handleClick}
      onMouseEnter={() => { if (!disabled) setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => { if (!disabled) setIsPressed(true); }}
      onMouseUp={() => setIsPressed(false)}
      onTouchStart={() => { if (!disabled) setIsPressed(true); }}
      onTouchEnd={() => setIsPressed(false)}
      onTouchCancel={() => setIsPressed(false)}
      onBlur={() => { setIsHovered(false); setIsPressed(false); }}
      onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) setIsPressed(true); }}
      onKeyUp={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsPressed(false); }}
    >
      <img
        className="btn-bg"
        src={src}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <div className="btn-content">
        {icon && <span className="btn-icon" aria-hidden="true">{icon}</span>}
        <span className="btn-label">{label}</span>
      </div>
    </button>
  );
}
