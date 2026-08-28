import type { Ref } from 'react'
import { useEffect, useRef, useState } from 'react'
import './GameControlDock.css'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

function assetUrl(file: string): string {
  return `${BASE}/assets/clean_glassy_dock/${file}`
}

function navAssetUrl(file: string): string {
  return `${BASE}/assets/updated_nav_fab_bar/${file}`
}

function useNotificationLed(
  value: number | undefined,
  options: { showInitially?: boolean; notifyOnAnyChange?: boolean } = {}
) {
  const currentValue = value ?? 0
  const { showInitially = false, notifyOnAnyChange = false } = options
  const [active, setActive] = useState(showInitially && currentValue > 0)
  const previousValueRef = useRef(currentValue)

  useEffect(() => {
    const previousValue = previousValueRef.current
    previousValueRef.current = currentValue
    const hasNewNotification = notifyOnAnyChange
      ? currentValue !== previousValue
      : currentValue > previousValue
    if (!hasNewNotification) return undefined

    const reveal = window.setTimeout(() => setActive(true), 0)
    return () => window.clearTimeout(reveal)
  }, [currentValue, notifyOnAnyChange])

  return [active, () => setActive(false)] as const
}

export interface GameControlDockProps {
  /** Ref to the dock shell for responsive placement within the game screen. */
  dockRef?: Ref<HTMLDivElement>
  onChatClick?: () => void
  onIncomingRequestsClick?: () => void
  onPrimaryActionClick?: () => void
  onPublicMeterClick?: () => void
  onToolClick?: () => void
  onHomeClick?: () => void
  onMoreClick?: (destination: 'settings' | 'profile' | 'rules' | 'leaderboard' | 'store') => void
  disabled?: boolean
  primaryDisabled?: boolean
  socialDisabled?: boolean
  incomingRequestsDisabled?: boolean
  publicMeterDisabled?: boolean
  chatBadgeCount?: number
  /** Extra class name for the flash animation on chat node */
  chatFlash?: boolean
  /** Badge count for the incoming requests node */
  incomingRequestsBadgeCount?: number
  /** Badge count for the public meter node */
  publicMeterBadgeCount?: number
  /** Whether the center button should pulse */
  primaryPulse?: boolean
  /** Count of actionable Confessional alerts shown in the Turkish blue badge */
  confessionalBadgeCount?: number
  /** Whether the Confessional icon/badge should play its alert animation */
  confessionalFlash?: boolean
  /** Alternates to force the Confessional flash animation to restart */
  confessionalFlashTick?: number
  /** Keeps the Confessional icon/badge pulsing until the player opens it */
  confessionalPersistentFlash?: boolean
  /** Ref to the visible Confessional icon for guided overlays/tutorials */
  confessionalIconRef?: Ref<HTMLImageElement>
}

export default function GameControlDock({
  dockRef,
  onChatClick,
  onIncomingRequestsClick,
  onPrimaryActionClick,
  onPublicMeterClick,
  onToolClick,
  onHomeClick,
  onMoreClick,
  disabled = false,
  primaryDisabled = false,
  socialDisabled = false,
  incomingRequestsDisabled = false,
  publicMeterDisabled = false,
  chatBadgeCount,
  chatFlash = false,
  incomingRequestsBadgeCount,
  publicMeterBadgeCount,
  primaryPulse = false,
  confessionalBadgeCount,
  confessionalFlash = false,
  confessionalFlashTick = 0,
  confessionalPersistentFlash = false,
  confessionalIconRef,
}: GameControlDockProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [socialLedActive, acknowledgeSocialLed] = useNotificationLed(chatBadgeCount, {
    notifyOnAnyChange: true,
  })
  const [requestsLedActive, acknowledgeRequestsLed] = useNotificationLed(
    incomingRequestsBadgeCount,
    { showInitially: true }
  )
  const [publicLedActive, acknowledgePublicLed] = useNotificationLed(publicMeterBadgeCount, {
    showInitially: true,
  })
  const [confessionalLedActive, acknowledgeConfessionalLed] = useNotificationLed(
    confessionalBadgeCount,
    { showInitially: true }
  )
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  // Query version keeps the refreshed public SVG from being served out of a
  // browser cache while retaining one shared source asset in production.
  const shellSrc = `${assetUrl('fab_shell_clean.svg')}?v=precision-glass-8`
  const playSrc = `${assetUrl('fab_center_play_clean.svg')}?v=precision-glass-7`
  const socialUnavailableClass = socialDisabled ? ' dock-hit-area--unavailable' : ''
  const requestsUnavailableClass = incomingRequestsDisabled ? ' dock-hit-area--unavailable' : ''
  const publicUnavailableClass = publicMeterDisabled ? ' dock-hit-area--unavailable' : ''

  useEffect(() => {
    if (!moreOpen) return undefined
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (moreButtonRef.current?.contains(target) || moreMenuRef.current?.contains(target)) return
      setMoreOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    document.addEventListener('pointerdown', closeOnOutsidePointer, true)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true)
    }
  }, [moreOpen])

  return (
    <nav className="game-control-dock-navigation" aria-label="Main navigation">
      <div
        ref={dockRef}
        className="game-control-dock fab-clean"
        role="toolbar"
        aria-label="Game actions"
      >
        <img
          className="game-control-dock__shell fab-shell"
          src={shellSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <img
          className="game-control-dock__icon fab-icon home"
          src={navAssetUrl('home_approved_final.svg')}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <img
          className={`game-control-dock__play fab-play${primaryPulse ? ' game-control-dock__play--pulse' : ''}${primaryDisabled ? ' game-control-dock__play--disabled' : ''}`}
          src={playSrc}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <img
          className={`game-control-dock__icon fab-icon social${chatFlash ? ' game-control-dock__icon--flash' : ''}${socialDisabled ? ' game-control-dock__icon--unavailable' : ''}`}
          src={assetUrl('fab_icon_social_clean.svg')}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <img
          className={`game-control-dock__icon fab-icon requests${incomingRequestsDisabled ? ' game-control-dock__icon--unavailable' : ''}`}
          src={assetUrl('fab_icon_inbox_clean.svg')}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <img
          className={`game-control-dock__icon fab-icon stats${publicMeterDisabled ? ' game-control-dock__icon--unavailable' : ''}`}
          src={assetUrl('fab_icon_stats_clean.svg')}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <img
          className={`game-control-dock__icon fab-icon confessional${confessionalFlash ? ` game-control-dock__icon--confessional-flash game-control-dock__icon--confessional-flash-${confessionalFlashTick % 2}` : ''}${confessionalPersistentFlash ? ' game-control-dock__icon--confessional-persistent' : ''}`}
          src={assetUrl('fab_icon_confessional_clean.svg')}
          alt=""
          aria-hidden="true"
          draggable={false}
          ref={confessionalIconRef}
        />
        <span className="fab-more-glyph" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>

        <button
          className="dock-hit-area hit-home dock-hit-area--home"
          type="button"
          aria-label="Home"
          disabled={disabled}
          onClick={disabled ? undefined : onHomeClick}
        />
        <button
          className={`dock-hit-area hit-social dock-hit-area--social${chatFlash ? ' dock-hit-area--flash dock-node--flash' : ''}${socialUnavailableClass}`}
          type="button"
          aria-label={`Social${chatBadgeCount ? ` (${chatBadgeCount})` : ''}`}
          aria-disabled={socialDisabled || disabled}
          disabled={disabled}
          onClick={
            disabled
              ? undefined
              : () => {
                  if (!socialDisabled) acknowledgeSocialLed()
                  onChatClick?.()
                }
          }
        >
          {socialLedActive && !socialDisabled && (
            <span className="dock-hit-area__notification-led" aria-hidden="true" />
          )}
          {chatBadgeCount != null && chatBadgeCount > 0 && !socialDisabled && (
            <span className="dock-hit-area__badge" aria-hidden="true">
              {chatBadgeCount > 99 ? '99+' : chatBadgeCount}
            </span>
          )}
        </button>
        <button
          className={`dock-hit-area hit-requests dock-hit-area--requests${requestsUnavailableClass}`}
          type="button"
          aria-label={`Incoming requests${incomingRequestsBadgeCount ? ` (${incomingRequestsBadgeCount})` : ''}`}
          aria-disabled={incomingRequestsDisabled || disabled}
          disabled={disabled}
          onClick={
            disabled
              ? undefined
              : () => {
                  if (!incomingRequestsDisabled) acknowledgeRequestsLed()
                  onIncomingRequestsClick?.()
                }
          }
        >
          {requestsLedActive && !incomingRequestsDisabled && (
            <span className="dock-hit-area__notification-led" aria-hidden="true" />
          )}
          {incomingRequestsBadgeCount != null &&
            incomingRequestsBadgeCount > 0 &&
            !incomingRequestsDisabled && (
              <span className="dock-hit-area__badge" aria-hidden="true">
                {incomingRequestsBadgeCount > 99 ? '99+' : incomingRequestsBadgeCount}
              </span>
            )}
        </button>
        <button
          className={`dock-hit-area hit-play dock-hit-area--play${primaryPulse ? ' dock-hit-area--pulse dock-node--pulse' : ''}`}
          type="button"
          aria-label="Advance to next phase"
          disabled={primaryDisabled}
          onClick={primaryDisabled ? undefined : onPrimaryActionClick}
        />
        <button
          className={`dock-hit-area hit-stats dock-hit-area--stats${publicUnavailableClass}`}
          type="button"
          aria-label={`Public meter${publicMeterBadgeCount ? ` (${publicMeterBadgeCount})` : ''}`}
          aria-disabled={publicMeterDisabled || disabled}
          disabled={disabled}
          onClick={
            disabled
              ? undefined
              : () => {
                  if (!publicMeterDisabled) acknowledgePublicLed()
                  onPublicMeterClick?.()
                }
          }
        >
          {publicLedActive && !publicMeterDisabled && (
            <span className="dock-hit-area__notification-led" aria-hidden="true" />
          )}
          {publicMeterBadgeCount != null && publicMeterBadgeCount > 0 && !publicMeterDisabled && (
            <span className="dock-hit-area__badge" aria-hidden="true">
              {publicMeterBadgeCount > 99 ? '99+' : publicMeterBadgeCount}
            </span>
          )}
        </button>
        <button
          className={`dock-hit-area hit-confessional dock-hit-area--confessional${confessionalFlash ? ` dock-hit-area--confessional-flash dock-hit-area--confessional-flash-${confessionalFlashTick % 2}` : ''}${confessionalPersistentFlash ? ' dock-hit-area--confessional-persistent' : ''}`}
          type="button"
          aria-label={`Confessional${confessionalBadgeCount ? ` (${confessionalBadgeCount})` : ''}`}
          disabled={disabled}
          onClick={
            disabled
              ? undefined
              : () => {
                  acknowledgeConfessionalLed()
                  onToolClick?.()
                }
          }
        >
          {confessionalLedActive && (
            <span className="dock-hit-area__notification-led" aria-hidden="true" />
          )}
          {confessionalBadgeCount != null && confessionalBadgeCount > 0 && (
            <span className="dock-hit-area__badge dock-hit-area__badge--mission" aria-hidden="true">
              {confessionalBadgeCount > 99 ? '99+' : confessionalBadgeCount}
            </span>
          )}
        </button>
        <button
          ref={moreButtonRef}
          className={`dock-hit-area hit-more dock-hit-area--more${moreOpen ? ' dock-hit-area--active' : ''}`}
          type="button"
          aria-label="More"
          aria-expanded={moreOpen}
          disabled={disabled}
          onClick={() => setMoreOpen((open) => !open)}
        />
        {moreOpen && (
          <div
            ref={moreMenuRef}
            className="game-control-dock__more-menu"
            role="menu"
            aria-label="More destinations"
          >
            {(
              [
                ['settings', navAssetUrl('settings_approved_final.svg'), 'Settings'],
                ['profile', navAssetUrl('profile_approved_final.svg'), 'Profile'],
                ['rules', navAssetUrl('rules_approved_final.svg'), 'Rules'],
                ['leaderboard', navAssetUrl('leaderboard_approved_final.svg'), 'Board'],
                ['store', `${BASE}/assets/icons/shop.svg`, 'Store'],
              ] as const
            ).map(([destination, icon, label]) => (
              <button
                key={destination}
                type="button"
                role="menuitem"
                aria-label={label}
                onClick={() => {
                  setMoreOpen(false)
                  onMoreClick?.(destination)
                }}
              >
                <img src={icon} alt="" aria-hidden="true" draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>
    </nav>
  )
}
