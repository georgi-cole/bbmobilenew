import type { ButtonHTMLAttributes } from 'react'
import './GameBackButton.css'

export interface GameBackButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  label?: string
}

/** Shared Big Eye back control. The icon is vector-drawn so it never becomes a platform emoji. */
export default function GameBackButton({
  className,
  label = 'Go back',
  type = 'button',
  ...buttonProps
}: GameBackButtonProps) {
  return (
    <button
      {...buttonProps}
      type={type}
      className={['game-back-button', className].filter(Boolean).join(' ')}
      aria-label={label}
    >
      <svg
        className="game-back-button__icon"
        viewBox="0 0 28 24"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M12 4 4 12l8 8" />
        <path d="M5 12h13.5c3.2 0 5.5 2 5.5 5.5" />
      </svg>
    </button>
  )
}
