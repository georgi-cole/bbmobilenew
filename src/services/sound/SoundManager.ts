/**
 * SoundManager.ts — HTMLAudioElement-based sound manager for bbmobilenew.
 *
 * Architecture:
 * - BGM channel: single HTMLAudioElement with loop, replaced on track change.
 * - Semantic background music is derived from app state via setDesiredMusic/syncMusic.
 * - SFX: small per-key pool (up to SFX_POOL_SIZE) so rapid effects overlap.
 * - Desired BGM: when audio is locked (before first user gesture), the manager
 *   stores only the latest desired BGM track.  On unlock it starts only that
 *   one track, preventing the "flush of accumulated play requests" bug on
 *   iPhone/Safari.
 * - Graceful error handling: invalid/missing files are logged once then skipped.
 *
 * Public API (centralized — prefer these):
 *   init(), setDesiredMusic(track, reason?), syncMusic()
 *   play(key, opts?), stop(key), stopAllMusic()
 *   setCategoryEnabled, setCategoryVolume,
 *   unlockFromGesture, unlockOnUserGesture, unlockAndPlayMusicOnly,
 *   currentMusicKey, currentMusicTrack, currentBgmOwner
 *
 * Legacy BGM API (deprecated — do NOT call from components):
 *   requestBgm(key, owner), releaseBgm(owner), playMusic(key, opts?), stopMusic()
 *   These wrappers are kept for test compatibility only.  All runtime BGM
 *   selection must flow through AudioStateSync → resolveDesiredMusic →
 *   setDesiredMusic so there is exactly one source of truth.
 *
 * IMPORTANT — stopAllMusic vs panicStopAllMusic:
 *   stopAllMusic()      clears _desiredMusicTrack = 'none' AND stops playback.
 *                       Use this when you also need to prevent a syncMusic()
 *                       triggered by visibility-change, settings toggle, etc.
 *                       from restarting stale music before the next Redux
 *                       render cycle updates AudioStateSync.
 *   panicStopAllMusic() stops playback but does NOT update _desiredMusicTrack.
 *                       Only safe when the desired track has already been set
 *                       to 'none' by the caller or will be set synchronously.
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

/**
 * Minimum gap (ms) between two identical SFX triggers.
 *
 * Any `play(key)` within this window of the previous `play(key)` is silently
 * dropped.  This collapses accidental duplicate triggers — e.g. React
 * StrictMode double-invoking a mount effect, a Redux middleware + component
 * hook both firing for the same action, or repeated re-renders — into a
 * single audible SFX instance, preventing the "stacked playback / burst"
 * artefact called out in the audio issue.
 *
 * The window is deliberately short (well below perceptible repeat intervals
 * for "click" / "tap" style SFX) so genuine rapid-fire plays are unaffected.
 */
const SFX_DEDUP_WINDOW_MS = 40;

export interface PlayOptions {
  /** Volume override (0–1).  Defaults to entry volume or 1. */
  volume?: number;
  /**
   * When true, bypasses the short per-key SFX dedup window.
   * Use sparingly — only for SFX that are genuinely expected to fire faster
   * than {@link SFX_DEDUP_WINDOW_MS} (e.g. restarting a looping SFX).
   */
  allowDuplicate?: boolean;
}

export interface UnlockAudioOptions {
  /** @deprecated `musicOnly` is ignored; unlock now always syncs only the current desired track. */
  musicOnly?: boolean;
}

export type { MusicTrack } from './musicTracks';

/**
 * Identifies who currently "owns" the background music channel.
 * Each scope should request/release BGM through requestBgm/releaseBgm so
 * the manager can enforce the single-channel invariant.
 *
 * Priority (highest → lowest):
 * minigame > cinematic > social > spectator > phase
 */
export type BgmOwner =
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
  opts?: PlayOptions;
}

const _liveMusicElements = new Set<HTMLAudioElement>();

function _audioLog(message: string, ...args: unknown[]): void {
  if (!_audioDebug) return;
  console.debug(`[audio] ${message}`, ...args);
}

// ── HTMLAudio factory helpers ─────────────────────────────────────────────────

function _makeMusicEl(src: string, volume: number): HTMLAudioElement {
  const el = document.createElement('audio');
  el.src = src;
  el.loop = true;
  el.volume = Math.max(0, Math.min(1, volume));
  el.preload = 'none';
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
  private _playingMusicTrack: MusicTrack = 'none';
  private _desiredMusicReason: string | null = null;
  private _musicPlaybackToken = 0;
  private _musicMuted = false;
  private _musicVolume = 1;

  // BGM ownership / desired-track tracking (per-owner map with priority fallback)
  private _currentBgmOwner: BgmOwner | null = null;
  // Per-owner desired BGM map — allows automatic fallback when an owner releases.
  // Priority order (lowest → highest):
  // phase < spectator < social < cinematic < minigame
  // The last element wins; iterate in reverse to find the highest-priority active owner.
  private _desiredPerOwner: Partial<Record<BgmOwner, { key: string; opts?: PlayOptions }>> = {};
  // SFX: pool of HTMLAudioElements per key
  private _sfxPools = new Map<string, HTMLAudioElement[]>();

  // Keys that have encountered a load/decode/play error — skip on subsequent calls
  private _failedKeys = new Set<string>();

  // Dynamically registered entries (from remote config, etc.)
  private _extraRegistry = new Map<string, SoundEntry>();

  private _initialised = false;
  private _unlocked = false;

  // Requests queued before the first user gesture (SFX markers only).
  private _playQueue: QueuedPlay[] = [];

  // Per-key timestamp of the most recent accepted play() call, used for the
  // short dedup window that collapses same-tick duplicate triggers (see
  // SFX_DEDUP_WINDOW_MS above).
  private _lastPlayedAt = new Map<string, number>();

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
    // Per-key dedup: drop duplicate triggers within a short window so the SFX
    // pool isn't forced to stack overlapping instances from accidental double
    // dispatches (React StrictMode, middleware + hook overlap, rapid
    // re-renders).  Looping SFX and callers that genuinely need rapid-fire
    // restart can set `opts.allowDuplicate` to opt out.
    if (!opts?.allowDuplicate) {
      const now = Date.now();
      const lastAt = this._lastPlayedAt.get(key);
      if (lastAt != null && now - lastAt < SFX_DEDUP_WINDOW_MS) {
        if (_audioDebug) {
          console.log(
            `[SoundManager] play("${key}") deduped (${now - lastAt}ms < ${SFX_DEDUP_WINDOW_MS}ms)`,
          );
        }
        return;
      }
      this._lastPlayedAt.set(key, now);
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

    // Compute effective volume here so it is available to the HTMLAudio path below.
    const baseVol = opts?.volume ?? entry.volume ?? 1;
    const effectiveVol = Math.max(0, Math.min(1, baseVol * cat.volume));

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

  async unlockAudio(): Promise<void> {
    this.unlockFromGesture();
  }

  async setDesiredMusic(track: MusicTrack, reason?: string): Promise<void> {
    if (this._desiredMusicTrack !== track || this._desiredMusicReason !== (reason ?? null)) {
      _audioLog(`desired -> ${track} reason=${reason ?? 'unknown'}`);
    }
    this._desiredMusicTrack = track;
    this._desiredMusicReason = reason ?? null;
    await this.syncMusic();
  }

  async syncMusic(): Promise<void> {
    if (SOUND_MANAGER_DISABLED) return;
    const shouldMute = this._musicMuted || !this._getCategory('music').enabled;
    const desiredTrack = this._desiredMusicTrack;
    if (shouldMute || desiredTrack === 'none') {
      this.panicStopAllMusic();
      return;
    }

    if (!this._unlocked) {
      this.panicStopAllMusic();
      return;
    }

    const key = this._resolveMusicKey(desiredTrack);
    if (!key) {
      this.panicStopAllMusic();
      return;
    }

    if (this._isMusicSynced(key)) {
      this._playingMusicTrack = desiredTrack;
      this._applyLiveMusicVolume();
      return;
    }

    const playbackToken = ++this._musicPlaybackToken;
    await this._doPlayMusic(key, playbackToken);
  }

  stopAllMusic(): void {
    this._desiredMusicTrack = 'none';
    this._desiredMusicReason = null;
    this._currentBgmOwner = null;
    this._desiredPerOwner = {};
    for (const liveEl of _liveMusicElements) {
      liveEl.pause();
      liveEl.currentTime = 0;
    }
    _liveMusicElements.clear();
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
   * Legacy background-music compatibility wrapper.
   *
   * This no longer participates in multi-owner fallback. Instead it warns,
   * records the legacy owner for diagnostics, and routes the request into the
   * centralized semantic music state so only one desired track exists at a time.
   */
  requestBgm(key: string | null, owner: BgmOwner, opts?: PlayOptions): void {
    console.warn(`[audio] legacy requestBgm("${key}", "${owner}")`);
    if (!key) {
      this.releaseBgm(owner);
      return;
    }

    if (SOUND_MANAGER_DISABLED) return;
    if (opts?.volume != null) {
      console.warn(`[audio] legacy requestBgm volume override ignored for "${key}"`);
    }
    this._desiredPerOwner = {};
    this._currentBgmOwner = owner;
    void this.setDesiredMusic(musicTrackFromSoundKey(key), `legacy-requestBgm:${owner}`);
  }

  /**
   * Legacy background-music compatibility wrapper.
   *
   * Clears the legacy owner diagnostic state and routes to the centralized
   * desired-music state.
   */
  releaseBgm(owner: BgmOwner): void {
    console.warn(`[audio] legacy releaseBgm("${owner}")`);
    if (SOUND_MANAGER_DISABLED) return;
    this._desiredPerOwner = {};
    this._currentBgmOwner = null;
    void this.setDesiredMusic('none', `legacy-releaseBgm:${owner}`);
  }

  /**
   * Start a looping music track (legacy wrapper — prefer requestBgm).
   * Internally stores the track in the 'phase' owner slot for backward
   * compatibility.  If audio is not yet unlocked the request is stored as the
   * desired BGM for the 'phase' owner and started after the first user gesture.
   */
  async playMusic(key: string, opts?: PlayOptions): Promise<void> {
    if (SOUND_MANAGER_DISABLED) return;
    if (opts?.volume != null) {
      console.warn(`[audio] legacy playMusic volume override ignored for "${key}"`);
    }
    console.warn(`[audio] legacy playMusic("${key}")`);
    this._currentBgmOwner = 'phase';
    await this.setDesiredMusic(musicTrackFromSoundKey(key), 'legacy-playMusic');
  }

  private async _doPlayMusic(key: string, playbackToken: number): Promise<void> {
    const desiredTrack = musicTrackFromSoundKey(key);
    if (this._musicKey === key && this._musicEl) {
      this._playingMusicTrack = desiredTrack;
      this._applyLiveMusicVolume();
      return;
    }

    for (const liveEl of _liveMusicElements) {
      liveEl.pause();
      liveEl.currentTime = 0;
    }
    _liveMusicElements.clear();
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

    const baseVol = entry.volume ?? 1;
    const effectiveVol = Math.max(0, Math.min(1, baseVol * this._musicVolume));

    const el = _makeMusicEl(entry.src, effectiveVol);
    _liveMusicElements.clear();
    _liveMusicElements.add(el);
    this._musicEl = el;
    this._musicKey = key;
    this._playingMusicTrack = desiredTrack;

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
          this._playingMusicTrack = 'none';
        }
        _liveMusicElements.delete(el);
      },
      { once: true },
    );

    _audioLog(`play ${desiredTrack}`);

    try {
      await el.play();
      if (this._isStaleMusicPlayback(playbackToken, el, key)) {
        _audioLog(`stale ignored ${desiredTrack}`);
        el.pause();
        el.currentTime = 0;
        _liveMusicElements.delete(el);
        if (this._musicEl === el) {
          this._musicEl = null;
          this._musicKey = null;
          this._playingMusicTrack = 'none';
        }
        return;
      }
    } catch (err) {
      const domErr = err as DOMException;
      if (domErr.name === 'NotAllowedError') {
        _audioLog(`blocked ${desiredTrack}`);
        if (this._musicKey === key) {
          this._musicKey = null;
          this._musicEl = null;
          this._playingMusicTrack = 'none';
        }
        _liveMusicElements.delete(el);
        this._ensureUnlockListeners();
      } else if (domErr.name === 'AbortError') {
        if (this._musicKey === key) {
          this._musicKey = null;
          this._musicEl = null;
          this._playingMusicTrack = 'none';
        }
        _liveMusicElements.delete(el);
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
        _liveMusicElements.delete(el);
      }
    }
  }

  /** Stop the currently-playing music track (legacy — prefer releaseBgm). */
  stopMusic(track?: MusicTrack): void {
    if (SOUND_MANAGER_DISABLED) return;
    if (track && this._desiredMusicTrack !== track && this._playingMusicTrack !== track) {
      return;
    }
    if (!track) {
      this.stopAllMusic();
      return;
    }
    void this.setDesiredMusic('none', `stopMusic:${track}`);
  }

  private _stopCurrentMusic(): void {
    if (this._musicEl) {
      this._musicEl.pause();
      this._musicEl.currentTime = 0;
      _liveMusicElements.delete(this._musicEl);
      this._musicEl = null;
    }
    this._musicKey = null;
    this._playingMusicTrack = 'none';
  }

  panicStopAllMusic(): void {
    this._musicPlaybackToken += 1;
    if (this._musicKey) {
      _audioLog(`stop ${this._playingMusicTrack}`);
    }
    for (const el of _liveMusicElements) {
      el.pause();
      el.currentTime = 0;
    }
    _liveMusicElements.clear();
    this._stopCurrentMusic();
  }

  private _applyLiveMusicVolume(): void {
    if (!this._musicEl || !this._musicKey) return;
    const entry = SOUND_REGISTRY[this._musicKey] ?? this._extraRegistry.get(this._musicKey);
    const baseVol = entry?.volume ?? 1;
    this._musicEl.volume = Math.max(0, Math.min(1, baseVol * this._musicVolume));
  }

  private _resolveMusicKey(track: MusicTrack): string | null {
    if (track === 'none') return null;
    if (track === 'competition' && this._extraRegistry.has('music:remote_main')) {
      return 'music:remote_main';
    }
    return MUSIC_TRACK_SOUND_KEYS[track];
  }

  private _isStaleMusicPlayback(
    playbackToken: number,
    el: HTMLAudioElement,
    key: string,
  ): boolean {
    const desiredKey = this._resolveMusicKey(this._desiredMusicTrack);
    return this._musicPlaybackToken !== playbackToken || this._musicEl !== el || desiredKey !== key;
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
   * Idempotent: repeated gestures after the initial unlock do not stop and
   * restart the current BGM track.  They simply re-run `syncMusic()` so any
   * previously-blocked play (NotAllowedError from a pre-gesture call) can
   * retry against the latest desired track, without interrupting a track
   * that is already playing correctly.
   *
   * `UnlockAudioOptions.musicOnly` is kept for backward compatibility but no
   * longer changes behavior.
   */
  unlockFromGesture(options: UnlockAudioOptions = {}): void {
    if (typeof document === 'undefined') return;
    if (this._unlocked) {
      // Already unlocked: do NOT panic-stop and restart the currently-playing
      // track (that produced an audible stop/restart glitch on repeated
      // taps).  Just clear any armed unlock listeners and let syncMusic()
      // reconcile — it is a no-op when the desired track is already playing
      // and will retry a previously-blocked start otherwise.
      this._clearUnlockListeners();
      void this.syncMusic();
      return;
    }

    this._clearUnlockListeners();
    this._unlocked = true;

    if (SOUND_MANAGER_DISABLED) {
      this._playQueue = [];
      return;
    }

    if (options.musicOnly && _audioDebug) {
      console.debug('[audio] unlockFromGesture(musicOnly) is deprecated; syncing current desired track');
    }
    _audioLog('unlock');
    // Drop any pre-unlock SFX marker — it was stored so that repeated
    // pre-unlock play() calls collapse to at most one, but on the actual
    // gesture we do NOT want to replay stale events.  Music is re-synced
    // from the current desired track only.
    this._playQueue = [];
    void this.syncMusic();
    this._primeSfxForMobile();
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
   * After unlock, stale queued SFX markers are discarded and only the current
   * desired music track is synced.
   */
  unlockOnUserGesture(): void {
    if (typeof document === 'undefined') return;
    if (SOUND_MANAGER_DISABLED) {
      this.unlockFromGesture();
      return;
    }
    if (this._unlocked) {
      if (_audioDebug) {
        console.log('[SoundManager] unlockOnUserGesture() — already unlocked');
      }
      return;
    }
    this._ensureUnlockListeners();
    this.unlockFromGesture();
  }

  /**
   * Deprecated alias for `unlockFromGesture()`.
   *
   * Kept so older callers still unlock audio, but there is no longer a special
   * music-only path separate from the centralized desired-track sync.
   */
  unlockAndPlayMusicOnly(): void {
    this.unlockFromGesture();
  }

  private _queueSfxMarker(key: string, opts?: PlayOptions): void {
    this._playQueue = [{ key, opts }];
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
      void this.syncMusic();
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
    /** Manually start a music track: __audioDebug.playMusic('music:hoh_comp_general') */
    playMusic: (key: string) => void SoundManager.playMusic(key),
    /** Request BGM with an owner: __audioDebug.requestBgm('music:hoh_comp_general', 'phase') */
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
