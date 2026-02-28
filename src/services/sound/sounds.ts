/**
 * sounds.ts — Central sound registry for bbmobilenew.
 *
 * Defines the canonical list of sound keys, their categories, and metadata
 * used by SoundManager to resolve and play audio assets.
 */

/** Broad groupings that can be independently enabled/muted/volumed. */
export type SoundCategory = 'ui' | 'tv' | 'player' | 'minigame' | 'music';

/** A single entry in the SOUND_REGISTRY. */
export interface SoundEntry {
  /** Unique semantic key, e.g. "ui:navigate". */
  key: string;
  /** Logical category for batch enable/volume control. */
  category: SoundCategory;
  /** Resolved URL (relative to public root). */
  src: string;
  /** Whether to preload the asset on init. */
  preload: boolean;
  /** Howler-compatible volume override (0–1). Default: 1. */
  volume?: number;
  /** Loop flag (used for music tracks). */
  loop?: boolean;
}

/**
 * SOUND_REGISTRY — canonical map of all sound keys.
 *
 * Paths are relative to the public root so they can be served as static assets
 * without being processed by the bundler.
 */
export const SOUND_REGISTRY: Readonly<Record<string, SoundEntry>> = {
  'ui:navigate': {
    key: 'ui:navigate',
    category: 'ui',
    src: '/assets/sounds/ui_navigate.mp3',
    preload: true,
    volume: 0.6,
  },
  'ui:confirm': {
    key: 'ui:confirm',
    category: 'ui',
    src: '/assets/sounds/ui_confirm.mp3',
    preload: true,
    volume: 0.7,
  },
  'ui:error': {
    key: 'ui:error',
    category: 'ui',
    src: '/assets/sounds/ui_error.mp3',
    preload: false,
    volume: 0.6,
  },
  'tv:event': {
    key: 'tv:event',
    category: 'tv',
    src: '/assets/sounds/tv_event.mp3',
    preload: true,
    volume: 0.8,
  },
  'player:evicted': {
    key: 'player:evicted',
    category: 'player',
    src: '/assets/sounds/player_evicted.mp3',
    preload: false,
    volume: 1.0,
  },
  'minigame:start': {
    key: 'minigame:start',
    category: 'minigame',
    src: '/assets/sounds/minigame_start.mp3',
    preload: false,
    volume: 0.9,
  },
  'music:menu_loop': {
    key: 'music:menu_loop',
    category: 'music',
    src: '/assets/sounds/music_menu_loop.mp3',
    preload: false,
    volume: 0.5,
    loop: true,
  },
  'music:intro_hub_loop': {
    key: 'music:intro_hub_loop',
    category: 'music',
    src: '/assets/sounds/music_intro_hub_loop.mp3',
    preload: false,
    volume: 0.45,
    loop: true,
  },
  'music:spectator_loop': {
    key: 'music:spectator_loop',
    category: 'music',
    src: '/assets/sounds/music_spectator_loop.mp3',
    preload: false,
    volume: 0.4,
    loop: true,
  },
  'minigame:results': {
    key: 'minigame:results',
    category: 'minigame',
    src: '/assets/sounds/minigame_results.mp3',
    preload: false,
    volume: 0.85,
  },
  'ui:jury_vote': {
    key: 'ui:jury_vote',
    category: 'ui',
    src: '/assets/sounds/ui_jury_vote.mp3',
    preload: false,
    volume: 0.7,
  },
  'tv:winner_reveal': {
    key: 'tv:winner_reveal',
    category: 'tv',
    src: '/assets/sounds/tv_winner_reveal.mp3',
    preload: false,
    volume: 1.0,
  },
  'tv:battleback': {
    key: 'tv:battleback',
    category: 'tv',
    src: '/assets/sounds/tv_battleback.mp3',
    preload: false,
    volume: 0.9,
  },
  'tv:public_favorite': {
    key: 'tv:public_favorite',
    category: 'tv',
    src: '/assets/sounds/tv_public_favorite.mp3',
    preload: false,
    volume: 0.9,
  },
};
