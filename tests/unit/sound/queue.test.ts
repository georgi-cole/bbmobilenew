/**
 * Tests for the SoundManager enabled runtime — BGM ownership, priority fallback,
 * SFX queue, and lifecycle behaviour.
 *
 * Audio playback is safe-mocked (HTMLAudioElement.prototype.play resolves
 * immediately) so tests run without real media files.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundManager } from '../../../src/services/sound/SoundManager';

// ── Audio element mocks ───────────────────────────────────────────────────────

/**
 * Reset all private SoundManager state between tests so tests do not bleed
 * into each other via the singleton.
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

beforeEach(() => {
  // Mock HTMLAudioElement.prototype.play so _doPlayMusic / _doPlay do not
  // error out in jsdom (which does not support media elements).
  vi.spyOn(HTMLAudioElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLAudioElement.prototype, 'pause').mockImplementation(() => {});
  resetSoundManager();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetSoundManager();
});

// ── BGM ownership / desired-per-owner ────────────────────────────────────────

describe('SoundManager BGM ownership (enabled runtime)', () => {
  it('requestBgm() stores desired entry in _desiredPerOwner', () => {
    const sm = SoundManager as unknown as {
      _desiredPerOwner: Record<string, { key: string }>;
    };

    SoundManager.requestBgm('music:hoh_comp_general', 'phase');

    expect(sm._desiredPerOwner['phase']).toEqual({ key: 'music:hoh_comp_general' });
  });

  it('requestBgm() with null key calls releaseBgm() and does not store desired entry', () => {
    const sm = SoundManager as unknown as {
      _desiredPerOwner: Record<string, { key: string }>;
    };

    SoundManager.requestBgm('music:hoh_comp_general', 'phase');
    SoundManager.requestBgm(null, 'phase');

    expect(sm._desiredPerOwner['phase']).toBeUndefined();
  });

  it('releaseBgm() removes the desired entry for the given owner', () => {
    const sm = SoundManager as unknown as {
      _desiredPerOwner: Record<string, { key: string }>;
    };

    SoundManager.requestBgm('music:hoh_comp_general', 'phase');
    SoundManager.releaseBgm('phase');

    expect(sm._desiredPerOwner['phase']).toBeUndefined();
  });

  it('releaseBgm() with no remaining owners clears currentBgmOwner', () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _currentBgmOwner: string | null;
    };

    // Unlock first so requestBgm / releaseBgm engage the real ownership logic
    sm._unlocked = true;

    SoundManager.requestBgm('music:hoh_comp_general', 'phase');
    SoundManager.releaseBgm('phase');

    expect(sm._currentBgmOwner).toBeNull();
  });

  it('higher-priority owner (minigame) overrides lower-priority owner (phase) when unlocked', () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _currentBgmOwner: string | null;
      _musicKey: string | null;
    };

    sm._unlocked = true;

    // Phase requests BGM first
    SoundManager.requestBgm('music:hoh_comp_general', 'phase');
    expect(sm._currentBgmOwner).toBe('phase');
    expect(sm._musicKey).toBe('music:hoh_comp_general');

    // Minigame overrides (higher priority)
    SoundManager.requestBgm('music:risk_wheel_loop', 'minigame');
    expect(sm._currentBgmOwner).toBe('minigame');
    expect(sm._musicKey).toBe('music:risk_wheel_loop');
  });

  it('releasing minigame BGM falls back to phase track when phase still has a desired entry', () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _currentBgmOwner: string | null;
      _musicKey: string | null;
    };

    sm._unlocked = true;

    // Phase requests, then minigame overrides
    SoundManager.requestBgm('music:hoh_comp_general', 'phase');
    SoundManager.requestBgm('music:risk_wheel_loop', 'minigame');
    expect(sm._currentBgmOwner).toBe('minigame');

    // Minigame releases — should fall back to phase track
    SoundManager.releaseBgm('minigame');
    expect(sm._currentBgmOwner).toBe('phase');
    expect(sm._musicKey).toBe('music:hoh_comp_general');
  });

  it('releasing social BGM falls back to phase track when phase has a desired entry', () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _currentBgmOwner: string | null;
      _musicKey: string | null;
    };

    sm._unlocked = true;

    SoundManager.requestBgm('music:nominations_main', 'phase');
    SoundManager.requestBgm('music:social_module', 'social');
    expect(sm._currentBgmOwner).toBe('social');

    SoundManager.releaseBgm('social');
    expect(sm._currentBgmOwner).toBe('phase');
    expect(sm._musicKey).toBe('music:nominations_main');
  });

  it('releasing minigame with no other owners clears currentBgmOwner (no stale track)', () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _currentBgmOwner: string | null;
      _musicKey: string | null;
    };

    sm._unlocked = true;

    // Minigame only — no phase track
    SoundManager.requestBgm('music:risk_wheel_loop', 'minigame');
    expect(sm._currentBgmOwner).toBe('minigame');

    SoundManager.releaseBgm('minigame');
    expect(sm._currentBgmOwner).toBeNull();
    expect(sm._musicKey).toBeNull();
  });
});

// ── Pre-unlock BGM queue behaviour ───────────────────────────────────────────

describe('SoundManager BGM before unlock (locked state)', () => {
  it('requestBgm() stores desired entry but does NOT call _doPlayMusic while locked', () => {
    const sm = SoundManager as unknown as {
      _desiredPerOwner: Record<string, { key: string }>;
      _musicKey: string | null;
    };
    const doPlayMusic = vi.spyOn(
      SoundManager as unknown as { _doPlayMusic: () => Promise<void> },
      '_doPlayMusic',
    );

    SoundManager.requestBgm('music:hoh_comp_general', 'phase');

    // Desired entry stored
    expect(sm._desiredPerOwner['phase']).toEqual({ key: 'music:hoh_comp_general' });
    // But no actual playback attempted
    expect(doPlayMusic).not.toHaveBeenCalled();
    expect(sm._musicKey).toBeNull();
  });

  it('upon unlock, highest-priority desired BGM is started via _applyDesiredBgm', () => {
    const sm = SoundManager as unknown as {
      _musicKey: string | null;
      _currentBgmOwner: string | null;
    };

    // Phase requests while locked, then minigame overrides while still locked
    SoundManager.requestBgm('music:hoh_comp_general', 'phase');
    SoundManager.requestBgm('music:risk_wheel_loop', 'minigame');

    // Unlock
    SoundManager.unlockFromGesture();

    // The highest-priority (minigame) track should be started
    expect(sm._musicKey).toBe('music:risk_wheel_loop');
    expect(sm._currentBgmOwner).toBe('minigame');
  });
});

// ── SFX queue before unlock ───────────────────────────────────────────────────

describe('SoundManager SFX queue (locked → unlock)', () => {
  it('play() before unlock queues a single SFX marker', async () => {
    const sm = SoundManager as unknown as {
      _playQueue: Array<{ key: string; isMusic: boolean }>;
    };

    await SoundManager.play('ui:confirm');

    expect(sm._playQueue).toHaveLength(1);
    expect(sm._playQueue[0].isMusic).toBe(false);
  });

  it('multiple play() calls before unlock collapse to at most one SFX marker', async () => {
    const sm = SoundManager as unknown as {
      _playQueue: Array<{ key: string; isMusic: boolean }>;
    };

    await SoundManager.play('ui:confirm');
    await SoundManager.play('ui:navigate');
    await SoundManager.play('ui:error');

    // Queue should have at most 1 SFX marker
    const sfxMarkers = sm._playQueue.filter((q) => !q.isMusic);
    expect(sfxMarkers.length).toBeLessThanOrEqual(1);
  });

  it('play() after unlock calls _doPlay directly (no queue)', async () => {
    const sm = SoundManager as unknown as {
      _playQueue: Array<{ key: string; isMusic: boolean }>;
    };
    // Unlock the manager
    SoundManager.unlockFromGesture();

    const doPlay = vi.spyOn(
      SoundManager as unknown as { _doPlay: () => Promise<void> },
      '_doPlay',
    );

    await SoundManager.play('ui:confirm');

    expect(doPlay).toHaveBeenCalledWith('ui:confirm', undefined);
    const sfxMarkers = sm._playQueue.filter((q) => !q.isMusic);
    expect(sfxMarkers).toHaveLength(0);
  });
});

// ── Category enabled / disabled ───────────────────────────────────────────────

describe('SoundManager category enable / disable', () => {
  it('setCategoryEnabled("music", false) stops current music immediately', () => {
    const sm = SoundManager as unknown as {
      _unlocked: boolean;
      _musicKey: string | null;
    };
    sm._unlocked = true;

    SoundManager.requestBgm('music:hoh_comp_general', 'phase');
    expect(sm._musicKey).toBe('music:hoh_comp_general');

    SoundManager.setCategoryEnabled('music', false);

    expect(sm._musicKey).toBeNull();
  });
});

// ── init() lifecycle listeners ────────────────────────────────────────────────

describe('SoundManager init() (enabled runtime)', () => {
  it('init() binds lifecycle listeners (_lifecycleListenersBound = true)', async () => {
    const sm = SoundManager as unknown as {
      _initialised: boolean;
      _lifecycleListenersBound: boolean;
    };

    await SoundManager.init();

    expect(sm._initialised).toBe(true);
    expect(sm._lifecycleListenersBound).toBe(true);
  });
});

// ── unlockOnUserGesture registers document listeners ─────────────────────────

describe('SoundManager unlockOnUserGesture() (enabled runtime)', () => {
  it('registers click/keydown/touchstart listeners on the document', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');

    SoundManager.unlockOnUserGesture();

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), true);
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    expect(addSpy).toHaveBeenCalledWith('touchstart', expect.any(Function), true);
  });
});
