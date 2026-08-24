import { useEffect } from 'react'
import { Capacitor, SystemBars, SystemBarType } from '@capacitor/core'

interface WakeLockSentinelLike {
  released?: boolean
  release?: () => Promise<void>
  addEventListener?: (type: 'release', listener: () => void) => void
  removeEventListener?: (type: 'release', listener: () => void) => void
}

interface WakeLockControllerLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>
}

interface LockableOrientationLike {
  lock?: (orientation: 'portrait') => Promise<void>
  unlock?: () => void
}

/**
 * Keeps the game in an "active play" mode on supported mobile browsers.
 *
 * Current behavior:
 * - requests a screen wake lock so the display stays awake during play
 * - re-requests the wake lock when the tab becomes visible again
 * - attempts to keep the experience portrait-locked when the platform allows it
 * - optionally hides only the native status bar during gameplay, while the
 *   measured CSS safe area remains the fallback if a platform keeps it visible
 */
export default function useGameMode(hideNativeStatusBar = false): void {
  useEffect(() => {
    const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    if (!isNativeAndroid) return undefined

    async function syncStatusBar() {
      try {
        if (hideNativeStatusBar) {
          await SystemBars.hide({ bar: SystemBarType.StatusBar })
        } else {
          await SystemBars.show({ bar: SystemBarType.StatusBar })
        }
      } catch {
        // Web builds and unsupported native shells keep using measured CSS insets.
      }
    }

    function handleStatusBarVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void syncStatusBar()
      }
    }

    function handleNativeResume() {
      void syncStatusBar()
    }

    void syncStatusBar()
    document.addEventListener('visibilitychange', handleStatusBarVisibilityChange)
    window.addEventListener('focus', handleNativeResume)
    window.addEventListener('pageshow', handleNativeResume)

    return () => {
      document.removeEventListener('visibilitychange', handleStatusBarVisibilityChange)
      window.removeEventListener('focus', handleNativeResume)
      window.removeEventListener('pageshow', handleNativeResume)
      if (hideNativeStatusBar) {
        void SystemBars.show({ bar: SystemBarType.StatusBar }).catch(() => undefined)
      }
    }
  }, [hideNativeStatusBar])

  useEffect(() => {
    let isMounted = true
    let wakeLockSentinel: WakeLockSentinelLike | null = null
    let wakeLockRequestInFlight: Promise<void> | null = null
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockControllerLike }).wakeLock
    const orientation = screen.orientation as LockableOrientationLike | undefined

    function isWakeLockRequestAllowedByVisibility() {
      return document.visibilityState === 'visible'
    }

    const handleWakeLockRelease = () => {
      wakeLockSentinel = null
      if (isMounted && isWakeLockRequestAllowedByVisibility()) {
        void requestWakeLock()
      }
    }

    async function releaseWakeLock() {
      const activeSentinel = wakeLockSentinel
      wakeLockSentinel = null

      activeSentinel?.removeEventListener?.('release', handleWakeLockRelease)

      try {
        await activeSentinel?.release?.()
      } catch {
        // Unsupported/rejected wake-lock releases are safe to ignore.
      }
    }

    async function requestWakeLock() {
      if (
        !isMounted ||
        !isWakeLockRequestAllowedByVisibility() ||
        wakeLockSentinel != null ||
        wakeLockRequestInFlight != null
      ) {
        return
      }

      const pendingRequest = (async () => {
        try {
          const sentinel = await wakeLock?.request('screen')
          if (!sentinel) return

          if (!isMounted || !isWakeLockRequestAllowedByVisibility()) {
            await sentinel.release?.()
            return
          }

          wakeLockSentinel = sentinel
          sentinel.addEventListener?.('release', handleWakeLockRelease)
        } catch {
          // Browsers may reject wake lock requests unless the page is active.
        } finally {
          wakeLockRequestInFlight = null
        }
      })()

      wakeLockRequestInFlight = pendingRequest
      await pendingRequest
    }

    async function lockOrientation() {
      try {
        await orientation?.lock?.('portrait')
      } catch {
        // Orientation lock is best-effort and unsupported on many browsers.
      }
    }

    function unlockOrientation() {
      try {
        orientation?.unlock?.()
      } catch {
        // Some browsers expose lock but not unlock; ignore cleanup failures.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void requestWakeLock()
        void lockOrientation()
      } else {
        void releaseWakeLock()
      }
    }

    void requestWakeLock()
    void lockOrientation()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      unlockOrientation()
      void releaseWakeLock()
    }
  }, [])
}
