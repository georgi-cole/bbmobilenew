import type { IncomingInteractionType } from '../../social/types'

export type IncomingInteractionIconName = IncomingInteractionType | 'inbox' | 'person' | 'close'

interface IncomingInteractionIconProps {
  name: IncomingInteractionIconName
  className?: string
}

export default function IncomingInteractionIcon({ name, className }: IncomingInteractionIconProps) {
  const commonProps = {
    className,
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    'data-testid': `incoming-icon-${name}`,
  }

  switch (name) {
    case 'inbox':
      return (
        <svg {...commonProps}>
          <path d="M4 5.5h16l1 8.5v4.5H3V14l1-8.5Z" />
          <path d="M3.5 14h4l1.5 2h6l1.5-2h4" />
        </svg>
      )
    case 'nomination_plea':
      return (
        <svg {...commonProps}>
          <path d="M7.5 11V6.5a1.5 1.5 0 0 1 3 0V10" />
          <path d="M10.5 10V5.5a1.5 1.5 0 0 1 3 0V10" />
          <path d="M13.5 10V6.5a1.5 1.5 0 0 1 3 0V12" />
          <path d="M16.5 11.5V9a1.5 1.5 0 0 1 3 0v4.5c0 4.1-2.8 7-7 7h-1.2a6 6 0 0 1-4.8-2.4L4.7 15.7a1.6 1.6 0 0 1 2.4-2.1l1.4 1.2" />
        </svg>
      )
    case 'alliance_proposal':
      return (
        <svg {...commonProps}>
          <path d="m8.2 12.8 3.1 3.1a2 2 0 0 0 2.8 0l4.6-4.6" />
          <path d="m15.8 12.8-3.1-3.1a2 2 0 0 0-2.8 0l-4.6 4.6" />
          <path d="m3 10 3.2-3.2 3 3M21 10l-3.2-3.2-3 3" />
        </svg>
      )
    case 'deal_offer':
      return (
        <svg {...commonProps}>
          <rect x="3" y="7" width="18" height="12" rx="2" />
          <path d="M9 7V5h6v2M3 12h18M10 12v2h4v-2" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...commonProps}>
          <path d="M12 3.5 21 20H3L12 3.5Z" />
          <path d="M12 9v5M12 17.2v.1" />
        </svg>
      )
    case 'gossip':
      return (
        <svg {...commonProps}>
          <path d="M4 5.5h10a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H9l-4 3v-3.2a3 3 0 0 1-2-2.8v-3a3 3 0 0 1 1-2.2Z" />
          <path d="M17 9.5h1a3 3 0 0 1 3 3v2a3 3 0 0 1-2 2.8V20l-3.5-2.7H13" />
          <path d="M7 9.8h6M7 12h4" />
        </svg>
      )
    case 'check_in':
      return (
        <svg {...commonProps}>
          <path d="M4 5h16v11H9l-5 4V5Z" />
          <path d="M8 9h8M8 12h5" />
        </svg>
      )
    case 'compliment':
      return (
        <svg {...commonProps}>
          <path d="M20.5 8.8c0 5-8.5 10.2-8.5 10.2S3.5 13.8 3.5 8.8A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8.5 1.2Z" />
        </svg>
      )
    case 'snide_remark':
      return (
        <svg {...commonProps}>
          <path d="M3 12s3.4-5 9-5 9 5 9 5-3.4 5-9 5-9-5-9-5Z" />
          <path d="M8.5 11.5a3.5 3.5 0 0 0 7 0" />
          <path d="m5 7-2-2M19 7l2-2" />
        </svg>
      )
    case 'other':
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m4 7 8 6 8-6" />
        </svg>
      )
    case 'person':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      )
    case 'close':
      return (
        <svg {...commonProps}>
          <path d="m7 7 10 10M17 7 7 17" />
        </svg>
      )
  }
}
