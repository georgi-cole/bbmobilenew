import type { CSSProperties, ReactNode } from 'react';
import './GameTopChip.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const BASE_LABEL_PADDING = 13;
const LABEL_WIDTH_SOFT_LIMIT = 10;
const CHIP_WIDTH_STEP = 14;
const BASE_CHIP_WIDTH = 68;

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
  const normalizedLabel = label.trim();
  const overflowChars = Math.max(0, normalizedLabel.length - LABEL_WIDTH_SOFT_LIMIT);
  const minChipWidth = BASE_CHIP_WIDTH + overflowChars * CHIP_WIDTH_STEP;
  const chipStyle = {
    '--game-top-chip-min-width': `${minChipWidth}px`,
    '--game-top-chip-inline-padding': `${BASE_LABEL_PADDING}px`,
  } as CSSProperties;

  return (
    <Tag
      className={`game-top-chip ${className}`.trim()}
      aria-label={ariaLabel ?? normalizedLabel}
      title={title}
      style={chipStyle}
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
        <span className="game-top-chip__label">{normalizedLabel}</span>
      </span>
    </Tag>
  );
}
