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

    for (const entry of Object.values(SOUND_REGISTRY)) {
      this.register(entry);
    }

    // Pre-init preload entries eagerly
    const preloads = Object.values(SOUND_REGISTRY).filter((e) => e.preload);
    await Promise.all(
      preloads.map((e) => {
        const src = this._sources.get(e.key);
        return src ? src.init() : Promise.resolve();
      }),
    );
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
   * Silently no-ops if the key is unknown or the category is disabled.
   */
  async play(key: string, opts?: PlayOptions): Promise<void> {
    const entry = SOUND_REGISTRY[key];
    if (!entry) {
      console.warn(`[SoundManager] Unknown sound key: "${key}"`);
      return;
    }
    const cat = this._getCategory(entry.category);
    if (!cat.enabled) return;

    let src = this._sources.get(key);
    if (!src) {
      // Lazily register sounds added after init()
      this.register(entry);
      src = this._sources.get(key)!;
    }

    // Ensure the source has been initialised before playing
    await src.init();

    const vol = opts?.volume ?? entry.volume ?? 1;
    src.setVolume(Math.min(vol, cat.volume));
    src.play();
  }

  // ── Music ─────────────────────────────────────────────────────────────────

  /** Start a looping music track.  Stops any previously-playing music first. */
  async playMusic(key: string, opts?: PlayOptions): Promise<void> {
    if (this._musicKey === key) return;
    this.stopMusic();

    const entry = SOUND_REGISTRY[key];
    if (!entry) {
      console.warn(`[SoundManager] Unknown music key: "${key}"`);
      return;
    }
    const cat = this._getCategory('music');
    if (!cat.enabled) return;

    this._musicKey = key;
    await this.play(key, opts);
  }

  /** Stop the currently-playing music track. */
  stopMusic(): void {
    if (!this._musicKey) return;
    const src = this._sources.get(this._musicKey);
    src?.stop();
    this._musicKey = null;
  }

  // ── Category controls ─────────────────────────────────────────────────────

  /** Enable or disable all sounds in a category. */
  setCategoryEnabled(category: SoundCategory, enabled: boolean): void {
    const state = this._getCategory(category);
    state.enabled = enabled;
    this._categories.set(category, state);

    // Stop music immediately if the music category is disabled while playing
    if (!enabled && category === 'music') {
      this.stopMusic();
    }
  }

  /** Set the master volume for a category (0–1). */
  setCategoryVolume(category: SoundCategory, volume: number): void {
    const state = this._getCategory(category);
    state.volume = Math.max(0, Math.min(1, volume));
    this._categories.set(category, state);
  }

  // ── User-gesture unlock ───────────────────────────────────────────────────

  /**
   * Register a one-time document listener to unlock the AudioContext on the
   * first user interaction (required by modern browser autoplay policies).
   */
  unlockOnUserGesture(): void {
    if (this._unlocked || typeof document === 'undefined') return;

    const unlock = () => {
      if (this._unlocked) return;
      this._unlocked = true;
      // Resume AudioContext if Howler is active
      if (
        typeof window !== 'undefined' &&
        'Howler' in window &&
        (window as unknown as { Howler: { ctx?: AudioContext } }).Howler?.ctx?.state === 'suspended'
      ) {
        void (window as unknown as { Howler: { ctx: AudioContext } }).Howler.ctx.resume();
      }
      document.removeEventListener('click', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      document.removeEventListener('touchstart', unlock, true);
    };

    document.addEventListener('click', unlock, true);
    document.addEventListener('keydown', unlock, true);
    document.addEventListener('touchstart', unlock, true);
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
