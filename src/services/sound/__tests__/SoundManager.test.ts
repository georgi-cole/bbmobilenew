import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundManager } from '../SoundManager';

type SoundManagerInternal = typeof SoundManager & {
  _categories: Map<unknown, unknown>;
  _sfxPools: Map<string, HTMLAudioElement[]>;
  _failedKeys: Set<string>;
  _initialised: boolean;
  _unlocked: boolean;
  _playQueue: Array<{ key: string; isMusic: boolean; opts?: { volume?: number } }>;
  _unlockHandler: (() => void) | null;
  _lifecycleListenersBound: boolean;
  _doPlay: (key: string, opts?: { volume?: number }) => Promise<void>;
  _doPlayMusic: (key: string, opts?: { volume?: number }) => Promise<void>;
  _drainQueue: () => void;
  _queueMusicRetry: (key: string, opts?: { volume?: number }) => void;
  _primeSfxForMobile: () => void;
};

function resetSoundManager(): SoundManagerInternal {
  const manager = SoundManager as SoundManagerInternal;
  manager._categories = new Map();
  manager._sfxPools = new Map();
  manager._failedKeys = new Set();
  manager._initialised = false;
  manager._unlocked = false;
  manager._playQueue = [];
  manager._unlockHandler = null;
  manager._lifecycleListenersBound = false;
  return manager;
}

describe('SoundManager', () => {
  beforeEach(() => {
    resetSoundManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetSoundManager();
  });

  it('drains queued music but discards queued SFX on unlock', () => {
    const manager = SoundManager as SoundManagerInternal;
    const playMusicSpy = vi.spyOn(manager, '_doPlayMusic').mockResolvedValue();
    const playSpy = vi.spyOn(manager, '_doPlay').mockResolvedValue();
    const primeSpy = vi.spyOn(manager, '_primeSfxForMobile').mockImplementation(() => {});

    manager._playQueue = [
      { key: 'music:intro_hub_loop', isMusic: true },
      { key: 'ui:confirm', isMusic: false },
      { key: 'tv:event', isMusic: false },
    ];

    manager._drainQueue();

    expect(playMusicSpy).toHaveBeenCalledTimes(1);
    expect(playMusicSpy).toHaveBeenCalledWith('music:intro_hub_loop', undefined);
    expect(playSpy).not.toHaveBeenCalled();
    expect(primeSpy).toHaveBeenCalledTimes(1);
    expect(manager._playQueue).toEqual([]);
  });

  it('retries music on the next gesture without globally re-locking audio', () => {
    const manager = SoundManager as SoundManagerInternal;
    const playMusicSpy = vi.spyOn(manager, '_doPlayMusic').mockResolvedValue();
    vi.spyOn(manager, '_primeSfxForMobile').mockImplementation(() => {});

    manager._unlocked = true;

    manager._queueMusicRetry('music:intro_hub_loop');

    expect(manager._unlocked).toBe(true);
    expect(manager._playQueue).toEqual([{ key: 'music:intro_hub_loop', isMusic: true, opts: undefined }]);

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(playMusicSpy).toHaveBeenCalledWith('music:intro_hub_loop', undefined);
    expect(manager._unlockHandler).toBeNull();
    expect(manager._playQueue).toEqual([]);
  });

  it('re-queues blocked SFX without globally re-locking audio', async () => {
    const manager = SoundManager as SoundManagerInternal;
    const blockedEl = {
      paused: true,
      ended: false,
      currentTime: 0,
      volume: 1,
      pause: vi.fn(),
      play: vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError')),
    } as unknown as HTMLAudioElement;

    manager._unlocked = true;
    manager._sfxPools.set('ui:confirm', [blockedEl]);

    await manager._doPlay('ui:confirm');

    expect(manager._unlocked).toBe(true);
    expect(manager._playQueue).toEqual([{ key: 'ui:confirm', isMusic: false, opts: undefined }]);
    expect(manager._unlockHandler).not.toBeNull();
  });

  it('caps mobile SFX priming work per gesture', () => {
    const manager = SoundManager as SoundManagerInternal;
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

    manager._primeSfxForMobile();

    expect(primedAudioCount).toBe(8);
  });
});
