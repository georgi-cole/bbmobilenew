import { useEffect } from 'react';

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

/**
 * Keeps the game in an "active play" mode on supported mobile browsers.
 *
 * Current behavior:
 * - requests a screen wake lock so the display stays awake during play
 * - re-requests the wake lock when the tab becomes visible again
 * - attempts to keep the experience portrait-locked when the platform allows it
 */
export default function useGameMode(): void {
  useEffect(() => {
    let isMounted = true;
    let wakeLockSentinel: WakeLockSentinelLike | null = null;

    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockControllerLike }).wakeLock;
    const orientation = screen.orientation as LockableOrientationLike | undefined;

    const handleWakeLockRelease = () => {
      wakeLockSentinel = null;
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
      if (!isMounted || document.visibilityState === 'hidden' || wakeLockSentinel != null) {
        return;
      }

      try {
        const sentinel = await wakeLock?.request('screen');
        if (!sentinel) return;

        if (!isMounted) {
          await sentinel.release?.();
          return;
        }

        wakeLockSentinel = sentinel;
        sentinel.addEventListener?.('release', handleWakeLockRelease);
      } catch {
        // Browsers may reject wake lock requests unless the page is active.
      }
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

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    }

    void requestWakeLock();
    void lockOrientation();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      unlockOrientation();
      void releaseWakeLock();
    };
  }, []);
}
