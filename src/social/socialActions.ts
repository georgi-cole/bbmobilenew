/**
 * Social action definitions for the SocialManeuvers subsystem.
 *
 * Each entry describes a social action a player can perform during a social
 * phase. baseCost can be a plain number (energy units) or an object with
 * separate energy and info costs.
 */

import type { PlayerStatus } from '../types';

export type ActionCategory = 'friendly' | 'strategic' | 'aggressive' | 'alliance';

/**
 * How many targets an action requires or supports.
 *  - 'none'               — no target player needed (e.g. observe, stay idle)
 *  - 'primary'            — exactly one target player required (default for most actions)
 *  - 'primaryPlusSubject' — one primary target + one lightweight contextual subject
 *                           (e.g. "Pitch Target to LOH about X")
 *  - 'multi'              — multiple target players supported (e.g. group actions)
 */
export type TargetMode = 'none' | 'primary' | 'primaryPlusSubject' | 'multi';

/**
 * Hint for the UI about what kind of players are valid subject candidates for
 * primaryPlusSubject actions.
 *  - 'houseguests'  — any alive non-human player
 *  - 'nominees'     — players currently on the nomination block
 *  - 'non_nominees' — alive non-human players NOT on the block
 *  - 'allies'       — players with positive affinity toward the actor
 *  - 'voters'       — alive non-human players who can vote this week
 */
export type SubjectPool = 'houseguests' | 'nominees' | 'non_nominees' | 'allies' | 'voters';

export interface SocialActionDefinition {
  id: string;
  title: string;
  /**
   * UI metadata category for display and filtering purposes.
   * Note: this field does NOT affect SocialPolicy outcome computation —
   * the actual delta behaviour is driven by the id lists in
   * `socialConfig.actionCategories.friendlyActions` / `aggressiveActions`.
   */
  category: ActionCategory;
  /** Energy cost as a plain number or a multi-resource cost-shape object. */
  baseCost: number | { energy?: number; influence?: number; info?: number };
  /**
   * Optional resource yields granted to the actor on a successful execution.
   * Dispatches applyInfluenceDelta / applyInfoDelta with positive deltas.
   */
  yields?: { influence?: number; info?: number };
  /** Emoji icon shown on the action card. */
  icon?: string;
  /** Short description shown on the action card below the title. */
  description?: string;
  /** Optional weight hint for future AI probability weighting. */
  successWeight?: number;
  /** Tag applied to relationship entries when this action fires (e.g. 'betrayal'). */
  outcomeTag?: string;
  /**
   * When false the action does not require a target player to be selected.
   * Defaults to true (most actions target another player).
   */
  needsTargets?: boolean;
  /**
   * Optional short hint displayed as a requirement badge on the action card
   * (e.g. "Requires 20% affinity"). Pure UI metadata — does not gate execution.
   */
  availabilityHint?: string;
  /**
   * How many targets this action requires or supports.
   * Defaults to 'primary' when needsTargets !== false, else 'none'.
   * See TargetMode type for full documentation.
   */
  targetMode?: TargetMode;
  /**
   * When true, this action is used by the AI engine only and should not appear
   * in the human-player action grid. Keeps the AI policy catalog intact while
   * avoiding duplicate / confusing entries in the player UI.
   */
  aiOnly?: boolean;
  /**
   * For primaryPlusSubject actions: hint about what pool of players is valid
   * as the contextual subject. Used by the UI to generate candidate chips.
   */
  subjectPool?: SubjectPool;
  /**
   * When set, this action is only available when the selected primary target
   * has one of the listed statuses.  For example, `['loh', 'loh+pos']` means
   * the action only appears when talking to the current Leader of the House.
   * Omit (or set to undefined) for actions that are available regardless of
   * the target's status.
   */
  requiredTargetStatus?: readonly PlayerStatus[];
}

/** Canonical list of social actions available in the game. */
export const SOCIAL_ACTIONS: SocialActionDefinition[] = [
  // ── Generic actions (always available) ────────────────────────────────────
  {
    id: 'compliment',
    title: 'Compliment',
    icon: '✨',
    description: 'Give genuine praise to build rapport.',
    category: 'friendly',
    baseCost: 1,
    targetMode: 'primary',
    successWeight: 3,
    yields: { influence: 0.02 },
  },
  {
    id: 'whisper',
    title: 'Whisper',
    icon: '🤫',
    description: 'Share private intel to gain trust.',
    category: 'strategic',
    baseCost: { energy: 1 },
    targetMode: 'primary',
    successWeight: 2,
    yields: { info: 1.0 },
  },
  {
    id: 'observe',
    title: 'Observe',
    icon: '👁️',
    description: 'Watch and listen. Costs only energy.',
    category: 'strategic',
    baseCost: { energy: 1 },
    targetMode: 'none',
    needsTargets: false,
    successWeight: 2,
    yields: { info: 1.0 },
  },
  {
    id: 'group_chat',
    title: 'Group Chat',
    icon: '🗣️',
    description: 'Mingle with the house. Build broad goodwill.',
    category: 'friendly',
    baseCost: { energy: 2 },
    targetMode: 'primary',
    successWeight: 2,
    yields: { influence: 0.03 },
  },
  // ── Alliance & relationship actions ───────────────────────────────────────
  {
    id: 'proposeAlliance',
    title: 'Propose Alliance',
    icon: '🤝',
    description: 'Propose a formal alliance. Success creates a lasting bond.',
    category: 'alliance',
    baseCost: { energy: 3, info: 2.0 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'alliance',
    availabilityHint: 'Requires positive affinity',
    yields: { influence: 0.06 },
  },
  {
    id: 'protect',
    title: 'Offer Protection',
    icon: '🛡️',
    description: 'Promise safety to a vulnerable player.',
    category: 'friendly',
    baseCost: 2,
    targetMode: 'primary',
    successWeight: 2,
  },
  {
    id: 'betray',
    title: 'Betray Ally',
    icon: '🗡️',
    description: 'Break an existing alliance for personal gain.',
    category: 'aggressive',
    baseCost: 3,
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'betrayal',
    availabilityHint: 'High-risk betrayal',
    yields: { influence: 0.04 },
  },
  {
    id: 'reassure',
    title: 'Reassure',
    icon: '🤗',
    description: 'Offer emotional support. Builds trust and goodwill.',
    category: 'friendly',
    baseCost: 1,
    targetMode: 'primary',
    successWeight: 2,
    yields: { influence: 0.03 },
  },
  {
    id: 'share_intel',
    title: 'Share Intel',
    icon: '📋',
    description: 'Share valuable intel to build trust and mutual advantage.',
    category: 'strategic',
    baseCost: { energy: 1, info: 2.0 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'intel',
    availabilityHint: 'Requires 200 info',
    yields: { info: 1.0, influence: 0.04 },
  },
  // ── Aggressive / competitive actions ─────────────────────────────────────
  {
    id: 'rumor',
    title: 'Spread Rumor',
    icon: '💬',
    description: 'Plant a damaging rumor about a player.',
    category: 'aggressive',
    baseCost: { energy: 2, info: 1.0 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'rumor',
    yields: { influence: 0.05 },
  },
  {
    id: 'startFight',
    title: 'Start Fight',
    icon: '💥',
    description: 'Escalate tension. Risky — may backfire.',
    category: 'aggressive',
    baseCost: 3,
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'conflict',
    availabilityHint: 'Risky — may backfire',
    yields: { influence: 0.04 },
  },
  {
    id: 'confront',
    title: 'Confront',
    icon: '😤',
    description: 'Directly challenge someone\'s behavior or motives.',
    category: 'aggressive',
    baseCost: 2,
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'conflict',
  },
  // ── Strategic / contextual actions ────────────────────────────────────────
  {
    id: 'favor_request',
    title: 'Request Favour',
    icon: '🙏',
    description: 'Call in a favour from your network.',
    category: 'strategic',
    baseCost: { energy: 1, influence: 2.0 },
    targetMode: 'primary',
    successWeight: 2,
    availabilityHint: 'Requires 200 influence',
    yields: { influence: 0.03 },
  },
  // ── primaryPlusSubject contextual actions ─────────────────────────────────
  // These actions involve "talking to X about Y":
  //   primary target = person you are talking to
  //   subject        = person you are talking about
  {
    id: 'pitch_target',
    title: 'Pitch Target',
    icon: '🎯',
    description: 'Suggest to the LOH who they should nominate.',
    category: 'strategic',
    baseCost: { energy: 2, influence: 1.0, info: 1.0 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'houseguests',
    successWeight: 1,
    outcomeTag: 'target',
    availabilityHint: 'Talk to LOH about a target',
    yields: { influence: 0.04 },
    requiredTargetStatus: ['loh', 'loh+pos'],
  },
  {
    id: 'suggest_replacement',
    title: 'Suggest Replacement',
    icon: '🔄',
    description: 'Pitch a replacement nominee to the POS holder or LOH.',
    category: 'strategic',
    baseCost: { energy: 2, influence: 1.0, info: 1.0 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'non_nominees',
    successWeight: 1,
    outcomeTag: 'target',
    availabilityHint: 'Requires LOH or POS holder',
    yields: { influence: 0.04 },
    requiredTargetStatus: ['loh', 'loh+pos', 'pos', 'nominated+pos'],
  },
  {
    id: 'warn_about_player',
    title: 'Warn About Player',
    icon: '⚠️',
    description: 'Warn an ally about a player you find suspicious.',
    category: 'strategic',
    baseCost: { energy: 1, info: 1.0 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'houseguests',
    successWeight: 2,
    outcomeTag: 'warning',
    yields: { info: 0.5 },
  },
  {
    id: 'rally_votes_against',
    title: 'Rally Votes Against',
    icon: '📣',
    description: 'Rally a voter to evict a specific nominee.',
    category: 'strategic',
    baseCost: { energy: 2, influence: 2.0 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'nominees',
    successWeight: 1,
    outcomeTag: 'vote_pressure',
    availabilityHint: 'Requires nominees on the block',
    yields: { influence: 0.03 },
  },
  // ── AI-only shims (kept for SocialPolicy / AI engine compatibility) ────────
  // These are hidden from the human-player grid.
  {
    id: 'ally',
    title: 'Form Alliance',
    icon: '🤝',
    description: 'Propose a formal alliance with another player.',
    category: 'alliance',
    baseCost: 3,
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'alliance',
    aiOnly: true,
  },
  {
    id: 'nominate',
    title: 'Nominate Player',
    icon: '🎯',
    description: 'Strategically name a target for elimination.',
    category: 'strategic',
    baseCost: { energy: 1 },
    targetMode: 'primary',
    successWeight: 2,
    aiOnly: true,
  },
  {
    id: 'vote_rally',
    title: 'Vote Rally',
    icon: '📣',
    description: 'Rally votes using your influence. High influence required.',
    category: 'strategic',
    baseCost: { energy: 2, influence: 5.0 },
    targetMode: 'primary',
    successWeight: 1,
    availabilityHint: 'Requires 500 influence',
    yields: { influence: 0.04 },
    aiOnly: true,
  },
  {
    id: 'idle',
    title: 'Stay Idle',
    icon: '😴',
    description: 'Wait and observe. Costs nothing.',
    category: 'strategic',
    baseCost: 0,
    targetMode: 'none',
    needsTargets: false,
    successWeight: 1,
  },
];
