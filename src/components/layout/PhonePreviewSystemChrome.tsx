import { useEffect } from 'react'
import { useLocation } from 'react-router'

type PreviewPlatform = 'iphone' | 'android'

const PREVIEW_INSETS: Record<PreviewPlatform, { top: number; bottom: number }> = {
  iphone: { top: 59, bottom: 34 },
  android: { top: 28, bottom: 24 },
}

function getPreviewPlatform(search: string): PreviewPlatform | null {
  const requested = new URLSearchParams(search).get('phonePlatform')
  if (requested === 'iphone' || requested === 'android') return requested
  if (window.name === 'phone-preview:iphone') return 'iphone'
  if (window.name === 'phone-preview:android') return 'android'
  return null
}

function formatPreviewTime() {
  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 18 12" aria-hidden="true">
      <rect x="1" y="8" width="2.2" height="3" rx="0.7" />
      <rect x="5.3" y="6" width="2.2" height="5" rx="0.7" />
      <rect x="9.6" y="3" width="2.2" height="8" rx="0.7" />
      <rect x="13.9" width="2.2" height="11" rx="0.7" />
    </svg>
  )
}

function WifiIcon() {
  return (
    <svg viewBox="0 0 18 13" aria-hidden="true">
      <path d="M1 4.3a12.3 12.3 0 0 1 16 0" />
      <path d="M4 7.3a7.7 7.7 0 0 1 10 0" />
      <path d="M7.1 10.1a3 3 0 0 1 3.8 0" />
      <circle cx="9" cy="11.5" r="1" />
    </svg>
  )
}

function BatteryIcon() {
  return (
    <svg viewBox="0 0 25 12" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="20"
        height="10"
        rx="3"
        className="phone-preview-chrome__battery-case"
      />
      <rect
        x="3"
        y="3"
        width="15"
        height="6"
        rx="1.5"
        className="phone-preview-chrome__battery-level"
      />
      <path d="M23 4.1v3.8" />
    </svg>
  )
}

export default function PhonePreviewSystemChrome() {
  const location = useLocation()
  const platform = getPreviewPlatform(location.search)
  const hidesAndroidStatusBar = platform === 'android' && location.pathname === '/game'

  useEffect(() => {
    if (!platform) return undefined

    const root = document.documentElement
    const insets = PREVIEW_INSETS[platform]
    const topInset = hidesAndroidStatusBar ? 0 : insets.top
    const properties = [
      '--safe-area-inset-top',
      '--safe-area-inset-right',
      '--safe-area-inset-bottom',
      '--safe-area-inset-left',
      '--app-safe-area-top-fallback',
    ] as const
    const previous = new Map(
      properties.map((property) => [property, root.style.getPropertyValue(property)])
    )
    const previewClasses = [
      'is-phone-preview',
      'is-capacitor',
      `is-capacitor-${platform === 'iphone' ? 'ios' : 'android'}`,
    ]
    const newlyAddedClasses = previewClasses.filter(
      (className) => !root.classList.contains(className)
    )

    root.style.setProperty('--safe-area-inset-top', `${topInset}px`)
    root.style.setProperty('--safe-area-inset-right', '0px')
    root.style.setProperty('--safe-area-inset-bottom', `${insets.bottom}px`)
    root.style.setProperty('--safe-area-inset-left', '0px')
    root.style.setProperty('--app-safe-area-top-fallback', `${topInset}px`)
    root.classList.toggle('is-native-status-bar-hidden', hidesAndroidStatusBar)
    root.classList.add(...previewClasses)

    window.dispatchEvent(new Event('resize'))

    return () => {
      for (const property of properties) {
        const value = previous.get(property)
        if (value) root.style.setProperty(property, value)
        else root.style.removeProperty(property)
      }
      root.classList.remove(...newlyAddedClasses)
      root.classList.remove('is-native-status-bar-hidden')
      window.dispatchEvent(new Event('resize'))
    }
  }, [hidesAndroidStatusBar, platform])

  if (!platform) return null

  return (
    <>
      {!hidesAndroidStatusBar && (
        <div
          className={`phone-preview-chrome phone-preview-chrome--${platform}`}
          aria-label={`${platform === 'iphone' ? 'iPhone' : 'Android'} simulated status bar`}
        >
          <div className="phone-preview-chrome__left">
            <strong>{formatPreviewTime()}</strong>
            <span>KoleTel</span>
          </div>
          <div className="phone-preview-chrome__right">
            <SignalIcon />
            <WifiIcon />
            <BatteryIcon />
          </div>
        </div>
      )}
      <div
        className={`phone-preview-chrome__home phone-preview-chrome__home--${platform}`}
        aria-hidden="true"
      />
    </>
  )
}
