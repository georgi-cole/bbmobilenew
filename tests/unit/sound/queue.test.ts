/**
 * Tests for SoundManager unlock-queue and drain behaviour.
 *
 * Covers:
 *  1. play() before unlock is queued, not executed immediately
 *  2. playMusic() before unlock is queued (latest music wins)
 *  3. unlockOnUserGesture() drains the queue
 *  4. Calling unlockOnUserGesture() multiple times does not register duplicate
 *     document listeners or cause double-drain
 *  5. stopMusic() clears queued music so it is not started after unlock
 *  6. play() after unlock executes immediately (no queueing)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SoundManager } from '../../../src/services/sound/SoundManager';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Reset the singleton SoundManager's internal state between tests by
 * accessing private fields through a type assertion.  This is acceptable
 * in unit tests where we need full control over the state machine.
 */
function resetSoundManager() {
  const sm = SoundManager as unknown as {
    _unlocked: boolean;
    _unlockHandler: (() => void) | null;
    _playQueue: unknown[];
    _musicEl: HTMLAudioElement | null;
    _musicKey: string | null;
    _sfxPools: Map<string, HTMLAudioElement[]>;
    _failedKeys: Set<string>;
    _initialised: boolean;
    _lifecycleListenersBound: boolean;
    _currentBgmOwner: string | null;
    _desiredPerOwner: Record<string, unknown>;
  };
  sm._unlocked = false;
  sm._unlockHandler = null;
  sm._playQueue = [];
  if (sm._musicEl) {
    sm._musicEl.pause?.();
    sm._musicEl = null;
  }
  sm._musicKey = null;
  sm._sfxPools = new Map();
  sm._failedKeys = new Set();
  sm._initialised = false;
  sm._lifecycleListenersBound = false;
  sm._currentBgmOwner = null;
  sm._desiredPerOwner = {};
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  resetSoundManager();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetSoundManager();
});

// ── 1. play() before unlock is queued ────────────────────────────────────────

describe('SoundManager unlock queue — play()', () => {
  it('does not call _doPlay immediately when not yet unlocked', async () => {
    const doPlay = vi.spyOn(
      SoundManager as unknown as { _doPlay: () => Promise<void> },
      '_doPlay',
    );

    await SoundManager.play('music:intro_hub_loop');

    expect(doPlay).not.toHaveBeenCalled();
  });

  it('queues the play request when not yet unlocked', async () => {
    const sm = SoundManager as unknown as { _playQueue: Array<{ key: string; isMusic: boolean }> };

    await SoundManager.play('music:intro_hub_loop');

    expect(sm._playQueue).toHaveLength(1);
    expect(sm._playQueue[0]).toMatchObject({ key: 'music:intro_hub_loop', isMusic: false });
  });

  it('keeps only the latest queued SFX marker while locked', async () => {
    const sm = SoundManager as unknown as { _playQueue: Array<{ key: string; isMusic: boolean }> };

    await SoundManager.play('ui:jury_vote');
    await SoundManager.play('tv:winner_reveal');

    const sfxItems = sm._playQueue.filter((q) => !q.isMusic);
    expect(sfxItems).toHaveLength(1);
    expect(sfxItems[0]).toMatchObject({ key: 'tv:winner_reveal', isMusic: false });
  });

  it('SFX queued before unlock are discarded on drain (not replayed to avoid flood)', async () => {
    // This is the key iPhone/Safari fix: stale SFX from page-load must NOT
    // replay when the user first taps a button.
    const doPlay = vi.spyOn(
      SoundManager as unknown as { _doPlay: (key: string) => Promise<void> },
      '_doPlay',
    ).mockResolvedValue(undefined);

    await SoundManager.play('ui:jury_vote');
    expect(doPlay).not.toHaveBeenCalled();

    SoundManager.unlockOnUserGesture();

    // Allow micro-tasks to resolve
    await Promise.resolve();

    // SFX from before unlock must be discarded — not replayed
    expect(doPlay).not.toHaveBeenCalled();
  });
});

// ── 2. playMusic() before unlock stores latest desired BGM ───────────────────

describe('SoundManager unlock queue — playMusic()', () => {
  it('stores the desired BGM in _desiredPerOwner (not _playQueue) when not yet unlocked', async () => {
    const sm = SoundManager as unknown as {
      _playQueue: Array<{ key: string; isMusic: boolean }>;
      _desiredPerOwner: Record<string, { key: string } | undefined>;
    };

    await SoundManager.playMusic('music:intro_hub_loop');

    // Music is now stored per-owner, not in the play queue
    expect(sm._desiredPerOwner['phase']).toMatchObject({ key: 'music:intro_hub_loop' });
    // Queue is empty (no music items)
    expect(sm._playQueue.filter((q) => q.isMusic)).toHaveLength(0);
  });

  it('only keeps the latest music request (later call overwrites earlier in _desiredPerOwner)', async () => {
    const sm = SoundManager as unknown as {
      _desiredPerOwner: Record<string, { key: string } | undefined>;
    };

    await SoundManager.playMusic('music:intro_hub_loop');
    await SoundManager.playMusic('music:gb_main');

    // Latest call wins — earlier desired is replaced
    expect(sm._desiredPerOwner['phase']?.key).toBe('music:gb_main');
  });

  it('drains desired BGM and starts music after unlock', async () => {
    const doPlayMusic = vi.spyOn(
      SoundManager as unknown as { _doPlayMusic: (key: string, opts?: unknown) => Promise<void> },
      '_doPlayMusic',
    ).mockResolvedValue(undefined);

    await SoundManager.playMusic('music:intro_hub_loop');
    SoundManager.unlockOnUserGesture();

    await Promise.resolve();

    expect(doPlayMusic).toHaveBeenCalledWith('music:intro_hub_loop', undefined);
  });
});

// ── 3. unlockOnUserGesture drains queue ──────────────────────────────────────

describe('SoundManager unlockOnUserGesture()', () => {
  it('sets _unlocked to true', () => {
    const sm = SoundManager as unknown as { _unlocked: boolean };
    SoundManager.unlockOnUserGesture();
    expect(sm._unlocked).toBe(true);
  });

  it('discards SFX and plays only latest music after unlock', async () => {
    // The key fix for iPhone "flood of sounds": SFX queued before the first
    // user gesture are discarded on unlock.  Only the latest desired BGM starts.
    const musicCalls: string[] = [];

    vi.spyOn(
      SoundManager as unknown as { _doPlay: (key: string) => Promise<void> },
      '_doPlay',
    ).mockImplementation(async (key) => { throw new Error(`SFX ${key} should not be called after unlock`); });

    vi.spyOn(
      SoundManager as unknown as { _doPlayMusic: (key: string) => Promise<void> },
      '_doPlayMusic',
    ).mockImplementation(async (key) => { musicCalls.push(key); });

    await SoundManager.play('ui:jury_vote');
    await SoundManager.playMusic('music:intro_hub_loop');
    await SoundManager.play('tv:winner_reveal');

    SoundManager.unlockOnUserGesture();
    await Promise.resolve();

    // Only the latest desired BGM should have started; SFX discarded
    expect(musicCalls).toEqual(['music:intro_hub_loop']);
  });

  it('play() after unlock bypasses the queue and calls _doPlay directly', async () => {
    SoundManager.unlockOnUserGesture();

    const doPlay = vi.spyOn(
      SoundManager as unknown as { _doPlay: (key: string) => Promise<void> },
      '_doPlay',
    ).mockResolvedValue(undefined);

    const sm = SoundManager as unknown as { _playQueue: unknown[] };

    await SoundManager.play('ui:jury_vote');

    expect(doPlay).toHaveBeenCalledWith('ui:jury_vote', undefined);
    expect(sm._playQueue).toHaveLength(0);
  });
});

// ── 4. Multiple unlockOnUserGesture() calls are safe (no duplicate listeners) ─

describe('SoundManager unlockOnUserGesture() — idempotent listener registration', () => {
  it('does not register duplicate listeners when called multiple times before unlock', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');

    SoundManager.unlockOnUserGesture();
    SoundManager.unlockOnUserGesture();
    SoundManager.unlockOnUserGesture();

    // Listeners are added only on the first call — capture phase, 3 event types
    const captureListeners = addSpy.mock.calls.filter(
      ([, , opts]) => opts === true || (opts as AddEventListenerOptions)?.capture === true,
    );
    // Exactly 3 capture-phase listeners (click + keydown + touchstart), added once
    expect(captureListeners).toHaveLength(3);
  });

  it('drains the queue exactly once even if unlockOnUserGesture() was called multiple times', async () => {
    const drainSpy = vi.spyOn(
      SoundManager as unknown as { _drainQueue: () => void },
      '_drainQueue',
    );

    SoundManager.unlockOnUserGesture();
    SoundManager.unlockOnUserGesture();
    SoundManager.unlockOnUserGesture();

    expect(drainSpy).toHaveBeenCalledTimes(1);
  });
});

// ── 5. stopMusic() clears desired BGM ─────────────────────────────────────────

describe('SoundManager stopMusic() clears desired BGM', () => {
  it('clears _desiredPerOwner so desired music is not started after unlock', async () => {
    const sm = SoundManager as unknown as {
      _desiredPerOwner: Record<string, unknown>;
    };

    await SoundManager.playMusic('music:intro_hub_loop');
    expect(sm._desiredPerOwner['phase']).toBeDefined();

    SoundManager.stopMusic();
    expect(sm._desiredPerOwner['phase']).toBeUndefined();
  });

  it('does not remove queued SFX requests', async () => {
    const sm = SoundManager as unknown as { _playQueue: Array<{ key: string; isMusic: boolean }> };

    // Queue an SFX before unlock, then call playMusic (which stores in _desiredPerOwner, not queue)
    await SoundManager.play('ui:jury_vote');
    await SoundManager.playMusic('music:intro_hub_loop');
    // Only the SFX is in the queue; music is in _desiredPerOwner
    expect(sm._playQueue.filter((q) => !q.isMusic)).toHaveLength(1);

    SoundManager.stopMusic();
    // SFX survives; only desired BGM is cleared
    expect(sm._playQueue).toHaveLength(1);
    expect(sm._playQueue[0]).toMatchObject({ isMusic: false });
  });
});

describe('SoundManager autoplay recovery', () => {
  it('re-arms unlock listener and avoids blacklisting when playMusic hits NotAllowedError after unlock', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _playQueue: Array<{ key: string; isMusic: boolean; opts?: unknown }>;
      _failedKeys: Set<string>;
      _unlockHandler: (() => void) | null;
    };
    sm._unlocked = true;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(
      new DOMException('blocked', 'NotAllowedError'),
    );

    await SoundManager.playMusic('music:intro_hub_loop');

    expect(sm._unlocked).toBe(true);
    // The key must not be blacklisted so it can be replayed
    expect(sm._failedKeys.has('music:intro_hub_loop')).toBe(false);
    // Unlock listeners re-armed
    expect(sm._unlockHandler).not.toBeNull();
    expect(sm._playQueue).toContainEqual({
      key: 'music:intro_hub_loop',
      isMusic: true,
    });
  });

  it('keeps only one queued SFX marker when blocked SFX repeat after unlock', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _playQueue: Array<{ key: string; isMusic: boolean; opts?: unknown }>;
    };
    sm._unlocked = true;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(
      new DOMException('blocked', 'NotAllowedError'),
    );

    await SoundManager.play('ui:jury_vote');
    await SoundManager.play('tv:winner_reveal');

    const sfxItems = sm._playQueue.filter((q) => !q.isMusic);
    expect(sfxItems).toEqual([{ key: 'tv:winner_reveal', isMusic: false, opts: undefined }]);
  });

  it('retries desired music on the next gesture even if audio stayed unlocked', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _playQueue: Array<{ key: string; isMusic: boolean; opts?: unknown }>;
      _desiredPerOwner: Record<string, { key: string; opts?: unknown } | undefined>;
      _queueMusicRetry: () => void;
    };
    const doPlayMusic = vi.spyOn(
      SoundManager as unknown as { _doPlayMusic: (key: string, opts?: unknown) => Promise<void> },
      '_doPlayMusic',
    ).mockResolvedValue(undefined);
    vi.spyOn(
      SoundManager as unknown as { _primeSfxForMobile: () => void },
      '_primeSfxForMobile',
    ).mockImplementation(() => {});

    sm._unlocked = true;
    sm._desiredPerOwner = {
      phase: { key: 'music:intro_hub_loop', opts: undefined },
    };
    sm._queueMusicRetry();

    SoundManager.unlockOnUserGesture();
    await Promise.resolve();

    expect(sm._unlocked).toBe(true);
    expect(sm._playQueue).toEqual([]);
    expect(doPlayMusic).toHaveBeenCalledWith('music:intro_hub_loop', undefined);
  });

  it('does NOT reset _unlocked when the page is hidden (prevents stale re-queuing on iOS)', async () => {
    // The fix: we no longer pre-emptively reset _unlocked on visibility-hide.
    // This prevents phase-transition music requests from being incorrectly queued
    // while the app is briefly backgrounded on iPhone.
    const sm = SoundManager as unknown as { _unlocked: boolean };
    await SoundManager.init();
    SoundManager.unlockOnUserGesture();
    expect(sm._unlocked).toBe(true);

    const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');

    try {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));

      // _unlocked should remain true — no pre-emptive reset on hide
      expect(sm._unlocked).toBe(true);
    } finally {
      if (originalHiddenDescriptor) {
        Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
      } else {
        Reflect.deleteProperty(document, 'hidden');
      }
    }
  });
});
