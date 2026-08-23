import { useState } from 'react';
import './TopUtilityButton.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export type TopUtilityIcon = 'music' | 'sound' | 'save';

export interface TopUtilityButtonProps {
  icon: TopUtilityIcon;
  ariaLabel: string;
  onClick?: () => void;
  disabled?: boolean;
  /** aria-pressed for toggle semantics (e.g. music on/off) */
  pressed?: boolean;
  title?: string;
}

/**
 * TopUtilityButton — SVG-backed utility button for the game HUD top bar.
 *
 * Uses top_utility_shell.svg as the background, with a matching glyph SVG
 * (music.svg / sound.svg / save.svg) overlaid on top.
 *
 * Visual states: normal → hover → pressed → disabled
 */
export default function TopUtilityButton({
  icon,
  ariaLabel,
  onClick,
  disabled = false,
  pressed,
  title,
}: TopUtilityButtonProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const isInactive = pressed === false;
  const shellSrc = `${BASE}/assets/control_dock/top_utility_shell.svg?v=precision-glass-3`;
  const glyphSrc = `${BASE}/assets/control_dock/${icon}.svg`;
  const audioInactiveScratchSrc = isInactive && (icon === 'music' || icon === 'sound')
    ? `${BASE}/assets/icons/audio_deactivated_scratch.svg`
    : null;

  const scale = disabled
    ? 1
    : isPressed
    ? 0.97
    : isHovered
    ? 1.03
    : 1;

  return (
    <button
      className={`top-utility-btn${disabled ? ' top-utility-btn--disabled' : ''}${pressed ? ' top-utility-btn--active' : ''}${isInactive ? ' top-utility-btn--inactive' : ''}`}
      type="button"
      aria-label={ariaLabel}
      aria-pressed={pressed}
      title={title}
      disabled={disabled}
      style={{ transform: `scale(${scale})` }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => { if (!disabled) setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => { if (!disabled) setIsPressed(true); }}
      onMouseUp={() => setIsPressed(false)}
      onTouchStart={() => { if (!disabled) setIsPressed(true); }}
      onTouchEnd={() => { setIsPressed(false); }}
      onTouchCancel={() => { setIsPressed(false); }}
      onBlur={() => { setIsHovered(false); setIsPressed(false); }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === ' ' || event.key === 'Enter') {
          setIsPressed(true);
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          setIsPressed(false);
        }
      }}
    >
      <img
        className="top-utility-btn__shell"
        src={shellSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      {glyphSrc && (
        <img
          className="top-utility-btn__glyph"
          src={glyphSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
      {audioInactiveScratchSrc && (
        <img
          className="top-utility-btn__scratch"
          src={audioInactiveScratchSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
    </button>
  );
}
