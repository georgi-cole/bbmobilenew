import type { StatusPillVariant } from '../../types';
import './StatusPill.css';

interface StatusPillProps {
  /** Visual style variant */
  variant?: StatusPillVariant;
  /** Leading emoji / icon character */
  icon?: string;
  /** Text label */
  label: string;
  /** Make the pill a clickable button */
  onClick?: () => void;
  /** aria-label override */
  ariaLabel?: string;
  className?: string;
}

/**
 * StatusPill — reusable pill chip used throughout the game HUD.
 *
 * Variants:
 *  phase    → accent gradient  (current game phase)
 *  week     → accent-2 gradient (S1W3)
 *  players  → green (alive/total)
 *  dr       → purple (Diary Room button)
 *  success  → green
 *  danger   → red
 *  warning  → amber
 *  info     → blue
 *  neutral  → grey
 *
 * Adding a new variant: add a CSS class in StatusPill.css and add the key
 * to StatusPillVariant in src/types/index.ts. No other files need changing.
 */
export default function StatusPill({
  variant = 'neutral',
  icon,
  label,
  onClick,
  ariaLabel,
  className = '',
}: StatusPillProps) {
  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      className={`status-pill status-pill--${variant} ${className}`.trim()}
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      // button semantics
      {...(onClick ? { type: 'button' as const } : {})}
    >
      {icon && <span className="status-pill__icon" aria-hidden="true">{icon}</span>}
      <span className="status-pill__label">{label}</span>
    </Tag>
  );
}
