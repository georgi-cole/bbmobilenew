/**
 * NativeAudioAdapter.ts
 *
 * Lightweight wrapper around the Cordova `cordova-plugin-nativeaudio` plugin.
 * When running inside a Cordova WebView the plugin is available as
 * `window.plugins.NativeAudio`; in a plain browser it is absent and all
 * methods resolve/return gracefully so the same call-sites work in both
 * environments.
 *
 * Install the plugin:
 *   cordova plugin add cordova-plugin-nativeaudio
 */

/** Shape of the NativeAudio plugin exposed by cordova-plugin-nativeaudio. */
interface NativeAudioPlugin {
  preloadSimple(
    id: string,
    assetPath: string,
    successCb: () => void,
    errorCb: (err: unknown) => void,
  ): void;
  preloadComplex(
    id: string,
    assetPath: string,
    volume: number,
    voices: number,
    delay: number,
    successCb: () => void,
    errorCb: (err: unknown) => void,
  ): void;
  play(
    id: string,
    successCb?: () => void,
    errorCb?: (err: unknown) => void,
    completeCallback?: () => void,
  ): void;
  stop(
    id: string,
    successCb?: () => void,
    errorCb?: (err: unknown) => void,
  ): void;
  unload(
    id: string,
    successCb?: () => void,
    errorCb?: (err: unknown) => void,
  ): void;
}

declare global {
  interface Window {
    plugins?: {
      NativeAudio?: NativeAudioPlugin;
    };
  }
}

/** Returns the native plugin if it is present, or null otherwise. */
function _getPlugin(): NativeAudioPlugin | null {
  if (typeof window === 'undefined') return null;
  return window.plugins?.NativeAudio ?? null;
}

class _NativeAudioAdapter {
  private _ready = false;
  private _initPromise: Promise<void> | null = null;

  /**
   * Wait for `deviceready` (Cordova) or resolve immediately in a browser.
   * Safe to call multiple times — subsequent calls return the same promise.
   */
  init(): Promise<void> {
    if (this._initPromise) return this._initPromise;

    this._initPromise = new Promise<void>((resolve) => {
      if (typeof document === 'undefined') {
        // SSR / non-browser environment
        this._ready = true;
        resolve();
        return;
      }

      const isCordovaEnv = 'cordova' in window;

      if (!isCordovaEnv) {
        // Plain browser (no Cordova) — resolve immediately
        this._ready = true;
        resolve();
        return;
      }

      if (_getPlugin()) {
        // Cordova is already ready and the plugin is available — resolve immediately.
        // (deviceready has already fired by the time plugins are injected.)
        this._ready = true;
        resolve();
        return;
      }

      // Running under Cordova but the plugin is not yet available — wait for
      // deviceready, after which the plugin will be injected by Cordova.
      const onReady = () => {
        this._ready = true;
        resolve();
      };

      document.addEventListener('deviceready', onReady, { once: true });
    });

    return this._initPromise;
  }

  /**
   * Returns true only when running inside a Cordova WebView AND the
   * `cordova-plugin-nativeaudio` plugin is installed.
   */
  isAvailable(): boolean {
    return this._ready && _getPlugin() !== null;
  }

  /**
   * Preload a simple (one-shot) audio asset.
   * Resolves on success; resolves (with a console warning) on error so callers
   * can use Promise.all without needing individual try/catch blocks.
   */
  preloadSfx(id: string, assetPath: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const plugin = _getPlugin();
      if (!plugin) {
        resolve();
        return;
      }
      plugin.preloadSimple(
        id,
        assetPath,
        () => resolve(),
        (err) => {
          console.warn(`[NativeAudioAdapter] preloadSfx("${id}") failed:`, err);
          resolve();
        },
      );
    });
  }

  /**
   * Preload a complex (multi-voice / volume-controlled) audio asset.
   * Resolves on success or on error (with a console warning).
   */
  preloadComplex(
    id: string,
    assetPath: string,
    volume = 1,
    voices = 1,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const plugin = _getPlugin();
      if (!plugin) {
        resolve();
        return;
      }
      plugin.preloadComplex(
        id,
        assetPath,
        volume,
        voices,
        0,
        () => resolve(),
        (err) => {
          console.warn(`[NativeAudioAdapter] preloadComplex("${id}") failed:`, err);
          resolve();
        },
      );
    });
  }

  /** Play a previously-preloaded SFX. No-op if the plugin is not available. */
  playSfx(id: string): void {
    const plugin = _getPlugin();
    if (!plugin) return;
    plugin.play(
      id,
      undefined,
      (err) => {
        console.warn(`[NativeAudioAdapter] playSfx("${id}") failed:`, err);
      },
    );
  }

  /** Stop a playing SFX. No-op if the plugin is not available. */
  stopSfx(id: string): void {
    const plugin = _getPlugin();
    if (!plugin) return;
    plugin.stop(id);
  }

  /** Unload a previously-preloaded SFX to free memory. No-op if plugin absent. */
  unloadSfx(id: string): void {
    const plugin = _getPlugin();
    if (!plugin) return;
    plugin.unload(id);
  }
}

/** Singleton NativeAudioAdapter instance. */
export const NativeAudioAdapter = new _NativeAudioAdapter();
