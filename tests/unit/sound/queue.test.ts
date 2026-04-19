import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundManager } from '../../../src/services/sound/SoundManager';
import type { SoundCategory } from '../../../src/services/sound/sounds';

function resetSoundManager() {
  const sm = SoundManager as unknown as {
    _unlocked: boolean;
    _unlockHandler: (() => void) | null;
    _playQueue: Array<{ key: string; opts?: { volume?: number } }>;
    _musicEl: HTMLAudioElement | null;
    _musicKey: string | null;
    _desiredMusicTrack: string;
    _playingMusicTrack: string;
    _desiredMusicReason: string | null;
    _musicPlaybackToken: number;
    _musicMuted: boolean;
    _musicVolume: number;
    _sfxPools: Map<string, HTMLAudioElement[]>;
    _failedKeys: Set<string>;
    _categories: Map<SoundCategory, { enabled: boolean; volume: number }>;
    _extraRegistry: Map<string, unknown>;
    _initialised: boolean;
    _lifecycleListenersBound: boolean;
    _desiredPerOwner: Record<string, unknown>;
    _currentBgmOwner: string | null;
    _lastPlayedAt: Map<string, number>;
  };
  sm._unlocked = false;
  sm._unlockHandler = null;
  sm._playQueue = [];
  if (sm._musicEl) {
    sm._musicEl.pause?.();
    sm._musicEl = null;
  }
  sm._musicKey = null;
  sm._desiredMusicTrack = 'none';
  sm._playingMusicTrack = 'none';
  sm._desiredMusicReason = null;
  sm._musicPlaybackToken = 0;
  sm._musicMuted = false;
  sm._musicVolume = 1;
  sm._sfxPools = new Map();
  sm._failedKeys = new Set();
  sm._categories = new Map();
  sm._extraRegistry = new Map();
  sm._initialised = false;
  sm._lifecycleListenersBound = false;
  sm._desiredPerOwner = {};
  sm._currentBgmOwner = null;
  sm._lastPlayedAt = new Map();
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  resetSoundManager();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetSoundManager();
});

describe('SoundManager music state machine', () => {
  it('stores only the latest desired music while locked and starts it after unlock', async () => {
    await SoundManager.setDesiredMusic('competition', 'phase');
    await SoundManager.setDesiredMusic('risk_wheel', 'minigame');

    expect(SoundManager.currentMusicKey).toBeNull();

    SoundManager.unlockFromGesture();
    await Promise.resolve();

    expect(SoundManager.currentMusicTrack).toBe('risk_wheel');
    expect(SoundManager.currentMusicKey).toBe('music:risk_wheel_loop');
  });

  it('panicStopAllMusic hard-stops the active track and clears references', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean };
    sm._unlocked = true;

    await SoundManager.setDesiredMusic('competition', 'phase');
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general');

    SoundManager.panicStopAllMusic();

    expect(SoundManager.currentMusicKey).toBeNull();
    expect(SoundManager.currentMusicTrack).toBe('none');
  });

  it('panicStopAllMusic does NOT clear _desiredMusicTrack (syncMusic can restart)', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _desiredMusicTrack: string;
    };
    sm._unlocked = true;

    await SoundManager.setDesiredMusic('competition', 'phase');
    SoundManager.panicStopAllMusic();

    // _desiredMusicTrack is still 'competition' — calling syncMusic() would
    // restart the track.  This is expected behaviour for panicStop; callers
    // that need to prevent a restart must use stopAllMusic() instead.
    expect(sm._desiredMusicTrack).toBe('competition');
  });

  it('stopAllMusic clears _desiredMusicTrack so syncMusic cannot restart stale music', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _desiredMusicTrack: string;
    };
    sm._unlocked = true;

    await SoundManager.setDesiredMusic('competition', 'phase');
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general');

    SoundManager.stopAllMusic();

    // Both playback and the desired-track pointer are cleared.
    expect(SoundManager.currentMusicKey).toBeNull();
    expect(SoundManager.currentMusicTrack).toBe('none');
    expect(sm._desiredMusicTrack).toBe('none');
  });

  it('after stopAllMusic, syncMusic does not restart the previous track', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean };
    sm._unlocked = true;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    await SoundManager.setDesiredMusic('competition', 'phase');
    expect(playSpy).toHaveBeenCalledTimes(1);

    SoundManager.stopAllMusic();
    const playsAfterStop = playSpy.mock.calls.length;

    // syncMusic() sees desiredTrack = 'none' → calls panicStopAllMusic, no replay.
    await SoundManager.syncMusic();

    expect(playSpy.mock.calls.length).toBe(playsAfterStop);
    expect(SoundManager.currentMusicKey).toBeNull();
  });

  it('ignores stale async playback from an older sync token', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean };
    sm._unlocked = true;

    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => {
          resolveSecond = resolve;
        }),
      );

    const first = SoundManager.setDesiredMusic('competition', 'first');
    const second = SoundManager.setDesiredMusic('nominations', 'second');

    resolveFirst();
    await Promise.resolve();
    resolveSecond();
    await Promise.all([first, second]);

    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(SoundManager.currentMusicTrack).toBe('nominations');
    expect(SoundManager.currentMusicKey).toBe('music:nominations_main');
  });

  it('is idempotent when syncMusic runs without a desired-track change', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean };
    sm._unlocked = true;
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    await SoundManager.setDesiredMusic('competition', 'initial');
    await SoundManager.syncMusic();
    await SoundManager.syncMusic();

    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(SoundManager.currentMusicTrack).toBe('competition');
  });

  it('creates music elements with preload disabled so tracks load on demand', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _musicEl: HTMLAudioElement | null;
    };
    sm._unlocked = true;

    await SoundManager.setDesiredMusic('competition', 'phase');

    expect(sm._musicEl?.preload).toBe('none');
  });

  it('retries only the current desired track after a blocked play on the next gesture', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean };
    sm._unlocked = true;
    const notAllowed = new DOMException('blocked', 'NotAllowedError');
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(notAllowed)
      .mockResolvedValue(undefined);
    const primeSpy = vi.spyOn(
      SoundManager as unknown as { _primeSfxForMobile: () => void },
      '_primeSfxForMobile',
    ).mockImplementation(() => {});

    await SoundManager.setDesiredMusic('competition', 'initial');
    expect(SoundManager.currentMusicKey).toBeNull();

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(playSpy).toHaveBeenCalledTimes(2);
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general');

    primeSpy.mockRestore();
  });
});

describe('SoundManager legacy wrappers and SFX queue', () => {
  it('requestBgm logs a warning and routes to setDesiredMusic', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    SoundManager.requestBgm('music:hoh_comp_general', 'phase');
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith('[audio] legacy requestBgm("music:hoh_comp_general", "phase")');
    expect((SoundManager as unknown as { _desiredMusicTrack: string })._desiredMusicTrack).toBe('competition');
  });

  it('requestBgm preserves the remote main music mapping', async () => {
    SoundManager.registerDynamic({
      key: 'music:remote_main',
      category: 'music',
      src: 'https://example.com/main.mp3',
      preload: false,
      volume: 0.5,
      loop: true,
    });

    SoundManager.requestBgm('music:remote_main', 'phase');
    await Promise.resolve();

    expect((SoundManager as unknown as { _desiredMusicTrack: string })._desiredMusicTrack).toBe('competition');
  });

  it('releaseBgm logs a warning and clears the desired track', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await SoundManager.setDesiredMusic('competition', 'phase');
    SoundManager.releaseBgm('phase');
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith('[audio] legacy releaseBgm("phase")');
    expect((SoundManager as unknown as { _desiredMusicTrack: string })._desiredMusicTrack).toBe('none');
  });

  it('play() before unlock queues a single SFX marker', async () => {
    const sm = SoundManager as unknown as {
      _playQueue: Array<{ key: string; opts?: { volume?: number } }>;
    };

    await SoundManager.play('ui:confirm');

    expect(sm._playQueue).toEqual([{ key: 'ui:confirm', opts: undefined }]);
  });

  it('multiple play() calls before unlock collapse to one SFX marker', async () => {
    const sm = SoundManager as unknown as {
      _playQueue: Array<{ key: string; opts?: { volume?: number } }>;
    };

    await SoundManager.play('ui:confirm');
    await SoundManager.play('ui:navigate');
    await SoundManager.play('ui:error');

    expect(sm._playQueue).toHaveLength(1);
  });
});

describe('SoundManager init + unlock listeners', () => {
  it('init() marks the manager initialised and binds lifecycle listeners', async () => {
    const sm = SoundManager as unknown as {
      _initialised: boolean;
      _lifecycleListenersBound: boolean;
      _bindLifecycleListeners: () => void;
    };

    const bindSpy = vi.spyOn(sm, '_bindLifecycleListeners').mockImplementation(() => {
      sm._lifecycleListenersBound = true;
    });

    await SoundManager.init();

    expect(sm._initialised).toBe(true);
    expect(sm._lifecycleListenersBound).toBe(true);
    expect(bindSpy).toHaveBeenCalledOnce();
  });

  it('unlockOnUserGesture registers document listeners', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');

    SoundManager.unlockOnUserGesture();

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(addSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), true);
  });
});

describe('SoundManager SFX dedup window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function getDoPlaySpy() {
    // Spy on the private post-dedup playback path so we can verify whether
    // `play()` decided to forward the call or drop it, independent of any
    // jsdom media-loading side effects in `_doPlay`.
    const sm = SoundManager as unknown as {
      _doPlay: (key: string, opts?: { volume?: number }) => Promise<void>;
    };
    return vi.spyOn(sm, '_doPlay').mockResolvedValue(undefined);
  }

  it('drops a duplicate play() for the same key within the dedup window', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean };
    sm._unlocked = true;
    const doPlaySpy = getDoPlaySpy();

    await SoundManager.play('ui:confirm');
    vi.advanceTimersByTime(20);
    await SoundManager.play('ui:confirm');

    expect(doPlaySpy).toHaveBeenCalledTimes(1);
  });

  it('allows repeated plays for the same key after the dedup window elapses', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _lastPlayedAt: Map<string, number>;
    };
    sm._unlocked = true;
    const doPlaySpy = getDoPlaySpy();

    await SoundManager.play('ui:confirm');
    vi.advanceTimersByTime(41);
    await SoundManager.play('ui:confirm');

    expect(doPlaySpy).toHaveBeenCalledTimes(2);
  });

  it('does not dedup distinct SFX keys against each other', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean };
    sm._unlocked = true;
    const doPlaySpy = getDoPlaySpy();

    await SoundManager.play('ui:confirm');
    await SoundManager.play('ui:navigate');
    await SoundManager.play('ui:error');

    expect(doPlaySpy).toHaveBeenCalledTimes(3);
  });

  it('bypasses the dedup window when opts.allowDuplicate is true', async () => {
    const sm = SoundManager as unknown as { _unlocked: boolean };
    sm._unlocked = true;
    const doPlaySpy = getDoPlaySpy();

    await SoundManager.play('ui:confirm', { allowDuplicate: true });
    await SoundManager.play('ui:confirm', { allowDuplicate: true });

    expect(doPlaySpy).toHaveBeenCalledTimes(2);
  });
});

describe('SoundManager unlockFromGesture idempotency', () => {
  it('does not panic-stop or restart the current track on repeat gestures', async () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _primeSfxForMobile: () => void;
    };
    // Stub the iOS SFX priming path — it is irrelevant to this behavior and
    // creates many audio elements that pollute the play-spy counters.
    vi.spyOn(sm, '_primeSfxForMobile').mockImplementation(() => {});
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});

    // First unlock: should start the desired track exactly once.
    await SoundManager.setDesiredMusic('competition', 'initial');
    SoundManager.unlockFromGesture();
    await Promise.resolve();
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general');

    const playsAfterFirstUnlock = playSpy.mock.calls.length;
    const pausesAfterFirstUnlock = pauseSpy.mock.calls.length;

    // Subsequent gesture should be idempotent: no pause, no restart.
    SoundManager.unlockFromGesture();
    await Promise.resolve();

    expect(playSpy.mock.calls.length).toBe(playsAfterFirstUnlock);
    expect(pauseSpy.mock.calls.length).toBe(pausesAfterFirstUnlock);
    expect(SoundManager.currentMusicKey).toBe('music:hoh_comp_general');
  });
});
