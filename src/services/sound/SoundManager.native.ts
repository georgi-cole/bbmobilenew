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

import type { PlayOptions, BgmOwner, UnlockAudioOptions } from './SoundManager';
import type { MusicTrack } from './musicTracks';
import type { SoundCategory, SoundEntry } from './sounds';

class _SoundManagerNative {
  async init(): Promise<void> {
    // TODO: initialise react-native-sound / expo-av
  }

  register(_entry: SoundEntry): void {
    // TODO: register asset with the native audio library
  }

  registerDynamic(_entry: SoundEntry): void {
    // TODO: register dynamic asset with the native audio library
  }
  async play(_key: string, _opts?: PlayOptions): Promise<void> {
    // TODO: play sound via native audio library
  }

  get currentMusicKey(): string | null {
    return null;
  }

  get currentMusicTrack(): MusicTrack {
    return 'none';
  }

  get currentBgmOwner(): BgmOwner | null {
    return null;
  }

  requestBgm(_key: string | null, _owner: BgmOwner, _opts?: PlayOptions): void {
    // TODO: route BGM request to native audio library
  }

  releaseBgm(_owner: BgmOwner): void {
    // TODO: release BGM ownership in native audio library
  }

  async playMusic(_key: string, _opts?: PlayOptions): Promise<void> {
    // TODO: start looping music track via native audio library
  }

  async unlockAudio(): Promise<void> {
    // No-op on React Native — no AudioContext unlock required
  }

  async setDesiredMusic(_track: MusicTrack, _reason?: string): Promise<void> {
    // TODO: route semantic music state through native audio library
  }

  async syncMusic(): Promise<void> {
    // TODO: reconcile semantic music state with native audio library
  }

  stopAllMusic(): void {
    // TODO: stop all music via native audio library
  }

  async fadeOutMusic(_durationMs?: number): Promise<void> {
    // TODO: fade out music via native audio library
  }

  panicStopAllMusic(): void {
    // TODO: force-stop all music via native audio library
  }

  stopMusic(_track?: MusicTrack): void {
    // TODO: stop music via native audio library
  }

  setMusicMuted(_value: boolean): void {
    // TODO: mute/unmute music in native audio library
  }

  setMusicVolume(_value: number): void {
    // TODO: set music volume in native audio library
  }

  async playSfx(_key: string, _opts?: PlayOptions): Promise<void> {
    // TODO: play SFX via native audio library
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

  unlockFromGesture(_options?: UnlockAudioOptions): void {
    // No-op on React Native — no AudioContext unlock required
  }

  unlockAndPlayMusicOnly(): void {
    this.unlockFromGesture();
  }
}

/** Singleton SoundManager instance (React Native stub). */
export const SoundManager = new _SoundManagerNative();
/** Migration alias for the stricter centralized music-state API surface. */
export const AudioManager = SoundManager;
