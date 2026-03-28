import type { ReactNode } from 'react';
import './GameTopChip.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export interface GameTopChipProps {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  /** Additional class names */
  className?: string;
}

/**
 * GameTopChip — SVG-backed status chip for the game HUD top bar.
 *
 * Uses top_chip.svg as the background shell, with label and optional icon
 * rendered via React on top.
 */
export default function GameTopChip({
  label,
  icon,
  onClick,
  disabled = false,
  ariaLabel,
  title,
  className = '',
}: GameTopChipProps) {
  const chipSrc = `${BASE}/assets/control_dock/top_chip.svg`;
  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      className={`game-top-chip ${className}`.trim()}
      aria-label={ariaLabel ?? label}
      title={title}
      {...(onClick ? { type: 'button' as const, disabled, onClick: disabled ? undefined : onClick } : {})}
    >
      <img
        className="game-top-chip__bg"
        src={chipSrc}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <span className="game-top-chip__content">
        {icon && <span className="game-top-chip__icon" aria-hidden="true">{icon}</span>}
        <span className="game-top-chip__label">{label}</span>
      </span>
    </Tag>
  );
}
