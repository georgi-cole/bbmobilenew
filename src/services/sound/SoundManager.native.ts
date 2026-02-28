/**
 * SoundManager.native.ts — React Native adapter stub for the SoundManager.
 *
 * Metro bundler resolves `.native.ts` files over `.ts` files on React Native
 * platforms, so this stub is automatically used in place of SoundManager.ts
 * when building for iOS/Android.
 *
 * Replace the stub implementations with real RN audio library calls
 * (e.g. react-native-sound or expo-av) when targeting native platforms.
 */

import type { PlayOptions } from './SoundManager';
import type { SoundCategory, SoundEntry } from './sounds';

class _SoundManagerNative {
  async init(): Promise<void> {
    // TODO: initialise react-native-sound / expo-av
  }

  register(_entry: SoundEntry): void {
    // TODO: register asset with the native audio library
  }

  async play(_key: string, _opts?: PlayOptions): Promise<void> {
    // TODO: play sound via native audio library
  }

  async playMusic(_key: string, _opts?: PlayOptions): Promise<void> {
    // TODO: start looping music track via native audio library
  }

  stopMusic(): void {
    // TODO: stop music via native audio library
  }

  setCategoryEnabled(_category: SoundCategory, _enabled: boolean): void {
    // TODO: mute/unmute category in native audio library
  }

  setCategoryVolume(_category: SoundCategory, _volume: number): void {
    // TODO: set category volume in native audio library
  }

  unlockOnUserGesture(): void {
    // No-op on React Native — no AudioContext unlock required
  }
}

/** Singleton SoundManager instance (React Native stub). */
export const SoundManager = new _SoundManagerNative();
