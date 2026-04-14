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

  it('drops queued SFX after unlock instead of replaying stale effects', async () => {
    const doPlay = vi.spyOn(
      SoundManager as unknown as { _doPlay: (key: string) => Promise<void> },
      '_doPlay',
    ).mockResolvedValue(undefined);

    await SoundManager.play('ui:jury_vote');
    expect(doPlay).not.toHaveBeenCalled();

    SoundManager.unlockOnUserGesture();

    // Allow micro-tasks from _drainQueue to resolve
    await Promise.resolve();

    expect(doPlay).not.toHaveBeenCalled();
  });
});

// ── 2. playMusic() before unlock queues latest music only ────────────────────

describe('SoundManager unlock queue — playMusic()', () => {
  it('queues music request when not yet unlocked', async () => {
    const sm = SoundManager as unknown as { _playQueue: Array<{ key: string; isMusic: boolean }> };

    await SoundManager.playMusic('music:intro_hub_loop');

    expect(sm._playQueue).toHaveLength(1);
    expect(sm._playQueue[0]).toMatchObject({ key: 'music:intro_hub_loop', isMusic: true });
  });

  it('only keeps the latest music request in the queue (replaces earlier)', async () => {
    const sm = SoundManager as unknown as { _playQueue: Array<{ key: string; isMusic: boolean }> };

    await SoundManager.playMusic('music:intro_hub_loop');
    await SoundManager.playMusic('music:gb_main');

    const musicItems = sm._playQueue.filter((q) => q.isMusic);
    expect(musicItems).toHaveLength(1);
    expect(musicItems[0].key).toBe('music:gb_main');
  });

  it('drains music queue and starts music after unlock', async () => {
    const doPlayMusic = vi.spyOn(
      SoundManager as unknown as { _doPlayMusic: (key: string) => Promise<void> },
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

  it('drains queued music but discards queued SFX', async () => {
    const calls: string[] = [];

    vi.spyOn(
      SoundManager as unknown as { _doPlay: (key: string) => Promise<void> },
      '_doPlay',
    ).mockImplementation(async (key) => { calls.push(`sfx:${key}`); });

    vi.spyOn(
      SoundManager as unknown as { _doPlayMusic: (key: string) => Promise<void> },
      '_doPlayMusic',
    ).mockImplementation(async (key) => { calls.push(`music:${key}`); });

    await SoundManager.play('ui:jury_vote');
    await SoundManager.playMusic('music:intro_hub_loop');
    await SoundManager.play('tv:winner_reveal');

    SoundManager.unlockOnUserGesture();
    await Promise.resolve();

    expect(calls).toEqual(['music:music:intro_hub_loop']);
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

// ── 5. stopMusic() clears queued music ────────────────────────────────────────

describe('SoundManager stopMusic() clears queued music', () => {
  it('removes a queued music request so it is not started after unlock', async () => {
    const sm = SoundManager as unknown as { _playQueue: Array<{ key: string; isMusic: boolean }> };

    await SoundManager.playMusic('music:intro_hub_loop');
    expect(sm._playQueue.filter((q) => q.isMusic)).toHaveLength(1);

    SoundManager.stopMusic();
    expect(sm._playQueue.filter((q) => q.isMusic)).toHaveLength(0);
  });

  it('does not remove queued sfx requests', async () => {
    const sm = SoundManager as unknown as { _playQueue: Array<{ key: string; isMusic: boolean }> };

    await SoundManager.play('ui:jury_vote');
    await SoundManager.playMusic('music:intro_hub_loop');
    expect(sm._playQueue).toHaveLength(2);

    SoundManager.stopMusic();
    expect(sm._playQueue).toHaveLength(1);
    expect(sm._playQueue[0]).toMatchObject({ isMusic: false });
  });
});

describe('SoundManager autoplay recovery', () => {
  it('re-queues music and avoids blacklisting when playMusic hits NotAllowedError after unlock', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _playQueue: Array<{ key: string; isMusic: boolean; opts?: unknown }>;
      _failedKeys: Set<string>;
    };
    sm._unlocked = true;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValueOnce(
      new DOMException('blocked', 'NotAllowedError'),
    );

    await SoundManager.playMusic('music:intro_hub_loop');

    expect(sm._unlocked).toBe(true);
    expect(sm._playQueue).toContainEqual({
      key: 'music:intro_hub_loop',
      isMusic: true,
      opts: undefined,
    });
    expect(sm._failedKeys.has('music:intro_hub_loop')).toBe(false);
  });

  it('retries queued music on the next gesture even if audio stayed unlocked', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _playQueue: Array<{ key: string; isMusic: boolean; opts?: unknown }>;
      _queueMusicRetry: (key: string) => void;
    };
    const doPlayMusic = vi.spyOn(
      SoundManager as unknown as { _doPlayMusic: (key: string) => Promise<void> },
      '_doPlayMusic',
    ).mockResolvedValue(undefined);
    vi.spyOn(
      SoundManager as unknown as { _primeSfxForMobile: () => void },
      '_primeSfxForMobile',
    ).mockImplementation(() => {});

    sm._unlocked = true;
    sm._queueMusicRetry('music:intro_hub_loop');

    SoundManager.unlockOnUserGesture();
    await Promise.resolve();

    expect(sm._unlocked).toBe(true);
    expect(sm._playQueue).toEqual([]);
    expect(doPlayMusic).toHaveBeenCalledWith('music:intro_hub_loop', undefined);
  });

  it('caps SFX priming work per gesture', () => {
    const realCreateElement = document.createElement.bind(document);
    let primedAudioCount = 0;

    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName !== 'audio') {
        return realCreateElement(tagName);
      }
      primedAudioCount += 1;
      return {
        src: '',
        loop: false,
        volume: 1,
        muted: false,
        preload: 'none',
        error: null,
        currentTime: 0,
        paused: true,
        ended: false,
        addEventListener: vi.fn(),
        pause: vi.fn(),
        play: vi.fn().mockReturnValue(Promise.resolve()),
      } as unknown as HTMLAudioElement;
    }) as typeof document.createElement);

    (
      SoundManager as unknown as { _primeSfxForMobile: () => void }
    )._primeSfxForMobile();

    expect(primedAudioCount).toBe(8);
  });

  it('marks audio as needing a fresh gesture after the page is hidden', async () => {
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

      expect(sm._unlocked).toBe(false);
    } finally {
      if (originalHiddenDescriptor) {
        Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
      } else {
        Reflect.deleteProperty(document, 'hidden');
      }
    }
  });
});
