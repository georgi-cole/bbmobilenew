/**
 * Sound services barrel export.
 */
export { SoundManager } from './SoundManager';
export type { PlayOptions } from './SoundManager';
export { SOUND_REGISTRY } from './sounds';
export type { SoundEntry, SoundCategory } from './sounds';
export { AudioSource } from './AudioSource';
export type { AudioSourceOptions } from './AudioSource';

/**
 * Placeholder hook for elimination scream audio.
 * No audio assets are wired up yet — this is a no-op stub.
 * Replace the body with a real SoundManager call when assets are available.
 */
export function playScreamPlaceholder(): void {}
