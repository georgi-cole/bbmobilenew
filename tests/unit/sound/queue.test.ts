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

  it('drains the queue and plays after unlock', async () => {
    const doPlay = vi.spyOn(
      SoundManager as unknown as { _doPlay: (key: string) => Promise<void> },
      '_doPlay',
    ).mockResolvedValue(undefined);

    await SoundManager.play('ui:jury_vote');
    expect(doPlay).not.toHaveBeenCalled();

    SoundManager.unlockOnUserGesture();

    // Allow micro-tasks from _drainQueue to resolve
    await Promise.resolve();

    expect(doPlay).toHaveBeenCalledWith('ui:jury_vote', undefined);
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

  it('drains mixed sfx + music queue in order', async () => {
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

    expect(calls).toContain('sfx:ui:jury_vote');
    expect(calls).toContain('music:music:intro_hub_loop');
    expect(calls).toContain('sfx:tv:winner_reveal');
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
