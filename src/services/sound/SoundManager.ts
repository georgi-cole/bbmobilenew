/**
 * SoundManager.ts — Singleton sound manager for bbmobilenew.
 *
 * Provides a central API for playing SFX and music with per-category
 * enable/volume control.  Backed by AudioSource (Howl or HTMLAudio fallback).
 *
 * Usage:
 *   import { SoundManager } from './SoundManager';
 *   await SoundManager.init();
 *   SoundManager.play('ui:confirm');
 *   SoundManager.playMusic('music:menu_loop');
 */

import { AudioSource } from './AudioSource';
import { SOUND_REGISTRY } from './sounds';
import type { SoundCategory, SoundEntry } from './sounds';

/** True in DEV builds or when VITE_AUDIO_DEBUG=true is set. */
const _audioDebug = import.meta.env.DEV || import.meta.env.VITE_AUDIO_DEBUG === 'true';

export interface PlayOptions {
  /** Volume override (0–1).  Defaults to entry volume or 1. */
  volume?: number;
}

interface CategoryState {
  enabled: boolean;
  volume: number; // 0–1 master volume for the category
}

const DEFAULT_CATEGORY_STATE: CategoryState = { enabled: true, volume: 1 };

class _SoundManager {
  private _sources = new Map<string, AudioSource>();
  private _categories = new Map<SoundCategory, CategoryState>();
  private _musicKey: string | null = null;
  private _initialised = false;
  private _unlocked = false;

  // ── Initialisation ────────────────────────────────────────────────────────

  /**
   * Initialise the SoundManager: pre-initialise all SOUND_REGISTRY entries
   * that are flagged `preload: true`.
   */
  async init(): Promise<void> {
    if (this._initialised) return;
    this._initialised = true;
    if (_audioDebug) {
      console.log('[SoundManager] init() — registering', Object.keys(SOUND_REGISTRY).length, 'sound keys');
    }

    for (const entry of Object.values(SOUND_REGISTRY)) {
      this.register(entry);
    }

    // Pre-init preload entries eagerly
    const preloads = Object.values(SOUND_REGISTRY).filter((e) => e.preload);
    if (_audioDebug) {
      console.log('[SoundManager] preloading', preloads.length, 'entries:', preloads.map((e) => e.key));
    }
    await Promise.all(
      preloads.map((e) => {
        const src = this._sources.get(e.key);
        return src ? src.init() : Promise.resolve();
      }),
    );
    if (_audioDebug) {
      console.log('[SoundManager] init() complete');
    }
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /** Register a sound entry (creates an AudioSource but does not init it). */
  register(entry: SoundEntry): void {
    if (this._sources.has(entry.key)) return;
    const src = new AudioSource({
      src: entry.src,
      volume: entry.volume ?? 1,
      loop: entry.loop ?? false,
      preload: entry.preload,
    });
    this._sources.set(entry.key, src);
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  /**
   * Play a one-shot sound effect.
   * No-ops if the key is unknown (warns) or the category is disabled (logs in
   * debug mode only).
   */
  async play(key: string, opts?: PlayOptions): Promise<void> {
    const entry = SOUND_REGISTRY[key];
    if (!entry) {
      console.warn(`[SoundManager] Unknown sound key: "${key}"`);
      return;
    }
    const cat = this._getCategory(entry.category);
    if (!cat.enabled) {
      if (_audioDebug) {
        console.log(`[SoundManager] play("${key}") skipped — category "${entry.category}" is disabled`);
      }
      return;
    }

    let src = this._sources.get(key);
    if (!src) {
      // Lazily register sounds added after init()
      this.register(entry);
      src = this._sources.get(key)!;
    }

    // Ensure the source has been initialised before playing
    await src.init();

    const vol = opts?.volume ?? entry.volume ?? 1;
    const effectiveVolume = Math.max(0, Math.min(1, vol * cat.volume));
    if (_audioDebug) {
      console.log(`[SoundManager] play("${key}") vol=${effectiveVolume.toFixed(2)} (entry=${vol}, cat=${cat.volume}) already=${src.isPlaying}`);
    }
    src.setVolume(effectiveVolume);
    src.play();
  }

  // ── Music ─────────────────────────────────────────────────────────────────

  /** Returns the key of the currently-playing music track, or null. */
  get currentMusicKey(): string | null {
    return this._musicKey;
  }

  /** Start a looping music track.  Stops any previously-playing music first. */
  async playMusic(key: string, opts?: PlayOptions): Promise<void> {
    if (this._musicKey === key) {
      if (_audioDebug) {
        console.log(`[SoundManager] playMusic("${key}") — already playing, no-op`);
      }
      return;
    }
    this.stopMusic();

    const entry = SOUND_REGISTRY[key];
    if (!entry) {
      console.warn(`[SoundManager] Unknown music key: "${key}"`);
      return;
    }
    const cat = this._getCategory('music');
    if (!cat.enabled) {
      if (_audioDebug) {
        console.log(`[SoundManager] playMusic("${key}") skipped — music category is disabled`);
      }
      return;
    }

    if (_audioDebug) {
      console.log(`[SoundManager] playMusic("${key}")`);
    }
    this._musicKey = key;
    await this.play(key, opts);
  }

  /** Stop the currently-playing music track. */
  stopMusic(): void {
    if (!this._musicKey) return;
    if (_audioDebug) {
      console.log(`[SoundManager] stopMusic() — stopping "${this._musicKey}"`);
    }
    const src = this._sources.get(this._musicKey);
    src?.stop();
    this._musicKey = null;
  }

  /**
   * Stop a specific sound by key without affecting the global music track.
   * Intended for looping SFX (e.g. the wheel-spin loop) that are played via
   * `play()` rather than `playMusic()`.
   * No-ops silently if the key is unknown or not currently playing.
   */
  stop(key: string): void {
    const src = this._sources.get(key);
    if (!src) return;
    if (_audioDebug) {
      console.log(`[SoundManager] stop("${key}")`);
    }
    src.stop();
  }

  // ── Category controls ─────────────────────────────────────────────────────

  /** Enable or disable all sounds in a category. */
  setCategoryEnabled(category: SoundCategory, enabled: boolean): void {
    const state = this._getCategory(category);
    const prev = state.enabled;
    state.enabled = enabled;
    this._categories.set(category, state);
    if (prev !== enabled) {
      console.log(`[SoundManager] category "${category}" enabled=${enabled}`);
    }

    // Stop music immediately if the music category is disabled while playing
    if (!enabled && category === 'music') {
      this.stopMusic();
    }
  }

  /** Set the master volume for a category (0–1). */
  setCategoryVolume(category: SoundCategory, volume: number): void {
    const state = this._getCategory(category);
    const newVolume = Math.max(0, Math.min(1, volume));
    if (state.volume !== newVolume) {
      state.volume = newVolume;
      this._categories.set(category, state);
      console.log(`[SoundManager] category "${category}" volume=${state.volume.toFixed(2)}`);
    }
  }

  // ── User-gesture unlock ───────────────────────────────────────────────────

  /**
   * Unlock the Web Audio API.
   *
   * - Performs the resume *immediately* (effective when called from within a
   *   user-gesture handler, e.g. from AudioGate).
   * - Also arms one-time document listeners so the unlock fires on the next
   *   gesture when called in advance of any interaction.
   *
   * Uses a dynamic import for Howler so the ESM bundle's AudioContext is
   * reached correctly (Howler does not attach itself to `window` in ESM mode).
   */
  unlockOnUserGesture(): void {
    if (typeof document === 'undefined') return;
    if (this._unlocked) {
      if (_audioDebug) {
        console.log('[SoundManager] unlockOnUserGesture() — already unlocked');
      }
      return;
    }
    if (_audioDebug) {
      console.log('[SoundManager] unlockOnUserGesture() — arming unlock');
    }

    const doResume = () => {
      if (this._unlocked) return;
      this._unlocked = true;
      document.removeEventListener('click', doResume, true);
      document.removeEventListener('keydown', doResume, true);
      document.removeEventListener('touchstart', doResume, true);
      if (_audioDebug) {
        console.log('[SoundManager] audio unlocked — resuming AudioContext');
      }
      // Resume AudioContext via dynamic import (works with ESM Howler bundles)
      void import('howler')
        .then((m: unknown) => {
          const ctx = (m as { Howler?: { ctx?: AudioContext } }).Howler?.ctx;
          if (ctx) {
            if (_audioDebug) {
              console.log(`[SoundManager] AudioContext state="${ctx.state}" — resuming`);
            }
            if (ctx.state === 'suspended') return ctx.resume();
          } else if (_audioDebug) {
            console.log('[SoundManager] Howler AudioContext not available');
          }
          return undefined;
        })
        .catch((err: unknown) => {
          console.warn('[SoundManager] Failed to resume AudioContext via Howler:', err);
        });
    };

    // Register document listeners first (ensures they exist for the pre-arm use case)
    document.addEventListener('click', doResume, true);
    document.addEventListener('keydown', doResume, true);
    document.addEventListener('touchstart', doResume, true);

    // Attempt the resume immediately (effective when called from within a user gesture handler)
    doResume();
  }

  // ── Debug helpers (DEV only) ──────────────────────────────────────────────

  /** Dump current audio engine state to the console. */
  debugDump(): void {
    console.group('[SoundManager] debugDump()');
    console.log('initialised:', this._initialised, '| unlocked:', this._unlocked);
    console.log('currentMusicKey:', this._musicKey ?? '(none)');
    console.log('registered keys:', [...this._sources.keys()].join(', '));
    console.log('categories:');
    for (const cat of ['music', 'ui', 'tv', 'player', 'minigame'] as SoundCategory[]) {
      const state = this._categories.get(cat) ?? DEFAULT_CATEGORY_STATE;
      console.log(`  ${cat}: enabled=${state.enabled}, volume=${state.volume.toFixed(2)}`);
    }
    console.groupEnd();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _getCategory(category: SoundCategory): CategoryState {
    if (!this._categories.has(category)) {
      this._categories.set(category, { ...DEFAULT_CATEGORY_STATE });
    }
    return this._categories.get(category)!;
  }
}

/** Singleton SoundManager instance. */
export const SoundManager = new _SoundManager();

// ── DEV-only window debug object ────────────────────────────────────────────

if (_audioDebug && typeof window !== 'undefined') {
  // Avoid overwriting an existing __bbAudio object (e.g. from hot-reload).
  if (!(window as unknown as Record<string, unknown>).__bbAudio) {
    (window as unknown as Record<string, unknown>).__bbAudio = {
      /** Dump full audio engine state. */
      dump: () => SoundManager.debugDump(),
      /** Play a sound key manually: __bbAudio.play('ui:confirm') */
      play: (key: string) => void SoundManager.play(key),
      /** Play a music key manually: __bbAudio.music('music:intro_hub_loop') */
      music: (key: string) => void SoundManager.playMusic(key),
      /** Stop current music. */
      stopMusic: () => SoundManager.stopMusic(),
      /** Stop a looping SFX key. */
      stop: (key: string) => SoundManager.stop(key),
      /** Unlock audio (simulates a user gesture). */
      unlock: () => SoundManager.unlockOnUserGesture(),
      /** Returns the current music key. */
      get currentMusic() {
        return SoundManager.currentMusicKey;
      },
    };
  }
  console.log('[SoundManager] DEV mode — debug helpers available on window.__bbAudio');
  console.log('  __bbAudio.dump()        — print audio engine state');
  console.log('  __bbAudio.play(key)     — manually play a sound');
  console.log('  __bbAudio.music(key)    — manually start music');
  console.log('  __bbAudio.stopMusic()   — stop current music');
  console.log('  __bbAudio.unlock()      — simulate user gesture unlock');
}
