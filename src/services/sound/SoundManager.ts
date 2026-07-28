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
 *   play(key, opts?), stop(key), stopAllMusic(), fadeOutMusic(durationMs?)
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

import { SOUND_REGISTRY } from './sounds'

// Only the tiny, frequently-used interface sounds are worth warming during
// the first gesture. Everything else is created on demand when it is needed.
const MOBILE_SFX_PRIME_KEYS = ['ui:navigate', 'ui:confirm', 'ui:error'] as const
import type { SoundCategory, SoundEntry } from './sounds'
import {
  MUSIC_TRACK_SOUND_KEYS,
  getMusicFallbackChain,
  musicTrackFromSoundKey,
} from './musicTracks'
import type { CatalogMusicTrack, MusicTrack } from './musicTracks'
import { NativeAudioAdapter } from '../../platform/cordova/NativeAudioAdapter'
import { NATIVE_SFX_MAP } from '../../platform/cordova/nativeSfxMap'

/** True in DEV builds, when VITE_AUDIO_DEBUG=true, or ?debugAudio=1 in URL. */
const _audioDebug =
  import.meta.env.DEV ||
  import.meta.env.VITE_AUDIO_DEBUG === 'true' ||
  (typeof location !== 'undefined' &&
    new URLSearchParams(location.search).get('debugAudio') === '1')

/**
 * Hard kill-switch for runtime audio playback/management.
 * Set to false to re-enable all audio; set to true only when debugging
 * playback/lifecycle regressions to keep the hook wiring intact.
 */
const SOUND_MANAGER_DISABLED = false

/** Max simultaneous instances per SFX key. */
const SFX_POOL_SIZE = 4

/**
 * Tiny silent WAV used to unlock the single reusable BGM element from a user
 * gesture even when the app has not resolved a real music track yet.
 */
const SILENT_UNLOCK_AUDIO_SRC =
  'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQIAAAAAAA=='

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
const SFX_DEDUP_WINDOW_MS = 40

export interface PlayOptions {
  /** Volume override (0–1).  Defaults to entry volume or 1. */
  volume?: number
  /**
   * When true, bypasses the short per-key SFX dedup window.
   * Use sparingly — only for SFX that are genuinely expected to fire faster
   * than {@link SFX_DEDUP_WINDOW_MS} (e.g. restarting a looping SFX).
   */
  allowDuplicate?: boolean
}

export interface UnlockAudioOptions {
  /** @deprecated `musicOnly` is ignored; unlock now always syncs only the current desired track. */
  musicOnly?: boolean
}

export interface MusicTrackOverride {
  track: CatalogMusicTrack
  sound: SoundEntry
}

interface ResolvedMusicCandidate {
  track: CatalogMusicTrack
  key: string
}

export type { MusicTrack } from './musicTracks'

/**
 * Identifies who currently "owns" the background music channel.
 * Each scope should request/release BGM through requestBgm/releaseBgm so
 * the manager can enforce the single-channel invariant.
 *
 * Priority (highest → lowest):
 * minigame > cinematic > social > spectator > phase
 */
export type BgmOwner = 'phase' | 'spectator' | 'social' | 'cinematic' | 'minigame'
export const CINEMATIC_BGM_OWNER: BgmOwner = 'cinematic'

interface CategoryState {
  enabled: boolean
  volume: number // 0–1 master volume for the category
}

const DEFAULT_CATEGORY_STATE: CategoryState = { enabled: true, volume: 1 }

interface QueuedPlay {
  key: string
  opts?: PlayOptions
}

const _liveMusicElements = new Set<HTMLAudioElement>()

function _audioLog(message: string, ...args: unknown[]): void {
  if (!_audioDebug) return
  console.debug(`[audio] ${message}`, ...args)
}

/**
 * Structured BGM-only log line emitted for every background-music lifecycle
 * event (request, sync, loading, playing, fading-out).  Each line includes
 * both the semantic track name and the resolved audio asset source URL so
 * developers can trace the full path from Redux state → file.
 *
 * Gated behind the same `_audioDebug` flag as `_audioLog` — produces no
 * output in production builds where neither DEV mode nor `VITE_AUDIO_DEBUG`
 * is active.
 */
function _bgmLog(event: string, track: string, src: string): void {
  if (!_audioDebug) return
  console.debug(`[audio:bgm] ${event} | track="${track}" | src="${src}"`)
}

// ── HTMLAudio factory helpers ─────────────────────────────────────────────────

function _makeMusicEl(src: string, volume: number, loop = true): HTMLAudioElement {
  const el = document.createElement('audio')
  el.src = src
  el.loop = loop
  el.volume = Math.max(0, Math.min(1, volume))
  el.preload = 'none'
  return el
}

function _makeSfxEl(src: string, volume: number, loop = false): HTMLAudioElement {
  const el = document.createElement('audio')
  el.src = src
  el.loop = loop
  el.volume = Math.max(0, Math.min(1, volume))
  el.preload = 'none'
  return el
}

function _resetAudioTime(el: HTMLAudioElement): void {
  try {
    el.currentTime = 0
  } catch {
    // Some mobile WebViews reject currentTime changes while an element settles.
  }
}

// ── SoundManager class ────────────────────────────────────────────────────────

class _SoundManager {
  private _categories = new Map<SoundCategory, CategoryState>()

  // BGM channel
  private _musicEl: HTMLAudioElement | null = null
  private _musicKey: string | null = null
  private _desiredMusicTrack: MusicTrack = 'none'
  private _playingMusicTrack: MusicTrack = 'none'
  private _desiredMusicReason: string | null = null
  private _musicPlaybackToken = 0
  private _musicMuted = false
  private _musicVolume = 1
  private _sfxPrimed = false

  // BGM ownership / desired-track tracking (per-owner map with priority fallback)
  private _currentBgmOwner: BgmOwner | null = null
  // Per-owner desired BGM map — allows automatic fallback when an owner releases.
  // Priority order (lowest → highest):
  // phase < spectator < social < cinematic < minigame
  // The last element wins; iterate in reverse to find the highest-priority active owner.
  private _desiredPerOwner: Partial<Record<BgmOwner, { key: string; opts?: PlayOptions }>> = {}
  // SFX: pool of HTMLAudioElements per key
  private _sfxPools = new Map<string, HTMLAudioElement[]>()

  // Keys that have encountered a load/decode/play error — skip on subsequent calls
  private _failedKeys = new Set<string>()

  // Dynamically registered entries (from remote config, etc.)
  private _extraRegistry = new Map<string, SoundEntry>()
  private _musicTrackOverrides = new Map<CatalogMusicTrack, string>()
  private _musicTrackOverrideSignature = ''

  private _initialised = false
  private _unlocked = false

  // Requests queued before the first user gesture (SFX markers only).
  private _playQueue: QueuedPlay[] = []

  // Per-key timestamp of the most recent accepted play() call, used for the
  // short dedup window that collapses same-tick duplicate triggers (see
  // SFX_DEDUP_WINDOW_MS above).
  private _lastPlayedAt = new Map<string, number>()

  // Stored unlock handler — ensures only one set of listeners is ever registered
  private _unlockHandler: (() => void) | null = null
  private _lifecycleListenersBound = false

  // ── Initialisation ──────────────────────────────────────────────────────────

  /**
   * Initialise the SoundManager.
   * With the HTMLAudio backend there is nothing to eagerly preload — audio
   * elements are created lazily on first play — so this is a lightweight
   * bookkeeping call.
   */
  async init(): Promise<void> {
    if (this._initialised) return
    this._initialised = true
    if (SOUND_MANAGER_DISABLED) return
    this._bindLifecycleListeners()
    if (_audioDebug) {
      console.log(
        '[SoundManager] init() — registry has',
        Object.keys(SOUND_REGISTRY).length,
        'keys'
      )
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
    this._extraRegistry.set(entry.key, entry)
    this._failedKeys.delete(entry.key)
  }

  setMusicTrackOverrides(overrides: readonly MusicTrackOverride[]): void {
    const normalized = overrides.filter((override) => override.sound.category === 'music')
    const signature = normalized
      .map(
        ({ track, sound }) =>
          `${track}|${sound.key}|${sound.src}|${sound.volume ?? ''}|${sound.loop ?? ''}`
      )
      .sort()
      .join('\n')
    if (signature === this._musicTrackOverrideSignature) return

    for (const key of this._musicTrackOverrides.values()) {
      this._extraRegistry.delete(key)
      this._failedKeys.delete(key)
    }
    this._musicTrackOverrides.clear()

    for (const override of normalized) {
      this.registerDynamic(override.sound)
      this._musicTrackOverrides.set(override.track, override.sound.key)
    }
    this._musicTrackOverrideSignature = signature

    if (this._desiredMusicTrack !== 'none') {
      this.panicStopAllMusic()
      void this.syncMusic()
    }
  }

  private _getEntry(key: string): SoundEntry | undefined {
    return this._extraRegistry.get(key) ?? SOUND_REGISTRY[key]
  }

  // ── Playback ────────────────────────────────────────────────────────────────

  /**
   * Play a one-shot SFX.
   * If audio is not yet unlocked the request is queued and retried after the
   * first user gesture.
   */
  async play(key: string, opts?: PlayOptions): Promise<void> {
    if (SOUND_MANAGER_DISABLED) return
    if (!this._unlocked) {
      if (_audioDebug) {
        console.log(`[SoundManager] play("${key}") queued — not yet unlocked`)
      }
      this._queueSfxMarker(key, opts)
      return
    }
    // Per-key dedup: drop duplicate triggers within a short window so the SFX
    // pool isn't forced to stack overlapping instances from accidental double
    // dispatches (React StrictMode, middleware + hook overlap, rapid
    // re-renders).  Looping SFX and callers that genuinely need rapid-fire
    // restart can set `opts.allowDuplicate` to opt out.
    if (!opts?.allowDuplicate) {
      const now = Date.now()
      const lastAt = this._lastPlayedAt.get(key)
      if (lastAt != null && now - lastAt < SFX_DEDUP_WINDOW_MS) {
        if (_audioDebug) {
          console.log(
            `[SoundManager] play("${key}") deduped (${now - lastAt}ms < ${SFX_DEDUP_WINDOW_MS}ms)`
          )
        }
        return
      }
      this._lastPlayedAt.set(key, now)
    }
    return this._doPlay(key, opts)
  }

  private async _doPlay(key: string, opts?: PlayOptions): Promise<void> {
    if (this._failedKeys.has(key)) return // previously failed — silent skip

    const entry = this._getEntry(key)
    if (!entry) {
      console.warn(`[SoundManager] Unknown sound key: "${key}"`)
      return
    }

    const cat = this._getCategory(entry.category)
    if (!cat.enabled) {
      if (_audioDebug) {
        console.log(`[SoundManager] play("${key}") skipped — category "${entry.category}" disabled`)
      }
      return
    }

    // Compute effective volume here so it is available to both the native
    // fast-path (for gate checks) and the HTMLAudio fallback path below.
    const baseVol = opts?.volume ?? entry.volume ?? 1
    const effectiveVol = Math.max(0, Math.min(1, baseVol * cat.volume))

    // Native audio fast-path: when running inside a Cordova WebView with the
    // nativeaudio plugin, use the native backend for mapped SFX keys.
    // Note: native SFX volume is baked in at preload time (via preloadComplex)
    // so real-time category volume changes do not affect already-preloaded SFX.
    // The fast-path is skipped when effectiveVol is 0 (muted) so silence is honoured.
    const nativeKey = NATIVE_SFX_MAP[key as keyof typeof NATIVE_SFX_MAP]
    if (nativeKey && NativeAudioAdapter.isAvailable() && effectiveVol > 0) {
      try {
        NativeAudioAdapter.playSfx(nativeKey)
        return
      } catch (err) {
        console.warn('[SoundManager] NativeAudio play failed, falling back to HTMLAudio', err)
      }
    }

    // Get or lazily create a per-key pool
    let pool = this._sfxPools.get(key)
    if (!pool) {
      pool = []
      this._sfxPools.set(key, pool)
    }

    // Find a free element in the pool
    let el = pool.find((e) => e.paused || e.ended)
    if (!el && pool.length < SFX_POOL_SIZE) {
      // Grow the pool — honour entry.loop so looping SFX (e.g. wheel-spin) work correctly
      el = _makeSfxEl(entry.src, effectiveVol, entry.loop ?? false)
      el.addEventListener('error', () => {
        if (!this._failedKeys.has(key)) {
          const code = el!.error?.code ?? 'unknown'
          console.error(
            `[SoundManager] SFX load error "${key}" (code ${code}):`,
            el!.error?.message ?? entry.src
          )
          this._failedKeys.add(key)
        }
      })
      pool.push(el)
    } else if (!el) {
      // Pool full — steal the element with the least time remaining
      let minRemaining = Infinity
      let stolen: HTMLAudioElement | null = null
      for (const e of pool) {
        const remaining = (isNaN(e.duration) ? 0 : e.duration) - e.currentTime
        if (remaining < minRemaining) {
          minRemaining = remaining
          stolen = e
        }
      }
      // Fallback: steal the first element if the loop produced no result
      el = stolen ?? pool[0]!
      el.pause()
      _resetAudioTime(el)
    }

    el!.volume = effectiveVol
    el!.muted = false
    _resetAudioTime(el!)

    if (_audioDebug) {
      console.log(`[SoundManager] play("${key}") vol=${effectiveVol.toFixed(2)} src="${entry.src}"`)
    }

    try {
      await el!.play()
    } catch (err) {
      if ((err as DOMException).name === 'NotAllowedError') {
        // Autoplay blocked (either before unlock or iOS blocking a non-gesture
        // call on a primed element). Queue a single SFX marker so the next
        // gesture re-runs the unlock drain/priming path without letting
        // repeated blocked SFX inflate the queue unboundedly.
        if (_audioDebug) {
          console.log(`[SoundManager] play("${key}") blocked by autoplay policy — re-queued`)
        }
        this._sfxPrimed = false
        this._queueSfxMarker(key, opts)
        this._ensureUnlockListeners()
      } else {
        if (!this._failedKeys.has(key)) {
          console.error(`[SoundManager] play("${key}") failed:`, err)
          this._failedKeys.add(key)
        }
      }
    }
  }

  // ── Music / BGM ─────────────────────────────────────────────────────────────

  /** Returns the key of the currently-playing music track, or null. */
  get currentMusicKey(): string | null {
    return this._musicKey
  }

  /** Returns the semantic music track currently allocated to the music channel. */
  get currentMusicTrack(): MusicTrack {
    return this._playingMusicTrack
  }

  /** Returns the BgmOwner that is currently controlling the BGM channel. */
  get currentBgmOwner(): BgmOwner | null {
    return this._currentBgmOwner
  }

  async unlockAudio(): Promise<void> {
    this.unlockFromGesture()
  }

  async setDesiredMusic(track: MusicTrack, reason?: string): Promise<void> {
    if (this._desiredMusicTrack !== track || this._desiredMusicReason !== (reason ?? null)) {
      _audioLog(`desired -> ${track} reason=${reason ?? 'unknown'}`)
      // BGM log: include the resolved asset path so it's visible in the console
      // even before the AudioElement is created.
      const candidate = this._resolveMusicCandidate(track)
      const src = candidate ? (this._getEntry(candidate.key)?.src ?? candidate.key) : '(none)'
      _bgmLog('requested', candidate?.track ?? track, src)
    }
    this._desiredMusicTrack = track
    this._desiredMusicReason = reason ?? null
    await this.syncMusic()
  }

  async syncMusic(): Promise<void> {
    if (SOUND_MANAGER_DISABLED) return
    const shouldMute = this._musicMuted || !this._getCategory('music').enabled
    const desiredTrack = this._desiredMusicTrack
    if (shouldMute || desiredTrack === 'none') {
      this.panicStopAllMusic()
      return
    }
    if (!this._unlocked) {
      this.panicStopAllMusic()
      return
    }

    const candidate = this._resolveMusicCandidate(desiredTrack)
    if (!candidate) {
      this.panicStopAllMusic()
      return
    }
    if (this._isMusicSynced(candidate.key)) {
      this._playingMusicTrack = candidate.track
      this._applyLiveMusicVolume()
      return
    }

    const syncEntry = this._getEntry(candidate.key)
    _bgmLog('sync', candidate.track, syncEntry?.src ?? candidate.key)
    const playbackToken = ++this._musicPlaybackToken
    await this._doPlayMusic(candidate, playbackToken)
  }

  stopAllMusic(): void {
    this._desiredMusicTrack = 'none'
    this._desiredMusicReason = null
    this._currentBgmOwner = null
    this._desiredPerOwner = {}
    for (const liveEl of _liveMusicElements) {
      liveEl.pause()
      _resetAudioTime(liveEl)
    }
    _liveMusicElements.clear()
    this._stopCurrentMusic(this._unlocked)
  }

  /**
   * Fade out the currently-playing music track over `durationMs` milliseconds,
   * then stop it.
   *
   * Like `stopAllMusic()`, this immediately clears `_desiredMusicTrack` so that
   * any visibility-change or settings-driven `syncMusic()` during the fade
   * cannot restart stale music.
   *
   * If no music is currently playing the returned Promise resolves immediately.
   *
   * @param durationMs Fade duration in ms (default 400).
   */
  async fadeOutMusic(durationMs = 400): Promise<void> {
    // Clear desired-track pointer synchronously so syncMusic() cannot restart
    // stale music while the fade is in progress (same guarantee as stopAllMusic).
    this._desiredMusicTrack = 'none'
    this._desiredMusicReason = null
    this._currentBgmOwner = null
    this._desiredPerOwner = {}

    if (SOUND_MANAGER_DISABLED) return

    const el = this._musicEl
    if (!el || el.paused) {
      // Nothing audible to fade; clean up and return.
      this._stopCurrentMusic(this._unlocked)
      for (const liveEl of _liveMusicElements) {
        liveEl.pause()
        _resetAudioTime(liveEl)
      }
      _liveMusicElements.clear()
      return
    }

    // Invalidate any concurrent async playback so a stale _doPlayMusic that
    // resolves after us does not re-set the music element.
    this._musicPlaybackToken += 1

    if (durationMs <= 0) {
      for (const liveEl of _liveMusicElements) {
        liveEl.pause()
        _resetAudioTime(liveEl)
      }
      _liveMusicElements.clear()
      this._stopCurrentMusic(this._unlocked)
      return
    }

    _audioLog(`fade-out ${this._playingMusicTrack} over ${durationMs}ms`)
    // Resolve the source URL for the BGM log before the element is nulled.
    const fadeSrc = this._musicKey
      ? (this._getEntry(this._musicKey)?.src ?? this._musicKey)
      : '(none)'
    _bgmLog('fading-out', this._playingMusicTrack, fadeSrc)

    const startVolume = el.volume
    const FADE_STEP_MS = 50
    const MIN_INTERVAL_MS = 16
    const steps = Math.max(1, Math.ceil(durationMs / FADE_STEP_MS))
    const intervalMs = Math.max(MIN_INTERVAL_MS, Math.floor(durationMs / steps))
    let step = 0

    await new Promise<void>((resolve) => {
      const timer = window.setInterval(() => {
        step += 1
        el.volume = Math.max(0, startVolume * (1 - step / steps))
        if (step >= steps) {
          window.clearInterval(timer)
          resolve()
        }
      }, intervalMs)
    })

    for (const liveEl of _liveMusicElements) {
      liveEl.pause()
      _resetAudioTime(liveEl)
    }
    _liveMusicElements.clear()
    this._stopCurrentMusic(this._unlocked)
  }

  setMusicMuted(value: boolean): void {
    this._musicMuted = value
    const state = this._getCategory('music')
    state.enabled = !value
    this._categories.set('music', state)
    if (value) {
      this._stopCurrentMusic(this._unlocked)
      return
    }
    void this.syncMusic()
  }

  setMusicVolume(value: number): void {
    this._musicVolume = Math.max(0, Math.min(1, value))
    const state = this._getCategory('music')
    state.volume = this._musicVolume
    this._categories.set('music', state)
    this._applyLiveMusicVolume()
  }

  async playSfx(key: string, options?: PlayOptions): Promise<void> {
    await this.play(key, options)
  }

  /**
   * Legacy background-music compatibility wrapper.
   *
   * This no longer participates in multi-owner fallback. Instead it warns,
   * records the legacy owner for diagnostics, and routes the request into the
   * centralized semantic music state so only one desired track exists at a time.
   */
  requestBgm(key: string | null, owner: BgmOwner, opts?: PlayOptions): void {
    console.warn(`[audio] legacy requestBgm("${key}", "${owner}")`)
    if (!key) {
      this.releaseBgm(owner)
      return
    }

    if (SOUND_MANAGER_DISABLED) return
    if (opts?.volume != null) {
      console.warn(`[audio] legacy requestBgm volume override ignored for "${key}"`)
    }
    this._desiredPerOwner = {}
    this._currentBgmOwner = owner
    void this.setDesiredMusic(musicTrackFromSoundKey(key), `legacy-requestBgm:${owner}`)
  }

  /**
   * Legacy background-music compatibility wrapper.
   *
   * Clears the legacy owner diagnostic state and routes to the centralized
   * desired-music state.
   */
  releaseBgm(owner: BgmOwner): void {
    console.warn(`[audio] legacy releaseBgm("${owner}")`)
    if (SOUND_MANAGER_DISABLED) return
    this._desiredPerOwner = {}
    this._currentBgmOwner = null
    void this.setDesiredMusic('none', `legacy-releaseBgm:${owner}`)
  }

  /**
   * Start a looping music track (legacy wrapper — prefer requestBgm).
   * Internally stores the track in the 'phase' owner slot for backward
   * compatibility.  If audio is not yet unlocked the request is stored as the
   * desired BGM for the 'phase' owner and started after the first user gesture.
   */
  async playMusic(key: string, opts?: PlayOptions): Promise<void> {
    if (SOUND_MANAGER_DISABLED) return
    if (opts?.volume != null) {
      console.warn(`[audio] legacy playMusic volume override ignored for "${key}"`)
    }
    console.warn(`[audio] legacy playMusic("${key}")`)
    this._currentBgmOwner = 'phase'
    await this.setDesiredMusic(musicTrackFromSoundKey(key), 'legacy-playMusic')
  }

  private async _doPlayMusic(
    candidate: ResolvedMusicCandidate,
    playbackToken: number
  ): Promise<void> {
    const { key, track: desiredTrack } = candidate
    if (this._musicKey === key && this._musicEl) {
      this._playingMusicTrack = desiredTrack
      this._applyLiveMusicVolume()
      return
    }

    for (const liveEl of _liveMusicElements) {
      liveEl.pause()
      _resetAudioTime(liveEl)
    }
    _liveMusicElements.clear()
    this._stopCurrentMusic(true)

    const entry = this._getEntry(key)
    if (!entry) {
      console.warn(`[SoundManager] Unknown music key: "${key}"`)
      this._failedKeys.add(key)
      void this.syncMusic()
      return
    }
    const cat = this._getCategory('music')
    if (!cat.enabled) return
    if (this._failedKeys.has(key)) {
      void this.syncMusic()
      return
    }

    const baseVol = entry.volume ?? 1
    const effectiveVol = Math.max(0, Math.min(1, baseVol * this._musicVolume))
    const el = this._getOrCreateMusicEl(entry.src, effectiveVol, entry.loop ?? true)
    _liveMusicElements.clear()
    _liveMusicElements.add(el)
    this._musicEl = el
    this._musicKey = key
    this._playingMusicTrack = desiredTrack

    el.addEventListener(
      'error',
      () => {
        if (this._isStaleMusicAttempt(playbackToken, el, key)) return
        if (!this._failedKeys.has(key)) {
          const code = el.error?.code ?? 'unknown'
          console.error(
            `[SoundManager] music load error "${key}" (code ${code}):`,
            el.error?.message ?? entry.src
          )
          this._failedKeys.add(key)
        }
        this._recoverFromMusicFailure(key, el)
      },
      { once: true }
    )

    _audioLog(`play ${desiredTrack}`)
    _bgmLog('loading', desiredTrack, entry.src)
    try {
      await el.play()
      if (this._isStaleMusicPlayback(playbackToken, el, key)) {
        _audioLog(`stale ignored ${desiredTrack}`)
        if (this._musicEl === el && this._musicKey === key) {
          el.pause()
          _resetAudioTime(el)
          _liveMusicElements.delete(el)
          this._musicKey = null
          this._playingMusicTrack = 'none'
        }
        return
      }
      _bgmLog('playing', desiredTrack, entry.src)
    } catch (err) {
      if (this._isStaleMusicAttempt(playbackToken, el, key)) return
      const domErr = err as DOMException
      if (domErr.name === 'NotAllowedError') {
        _audioLog(`blocked ${desiredTrack}`)
        if (this._musicKey === key) {
          this._musicKey = null
          this._playingMusicTrack = 'none'
        }
        _liveMusicElements.delete(el)
        this._ensureUnlockListeners()
      } else if (domErr.name === 'AbortError') {
        if (this._musicKey === key) {
          this._musicKey = null
          this._playingMusicTrack = 'none'
        }
        _liveMusicElements.delete(el)
      } else {
        if (!this._failedKeys.has(key)) {
          console.error(`[SoundManager] playMusic("${key}") failed:`, err)
          this._failedKeys.add(key)
        }
        this._recoverFromMusicFailure(key, el)
      }
    }
  }

  /** Stop the currently-playing music track (legacy — prefer releaseBgm). */
  stopMusic(track?: MusicTrack): void {
    if (SOUND_MANAGER_DISABLED) return
    if (track && this._desiredMusicTrack !== track && this._playingMusicTrack !== track) {
      return
    }
    if (!track) {
      this.stopAllMusic()
      return
    }
    void this.setDesiredMusic('none', `stopMusic:${track}`)
  }

  private _stopCurrentMusic(retainElement = false): void {
    if (this._musicEl) {
      this._musicEl.pause()
      _resetAudioTime(this._musicEl)
      _liveMusicElements.delete(this._musicEl)
      if (!retainElement) {
        this._musicEl = null
      }
    }
    this._musicKey = null
    this._playingMusicTrack = 'none'
  }

  panicStopAllMusic(): void {
    this._musicPlaybackToken += 1
    if (this._musicKey) {
      _audioLog(`stop ${this._playingMusicTrack}`)
    }
    for (const el of _liveMusicElements) {
      el.pause()
      _resetAudioTime(el)
    }
    _liveMusicElements.clear()
    this._stopCurrentMusic(this._unlocked)
  }

  private _applyLiveMusicVolume(): void {
    if (!this._musicEl || !this._musicKey) return
    const entry = this._getEntry(this._musicKey)
    const baseVol = entry?.volume ?? 1
    this._musicEl.volume = Math.max(0, Math.min(1, baseVol * this._musicVolume))
  }

  private _resolveMusicCandidate(track: MusicTrack): ResolvedMusicCandidate | null {
    if (track === 'none') return null
    const semanticCandidates = [
      track,
      ...getMusicFallbackChain(track).filter(
        (fallback): fallback is CatalogMusicTrack => fallback !== 'none'
      ),
    ]

    for (const candidateTrack of semanticCandidates) {
      const overrideKey = this._musicTrackOverrides.get(candidateTrack)
      if (overrideKey && !this._failedKeys.has(overrideKey) && this._getEntry(overrideKey)) {
        return { track: candidateTrack, key: overrideKey }
      }
      if (
        candidateTrack === 'competition' &&
        this._extraRegistry.has('music:remote_main') &&
        !this._failedKeys.has('music:remote_main')
      ) {
        return { track: candidateTrack, key: 'music:remote_main' }
      }
      const bundledKey = MUSIC_TRACK_SOUND_KEYS[candidateTrack]
      if (!this._failedKeys.has(bundledKey) && this._getEntry(bundledKey)) {
        return { track: candidateTrack, key: bundledKey }
      }
    }
    return null
  }

  private _resolveMusicKey(track: MusicTrack): string | null {
    return this._resolveMusicCandidate(track)?.key ?? null
  }

  private _recoverFromMusicFailure(key: string, el: HTMLAudioElement): void {
    if (this._musicKey !== key || this._musicEl !== el) return
    this._musicPlaybackToken += 1
    el.pause()
    _resetAudioTime(el)
    _liveMusicElements.delete(el)
    this._musicKey = null
    this._playingMusicTrack = 'none'
    void this.syncMusic()
  }

  private _isStaleMusicAttempt(playbackToken: number, el: HTMLAudioElement, key: string): boolean {
    return (
      this._musicPlaybackToken !== playbackToken || this._musicEl !== el || this._musicKey !== key
    )
  }

  private _isStaleMusicPlayback(playbackToken: number, el: HTMLAudioElement, key: string): boolean {
    const desiredKey = this._resolveMusicKey(this._desiredMusicTrack)
    return this._musicPlaybackToken !== playbackToken || this._musicEl !== el || desiredKey !== key
  }

  private _isMusicSynced(key: string): boolean {
    return this._musicKey === key && this._musicEl != null
  }

  /**
   * Stop a specific sound by key without affecting the global music track.
   * Intended for looping SFX (e.g. a wheel-spin loop) played via play().
   * No-ops silently if the key is unknown or not playing.
   */
  stop(key: string): void {
    if (SOUND_MANAGER_DISABLED) return
    const pool = this._sfxPools.get(key)
    if (!pool) return
    if (_audioDebug) {
      console.log(`[SoundManager] stop("${key}")`)
    }
    for (const el of pool) {
      el.pause()
      _resetAudioTime(el)
    }
  }

  // ── Category controls ───────────────────────────────────────────────────────

  /** Enable or disable all sounds in a category. */
  setCategoryEnabled(category: SoundCategory, enabled: boolean): void {
    if (category === 'music') {
      this.setMusicMuted(!enabled)
      if (_audioDebug) {
        console.log(`[SoundManager] category "${category}" enabled=${enabled}`)
      }
      return
    }
    const state = this._getCategory(category)
    const prev = state.enabled
    state.enabled = enabled
    this._categories.set(category, state)
    if (prev !== enabled) {
      console.log(`[SoundManager] category "${category}" enabled=${enabled}`)
    }
  }

  /** Set the master volume for a category (0–1). */
  setCategoryVolume(category: SoundCategory, volume: number): void {
    if (category === 'music') {
      const newVolume = Math.max(0, Math.min(1, volume))
      const didChange = this._musicVolume !== newVolume
      this.setMusicVolume(newVolume)
      if (_audioDebug && didChange) {
        console.log(`[SoundManager] category "${category}" volume=${newVolume.toFixed(2)}`)
      }
      return
    }
    const state = this._getCategory(category)
    const newVolume = Math.max(0, Math.min(1, volume))
    if (state.volume !== newVolume) {
      state.volume = newVolume
      this._categories.set(category, state)
      console.log(`[SoundManager] category "${category}" volume=${newVolume.toFixed(2)}`)
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
    if (typeof document === 'undefined') return
    if (this._unlocked) {
      // Already unlocked: do NOT panic-stop and restart the currently-playing
      // track (that produced an audible stop/restart glitch on repeated
      // taps).  Just clear any armed unlock listeners and let syncMusic()
      // reconcile — it is a no-op when the desired track is already playing
      // and will retry a previously-blocked start otherwise.
      this._clearUnlockListeners()
      this._primeMusicForMobile()
      this._primeSfxForMobile()
      this._playQueue = []
      void this.syncMusic()
      return
    }

    this._clearUnlockListeners()
    this._unlocked = true

    if (SOUND_MANAGER_DISABLED) {
      this._playQueue = []
      return
    }

    if (options.musicOnly && _audioDebug) {
      console.debug(
        '[audio] unlockFromGesture(musicOnly) is deprecated; syncing current desired track'
      )
    }
    _audioLog('unlock')
    // Drop any pre-unlock SFX marker — it was stored so that repeated
    // pre-unlock play() calls collapse to at most one, but on the actual
    // gesture we do NOT want to replay stale events.  Music is re-synced
    // from the current desired track only.
    this._playQueue = []
    this._primeMusicForMobile()
    void this.syncMusic()
    this._primeSfxForMobile()
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
    if (typeof document === 'undefined') return
    if (SOUND_MANAGER_DISABLED) {
      this.unlockFromGesture()
      return
    }
    if (this._unlocked) {
      if (_audioDebug) {
        console.log('[SoundManager] unlockOnUserGesture() — already unlocked')
      }
      return
    }
    this._ensureUnlockListeners()
    this.unlockFromGesture()
  }

  /**
   * Deprecated alias for `unlockFromGesture()`.
   *
   * Kept so older callers still unlock audio, but there is no longer a special
   * music-only path separate from the centralized desired-track sync.
   */
  unlockAndPlayMusicOnly(): void {
    this.unlockFromGesture()
  }

  private _queueSfxMarker(key: string, opts?: PlayOptions): void {
    this._playQueue = [{ key, opts }]
  }

  private _clearUnlockListeners(): void {
    if (typeof document === 'undefined' || !this._unlockHandler) return
    document.removeEventListener('click', this._unlockHandler, true)
    document.removeEventListener('keydown', this._unlockHandler, true)
    document.removeEventListener('touchstart', this._unlockHandler, true)
    this._unlockHandler = null
  }

  private _ensureUnlockListeners(): void {
    if (typeof document === 'undefined' || this._unlockHandler) return
    if (_audioDebug) {
      console.log('[SoundManager] unlockOnUserGesture() — arming unlock listeners')
    }
    const handler = () => {
      this.unlockFromGesture()
    }
    this._unlockHandler = handler
    document.addEventListener('click', handler, true)
    document.addEventListener('keydown', handler, true)
    document.addEventListener('touchstart', handler, true)
  }

  private _bindLifecycleListeners(): void {
    if (typeof document === 'undefined' || this._lifecycleListenersBound) return
    this._lifecycleListenersBound = true
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Do NOT reset _unlocked on hide.  Pre-emptively resetting it would cause
        // all subsequent BGM/SFX calls (e.g. from phase transitions that happen
        // while the screen is briefly inactive) to be queued rather than applied
        // immediately.  The play() error handler already re-queues on
        // NotAllowedError if iOS actually rejects the next play attempt.
        return
      }
      void this.syncMusic()
    })
  }

  private _getOrCreateMusicEl(src: string, volume: number, loop: boolean): HTMLAudioElement {
    const el = this._musicEl ?? _makeMusicEl(src, volume, loop)
    if (this._musicEl !== el) {
      this._musicEl = el
    }
    el.pause()
    if (el.getAttribute('src') !== src) {
      el.src = src
    }
    el.loop = loop
    el.volume = Math.max(0, Math.min(1, volume))
    el.preload = 'none'
    el.muted = false
    _resetAudioTime(el)
    return el
  }

  private _primeMusicForMobile(): void {
    if (typeof document === 'undefined') return
    if (this._musicEl) return

    const el = _makeMusicEl(SILENT_UNLOCK_AUDIO_SRC, 0, false)
    this._musicEl = el
    el.muted = true
    el.preload = 'auto'

    const playResult = el.play()
    el.pause()
    _resetAudioTime(el)
    el.muted = false
    el.volume = 0
    el.removeAttribute('src')

    if (playResult && typeof playResult.then === 'function') {
      playResult.catch((err) => {
        if (_audioDebug) {
          console.warn('[SoundManager] music unlock priming failed:', err)
        }
      })
    }
  }

  private _resetPrimedSfxElement(el: HTMLAudioElement, entry: SoundEntry): void {
    el.pause()
    _resetAudioTime(el)
    el.muted = false
    el.volume = Math.max(0, Math.min(1, entry.volume ?? 1))
  }

  private _handleSfxPrimingFailure(key: string, err: unknown): void {
    if (_audioDebug) {
      console.warn(`[SoundManager] SFX priming play() failed for "${key}":`, err)
    }
    // Do not mark the key failed: mobile browsers may reject bulk priming even
    // though the same sound can still play later from a real gesture.
  }

  /**
   * Pre-create the small set of common interface sounds during a user gesture.
   * The element is paused immediately so stale startup sounds cannot become
   * audible later. Ceremony and minigame audio remains lazy/on-demand.
   */
  private _primeSfxForMobile(): void {
    if (typeof document === 'undefined' || this._sfxPrimed) return
    this._sfxPrimed = true

    for (const key of MOBILE_SFX_PRIME_KEYS) {
      const entry = SOUND_REGISTRY[key]
      if (!entry) continue
      let pool = this._sfxPools.get(key)
      if (!pool) {
        pool = []
        this._sfxPools.set(key, pool)
      }
      if (pool.length === 0) {
        const el = _makeSfxEl(entry.src, 0, entry.loop ?? false)
        el.addEventListener('error', () => {
          if (!this._failedKeys.has(key)) {
            const code = el.error?.code ?? 'unknown'
            console.error(
              `[SoundManager] SFX load error "${key}" (code ${code}):`,
              el.error?.message ?? entry.src
            )
            this._failedKeys.add(key)
          }
        })
        pool.push(el)
        el.muted = true
        const playResult = el.play()
        this._resetPrimedSfxElement(el, entry)
        if (playResult && typeof playResult.then === 'function') {
          playResult.catch((err) => this._handleSfxPrimingFailure(key, err))
        }
      }
    }
  }

  // ── Debug helpers ───────────────────────────────────────────────────────────

  /** Dump current audio engine state to the console. */
  debugDump(): void {
    console.group('[SoundManager] debugDump()')
    console.log('initialised:', this._initialised, '| unlocked:', this._unlocked)
    console.log(
      'currentMusicKey:',
      this._musicKey ?? '(none)',
      '| owner:',
      this._currentBgmOwner ?? '(none)'
    )
    console.log(
      'desiredMusicTrack:',
      this._desiredMusicTrack,
      '| reason:',
      this._desiredMusicReason ?? '(none)'
    )
    const desiredSummary = Object.fromEntries(
      Object.entries(this._desiredPerOwner).map(([k, v]) => [k, v?.key ?? null])
    )
    console.log('desiredPerOwner:', JSON.stringify(desiredSummary))
    console.log('queue length:', this._playQueue.length)
    console.log('failed keys:', [...this._failedKeys].join(', ') || '(none)')
    console.log('sfx pools:', [...this._sfxPools.keys()].join(', ') || '(none)')
    console.log('categories:')
    for (const cat of ['music', 'ui', 'tv', 'player', 'minigame'] as SoundCategory[]) {
      const state = this._categories.get(cat) ?? DEFAULT_CATEGORY_STATE
      console.log(`  ${cat}: enabled=${state.enabled}, volume=${state.volume.toFixed(2)}`)
    }
    console.groupEnd()
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _getCategory(category: SoundCategory): CategoryState {
    if (!this._categories.has(category)) {
      this._categories.set(category, { ...DEFAULT_CATEGORY_STATE })
    }
    return this._categories.get(category)!
  }
}

/** Singleton SoundManager instance. */
export const SoundManager = new _SoundManager()
/** Migration alias for the stricter centralized music-state API surface. */
export const AudioManager = SoundManager

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
        SoundManager.setCategoryEnabled(cat, true)
      }
    },
    /** Dump full engine state to console. */
    dump: () => SoundManager.debugDump(),
    // Legacy helpers
    stopMusic: () => SoundManager.stopMusic(),
    stop: (key: string) => SoundManager.stop(key),
    unlock: () => SoundManager.unlockOnUserGesture(),
    get currentMusic() {
      return SoundManager.currentMusicKey
    },
    get currentOwner() {
      return SoundManager.currentBgmOwner
    },
  }

  // Expose under both the new name (__audioDebug) and the legacy alias (__bbAudio)
  ;(window as unknown as Record<string, unknown>).__audioDebug = _dbg
  ;(window as unknown as Record<string, unknown>).__bbAudio = _dbg

  console.log('[SoundManager] debug helpers on window.__audioDebug (alias: __bbAudio)')
  console.log('  __audioDebug.listKeys()     — list all registered sound keys')
  console.log('  __audioDebug.play(key)      — manually play a sound')
  console.log('  __audioDebug.playMusic(key) — start music')
  console.log('  __audioDebug.unlockFromGesture() — unlock audio now')
  console.log('  __audioDebug.enableAll()    — enable all categories')
  console.log('  __audioDebug.dump()         — print engine state')
}
