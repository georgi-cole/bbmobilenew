import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

interface WakeLockSentinelLike {
  released?: boolean;
  release?: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
}

interface WakeLockControllerLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

interface LockableOrientationLike {
  lock?: (orientation: 'portrait') => Promise<void>;
  unlock?: () => void;
}

interface NativeStatusBarLike {
  hide?: () => Promise<void>;
  show?: () => Promise<void>;
  setOverlaysWebView?: (options: { overlay: boolean }) => Promise<void>;
}

function getNativeStatusBar(): NativeStatusBarLike | null {
  if (!Capacitor.isNativePlatform()) return null;

  const plugins = (Capacitor as unknown as { Plugins?: Record<string, unknown> }).Plugins;
  return (plugins?.StatusBar as NativeStatusBarLike | undefined) ?? null;
}

/**
 * Keeps the game in an "active play" mode on supported mobile browsers.
 *
 * Current behavior:
 * - requests a screen wake lock so the display stays awake during play
 * - re-requests the wake lock when the tab becomes visible again
 * - attempts to keep the experience portrait-locked when the platform allows it
 * - lets the native status bar overlay the WebView before hiding it so
 *   SafeGameViewport remains the only safe-area layout owner
 */
export default function useGameMode(): void {
  useEffect(() => {
    let isMounted = true;
    let wakeLockSentinel: WakeLockSentinelLike | null = null;
    let wakeLockRequestInFlight: Promise<void> | null = null;
    let statusBarHidden = false;

    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockControllerLike }).wakeLock;
    const orientation = screen.orientation as LockableOrientationLike | undefined;
    const statusBar = getNativeStatusBar();

    function isWakeLockRequestAllowedByVisibility() {
      return document.visibilityState === 'visible';
    }

    const handleWakeLockRelease = () => {
      wakeLockSentinel = null;
      if (isMounted && isWakeLockRequestAllowedByVisibility()) {
        void requestWakeLock();
      }
    };

    async function releaseWakeLock() {
      const activeSentinel = wakeLockSentinel;
      wakeLockSentinel = null;

      activeSentinel?.removeEventListener?.('release', handleWakeLockRelease);

      try {
        await activeSentinel?.release?.();
      } catch {
        // Unsupported/rejected wake-lock releases are safe to ignore.
      }
    }

    async function requestWakeLock() {
      if (
        !isMounted
        || !isWakeLockRequestAllowedByVisibility()
        || wakeLockSentinel != null
        || wakeLockRequestInFlight != null
      ) {
        return;
      }

      const pendingRequest = (async () => {
        try {
          const sentinel = await wakeLock?.request('screen');
          if (!sentinel) return;

          if (!isMounted || !isWakeLockRequestAllowedByVisibility()) {
            await sentinel.release?.();
            return;
          }

          wakeLockSentinel = sentinel;
          sentinel.addEventListener?.('release', handleWakeLockRelease);
        } catch {
          // Browsers may reject wake lock requests unless the page is active.
        } finally {
          wakeLockRequestInFlight = null;
        }
      })();

      wakeLockRequestInFlight = pendingRequest;
      await pendingRequest;
    }

    async function lockOrientation() {
      try {
        await orientation?.lock?.('portrait');
      } catch {
        // Orientation lock is best-effort and unsupported on many browsers.
      }
    }

    function unlockOrientation() {
      try {
        orientation?.unlock?.();
      } catch {
        // Some browsers expose lock but not unlock; ignore cleanup failures.
      }
    }

    async function hideStatusBar() {
      if (!statusBar || statusBarHidden) return;

      try {
        // SafeGameViewport owns CSS safe-area layout; native APIs must not resize the WebView.
        await statusBar.setOverlaysWebView?.({ overlay: true });
        await statusBar.hide?.();
        statusBarHidden = true;
      } catch {
        // SafeGameViewport owns layout correctness even when native APIs fail.
      }
    }

    async function showStatusBar() {
      if (!statusBar || !statusBarHidden) return;

      try {
        await statusBar.show?.();
      } catch {
        // Native status bar restoration is best-effort during teardown.
      } finally {
        statusBarHidden = false;
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
        void lockOrientation();
        void hideStatusBar();
      } else {
        void releaseWakeLock();
        void showStatusBar();
      }
    }

    void requestWakeLock();
    void lockOrientation();
    void hideStatusBar();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unlockOrientation();
      void showStatusBar();
      void releaseWakeLock();
    };
  }, []);
}
