/**
 * sounds.ts — Central sound registry for bbmobilenew.
 *
 * Defines the canonical list of sound keys, their categories, and metadata
 * used by SoundManager to resolve and play audio assets.
 *
 * ## Option B: filename-driven sound keys
 *
 * Keys are derived from the uploaded filename prefix:
 *   ui_*, tv_*, player_*, minigame_*, music_*
 * Format: `[prefix]:[rest_of_stem]`  e.g. `tv:battleback`
 *
 * For files that do NOT follow a recognized prefix (legacy or vendor names),
 * FILENAME_ALIAS_MAP maps the bare filename stem to the canonical semantic key.
 * This avoids physically renaming binary assets — the registry resolves both
 * the canonical key AND any aliases to the same underlying file.
 *
 * Usage:
 *   import { resolveKey } from './sounds';
 *   resolveKey('live_vote') // → 'tv:live_vote'
 *   resolveKey('tv:live_vote') // → 'tv:live_vote' (pass-through)
 */

/** Broad groupings that can be independently enabled/muted/volumed. */
export type SoundCategory = 'ui' | 'tv' | 'player' | 'minigame' | 'music';

/** A single entry in the SOUND_REGISTRY. */
export interface SoundEntry {
  /** Unique semantic key, e.g. "ui:navigate". */
  key: string;
  /** Logical category for batch enable/volume control. */
  category: SoundCategory;
  /** Resolved URL (absolute, respecting the app base path). */
  src: string;
  /** Whether to preload the asset on init. */
  preload: boolean;
  /** Howler-compatible volume override (0–1). Default: 1. */
  volume?: number;
  /** Loop flag (used for music tracks). */
  loop?: boolean;
}

/**
 * Base path for sound assets, derived from Vite's BASE_URL so that paths
 * resolve correctly for both root deployments (base = '/') and sub-path
 * deployments (e.g. base = '/bbmobilenew/').
 *
 * Vite guarantees BASE_URL always ends with a slash, so concatenating the
 * relative segment directly is safe.
 *
 * Examples:
 *   base = '/'            → SOUNDS_BASE = '/assets/sounds/'
 *   base = '/bbmobilenew/' → SOUNDS_BASE = '/bbmobilenew/assets/sounds/'
 */
const _viteBase: string = import.meta.env.BASE_URL ?? '/';
export const SOUNDS_BASE = `${_viteBase}assets/sounds/`;

/**
 * SOUND_REGISTRY — canonical map of all sound keys.
 *
 * Paths use SOUNDS_BASE so they are served from the correct location on any
 * deployment (local dev or GitHub Pages sub-path).
 */
export const SOUND_REGISTRY: Readonly<Record<string, SoundEntry>> = {
  'ui:navigate': {
    key: 'ui:navigate',
    category: 'ui',
    src: `${SOUNDS_BASE}ui_navigate.mp3`,
    preload: true,
    volume: 0.6,
  },
  'ui:confirm': {
    key: 'ui:confirm',
    category: 'ui',
    src: `${SOUNDS_BASE}ui_confirm.mp3`,
    preload: true,
    volume: 0.7,
  },
  'ui:error': {
    key: 'ui:error',
    category: 'ui',
    src: `${SOUNDS_BASE}ui_error.mp3`,
    preload: false,
    volume: 0.6,
  },
  'tv:event': {
    key: 'tv:event',
    category: 'tv',
    src: `${SOUNDS_BASE}tv_event.mp3`,
    preload: true,
    volume: 0.8,
  },
  'player:evicted': {
    key: 'player:evicted',
    category: 'player',
    src: `${SOUNDS_BASE}player_evicted.mp3`,
    preload: false,
    volume: 1.0,
  },
  'minigame:start': {
    key: 'minigame:start',
    category: 'minigame',
    src: `${SOUNDS_BASE}minigame_start.mp3`,
    preload: false,
    volume: 0.9,
  },
  /**
   * Wheel-spin loop for the Risk Wheel minigame.
   * Asset not yet present — drop /public/assets/sounds/minigame_wheelofluck.mp3
   * to activate. Until the file is added, SoundManager will still attempt to
   * load/play this asset (resulting in missing-file errors such as 404s).
   */
  'minigame:wheelofluck': {
    key: 'minigame:wheelofluck',
    category: 'minigame',
    src: `${SOUNDS_BASE}minigame_wheelofluck.mp3`,
    preload: false,
    volume: 1.0,
    loop: true,
  },
  /**
   * Risk Wheel ambient loop.
   * Asset not yet present — drop /public/assets/sounds/music_risk_wheel_loop.mp3
   * to activate. Until the file is added, SoundManager will still attempt to
   * load/play this asset (resulting in missing-file errors such as 404s).
   */
  'music:risk_wheel_loop': {
    key: 'music:risk_wheel_loop',
    category: 'music',
    src: `${SOUNDS_BASE}music_risk_wheel_loop.mp3`,
    preload: false,
    volume: 0.4,
    loop: true,
  },
  /**
   * Risk Wheel positive reward stinger.
   * Asset not yet present — drop /public/assets/sounds/minigame_risk_wheel_good.mp3
   * to activate.
   */
  'minigame:risk_wheel_good': {
    key: 'minigame:risk_wheel_good',
    category: 'minigame',
    src: `${SOUNDS_BASE}minigame_risk_wheel_good.mp3`,
    preload: false,
    volume: 0.95,
  },
  /**
   * Risk Wheel negative reward stinger.
   * Asset not yet present — drop /public/assets/sounds/minigame_risk_wheel_bad.mp3
   * to activate.
   */
  'minigame:risk_wheel_bad': {
    key: 'minigame:risk_wheel_bad',
    category: 'minigame',
    src: `${SOUNDS_BASE}minigame_risk_wheel_bad.mp3`,
    preload: false,
    volume: 0.95,
  },
  /**
   * Risk Wheel scoreboard reveal stinger.
   * Asset not yet present — drop /public/assets/sounds/minigame_risk_wheel_scoreboard.mp3
   * to activate.
   */
  'minigame:risk_wheel_scoreboard': {
    key: 'minigame:risk_wheel_scoreboard',
    category: 'minigame',
    src: `${SOUNDS_BASE}minigame_risk_wheel_scoreboard.mp3`,
    preload: false,
    volume: 0.9,
  },
  /**
   * Risk Wheel winner reveal stinger.
   * Asset not yet present — drop /public/assets/sounds/minigame_risk_wheel_winner.mp3
   * to activate.
   */
  'minigame:risk_wheel_winner': {
    key: 'minigame:risk_wheel_winner',
    category: 'minigame',
    src: `${SOUNDS_BASE}minigame_risk_wheel_winner.mp3`,
    preload: false,
    volume: 1.0,
  },
  'music:menu_loop': {
    key: 'music:menu_loop',
    category: 'music',
    src: `${SOUNDS_BASE}music_menu_loop.mp3`,
    preload: false,
    volume: 0.5,
    loop: true,
  },
  'music:intro_hub_loop': {
    key: 'music:intro_hub_loop',
    category: 'music',
    src: `${SOUNDS_BASE}music_intro_hub_loop.mp3`,
    preload: false,
    volume: 0.45,
    loop: true,
  },
  'music:spectator_loop': {
    key: 'music:spectator_loop',
    category: 'music',
    src: `${SOUNDS_BASE}music_spectator_loop.mp3`,
    preload: false,
    volume: 0.4,
    loop: true,
  },
  'minigame:results': {
    key: 'minigame:results',
    category: 'minigame',
    src: `${SOUNDS_BASE}minigame_results.mp3`,
    preload: false,
    volume: 0.85,
  },
  'ui:jury_vote': {
    key: 'ui:jury_vote',
    category: 'ui',
    src: `${SOUNDS_BASE}ui_jury_vote.mp3`,
    preload: false,
    volume: 0.7,
  },
  'tv:winner_reveal': {
    key: 'tv:winner_reveal',
    category: 'tv',
    src: `${SOUNDS_BASE}tv_winner_reveal.mp3`,
    preload: false,
    volume: 1.0,
  },
  'tv:battleback': {
    key: 'tv:battleback',
    category: 'tv',
    src: `${SOUNDS_BASE}tv_battleback.mp3`,
    preload: false,
    volume: 0.9,
  },
  'tv:public_favorite': {
    key: 'tv:public_favorite',
    category: 'tv',
    src: `${SOUNDS_BASE}tv_public_favorite.mp3`,
    preload: false,
    volume: 0.9,
  },

  // ── Social module music ───────────────────────────────────────────────────

  /**
   * Social module background music — plays while the Social panel or incoming
   * inbox is open.  Stops and restores the previous track on close.
   * Asset: public/assets/sounds/Social_module.mp3
   */
  'music:social_module': {
    key: 'music:social_module',
    category: 'music',
    src: `${SOUNDS_BASE}Social_module.mp3`,
    preload: false,
    volume: 0.5,
    loop: true,
  },

  // ── Glass Bridge minigame sounds ──────────────────────────────────────────

  /**
   * Glass Bridge looping background music.
   * Asset: public/assets/sounds/glassbridge/glass bridge main 1.mp3
   */
  'music:gb_main': {
    key: 'music:gb_main',
    category: 'music',
    src: `${SOUNDS_BASE}glassbridge/glass bridge main 1.mp3`,
    preload: false,
    volume: 0.5,
    loop: true,
  },
  /**
   * Glass Bridge safe-tile step sound — plays when a player steps on a
   * non-breaking glass tile.
   * Asset: public/assets/sounds/glassbridge/glass step.mp3
   */
  'minigame:gb_safe_step': {
    key: 'minigame:gb_safe_step',
    category: 'minigame',
    src: `${SOUNDS_BASE}glassbridge/glass step.mp3`,
    preload: false,
    volume: 0.9,
  },
  /**
   * Glass Bridge death sound — plays when a tile breaks and the player dies.
   * Asset: public/assets/sounds/glassbridge/jump fall death.mp3
   */
  'minigame:gb_death': {
    key: 'minigame:gb_death',
    category: 'minigame',
    src: `${SOUNDS_BASE}glassbridge/jump fall death.mp3`,
    preload: false,
    volume: 1.0,
  },
  /**
   * Glass Bridge winner sound — plays when a player reaches the last correct
   * row and survives.
   * Asset: public/assets/sounds/glassbridge/glass bridge winner.mp3
   */
  'minigame:gb_winner': {
    key: 'minigame:gb_winner',
    category: 'minigame',
    src: `${SOUNDS_BASE}glassbridge/glass bridge winner.mp3`,
    preload: false,
    volume: 1.0,
  },
  /**
   * Glass Bridge new-player-turn sound — plays whenever a new player starts
   * their turn on the bridge.
   * Asset: public/assets/sounds/glassbridge/new player turn.mp3
   */
  'minigame:gb_new_turn': {
    key: 'minigame:gb_new_turn',
    category: 'minigame',
    src: `${SOUNDS_BASE}glassbridge/new player turn.mp3`,
    preload: false,
    volume: 0.85,
  },

  // ── Phase / TV event music ────────────────────────────────────────────────

  /**
   * HOH competition and general competition music.
   * Asset: public/assets/sounds/music_hoh_comp_general.mp3
   */
  'music:hoh_comp_general': {
    key: 'music:hoh_comp_general',
    category: 'music',
    src: `${SOUNDS_BASE}music_hoh_comp_general.mp3`,
    preload: false,
    volume: 0.6,
    loop: true,
  },

  /**
   * Live vote stinger — plays during live voting sequences.
   * Asset: public/assets/sounds/live_vote.mp3
   */
  'tv:live_vote': {
    key: 'tv:live_vote',
    category: 'tv',
    src: `${SOUNDS_BASE}live_vote.mp3`,
    preload: false,
    volume: 0.85,
  },

  /**
   * Nominations reveal — horror/suspense variant looping background music.
   * Plays during the nominations ceremony alongside or instead of nominations_main.
   * Asset: public/assets/sounds/nominations_horror.mp3
   */
  'music:nominations_horror': {
    key: 'music:nominations_horror',
    category: 'music',
    src: `${SOUNDS_BASE}nominations_horror.mp3`,
    preload: false,
    volume: 0.9,
    loop: true,
  },

  /**
   * Nominations ceremony looping background music.
   * Plays when entering the nominations phase and continues through nomination_results.
   * Asset: public/assets/sounds/nominations_main.mp3
   */
  'music:nominations_main': {
    key: 'music:nominations_main',
    category: 'music',
    src: `${SOUNDS_BASE}nominations_main.mp3`,
    preload: false,
    volume: 0.9,
    loop: true,
  },

  /**
   * Veto ceremony stinger — one-shot sound played at the start of pov_ceremony.
   * Asset: public/assets/sounds/veto_ceremony.mp3
   */
  'tv:veto_ceremony': {
    key: 'tv:veto_ceremony',
    category: 'tv',
    src: `${SOUNDS_BASE}veto_ceremony.mp3`,
    preload: false,
    volume: 0.85,
  },

  /**
   * Veto phase looping background music — plays during pov_ceremony and
   * pov_ceremony_results phases.
   * Asset: public/assets/sounds/veto_phase.mp3
   */
  'music:veto_phase': {
    key: 'music:veto_phase',
    category: 'music',
    src: `${SOUNDS_BASE}veto_phase.mp3`,
    preload: false,
    volume: 0.85,
    loop: true,
  },

  /**
   * Voting for eviction — plays during the eviction vote ceremony.
   * Asset: public/assets/sounds/voting_for_eviction_user_and_housguests.mp3
   * (Note: actual filename has intentional typo "housguests".)
   */
  'tv:voting_eviction': {
    key: 'tv:voting_eviction',
    category: 'tv',
    src: `${SOUNDS_BASE}voting_for_eviction_user_and_housguests.mp3`,
    preload: false,
    volume: 0.9,
  },

  // ── Wildcard Western minigame sounds ──────────────────────────────────────

  /**
   * Wildcard Western looping background music — plays throughout the entire game.
   * Asset: public/assets/sounds/wildcard western/music_wildcard_western_main.mp3
   */
  'music:wildcard_western_main': {
    key: 'music:wildcard_western_main',
    category: 'music',
    src: `${SOUNDS_BASE}wildcard western/music_wildcard_western_main.mp3`,
    preload: false,
    volume: 0.5,
    loop: true,
  },
  /**
   * Wildcard Western select sound — plays when the player taps an answer,
   * selects a duel opponent, or picks another houseguest.
   * Asset: public/assets/sounds/wildcard western/ui_wildcard_select.mp3
   */
  'ui:wildcard_select': {
    key: 'ui:wildcard_select',
    category: 'ui',
    src: `${SOUNDS_BASE}wildcard western/ui_wildcard_select.mp3`,
    preload: false,
    volume: 0.8,
  },
  /**
   * Wildcard Western draw sound — plays when the player hits the DRAW button.
   * Asset: public/assets/sounds/wildcard western/ui_wildcard_draw.mp3
   */
  'ui:wildcard_draw': {
    key: 'ui:wildcard_draw',
    category: 'ui',
    src: `${SOUNDS_BASE}wildcard western/ui_wildcard_draw.mp3`,
    preload: false,
    volume: 0.9,
  },
  /**
   * Wildcard Western elimination sound — plays when a player is eliminated.
   * Asset: public/assets/sounds/wildcard western/player_wildcard_eliminated.mp3
   */
  'player:wildcard_eliminated': {
    key: 'player:wildcard_eliminated',
    category: 'player',
    src: `${SOUNDS_BASE}wildcard western/player_wildcard_eliminated.mp3`,
    preload: false,
    volume: 1.0,
  },
  /**
   * Wildcard Western winner sound — plays when the game winner is revealed.
   * Asset: public/assets/sounds/wildcard western/minigame_wildcard_winner.mp3
   */
  'minigame:wildcard_winner': {
    key: 'minigame:wildcard_winner',
    category: 'minigame',
    src: `${SOUNDS_BASE}wildcard western/minigame_wildcard_winner.mp3`,
    preload: false,
    volume: 1.0,
  },
  /**
   * Wildcard Western continue sound — plays when the Continue button is pressed
   * after a duel resolution.
   * Asset: public/assets/sounds/wildcard western/ui_wildcard_continue.mp3
   */
  'ui:wildcard_continue': {
    key: 'ui:wildcard_continue',
    category: 'ui',
    src: `${SOUNDS_BASE}wildcard western/ui_wildcard_continue.mp3`,
    preload: false,
    volume: 0.8,
  },
  /**
   * Wildcard Western new-round cue — plays at round/pair transitions.
   * Asset: public/assets/sounds/wildcard western/western_new_round.mp3
   */
  'ui:western_new_round': {
    key: 'ui:western_new_round',
    category: 'ui',
    src: `${SOUNDS_BASE}wildcard western/western_new_round.mp3`,
    preload: false,
    volume: 0.85,
  },
};

/**
 * FILENAME_ALIAS_MAP — maps bare filename stems (without extension) to their
 * canonical SOUND_REGISTRY key.
 *
 * This supports Option B: files uploaded with non-standard names (e.g. legacy
 * vendor names, capitalised names, or abbreviated names) are resolved to their
 * canonical semantic key without physically renaming the binary asset.
 *
 * Usage:
 *   const key = FILENAME_ALIAS_MAP['live_vote'] ?? 'tv:live_vote';
 *   // or use the resolveKey() helper below
 */
export const FILENAME_ALIAS_MAP: Readonly<Record<string, string>> = {
  // Legacy / non-prefix filenames → canonical key
  live_vote:                                             'tv:live_vote',
  nominations_horror:                                    'music:nominations_horror',
  nominations_main:                                      'music:nominations_main',
  veto_ceremony:                                         'tv:veto_ceremony',
  veto_phase:                                            'music:veto_phase',
  voting_for_eviction_user_and_housguests:               'tv:voting_eviction',
  // Alternate / previously-used capitalised filenames (resolve safely)
  Social_module:                                         'music:social_module',
  Hoh_competition_and_general_competition:               'music:hoh_comp_general',
  // Wildcard Western — non-prefix filename that doesn't auto-derive
  western_new_round:                                     'ui:western_new_round',
};

/**
 * resolveKey — resolves a filename stem OR an already-canonical key to the
 * canonical SOUND_REGISTRY key.
 *
 * - If `input` is already a registered key (e.g. `"tv:live_vote"`), it is
 *   returned unchanged.
 * - If `input` matches an entry in FILENAME_ALIAS_MAP, the mapped key is
 *   returned.
 * - Otherwise, Option B automatic derivation: strip the leading prefix word
 *   before the first underscore and reconstruct a `prefix:rest` key.
 *   e.g. `"ui_navigate"` → `"ui:navigate"`.
 * - Returns null if no mapping can be found.
 */
export function resolveKey(input: string): string | null {
  // Use hasOwnProperty to avoid false positives from inherited prototype
  // properties (e.g. "toString", "hasOwnProperty" itself would match with `in`).

  // 1. Already a canonical key?
  if (Object.prototype.hasOwnProperty.call(SOUND_REGISTRY, input)) return input;

  // 2. Alias map lookup (bare stem, no extension)
  const stem = input.replace(/\.mp3$/i, '');
  if (Object.prototype.hasOwnProperty.call(FILENAME_ALIAS_MAP, stem)) return FILENAME_ALIAS_MAP[stem];

  // 3. Auto-derive: prefix_rest → prefix:rest
  const PREFIXES = ['ui', 'tv', 'player', 'minigame', 'music'] as const;
  for (const p of PREFIXES) {
    if (stem.startsWith(`${p}_`)) {
      const candidate = `${p}:${stem.slice(p.length + 1)}`;
      if (Object.prototype.hasOwnProperty.call(SOUND_REGISTRY, candidate)) return candidate;
    }
  }

  return null;
}
