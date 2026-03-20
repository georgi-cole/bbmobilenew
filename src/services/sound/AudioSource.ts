/**
 * AudioSource.ts — HTMLAudioElement wrapper.
 *
 * Provides a unified play/stop/unload/setVolume API backed by
 * HTMLAudioElement.  The Howler dependency has been removed so that audio
 * works reliably on GitHub Pages without requiring an AudioContext unlock.
 *
 * Note: SoundManager no longer uses AudioSource directly — it manages
 * HTMLAudioElements and per-key pools internally.  This class is retained for
 * any callers that import it from the sound service barrel (index.ts).
 */

const _audioDebug = import.meta.env.DEV || import.meta.env.VITE_AUDIO_DEBUG === 'true';

export interface AudioSourceOptions {
  src: string;
  volume?: number;
  loop?: boolean;
  preload?: boolean;
}

/**
 * AudioSource wraps an HTMLAudioElement providing a simple play/stop/volume
 * interface.
 */
export class AudioSource {
  private _audio: HTMLAudioElement | null = null;
  private _volume: number;
  private _loop: boolean;
  private readonly _src: string;
  private readonly _preload: boolean;
  private _initPromise: Promise<void> | null = null;

  constructor(opts: AudioSourceOptions) {
    this._src = opts.src;
    this._volume = opts.volume ?? 1;
    this._loop = opts.loop ?? false;
    this._preload = opts.preload ?? false;
  }

  /**
   * Initialise the underlying HTMLAudioElement.  Idempotent — safe to call
   * multiple times; concurrent calls are coalesced onto the same promise.
   */
  async init(): Promise<void> {
    if (this._initPromise) return this._initPromise;
    if (this._audio !== null) return;
    this._initPromise = this._doInit().finally(() => {
      this._initPromise = null;
    });
    return this._initPromise;
  }

  private _doInit(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (typeof document === 'undefined') {
        resolve();
        return;
      }
      const el = document.createElement('audio');
      el.src = this._src;
      el.volume = Math.max(0, Math.min(1, this._volume));
      el.loop = this._loop;
      el.preload = this._preload ? 'auto' : 'none';

      el.addEventListener('error', () => {
        const code = el.error?.code ?? 'unknown';
        console.error(
          `[AudioSource] load error for "${this._src}" (code ${code}):`,
          el.error?.message ?? '',
        );
        resolve(); // don't reject — caller should still get a usable (silent) source
      });

      el.addEventListener(
        'canplaythrough',
        () => {
          if (_audioDebug) {
            console.debug(`[AudioSource] ready: ${this._src}`);
          }
          resolve();
        },
        { once: true },
      );

      this._audio = el;

      // If not preloading, resolve immediately (element is ready to play on demand)
      if (!this._preload) resolve();
    });
  }

  /** Play the sound. Returns 0 (HTMLAudio has no numeric id). */
  play(): number {
    if (this._audio) {
      // Only rewind if the element is not currently playing
      if (this._audio.paused || this._audio.ended) {
        this._audio.currentTime = 0;
      }
      void this._audio.play().catch((err: unknown) => {
        console.warn(`[AudioSource] play() rejected for "${this._src}":`, err);
      });
    }
    return 0;
  }

  /** Stop playback and rewind to the start. */
  stop(): void {
    if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
    }
  }

  /** Release all resources. */
  unload(): void {
    if (this._audio) {
      this._audio.pause();
      this._audio.src = '';
      this._audio = null;
    }
  }

  /** Set the playback volume (0–1). */
  setVolume(vol: number): void {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this._audio) {
      this._audio.volume = this._volume;
    }
  }

  /** Whether audio is currently playing. */
  get isPlaying(): boolean {
    return this._audio ? !this._audio.paused : false;
  }
}
