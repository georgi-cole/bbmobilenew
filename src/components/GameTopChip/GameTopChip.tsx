import type { CSSProperties, ReactNode } from 'react';
import './GameTopChip.css';

const BASE_LABEL_PADDING = 13;
const LABEL_WIDTH_SOFT_LIMIT = 10;
const CHIP_WIDTH_STEP = 14;
const BASE_CHIP_WIDTH = 68;

export interface GameTopChipProps {
  label: string;
  /** Short label shown only when a parent header enters its compact layout. */
  compactLabel?: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
  /** Semantic visual tone. */
  tone?: 'accent' | 'neutral' | 'danger' | 'success';
  /** Additional class names */
  className?: string;
}

/**
 * GameTopChip — stretch-safe status chip for the game HUD top bar.
 *
 * Renders the shell in CSS so longer labels can expand the pill cleanly
 * without the fixed SVG art causing visual overflow.
 */
export default function GameTopChip({
  label,
  compactLabel,
  icon,
  onClick,
  disabled = false,
  ariaLabel,
  title,
  tone = 'accent',
  className = '',
}: GameTopChipProps) {
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
      className={`game-top-chip game-top-chip--${tone} ${className}`.trim()}
      aria-label={ariaLabel ?? normalizedLabel}
      title={title}
      style={chipStyle}
      {...(onClick ? { type: 'button' as const, disabled, onClick: disabled ? undefined : onClick } : {})}
    >
      <span className="game-top-chip__content">
        {icon && <span className="game-top-chip__icon" aria-hidden="true">{icon}</span>}
        <span className="game-top-chip__label game-top-chip__label--full">{normalizedLabel}</span>
        {compactLabel && (
          <span className="game-top-chip__label game-top-chip__label--compact">
            {compactLabel.trim()}
          </span>
        )}
      </span>
    </Tag>
  );
}
