/**
 * Tests for the hard-disabled SoundManager runtime.
 *
 * The public SoundManager API must remain callable so ceremony/minigame hooks
 * do not need to change, but playback/queue/ownership handling should stay off.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundManager } from '../../../src/services/sound/SoundManager';

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

beforeEach(() => {
  resetSoundManager();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetSoundManager();
});

describe('SoundManager disabled runtime', () => {
  it('keeps play() as a safe no-op without queueing or invoking internal playback', async () => {
    const sm = SoundManager as unknown as { _playQueue: unknown[] };
    const doPlay = vi.spyOn(
      SoundManager as unknown as { _doPlay: () => Promise<void> },
      '_doPlay',
    );

    await SoundManager.play('ui:jury_vote');

    expect(doPlay).not.toHaveBeenCalled();
    expect(sm._playQueue).toEqual([]);
  });

  it('keeps playMusic() as a safe no-op without desired-track bookkeeping or playback', async () => {
    const sm = SoundManager as unknown as {
      _playQueue: unknown[];
      _desiredPerOwner: Record<string, unknown>;
    };
    const doPlayMusic = vi.spyOn(
      SoundManager as unknown as { _doPlayMusic: () => Promise<void> },
      '_doPlayMusic',
    );

    await SoundManager.playMusic('music:intro_hub_loop');

    expect(doPlayMusic).not.toHaveBeenCalled();
    expect(sm._desiredPerOwner).toEqual({});
    expect(sm._playQueue).toEqual([]);
  });

  it('keeps requestBgm()/releaseBgm() callable without managing owners or current music', () => {
    const sm = SoundManager as unknown as {
      _currentBgmOwner: string | null;
      _musicKey: string | null;
      _desiredPerOwner: Record<string, unknown>;
    };

    SoundManager.requestBgm('music:veto_phase', 'phase');
    SoundManager.releaseBgm('phase');

    expect(sm._currentBgmOwner).toBeNull();
    expect(sm._musicKey).toBeNull();
    expect(sm._desiredPerOwner).toEqual({});
  });

  it('still records unlock state for gesture hooks without registering queue listeners', () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _unlockHandler: (() => void) | null;
      _playQueue: unknown[];
    };
    const addSpy = vi.spyOn(document, 'addEventListener');

    SoundManager.unlockOnUserGesture();

    expect(sm._unlocked).toBe(true);
    expect(sm._unlockHandler).toBeNull();
    expect(sm._playQueue).toEqual([]);
    expect(addSpy).not.toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(addSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(addSpy).not.toHaveBeenCalledWith('touchstart', expect.any(Function), true);
  });

  it('initialises without binding lifecycle playback listeners', async () => {
    const sm = SoundManager as unknown as {
      _initialised: boolean;
      _lifecycleListenersBound: boolean;
    };

    await SoundManager.init();

    expect(sm._initialised).toBe(true);
    expect(sm._lifecycleListenersBound).toBe(false);
  });
});
