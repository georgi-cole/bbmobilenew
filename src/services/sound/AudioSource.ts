/**
 * AudioSource.ts — thin wrapper around Howl (if available) or HTMLAudio fallback.
 *
 * Provides a unified play/stop/unload/setVolume API so the rest of the sound
 * system does not need to know which backend is active.
 */

// Dynamic import of howler so tree-shaking works and SSR/test environments
// don't crash if the module is absent.
type HowlConstructor = new (options: {
  src: string[];
  volume?: number;
  loop?: boolean;
  preload?: boolean | 'metadata';
  onload?: () => void;
  onloaderror?: (id: number, err: unknown) => void;
  onplayerror?: (id: number, err: unknown) => void;
}) => HowlInstance;

interface HowlInstance {
  play(): number;
  stop(id?: number): this;
  unload(): this;
  volume(vol?: number): number | this;
  playing(id?: number): boolean;
}

let HowlClass: HowlConstructor | null = null;

/** Attempt to load Howl lazily; safe to call multiple times. */
async function loadHowl(): Promise<HowlConstructor | null> {
  if (HowlClass) return HowlClass;
  try {
    const mod = await import('howler');
    HowlClass = (mod as unknown as { Howl: HowlConstructor }).Howl ?? null;
  } catch {
    HowlClass = null;
  }
  return HowlClass;
}

export interface AudioSourceOptions {
  src: string;
  volume?: number;
  loop?: boolean;
  preload?: boolean;
}

/**
 * AudioSource wraps either a Howl instance or an HTMLAudioElement so the
 * caller gets the same interface regardless of the backend.
 */
export class AudioSource {
  private _howl: HowlInstance | null = null;
  private _audio: HTMLAudioElement | null = null;
  private _volume: number;
  private _loop: boolean;
  private readonly _src: string;
  private readonly _preload: boolean;

  constructor(opts: AudioSourceOptions) {
    this._src = opts.src;
    this._volume = opts.volume ?? 1;
    this._loop = opts.loop ?? false;
    this._preload = opts.preload ?? false;
  }

  private _initPromise: Promise<void> | null = null;

  /**
   * Initialise the underlying backend. Idempotent — safe to call multiple
   * times; concurrent calls are coalesced onto the same promise.
   */
  async init(): Promise<void> {
    // Coalesce concurrent async calls
    if (this._initPromise) return this._initPromise;
    // Already initialised (synchronous fast-path)
    if (this._howl !== null || this._audio !== null) return;
    this._initPromise = this._doInit().finally(() => {
      this._initPromise = null;
    });
    return this._initPromise;
  }

  private async _doInit(): Promise<void> {
    const Howl = await loadHowl();
    if (Howl) {
      this._howl = new Howl({
        src: [this._src],
        volume: this._volume,
        loop: this._loop,
        preload: this._preload,
      });
    } else {
      // HTMLAudio fallback
      if (typeof document !== 'undefined') {
        const el = document.createElement('audio');
        el.src = this._src;
        el.volume = this._volume;
        el.loop = this._loop;
        if (this._preload) el.preload = 'auto';
        this._audio = el;
      }
    }
  }

  /** Play the sound. Returns the Howl sound id (or 0 for HTMLAudio). */
  play(): number {
    if (this._howl) return this._howl.play();
    if (this._audio) {
      void this._audio.play().catch(() => {
        /* autoplay may be blocked; silently ignore */
      });
    }
    return 0;
  }

  /** Stop playback. */
  stop(): void {
    if (this._howl) {
      this._howl.stop();
    } else if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
    }
  }

  /** Release all resources held by this source. */
  unload(): void {
    if (this._howl) {
      this._howl.unload();
      this._howl = null;
    } else if (this._audio) {
      this._audio.pause();
      this._audio.src = '';
      this._audio = null;
    }
  }

  /** Set the playback volume (0–1). */
  setVolume(vol: number): void {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this._howl) {
      this._howl.volume(this._volume);
    } else if (this._audio) {
      this._audio.volume = this._volume;
    }
  }

  /** Whether audio is currently playing. */
  get isPlaying(): boolean {
    if (this._howl) return this._howl.playing();
    if (this._audio) return !this._audio.paused;
    return false;
  }
}
