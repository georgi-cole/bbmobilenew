import type { SoundEntry } from './sounds';
import type { MusicTrack } from './musicTracks';

export interface MinigameMusicConfig {
  track: MusicTrack;
  sound: SoundEntry;
  gameKeys: readonly string[];
  fadeInMs: number;
  /** Keep the track playing while the winner badge animation and sting complete. */
  postGameHoldMs: number;
  fadeOutMs: number;
}

const soundsBase = `${import.meta.env.BASE_URL ?? '/'}assets/sounds/`;

export const MINIGAME_MUSIC_CONFIGS: readonly MinigameMusicConfig[] = [
  {
    track: 'challenge_group_1',
    sound: {
      key: 'music:challenge_group_1',
      category: 'music',
      src: `${soundsBase}challenge_group_1_audio.mp3`,
      preload: false,
      volume: 0.4,
      loop: true,
    },
    gameKeys: ['bigSpender', 'snake', 'castleRescue', 'batteryLow'],
    fadeInMs: 500,
    postGameHoldMs: 2800,
    fadeOutMs: 2000,
  },
] as const;

export function getMinigameMusicConfig(
  gameKey: string | null | undefined,
): MinigameMusicConfig | undefined {
  if (!gameKey) return undefined;
  return MINIGAME_MUSIC_CONFIGS.find((config) => config.gameKeys.includes(gameKey));
}

export function getMinigameMusicConfigByTrack(
  track: MusicTrack,
): MinigameMusicConfig | undefined {
  return MINIGAME_MUSIC_CONFIGS.find((config) => config.track === track);
}
