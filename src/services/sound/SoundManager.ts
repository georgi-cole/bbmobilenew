/**
 * SoundManager.ts — HTMLAudioElement-based sound manager for bbmobilenew.
 *
 * Architecture:
 * - BGM channel: single HTMLAudioElement with loop, replaced on track change.
 *   Ownership is tracked via BgmOwner so only one scope controls BGM at a time.
 * - SFX: small per-key pool (up to SFX_POOL_SIZE) so rapid effects overlap.
 * - Desired BGM: when audio is locked (before first user gesture), the manager
 *   stores only the latest desired BGM track.  On unlock it starts only that
 *   one track, preventing the "flush of accumulated play requests" bug on
 *   iPhone/Safari.
 * - Graceful error handling: invalid/missing files are logged once then skipped.
 *
 * Public API:
 *   init(), requestBgm(key, owner), releaseBgm(owner),
 *   play(key, opts?), stop(key),
 *   setCategoryEnabled, setCategoryVolume,
 *   unlockFromGesture, unlockOnUserGesture, unlockAndPlayMusicOnly,
 *   currentMusicKey, currentBgmOwner
 *
 * Legacy BGM API (backward-compatible wrappers):
 *   playMusic(key, opts?), stopMusic()
 *
 * Disabled mode:
 * - Runtime playback/management is intentionally disabled to avoid the
 *   conflicts and race conditions tracked in the current issue.
 * - Ceremony/minigame hooks still call the same public methods, but those
 *   calls are treated as safe no-ops so the hook wiring stays intact.
 */

import { SOUND_REGISTRY } from './sounds';
import type { SoundCategory, SoundEntry } from './sounds';
import {
  MUSIC_TRACK_SOUND_KEYS,
  musicTrackFromSoundKey,
} from './musicTracks';
import type { MusicTrack } from './musicTracks';
import { NativeAudioAdapter } from '../../platform/cordova/NativeAudioAdapter';
import { NATIVE_SFX_MAP } from '../../platform/cordova/nativeSfxMap';

/** True in DEV builds, when VITE_AUDIO_DEBUG=true, or ?debugAudio=1 in URL. */
const _audioDebug =
  import.meta.env.DEV ||
  import.meta.env.VITE_AUDIO_DEBUG === 'true' ||
  (typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('debugAudio') === '1');

/**
 * Hard kill-switch for runtime audio playback/management.
 * Set to false to re-enable all audio; set to true only when debugging
 * playback/lifecycle regressions to keep the hook wiring intact.
 */
const SOUND_MANAGER_DISABLED = false;

/** Max simultaneous instances per SFX key. */
const SFX_POOL_SIZE = 4;

export interface PlayOptions {
  /** Volume override (0–1).  Defaults to entry volume or 1. */
  volume?: number;
}

export interface UnlockAudioOptions {
  /** When true, only the highest-priority desired BGM is started on unlock. */
  musicOnly?: boolean;
}

export type { MusicTrack } from './musicTracks';

/**
 * Identifies who currently "owns" the background music channel.
 * Each scope should request/release BGM through requestBgm/releaseBgm so
 * the manager can enforce the single-channel invariant.
 *
 * Priority (highest → lowest):
 * minigame > cinematic > social > spectator > phase > introhub
 */
export type BgmOwner =
  | 'introhub'
  | 'phase'
  | 'spectator'
  | 'social'
  | 'cinematic'
  | 'minigame';
export const CINEMATIC_BGM_OWNER: BgmOwner = 'cinematic';

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

  // BGM channel
  private _musicEl: HTMLAudioElement | null = null;
  private _musicKey: string | null = null;
  private _desiredMusicTrack: MusicTrack = 'none';
  private _desiredMusicOpts?: PlayOptions;
  private _playingMusicTrack: MusicTrack = 'none';
  private _desiredMusicReason: string | null = null;
  private _musicTransitionId = 0;
  private _musicMuted = false;
  private _musicVolume = 1;

  // BGM ownership / desired-track tracking (per-owner map with priority fallback)
  private _currentBgmOwner: BgmOwner | null = null;
  // Per-owner desired BGM map — allows automatic fallback when an owner releases.
  // Priority order (lowest → highest):
  // introhub < phase < spectator < social < cinematic < minigame
  // The last element wins; iterate in reverse to find the highest-priority active owner.
  private _desiredPerOwner: Partial<Record<BgmOwner, { key: string; opts?: PlayOptions }>> = {};
  private static readonly _BGM_PRIORITY: readonly BgmOwner[] = [
    'introhub', 'phase', 'spectator', 'social', 'cinematic', 'minigame',
  ];

  // SFX: pool of HTMLAudioElements per key
  private _sfxPools = new Map<string, HTMLAudioElement[]>();

  // Keys that have encountered a load/decode/play error — skip on subsequent calls
  private _failedKeys = new Set<string>();

  // Dynamically registered entries (from remote config, etc.)
  private _extraRegistry = new Map<string, SoundEntry>();

  private _initialised = false;
  private _unlocked = false;

  // Requests queued before the first user gesture (desired BGM + at most one SFX marker)
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
    if (SOUND_MANAGER_DISABLED) return;
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

  /**
   * Register a dynamically-provided sound entry (e.g. from remote config).
   * The entry is stored in an instance-level map and consulted alongside the
   * static SOUND_REGISTRY.  Calling this with the same key overwrites the
   * previous entry.  Remote entries must not contain executable code —
   * only `src` (a validated http/https URL) and scalar metadata are trusted.
   */
  registerDynamic(entry: SoundEntry): void {
    this._extraRegistry.set(entry.key, entry);
    // Clear any prior failure flag so the newly registered entry gets a chance.
    this._failedKeys.delete(entry.key);
    if (entry.key === 'music:remote_intro' && this._desiredMusicTrack === 'introhub') {
      void this.syncMusic();
    }
  }

  // ── Playback ────────────────────────────────────────────────────────────────

  /**
   * Play a one-shot SFX.
   * If audio is not yet unlocked the request is queued and retried after the
   * first user gesture.
   */
  async play(key: string, opts?: PlayOptions): Promise<void> {
    if (SOUND_MANAGER_DISABLED) return;
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

    const entry = SOUND_REGISTRY[key] ?? this._extraRegistry.get(key);
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

  // ── Music / BGM ─────────────────────────────────────────────────────────────

  /** Returns the key of the currently-playing music track, or null. */
  get currentMusicKey(): string | null {
    return this._musicKey;
  }

  /** Returns the semantic music track currently allocated to the music channel. */
  get currentMusicTrack(): MusicTrack {
    return this._playingMusicTrack;
  }

  /** Returns the BgmOwner that is currently controlling the BGM channel. */
  get currentBgmOwner(): BgmOwner | null {
    return this._currentBgmOwner;
  }

  /**
   * Returns the highest-priority owner that has a desired BGM entry, together
   * with its key and opts.  Returns null if no owner has a desired BGM.
   */
  private _getTopDesiredEntry(): { key: string; owner: BgmOwner; opts?: PlayOptions } | null {
    const p = _SoundManager._BGM_PRIORITY;
    for (let i = p.length - 1; i >= 0; i--) {
      const owner = p[i];
      const entry = this._desiredPerOwner[owner];
      if (entry) return { key: entry.key, owner, opts: entry.opts };
    }
    return null;
  }

  private _resolveDesiredMusicTrack(): MusicTrack {
    const top = this._getTopDesiredEntry();
    return top ? musicTrackFromSoundKey(top.key) : 'none';
  }

  async unlockAudio(): Promise<void> {
    this.unlockFromGesture();
  }

  async setDesiredMusic(track: MusicTrack, reason?: string): Promise<void> {
    this._desiredMusicTrack = track;
    this._desiredMusicOpts = undefined;
    this._desiredMusicReason = reason ?? null;
    await this.syncMusic();
  }

  async syncMusic(): Promise<void> {
    if (SOUND_MANAGER_DISABLED) return;

    const desiredRequest = this._getDesiredMusicRequest();
    const desiredTrack = desiredRequest.track;
    const shouldMute = this._musicMuted || !this._getCategory('music').enabled;
    if ((!desiredRequest.key && desiredTrack === 'none') || shouldMute) {
      this._stopCurrentMusic();
      return;
    }

    if (!this._unlocked) {
      this._playQueue = this._playQueue.filter((q) => !q.isMusic);
      return;
    }

    const key = desiredRequest.key;
    if (!key) {
      this._stopCurrentMusic();
      return;
    }

    if (this._isMusicSynced(key)) {
      this._playingMusicTrack = desiredTrack;
      this._applyLiveMusicVolume(desiredRequest.opts);
      return;
    }

    await this._doPlayMusic(key, desiredRequest.opts);
  }

  stopAllMusic(): void {
    this._desiredPerOwner = {};
    this._desiredMusicTrack = 'none';
    this._desiredMusicOpts = undefined;
    this._desiredMusicReason = null;
    this._currentBgmOwner = null;
    this._playQueue = this._playQueue.filter((q) => !q.isMusic);
    this._stopCurrentMusic();
  }

  setMusicMuted(value: boolean): void {
    this._musicMuted = value;
    const state = this._getCategory('music');
    state.enabled = !value;
    this._categories.set('music', state);
    if (value) {
      this._stopCurrentMusic();
      return;
    }
    void this.syncMusic();
  }

  setMusicVolume(value: number): void {
    this._musicVolume = Math.max(0, Math.min(1, value));
    const state = this._getCategory('music');
    state.volume = this._musicVolume;
    this._categories.set('music', state);
    this._applyLiveMusicVolume();
  }

  async playSfx(key: string, options?: PlayOptions): Promise<void> {
    await this.play(key, options);
  }

  /**
   * Request a background music track with an explicit ownership scope.
   *
   * - Each owner maintains its own desired BGM entry.  The highest-priority
   *   active owner wins; releasing an owner automatically falls back to the
   *   next lower-priority owner that still has a desired entry.
   * - If audio is locked (before user gesture) the request is stored but
   *   nothing plays until unlock — preventing the "flush of accumulated play
   *   requests" bug on iPhone/Safari.
   * - If audio is unlocked the new track starts immediately only if this
   *   owner is the current highest-priority active owner.
   * - Passing null as key releases BGM for this owner (same as releaseBgm).
   *
   * All BGM callers (introhub, phase, spectator, social, cinematic, minigame) MUST use
   * this method rather than calling playMusic/stopMusic directly so the
   * manager can enforce the single-channel invariant.
   */
  requestBgm(key: string | null, owner: BgmOwner, opts?: PlayOptions): void {
    if (_audioDebug) {
      console.log(`[SoundManager] requestBgm("${key}", "${owner}")`);
    }

    if (!key) {
      this.releaseBgm(owner);
      return;
    }

    if (SOUND_MANAGER_DISABLED) return;

    // Store per-owner desired entry — does NOT overwrite other owners
    this._desiredPerOwner[owner] = opts ? { key, opts } : { key };
    const top = this._getTopDesiredEntry();
    this._currentBgmOwner = top?.owner ?? null;
    void this.setDesiredMusic(this._resolveDesiredMusicTrack(), `requestBgm:${owner}`);
  }

  /**
   * Release BGM ownership for the given owner.
   *
   * - Removes this owner's desired BGM entry.
   * - If this owner was currently playing, automatically falls back to the
   *   next highest-priority owner that still has a desired entry.
   * - No-op if this owner does not currently own the BGM channel and has no
   *   desired entry.
   */
  releaseBgm(owner: BgmOwner): void {
    if (_audioDebug) {
      console.log(`[SoundManager] releaseBgm("${owner}")`);
    }

    if (SOUND_MANAGER_DISABLED) return;

    const wasActive = this._currentBgmOwner === owner;
    delete this._desiredPerOwner[owner];

    const top = this._getTopDesiredEntry();
    if (!top) {
      this._currentBgmOwner = null;
      if (wasActive) {
        this._playQueue = this._playQueue.filter((q) => !q.isMusic);
      }
      void this.setDesiredMusic('none', `releaseBgm:${owner}`);
      return;
    }

    if (_audioDebug) {
      console.log(`[SoundManager] releaseBgm("${owner}") — falling back to "${top.key}" (owner: ${top.owner})`);
    }
    this._currentBgmOwner = top.owner;
    void this.setDesiredMusic(this._resolveDesiredMusicTrack(), `releaseBgm:${owner}`);
  }

  /**
   * Start a looping music track (legacy wrapper — prefer requestBgm).
   * Internally stores the track in the 'phase' owner slot for backward
   * compatibility.  If audio is not yet unlocked the request is stored as the
   * desired BGM for the 'phase' owner and started after the first user gesture.
   */
  async playMusic(key: string, opts?: PlayOptions): Promise<void> {
    if (SOUND_MANAGER_DISABLED) return;
    this._desiredPerOwner['phase'] = opts ? { key, opts } : { key };
    this._currentBgmOwner = this._getTopDesiredEntry()?.owner ?? 'phase';
    await this.setDesiredMusic(this._resolveDesiredMusicTrack(), 'playMusic');
  }

  private async _doPlayMusic(key: string, opts?: PlayOptions): Promise<void> {
    const desiredTrack = musicTrackFromSoundKey(key);
    if (this._musicKey === key && this._musicEl) {
      if (_audioDebug) {
        console.log(`[SoundManager] playMusic("${key}") — already allocated/playing`);
      }
      this._playingMusicTrack = desiredTrack;
      this._applyLiveMusicVolume(opts);
      return;
    }

    this._stopCurrentMusic();

    const entry = SOUND_REGISTRY[key] ?? this._extraRegistry.get(key);
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
    const effectiveVol = Math.max(0, Math.min(1, baseVol * this._musicVolume));

    const el = _makeMusicEl(entry.src, effectiveVol);
    const transitionId = ++this._musicTransitionId;
    this._musicEl = el;
    this._musicKey = key;
    this._playingMusicTrack = desiredTrack;

    el.addEventListener(
      'error',
      () => {
        if (this._musicTransitionId !== transitionId) return;
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
          this._playingMusicTrack = 'none';
        }
      },
      { once: true },
    );

    if (_audioDebug) {
      console.log(`[SoundManager] playMusic("${key}") vol=${effectiveVol.toFixed(2)} src="${entry.src}"`);
    }

    try {
      await el.play();
      if (this._musicTransitionId !== transitionId) {
        el.pause();
        el.currentTime = 0;
        return;
      }
    } catch (err) {
      const domErr = err as DOMException;
      if (domErr.name === 'NotAllowedError') {
        if (_audioDebug) {
          console.log(`[SoundManager] playMusic("${key}") blocked by autoplay policy — re-queued`);
        }
        this._queueMusicRetry();
        if (this._musicKey === key) {
          this._musicKey = null;
          this._musicEl = null;
          this._playingMusicTrack = 'none';
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
          this._playingMusicTrack = 'none';
        }
      } else {
        if (!this._failedKeys.has(key)) {
          console.error(`[SoundManager] playMusic("${key}") failed:`, err);
          this._failedKeys.add(key);
        }
        if (this._musicKey === key) {
          this._musicKey = null;
          this._musicEl = null;
          this._playingMusicTrack = 'none';
        }
      }
    }
  }

  /** Stop the currently-playing music track (legacy — prefer releaseBgm). */
  stopMusic(track?: MusicTrack): void {
    if (SOUND_MANAGER_DISABLED) return;
    if (track && this._desiredMusicTrack !== track && this._playingMusicTrack !== track) {
      return;
    }
    if (_audioDebug && this._musicKey) {
      console.log(`[SoundManager] stopMusic() — stopping "${this._musicKey}"`);
    }
    if (!track) {
      this.stopAllMusic();
      return;
    }
    for (const owner of _SoundManager._BGM_PRIORITY) {
      if (musicTrackFromSoundKey(this._desiredPerOwner[owner]?.key) === track) {
        delete this._desiredPerOwner[owner];
      }
    }
    const nextTop = this._getTopDesiredEntry();
    this._currentBgmOwner = nextTop?.owner ?? null;
    if (this._playingMusicTrack === track) {
      this._stopCurrentMusic();
    }
    void this.setDesiredMusic(this._resolveDesiredMusicTrack(), `stopMusic:${track}`);
  }

  private _stopCurrentMusic(): void {
    if (this._musicEl) {
      this._musicTransitionId += 1;
      this._musicEl.pause();
      this._musicEl.currentTime = 0;
      this._musicEl = null;
    }
    this._musicKey = null;
    this._playingMusicTrack = 'none';
  }

  private _applyLiveMusicVolume(opts?: PlayOptions): void {
    if (!this._musicEl || !this._musicKey) return;
    const entry = SOUND_REGISTRY[this._musicKey] ?? this._extraRegistry.get(this._musicKey);
    const baseVol = opts?.volume ?? entry?.volume ?? 1;
    this._musicEl.volume = Math.max(0, Math.min(1, baseVol * this._musicVolume));
  }

  private _resolveMusicKey(track: MusicTrack): string | null {
    if (track === 'none') return null;
    if (track === 'introhub' && this._extraRegistry.has('music:remote_intro')) {
      return 'music:remote_intro';
    }
    return MUSIC_TRACK_SOUND_KEYS[track];
  }

  private _getDesiredMusicRequest(): { track: MusicTrack; key: string | null; opts?: PlayOptions } {
    const top = this._getTopDesiredEntry();
    if (top) {
      return {
        track: musicTrackFromSoundKey(top.key),
        key: top.key,
        opts: top.opts,
      };
    }
    return {
      track: this._desiredMusicTrack,
      key: this._resolveMusicKey(this._desiredMusicTrack),
      opts: this._desiredMusicOpts,
    };
  }

  private _isMusicSynced(key: string): boolean {
    return this._musicKey === key && this._musicEl != null;
  }

  /**
   * Stop a specific sound by key without affecting the global music track.
   * Intended for looping SFX (e.g. a wheel-spin loop) played via play().
   * No-ops silently if the key is unknown or not playing.
   */
  stop(key: string): void {
    if (SOUND_MANAGER_DISABLED) return;
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
    if (category === 'music') {
      this.setMusicMuted(!enabled);
      if (_audioDebug) {
        console.log(`[SoundManager] category "${category}" enabled=${enabled}`);
      }
      return;
    }
    const state = this._getCategory(category);
    const prev = state.enabled;
    state.enabled = enabled;
    this._categories.set(category, state);
    if (prev !== enabled) {
      console.log(`[SoundManager] category "${category}" enabled=${enabled}`);
    }
  }

  /** Set the master volume for a category (0–1). */
  setCategoryVolume(category: SoundCategory, volume: number): void {
    if (category === 'music') {
      const newVolume = Math.max(0, Math.min(1, volume));
      const didChange = this._musicVolume !== newVolume;
      this.setMusicVolume(newVolume);
      if (_audioDebug && didChange) {
        console.log(`[SoundManager] category "${category}" volume=${newVolume.toFixed(2)}`);
      }
      return;
    }
    const state = this._getCategory(category);
    const newVolume = Math.max(0, Math.min(1, volume));
    if (state.volume !== newVolume) {
      state.volume = newVolume;
      this._categories.set(category, state);
      console.log(`[SoundManager] category "${category}" volume=${newVolume.toFixed(2)}`);
    }
  }

  // ── User-gesture unlock ─────────────────────────────────────────────────────

  /**
   * Unlock the audio system immediately from inside a user gesture.
   *
   * Use this for route-owned gesture handlers so the caller controls exactly
   * which click/tap unlocks audio without also arming a second global path.
   */
  unlockFromGesture(options: UnlockAudioOptions = {}): void {
    if (typeof document === 'undefined') return;
    if (this._unlocked) {
      this._clearUnlockListeners();
      if (_audioDebug) {
        console.log('[SoundManager] unlockFromGesture() — already unlocked');
      }
      if (options.musicOnly) {
        this._playQueue = [];
        void this.syncMusic();
        this._primeSfxForMobile();
        return;
      }
      this._drainQueue();
      return;
    }

    this._clearUnlockListeners();
    this._unlocked = true;

    if (SOUND_MANAGER_DISABLED) {
      this._playQueue = [];
      return;
    }

    if (_audioDebug) {
      console.log(
        `[SoundManager] audio unlocked via direct gesture — ${options.musicOnly ? 'starting desired BGM only' : 'applying desired BGM, priming SFX pools'}`,
      );
    }

    if (options.musicOnly) {
      this._playQueue = [];
      void this.syncMusic();
      this._primeSfxForMobile();
      return;
    }

    this._drainQueue();
  }

  /**
   * Unlock the audio system.
   *
   * - Call from within a user-gesture handler (e.g. a button click) to
   *   immediately unlock and start the desired BGM.
   * - Also arms document-level listeners so any subsequent gesture unlocks
   *   if this is called before any interaction has occurred.
   * - Safe to call multiple times — only one set of document listeners is
   *   ever registered, preventing listener leaks.
   *
   * After unlock, the latest desired BGM is started and queued SFX/music
   * markers are discarded after priming the SFX pool for future non-gesture
   * playback.
   * After unlock, only the latest desired BGM is started (stale SFX queue
   * items are discarded so multiple sounds do not flood the user).
   */
  unlockOnUserGesture(): void {
    if (typeof document === 'undefined') return;
    if (SOUND_MANAGER_DISABLED) {
      this.unlockFromGesture();
      return;
    }
    if (this._unlocked && this._playQueue.length === 0 && this._desiredMusicTrack === this._playingMusicTrack) {
      if (_audioDebug) {
        console.log('[SoundManager] unlockOnUserGesture() — already unlocked');
      }
      return;
    }
    this._ensureUnlockListeners();
    this.unlockFromGesture();
  }

  /**
   * Unlock audio from a user gesture but only start the desired BGM.
   *
   * Use this instead of `unlockOnUserGesture()` from the "Enable sounds" handler
   * on the hub screen so that SFX queued during page load are intentionally
   * discarded and do not flood the user with sound at the moment they tap the
   * consent button.
   *
   * - Primes SFX pool elements so future non-gesture SFX plays work on iOS.
   * - Starts only the latest desired BGM from the desired-per-owner map.
   * - Starts only the latest desired BGM (from _desiredBgmKey / queue).
   * - Drops all queued SFX so they are never replayed automatically.
   */
  unlockAndPlayMusicOnly(): void {
    this.unlockFromGesture({ musicOnly: true });
  }

  private _drainQueue(): void {
    const q = this._playQueue.splice(0);
    if (_audioDebug) {
      console.log(
        '[SoundManager] draining queue — starting desired BGM, priming SFX pools',
      );
    }
    let discardedSfxCount = 0;
    let discardedMusicMarkerCount = 0;
    for (const item of q) {
      if (item.isMusic) {
        discardedMusicMarkerCount += 1;
      } else {
        discardedSfxCount += 1;
      }
    }
    // Discard all queued items (SFX are stale; music is superseded by _desiredBgmKey).
    // Starting only the latest desired BGM prevents multi-sound flush on iPhone.
    this._playQueue = [];
    void this.syncMusic();

    // Prime SFX pool elements during this gesture context so that iOS allows
    // future non-gesture plays (e.g. game-state-driven SFX like death/winner).
    this._primeSfxForMobile();
    if (_audioDebug && discardedSfxCount > 0) {
      console.log('[SoundManager] discarded stale queued SFX item(s):', discardedSfxCount);
    }
    if (_audioDebug && discardedMusicMarkerCount > 0) {
      console.log('[SoundManager] discarded queued music retry marker(s):', discardedMusicMarkerCount);
    }
  }

  private _queueMusicRetry(): void {
    // Re-arm the unlock listener so the next user gesture re-applies the top
    // desired BGM via _applyDesiredBgm().  The queue is not used for music
    // any more — _drainQueue reads from _desiredPerOwner directly. Keep a
    // single marker in the queue so a future gesture still triggers a drain
    // even if audio remains marked unlocked.
    this._playQueue = this._playQueue.filter((q) => !q.isMusic);
    this._playQueue.push({ key: this._musicKey ?? '__desired-bgm-retry__', isMusic: true });
    this._ensureUnlockListeners();
  }

  private _queueSfxMarker(key: string, opts?: PlayOptions): void {
    // A single queued SFX marker is enough to force the next user gesture down
    // the drain/priming path. Keep any queued music retry marker intact.
    this._playQueue = this._playQueue.filter((q) => q.isMusic);
    this._playQueue.push({ key, isMusic: false, opts });
  }

  private _clearUnlockListeners(): void {
    if (typeof document === 'undefined' || !this._unlockHandler) return;
    document.removeEventListener('click', this._unlockHandler, true);
    document.removeEventListener('keydown', this._unlockHandler, true);
    document.removeEventListener('touchstart', this._unlockHandler, true);
    this._unlockHandler = null;
  }

  private _ensureUnlockListeners(): void {
    if (typeof document === 'undefined' || this._unlockHandler) return;
    if (_audioDebug) {
      console.log('[SoundManager] unlockOnUserGesture() — arming unlock listeners');
    }
    const handler = () => {
      this.unlockFromGesture();
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
        // Do NOT reset _unlocked on hide.  Pre-emptively resetting it would cause
        // all subsequent BGM/SFX calls (e.g. from phase transitions that happen
        // while the screen is briefly inactive) to be queued rather than applied
        // immediately.  The play() error handler already re-queues on
        // NotAllowedError if iOS actually rejects the next play attempt.
        return;
      }
      // Page came back to foreground — resume music if it was paused
      if (!this._musicEl || !this._musicKey || !this._musicEl.paused) return;
      const resumeKey = this._musicKey;
      const resumeEl = this._musicEl;
      void resumeEl.play().catch((err: unknown) => {
        const domErr = err as DOMException;
        if (domErr.name === 'NotAllowedError') {
          if (_audioDebug) {
            console.log(`[SoundManager] resume("${resumeKey}") blocked after visibility restore — re-arming for next gesture`);
          }
          if (this._musicKey === resumeKey) {
            this._musicKey = null;
            this._musicEl = null;
          }
          // Re-arm unlock so the next gesture re-applies the top desired BGM
          // via _applyDesiredBgm() — _desiredPerOwner tracks the correct track.
          this._queueMusicRetry();
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
    for (const [key, entry] of Object.entries(SOUND_REGISTRY)) {
      if (entry.category === 'music') continue; // music handled separately
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
  }

  // ── Debug helpers ───────────────────────────────────────────────────────────

  /** Dump current audio engine state to the console. */
  debugDump(): void {
    console.group('[SoundManager] debugDump()');
    console.log('initialised:', this._initialised, '| unlocked:', this._unlocked);
    console.log('currentMusicKey:', this._musicKey ?? '(none)', '| owner:', this._currentBgmOwner ?? '(none)');
    console.log('desiredMusicTrack:', this._desiredMusicTrack, '| reason:', this._desiredMusicReason ?? '(none)');
    const desiredSummary = Object.fromEntries(
      Object.entries(this._desiredPerOwner).map(([k, v]) => [k, v?.key ?? null]),
    );
    console.log('desiredPerOwner:', JSON.stringify(desiredSummary));
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
/** Migration alias for the stricter centralized music-state API surface. */
export const AudioManager = SoundManager;

// ── Window debug object (DEV / ?debugAudio=1) ─────────────────────────────────

if (_audioDebug && typeof window !== 'undefined') {
  const _dbg = {
    /** List all registered sound keys. */
    listKeys: (): string[] => Object.keys(SOUND_REGISTRY),
    /** Manually play a SFX key: __audioDebug.play('ui:confirm') */
    play: (key: string) => void SoundManager.play(key),
    /** Manually start a music track: __audioDebug.playMusic('music:intro_hub_loop') */
    playMusic: (key: string) => void SoundManager.playMusic(key),
    /** Request BGM with an owner: __audioDebug.requestBgm('music:intro_hub_loop', 'introhub') */
    requestBgm: (key: string, owner: string) => SoundManager.requestBgm(key, owner as BgmOwner),
    /** Immediately unlock audio from the current gesture. */
    unlockFromGesture: (musicOnly = false) => SoundManager.unlockFromGesture({ musicOnly }),
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
    get currentOwner() {
      return SoundManager.currentBgmOwner;
    },
  };

  // Expose under both the new name (__audioDebug) and the legacy alias (__bbAudio)
  (window as unknown as Record<string, unknown>).__audioDebug = _dbg;
  (window as unknown as Record<string, unknown>).__bbAudio = _dbg;

  console.log('[SoundManager] debug helpers on window.__audioDebug (alias: __bbAudio)');
  console.log('  __audioDebug.listKeys()     — list all registered sound keys');
  console.log('  __audioDebug.play(key)      — manually play a sound');
  console.log('  __audioDebug.playMusic(key) — start music');
  console.log('  __audioDebug.unlockFromGesture() — unlock audio now');
  console.log('  __audioDebug.enableAll()    — enable all categories');
  console.log('  __audioDebug.dump()         — print engine state');
}
