/**
 * SoundManager.ts — HTMLAudioElement-based sound manager for bbmobilenew.
 *
 * Architecture:
 * - Music channel: single HTMLAudioElement with loop, replaced on track change.
 * - SFX: small per-key pool (up to SFX_POOL_SIZE) so rapid effects overlap.
 * - Unlock queue: play/playMusic calls made before a user gesture are queued
 *   and replayed automatically after unlock (satisfies browser autoplay policy).
 * - Graceful error handling: invalid/missing files are logged once then skipped.
 *
 * Public API (unchanged from previous version):
 *   init(), play(key, opts?), playMusic(key, opts?), stopMusic(), stop(key),
 *   setCategoryEnabled, setCategoryVolume, unlockOnUserGesture, currentMusicKey
 */

import { SOUND_REGISTRY } from './sounds';
import type { SoundCategory, SoundEntry } from './sounds';
import { NativeAudioAdapter } from '../../platform/cordova/NativeAudioAdapter';
import { NATIVE_SFX_MAP } from '../../platform/cordova/nativeSfxMap';

/** True in DEV builds, when VITE_AUDIO_DEBUG=true, or ?debugAudio=1 in URL. */
const _audioDebug =
  import.meta.env.DEV ||
  import.meta.env.VITE_AUDIO_DEBUG === 'true' ||
  (typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('debugAudio') === '1');

/** Max simultaneous instances per SFX key. */
const SFX_POOL_SIZE = 4;
/** Max new SFX elements to prime per gesture to avoid exhausting iOS playback budget. */
const MAX_SFX_PRIMES_PER_GESTURE = 8;

export interface PlayOptions {
  /** Volume override (0–1).  Defaults to entry volume or 1. */
  volume?: number;
}

interface CategoryState {
  enabled: boolean;
  volume: number; // 0–1 master volume for the category
}

const DEFAULT_CATEGORY_STATE: CategoryState = { enabled: true, volume: 1 };

interface QueuedPlay {
  key: string;
  isMusic: boolean;
  opts?: PlayOptions;
}

// ── HTMLAudio factory helpers ─────────────────────────────────────────────────

function _makeMusicEl(src: string, volume: number): HTMLAudioElement {
  const el = document.createElement('audio');
  el.src = src;
  el.loop = true;
  el.volume = Math.max(0, Math.min(1, volume));
  el.preload = 'auto';
  return el;
}

function _makeSfxEl(src: string, volume: number, loop = false): HTMLAudioElement {
  const el = document.createElement('audio');
  el.src = src;
  el.loop = loop;
  el.volume = Math.max(0, Math.min(1, volume));
  el.preload = 'none';
  return el;
}

// ── SoundManager class ────────────────────────────────────────────────────────

class _SoundManager {
  private _categories = new Map<SoundCategory, CategoryState>();

  // Music channel
  private _musicEl: HTMLAudioElement | null = null;
  private _musicKey: string | null = null;

  // SFX: pool of HTMLAudioElements per key
  private _sfxPools = new Map<string, HTMLAudioElement[]>();

  // Keys that have encountered a load/decode/play error — skip on subsequent calls
  private _failedKeys = new Set<string>();

  private _initialised = false;
  private _unlocked = false;

  // Requests queued before the first user gesture
  private _playQueue: QueuedPlay[] = [];

  // Stored unlock handler — ensures only one set of listeners is ever registered
  private _unlockHandler: (() => void) | null = null;
  private _lifecycleListenersBound = false;

  // ── Initialisation ──────────────────────────────────────────────────────────

  /**
   * Initialise the SoundManager.
   * With the HTMLAudio backend there is nothing to eagerly preload — audio
   * elements are created lazily on first play — so this is a lightweight
   * bookkeeping call.
   */
  async init(): Promise<void> {
    if (this._initialised) return;
    this._initialised = true;
    this._bindLifecycleListeners();
    if (_audioDebug) {
      console.log('[SoundManager] init() — registry has', Object.keys(SOUND_REGISTRY).length, 'keys');
    }
  }

  // ── Registration (kept for API compatibility) ───────────────────────────────

  /** No-op: registry is the source of truth; pools are created lazily on play. */
  register(_entry: SoundEntry): void {
    // intentional no-op — SoundEntry metadata lives in SOUND_REGISTRY
  }

  // ── Playback ────────────────────────────────────────────────────────────────

  /**
   * Play a one-shot SFX.
   * If audio is not yet unlocked the request is queued and retried after the
   * first user gesture.
   */
  async play(key: string, opts?: PlayOptions): Promise<void> {
    if (!this._unlocked) {
      if (_audioDebug) {
        console.log(`[SoundManager] play("${key}") queued — not yet unlocked`);
      }
      this._queueSfxMarker(key, opts);
      return;
    }
    return this._doPlay(key, opts);
  }

  private async _doPlay(key: string, opts?: PlayOptions): Promise<void> {
    if (this._failedKeys.has(key)) return; // previously failed — silent skip

    const entry = SOUND_REGISTRY[key];
    if (!entry) {
      console.warn(`[SoundManager] Unknown sound key: "${key}"`);
      return;
    }

    const cat = this._getCategory(entry.category);
    if (!cat.enabled) {
      if (_audioDebug) {
        console.log(`[SoundManager] play("${key}") skipped — category "${entry.category}" disabled`);
      }
      return;
    }

    // Compute effective volume here so it is available to both the native
    // fast-path (for gate checks) and the HTMLAudio fallback path below.
    const baseVol = opts?.volume ?? entry.volume ?? 1;
    const effectiveVol = Math.max(0, Math.min(1, baseVol * cat.volume));

    // Native audio fast-path: when running inside a Cordova WebView with the
    // nativeaudio plugin, use the native backend for mapped SFX keys.
    // Note: native SFX volume is baked in at preload time (via preloadComplex)
    // so real-time category volume changes do not affect already-preloaded SFX.
    // The fast-path is skipped when effectiveVol is 0 (muted) so silence is honoured.
    const nativeKey = NATIVE_SFX_MAP[key as keyof typeof NATIVE_SFX_MAP];
    if (nativeKey && NativeAudioAdapter.isAvailable() && effectiveVol > 0) {
      try {
        NativeAudioAdapter.playSfx(nativeKey);
        return;
      } catch (err) {
        console.warn('[SoundManager] NativeAudio play failed, falling back to HTMLAudio', err);
      }
    }

    // Get or lazily create a per-key pool
    let pool = this._sfxPools.get(key);
    if (!pool) {
      pool = [];
      this._sfxPools.set(key, pool);
    }

    // Find a free element in the pool
    let el = pool.find((e) => e.paused || e.ended);
    if (!el && pool.length < SFX_POOL_SIZE) {
      // Grow the pool — honour entry.loop so looping SFX (e.g. wheel-spin) work correctly
      el = _makeSfxEl(entry.src, effectiveVol, entry.loop ?? false);
      el.addEventListener('error', () => {
        if (!this._failedKeys.has(key)) {
          const code = el!.error?.code ?? 'unknown';
          console.error(
            `[SoundManager] SFX load error "${key}" (code ${code}):`,
            el!.error?.message ?? entry.src,
          );
          this._failedKeys.add(key);
        }
      });
      pool.push(el);
    } else if (!el) {
      // Pool full — steal the element with the least time remaining
      let minRemaining = Infinity;
      let stolen: HTMLAudioElement | null = null;
      for (const e of pool) {
        const remaining = (isNaN(e.duration) ? 0 : e.duration) - e.currentTime;
        if (remaining < minRemaining) {
          minRemaining = remaining;
          stolen = e;
        }
      }
      // Fallback: steal the first element if the loop produced no result
      el = stolen ?? pool[0]!;
      el.pause();
      el.currentTime = 0;
    }

    el!.volume = effectiveVol;
    el!.currentTime = 0;

    if (_audioDebug) {
      console.log(`[SoundManager] play("${key}") vol=${effectiveVol.toFixed(2)} src="${entry.src}"`);
    }

    try {
      await el!.play();
    } catch (err) {
      if ((err as DOMException).name === 'NotAllowedError') {
        // Autoplay blocked (either before unlock or iOS blocking a non-gesture
        // call on a primed element). Queue a single SFX marker so the next
        // gesture re-runs the unlock drain/priming path without letting
        // repeated blocked SFX inflate the queue unboundedly.
        if (_audioDebug) {
          console.log(`[SoundManager] play("${key}") blocked by autoplay policy — re-queued`);
        }
        this._queueSfxMarker(key, opts);
        this._ensureUnlockListeners();
      } else {
        if (!this._failedKeys.has(key)) {
          console.error(`[SoundManager] play("${key}") failed:`, err);
          this._failedKeys.add(key);
        }
      }
    }
  }

  // ── Music ───────────────────────────────────────────────────────────────────

  /** Returns the key of the currently-playing music track, or null. */
  get currentMusicKey(): string | null {
    return this._musicKey;
  }

  /**
   * Start a looping music track.
   * If audio is not yet unlocked the request is queued (replacing any earlier
   * queued music request) and retried after the first user gesture.
   */
  async playMusic(key: string, opts?: PlayOptions): Promise<void> {
    if (!this._unlocked) {
      if (_audioDebug) {
        console.log(`[SoundManager] playMusic("${key}") queued — not yet unlocked`);
      }
      // Keep only the latest music request in the queue
      this._playQueue = this._playQueue.filter((q) => !q.isMusic);
      this._playQueue.push({ key, isMusic: true, opts });
      return;
    }
    return this._doPlayMusic(key, opts);
  }

  private async _doPlayMusic(key: string, opts?: PlayOptions): Promise<void> {
    // Already playing this track and the element is running — no-op
    if (this._musicKey === key && this._musicEl && !this._musicEl.paused) {
      if (_audioDebug) {
        console.log(`[SoundManager] playMusic("${key}") — already playing`);
      }
      return;
    }

    this._stopCurrentMusic();

    const entry = SOUND_REGISTRY[key];
    if (!entry) {
      console.warn(`[SoundManager] Unknown music key: "${key}"`);
      return;
    }

    const cat = this._getCategory('music');
    if (!cat.enabled) {
      if (_audioDebug) {
        console.log(`[SoundManager] playMusic("${key}") skipped — music category disabled`);
      }
      return;
    }

    if (this._failedKeys.has(key)) {
      if (_audioDebug) {
        console.log(`[SoundManager] playMusic("${key}") skipped — previously failed`);
      }
      return;
    }

    const baseVol = opts?.volume ?? entry.volume ?? 1;
    const effectiveVol = Math.max(0, Math.min(1, baseVol * cat.volume));

    const el = _makeMusicEl(entry.src, effectiveVol);
    this._musicEl = el;
    this._musicKey = key;

    el.addEventListener(
      'error',
      () => {
        if (!this._failedKeys.has(key)) {
          const code = el.error?.code ?? 'unknown';
          console.error(
            `[SoundManager] music load error "${key}" (code ${code}):`,
            el.error?.message ?? entry.src,
          );
          this._failedKeys.add(key);
        }
        if (this._musicKey === key) {
          this._musicKey = null;
          this._musicEl = null;
        }
      },
      { once: true },
    );

    if (_audioDebug) {
      console.log(`[SoundManager] playMusic("${key}") vol=${effectiveVol.toFixed(2)} src="${entry.src}"`);
    }

    try {
      await el.play();
    } catch (err) {
      const domErr = err as DOMException;
      if (domErr.name === 'NotAllowedError') {
        if (_audioDebug) {
          console.log(`[SoundManager] playMusic("${key}") blocked by autoplay policy — re-queued`);
        }
        this._queueMusicRetry(key, opts);
        if (this._musicKey === key) {
          this._musicKey = null;
          this._musicEl = null;
        }
      } else if (domErr.name === 'AbortError') {
        // play() was interrupted by a subsequent pause() or src change (e.g.
        // stopMusic() called while this promise was in-flight).  This is
        // expected behaviour — do NOT mark the key as failed so the track can
        // be replayed in the future.
        if (_audioDebug) {
          console.log(`[SoundManager] playMusic("${key}") aborted (stopMusic race) — ignored`);
        }
        if (this._musicKey === key) {
          this._musicKey = null;
          this._musicEl = null;
        }
      } else {
        if (!this._failedKeys.has(key)) {
          console.error(`[SoundManager] playMusic("${key}") failed:`, err);
          this._failedKeys.add(key);
        }
        if (this._musicKey === key) {
          this._musicKey = null;
          this._musicEl = null;
        }
      }
    }
  }

  /** Stop the currently-playing music track. */
  stopMusic(): void {
    if (_audioDebug && this._musicKey) {
      console.log(`[SoundManager] stopMusic() — stopping "${this._musicKey}"`);
    }
    this._stopCurrentMusic();
    // Also clear any queued music so it doesn't restart after unlock
    this._playQueue = this._playQueue.filter((q) => !q.isMusic);
  }

  private _stopCurrentMusic(): void {
    if (this._musicEl) {
      this._musicEl.pause();
      // Do NOT set src='' here — that triggers an async error event which
      // would add the key to _failedKeys and permanently prevent restart.
      // Simply null the reference; the element will be garbage collected.
      this._musicEl = null;
    }
    this._musicKey = null;
  }

  /**
   * Stop a specific sound by key without affecting the global music track.
   * Intended for looping SFX (e.g. a wheel-spin loop) played via play().
   * No-ops silently if the key is unknown or not playing.
   */
  stop(key: string): void {
    const pool = this._sfxPools.get(key);
    if (!pool) return;
    if (_audioDebug) {
      console.log(`[SoundManager] stop("${key}")`);
    }
    for (const el of pool) {
      el.pause();
      el.currentTime = 0;
    }
  }

  // ── Category controls ───────────────────────────────────────────────────────

  /** Enable or disable all sounds in a category. */
  setCategoryEnabled(category: SoundCategory, enabled: boolean): void {
    const state = this._getCategory(category);
    const prev = state.enabled;
    state.enabled = enabled;
    this._categories.set(category, state);
    if (prev !== enabled) {
      console.log(`[SoundManager] category "${category}" enabled=${enabled}`);
    }
    // Stop music immediately when the music category is disabled
    if (!enabled && category === 'music') {
      this._stopCurrentMusic();
    }
  }

  /** Set the master volume for a category (0–1). */
  setCategoryVolume(category: SoundCategory, volume: number): void {
    const state = this._getCategory(category);
    const newVolume = Math.max(0, Math.min(1, volume));
    if (state.volume !== newVolume) {
      state.volume = newVolume;
      this._categories.set(category, state);
      console.log(`[SoundManager] category "${category}" volume=${newVolume.toFixed(2)}`);
      // Apply volume change to live music immediately
      if (category === 'music' && this._musicEl && this._musicKey) {
        const entry = SOUND_REGISTRY[this._musicKey];
        const baseVol = entry?.volume ?? 1;
        this._musicEl.volume = Math.max(0, Math.min(1, baseVol * newVolume));
      }
    }
  }

  // ── User-gesture unlock ─────────────────────────────────────────────────────

  /**
   * Unlock the audio system.
   *
   * - Call from within a user-gesture handler (e.g. a button click) to
   *   immediately unlock and drain the play queue.
   * - Also arms document-level listeners so any subsequent gesture unlocks
   *   if this is called before any interaction has occurred.
   * - Safe to call multiple times — only one set of document listeners is
   *   ever registered, preventing listener leaks.
   *
   * After unlock, queued music requests are replayed and queued SFX markers are
   * discarded after priming the SFX pool for future non-gesture playback.
   */
  unlockOnUserGesture(): void {
    if (typeof document === 'undefined') return;
    if (this._unlocked && this._playQueue.length === 0) {
      if (_audioDebug) {
        console.log('[SoundManager] unlockOnUserGesture() — already unlocked');
      }
      return;
    }
    this._ensureUnlockListeners();

    // Also try immediately — effective when called from inside a gesture handler
    this._unlockHandler?.();
  }

  /**
   * Unlock audio from a user gesture but only replay queued music items.
   *
   * Use this instead of `unlockOnUserGesture()` from the "Enable sounds" handler
   * on the hub screen so that SFX queued during page load are intentionally
   * discarded and do not flood the user with sound at the moment they tap the
   * consent button.
   *
   * - Primes SFX pool elements so future non-gesture SFX plays work on iOS.
   * - Replays only queued music items (preserving latest-music semantics).
   * - Drops all queued SFX so they are never replayed automatically.
   */
  unlockAndPlayMusicOnly(): void {
    if (typeof document === 'undefined') return;
    if (this._unlocked && this._playQueue.length === 0) {
      if (_audioDebug) {
        console.log('[SoundManager] unlockAndPlayMusicOnly() — already unlocked');
      }
      return;
    }

    // Remove any pending document-level unlock listeners if they were armed.
    if (this._unlockHandler) {
      document.removeEventListener('click', this._unlockHandler, true);
      document.removeEventListener('keydown', this._unlockHandler, true);
      document.removeEventListener('touchstart', this._unlockHandler, true);
      this._unlockHandler = null;
    }
    this._unlocked = true;

    if (_audioDebug) {
      console.log('[SoundManager] audio unlocked via unlockAndPlayMusicOnly — draining music queue only');
    }

    // Replay only the queued music items; intentionally drop any queued SFX.
    const queued = this._playQueue.splice(0);
    for (const item of queued) {
      if (item.isMusic) {
        void this._doPlayMusic(item.key, item.opts);
      }
      // SFX items are intentionally discarded.
    }

    // Prime after starting queued music so iOS/Safari uses the gesture budget
    // on the background track first.
    this._primeSfxForMobile();
  }

  private _drainQueue(): void {
    const q = this._playQueue.splice(0);
    if (_audioDebug && q.length > 0) {
      console.log(
        '[SoundManager] draining queue:',
        q.map((i) => `${i.isMusic ? 'music' : 'sfx'}:${i.key}`),
      );
    }
    const musicItems: QueuedPlay[] = [];
    let discardedSfxCount = 0;
    for (const item of q) {
      if (item.isMusic) {
        musicItems.push(item);
      } else {
        discardedSfxCount += 1;
      }
    }
    for (const item of musicItems) {
      void this._doPlayMusic(item.key, item.opts);
    }
    // Prime SFX pool elements during this gesture context so that iOS allows
    // future non-gesture plays (e.g. game-state-driven SFX like death/winner).
    this._primeSfxForMobile();
    if (_audioDebug && discardedSfxCount > 0) {
      console.log('[SoundManager] discarded stale queued SFX item(s):', discardedSfxCount);
    }
  }

  private _queueMusicRetry(key: string, opts?: PlayOptions): void {
    this._playQueue = this._playQueue.filter((q) => !q.isMusic);
    this._playQueue.push({ key, isMusic: true, opts });
    this._ensureUnlockListeners();
  }

  private _queueSfxMarker(key: string, opts?: PlayOptions): void {
    this._playQueue = this._playQueue.filter((q) => q.isMusic);
    this._playQueue.push({ key, isMusic: false, opts });
  }

  private _ensureUnlockListeners(): void {
    if (typeof document === 'undefined' || this._unlockHandler) return;
    if (_audioDebug) {
      console.log('[SoundManager] unlockOnUserGesture() — arming unlock listeners');
    }
    const handler = () => {
      if (this._unlocked && this._playQueue.length === 0) return;
      this._unlocked = true;
      document.removeEventListener('click', handler, true);
      document.removeEventListener('keydown', handler, true);
      document.removeEventListener('touchstart', handler, true);
      this._unlockHandler = null;
      if (_audioDebug) {
        console.log(
          '[SoundManager] audio unlocked — draining queue of',
          this._playQueue.length,
          'item(s)',
        );
      }
      this._drainQueue();
    };
    this._unlockHandler = handler;
    document.addEventListener('click', handler, true);
    document.addEventListener('keydown', handler, true);
    document.addEventListener('touchstart', handler, true);
  }

  private _bindLifecycleListeners(): void {
    if (typeof document === 'undefined' || this._lifecycleListenersBound) return;
    this._lifecycleListenersBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this._unlocked = false;
        return;
      }
      if (!this._musicEl || !this._musicKey || !this._musicEl.paused) return;
      const resumeKey = this._musicKey;
      const resumeEl = this._musicEl;
      void resumeEl.play().catch((err: unknown) => {
        const domErr = err as DOMException;
        if (domErr.name === 'NotAllowedError') {
          if (_audioDebug) {
            console.log(`[SoundManager] resume("${resumeKey}") blocked after visibility restore — re-queued`);
          }
          if (this._musicKey === resumeKey) {
            this._musicKey = null;
            this._musicEl = null;
          }
          this._queueMusicRetry(resumeKey);
          return;
        }
        if (domErr.name === 'AbortError') return;
        console.error(`[SoundManager] resume("${resumeKey}") failed:`, err);
      });
    });
  }

  /**
   * Pre-create and "prime" one pool element per registered SFX key during a
   * user-gesture context.  On iOS/Safari, calling `.play()` on a new
   * HTMLAudioElement outside a gesture throws NotAllowedError even after the
   * audio context is unlocked.  Touching the element here (play+pause at
   * volume 0) registers it with the browser so subsequent non-gesture plays work.
   */
  private _primeSfxForMobile(): void {
    if (typeof document === 'undefined') return;
    let primedThisGesture = 0;
    for (const [key, entry] of Object.entries(SOUND_REGISTRY)) {
      if (entry.category === 'music') continue; // music handled separately
      if (primedThisGesture >= MAX_SFX_PRIMES_PER_GESTURE) break;
      let pool = this._sfxPools.get(key);
      if (!pool) {
        pool = [];
        this._sfxPools.set(key, pool);
      }
      if (pool.length === 0) {
        const el = _makeSfxEl(entry.src, 0, entry.loop ?? false);
        // Attach error handling so primed elements behave like normally pooled
        // ones — load errors are logged and the key is marked failed so the
        // pool does not keep reusing a broken element.
        el.addEventListener('error', () => {
          if (!this._failedKeys.has(key)) {
            const code = el.error?.code ?? 'unknown';
            console.error(
              `[SoundManager] SFX load error "${key}" (code ${code}):`,
              el.error?.message ?? entry.src,
            );
            this._failedKeys.add(key);
          }
        });
        pool.push(el);
        primedThisGesture += 1;
        // Mute during priming to avoid audible artifacts on mobile browsers.
        // Setting muted=true is more reliable than volume=0 across WebView
        // implementations (some still produce audible noise at volume=0).
        el.muted = true;
        // Call play() synchronously in the gesture context — iOS cares about
        // the synchronous call, not the promise resolution.  Immediately pause
        // and restore real volume/unmute in the callback.
        // Use optional chaining: test envs may return undefined from play().
        el.play()?.then(() => {
          el.pause();
          el.currentTime = 0;
          el.muted = false;
          el.volume = Math.max(0, Math.min(1, entry.volume ?? 1));
        }).catch((err) => {
          // Log priming failures in debug builds and mark the key as failed
          // so we don't keep reusing a broken element.
          if (_audioDebug) {
            console.warn(`[SoundManager] SFX priming play() failed for "${key}":`, err);
          }
          this._failedKeys.add(key);
        });
      }
    }
    if (_audioDebug && primedThisGesture >= MAX_SFX_PRIMES_PER_GESTURE) {
      console.log(
        '[SoundManager] SFX priming capped for this gesture at',
        MAX_SFX_PRIMES_PER_GESTURE,
        'item(s)',
      );
    }
  }

  // ── Debug helpers ───────────────────────────────────────────────────────────

  /** Dump current audio engine state to the console. */
  debugDump(): void {
    console.group('[SoundManager] debugDump()');
    console.log('initialised:', this._initialised, '| unlocked:', this._unlocked);
    console.log('currentMusicKey:', this._musicKey ?? '(none)');
    console.log('queue length:', this._playQueue.length);
    console.log('failed keys:', [...this._failedKeys].join(', ') || '(none)');
    console.log('sfx pools:', [...this._sfxPools.keys()].join(', ') || '(none)');
    console.log('categories:');
    for (const cat of ['music', 'ui', 'tv', 'player', 'minigame'] as SoundCategory[]) {
      const state = this._categories.get(cat) ?? DEFAULT_CATEGORY_STATE;
      console.log(`  ${cat}: enabled=${state.enabled}, volume=${state.volume.toFixed(2)}`);
    }
    console.groupEnd();
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _getCategory(category: SoundCategory): CategoryState {
    if (!this._categories.has(category)) {
      this._categories.set(category, { ...DEFAULT_CATEGORY_STATE });
    }
    return this._categories.get(category)!;
  }
}

/** Singleton SoundManager instance. */
export const SoundManager = new _SoundManager();

// ── Window debug object (DEV / ?debugAudio=1) ─────────────────────────────────

if (_audioDebug && typeof window !== 'undefined') {
  const _dbg = {
    /** List all registered sound keys. */
    listKeys: (): string[] => Object.keys(SOUND_REGISTRY),
    /** Manually play a SFX key: __audioDebug.play('ui:confirm') */
    play: (key: string) => void SoundManager.play(key),
    /** Manually start a music track: __audioDebug.playMusic('music:intro_hub_loop') */
    playMusic: (key: string) => void SoundManager.playMusic(key),
    /** Enable all audio categories (useful for quick testing). */
    enableAll: () => {
      for (const cat of ['music', 'ui', 'tv', 'player', 'minigame'] as SoundCategory[]) {
        SoundManager.setCategoryEnabled(cat, true);
      }
    },
    /** Dump full engine state to console. */
    dump: () => SoundManager.debugDump(),
    // Legacy helpers
    stopMusic: () => SoundManager.stopMusic(),
    stop: (key: string) => SoundManager.stop(key),
    unlock: () => SoundManager.unlockOnUserGesture(),
    get currentMusic() {
      return SoundManager.currentMusicKey;
    },
  };

  // Expose under both the new name (__audioDebug) and the legacy alias (__bbAudio)
  (window as unknown as Record<string, unknown>).__audioDebug = _dbg;
  (window as unknown as Record<string, unknown>).__bbAudio = _dbg;

  console.log('[SoundManager] debug helpers on window.__audioDebug (alias: __bbAudio)');
  console.log('  __audioDebug.listKeys()     — list all registered sound keys');
  console.log('  __audioDebug.play(key)      — manually play a sound');
  console.log('  __audioDebug.playMusic(key) — start music');
  console.log('  __audioDebug.enableAll()    — enable all categories');
  console.log('  __audioDebug.dump()         — print engine state');
}
