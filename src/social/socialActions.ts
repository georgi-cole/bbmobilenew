import { DRAMA_SOCIAL_ACTIONS } from './dramaModeConfig'

/**
 * Social action definitions for the SocialManeuvers subsystem.
 *
 * Each entry describes a social action a player can perform during a social
 * phase. `baseCost` can be a plain number (energy units) or an object with
 * separate `energy`, `influence`, and/or `info` costs.
 *
 * ## Resource roles
 * - **energy**    — action stamina; always spent to perform an action.
 * - **influence** — social/political capital; earned from rapport actions,
 *                   spent on political-leverage actions.
 * - **info**      — intelligence capital; earned by observing/whispering,
 *                   spent on intel-sensitive actions.
 *
 * ## Relationship state (not a spendable resource)
 * affinity, trust, resentment, and tags (alliance, betrayal, target, etc.)
 * are stored in `state.social.relationships` and drive AI targeting, veto
 * bias, nomination preference, and outcome modifiers.  They are separate
 * from the banked resources above.
 */

import type { PlayerStatus } from '../types'
import type { DramaArcStage, DramaArcType } from './types'

export type ActionCategory = 'friendly' | 'strategic' | 'aggressive' | 'alliance'

/**
 * Semantic role of a social action.
 *
 * | Kind               | Primary cost       | Primary yield      | Purpose                              |
 * |--------------------|--------------------|--------------------|--------------------------------------|
 * | rapport            | energy             | influence (small)  | Build goodwill / relationship state  |
 * | intel_gain         | energy             | info               | Observe, eavesdrop, gather intel     |
 * | intel_spend        | energy + info      | influence          | Convert intel into social leverage   |
 * | political_spend    | energy + influence | influence / tags   | Spend capital on board position      |
 * | aggressive         | energy             | influence / tags   | Disrupt, damage, or escalate         |
 */
export type SocialActionKind =
  | 'rapport'
  | 'intel_gain'
  | 'intel_spend'
  | 'political_spend'
  | 'aggressive'

/**
 * How many targets an action requires or supports.
 *  - 'none'               — no target player needed (e.g. observe, stay idle)
 *  - 'primary'            — exactly one target player required (default for most actions)
 *  - 'primaryPlusSubject' — one primary target + one lightweight contextual subject
 *                           (e.g. "Pitch Target to LOH about X")
 *  - 'multi'              — multiple target players supported (e.g. group actions)
 */
export type TargetMode = 'none' | 'primary' | 'primaryPlusSubject' | 'multi'

/**
 * Hint for the UI about what kind of players are valid subject candidates for
 * primaryPlusSubject actions.
 *  - 'houseguests'  — any alive non-human player
 *  - 'nominees'     — players currently on the nomination block
 *  - 'non_nominees' — alive non-human players NOT on the block
 *  - 'allies'       — players with positive affinity toward the actor
 *  - 'voters'       — alive non-human players who can vote this week
 */
export type SubjectPool = 'houseguests' | 'nominees' | 'non_nominees' | 'allies' | 'voters'

export interface SocialActionDefinition {
  id: string
  title: string
  /**
   * UI metadata category for display and filtering purposes.
   * Note: this field does NOT affect SocialPolicy outcome computation —
   * the actual delta behaviour is driven by the id lists in
   * `socialConfig.actionCategories.friendlyActions` / `aggressiveActions`.
   */
  category: ActionCategory
  /**
   * Semantic role of this action in the resource economy.
   * Used for action-catalog documentation and future AI weighting.
   * Does not gate execution — see `baseCost` and `yields` for runtime behaviour.
   */
  kind?: SocialActionKind
  /**
   * Energy cost as a plain number or a multi-resource cost-shape object.
   * Influence costs are authored in whole influence units (2.0 → cost 20);
   * info costs remain in the legacy bank-point scale (2.0 → cost 200).
   */
  baseCost: number | { energy?: number; influence?: number; info?: number }
  /**
   * Optional resource yields granted to the actor on a successful execution.
   * Influence yields remain authored in legacy fractional bank units
   * (0.02 → +2). Dispatches applyInfluenceDelta / applyInfoDelta with
   * positive deltas.
   */
  /** Optional Drama Mode override; Normal Mode always uses baseCost. */
  dramaCost?: number | { energy?: number; influence?: number; info?: number }
  /** Optional Drama Mode target-shape override. */
  dramaTargetMode?: TargetMode
  yields?: { influence?: number; info?: number }
  /** Emoji icon shown on the action card. */
  icon?: string
  /** Short description shown on the action card below the title. */
  description?: string
  /** Optional weight hint for future AI probability weighting. */
  successWeight?: number
  /** Tag applied to relationship entries when this action fires (e.g. 'betrayal'). */
  outcomeTag?: string
  /**
   * When false the action does not require a target player to be selected.
   * Defaults to true (most actions target another player).
   */
  needsTargets?: boolean
  /**
   * Optional short hint displayed as a requirement badge on the action card
   * (e.g. "Requires 20% affinity"). Pure UI metadata — does not gate execution.
   */
  availabilityHint?: string
  /**
   * How many targets this action requires or supports.
   * Defaults to 'primary' when needsTargets !== false, else 'none'.
   * See TargetMode type for full documentation.
   */
  targetMode?: TargetMode
  /**
   * When true, this action is used by the AI engine only and should not appear
   * in the human-player action grid. Keeps the AI policy catalog intact while
   * avoiding duplicate / confusing entries in the player UI.
   */
  aiOnly?: boolean
  /**
   * For primaryPlusSubject actions: hint about what pool of players is valid
   * as the contextual subject. Used by the UI to generate candidate chips.
   */
  subjectPool?: SubjectPool
  /** Minimum number of distinct targets required by a multi-target action. */
  minTargets?: number
  /** Optional hard limit for a multi-target action. */
  maxTargets?: number
  /** Dynamic energy charged per selected target (baseCost remains the floor). */
  energyPerTarget?: number
  /** Allow the acting player to be chosen as the contextual subject. */
  allowActorAsSubject?: boolean
  /**
   * When set, this action is only available when the selected primary target
   * has one of the listed statuses.  For example, `['loh', 'loh+pos']` means
   * the action only appears when talking to the current Leader of the House.
   * Omit (or set to undefined) for actions that are available regardless of
   * the target's status.
   */
  requiredTargetStatus?: readonly PlayerStatus[]
  // Only actors currently holding one of these roles may use the action.
  /** Drama-only contextual gates. Base fields above preserve Normal Mode rules. */
  dramaAllowedPhases?: readonly string[]
  dramaRequiredActorStatus?: readonly PlayerStatus[]
  dramaRequiredTargetStatus?: readonly PlayerStatus[]
  dramaRequiredRelationshipTags?: readonly string[]
  dramaExcludedRelationshipTags?: readonly string[]
  dramaMinAffinity?: number
  dramaMaxAffinity?: number
  requiredActorStatus?: readonly PlayerStatus[]
  /** Only available while the premium Drama Mode simulation is enabled. */
  dramaOnly?: boolean
  /**
   * Part of the paid Reality strategy layer. In Classic it remains visible as
   * a locked preview card rather than making the core catalogue feel smaller.
   */
  realityExclusive?: boolean
  allowedPhases?: readonly string[]
  requiredRelationshipTags?: readonly string[]
  excludedRelationshipTags?: readonly string[]
  minAffinity?: number
  maxAffinity?: number
  requiredArcTypes?: readonly DramaArcType[]
  excludedArcTypes?: readonly DramaArcType[]
  requiredArcStages?: readonly DramaArcStage[]
  requiredArcPublic?: boolean
  requiresKnownSecret?: boolean
  /** Expansion-specific relationship action shown only during Vox Populi seasons. */
  voxOnly?: boolean
}

/** Resolve the target shape without leaking Drama Mode behavior into Normal Mode. */
export function resolveActionTargetMode(
  action: SocialActionDefinition,
  dramaMode = false
): TargetMode {
  return (
    (dramaMode ? action.dramaTargetMode : undefined) ??
    action.targetMode ??
    (action.needsTargets === false ? 'none' : 'primary')
  )
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
    kind: 'rapport',
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
    kind: 'intel_gain',
    baseCost: { energy: 1 },
    dramaCost: { energy: 2 },
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
    kind: 'intel_gain',
    baseCost: { energy: 1 },
    dramaCost: { energy: 2 },
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
    kind: 'rapport',
    baseCost: { energy: 2 },
    targetMode: 'multi',
    minTargets: 2,
    maxTargets: 8,
    energyPerTarget: 1,
    successWeight: 2,
    yields: { influence: 0.03 },
  },
  {
    id: 'build_quiet_bond',
    title: 'Heart-to-Heart',
    icon: '☕',
    description: 'Step away from the noise and deepen a genuine one-to-one bond.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 2 },
    targetMode: 'primary',
    successWeight: 3,
    yields: { influence: 0.04 },
    allowedPhases: ['social_1', 'social_2'],
    voxOnly: true,
  },
  {
    id: 'share_personal_story',
    title: 'Open Up',
    icon: '💭',
    description: 'Share something personal and give this relationship room to become real.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: { energy: 2 },
    targetMode: 'primary',
    successWeight: 2,
    yields: { influence: 0.03 },
    allowedPhases: ['social_1', 'social_2'],
    voxOnly: true,
  },
  {
    id: 'read_the_room',
    title: 'Read the Room',
    icon: '👁️',
    description: 'Watch the house dynamics without discussing nominations or pushing a target.',
    category: 'strategic',
    kind: 'intel_gain',
    baseCost: { energy: 1 },
    targetMode: 'none',
    needsTargets: false,
    successWeight: 3,
    yields: { info: 1 },
    allowedPhases: ['social_1', 'social_2'],
    voxOnly: true,
  },
  // ── Alliance & relationship actions ───────────────────────────────────────
  {
    id: 'proposeAlliance',
    title: 'Propose Alliance',
    icon: '🤝',
    description: 'Propose a formal alliance. Success creates a lasting bond.',
    category: 'alliance',
    kind: 'intel_spend',
    baseCost: { energy: 3, info: 2.0 },
    dramaCost: { energy: 4, info: 1.0 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'alliance',
    availabilityHint: 'Requires positive affinity',
    excludedRelationshipTags: ['alliance'],
    realityExclusive: true,
    yields: { influence: 0.06 },
  },
  {
    id: 'protect',
    title: 'Offer Protection',
    icon: '🛡️',
    description: 'Promise safety to a vulnerable player.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: 2,
    targetMode: 'primary',
    successWeight: 2,
    realityExclusive: true,
  },
  {
    id: 'betray',
    title: 'Betray Ally',
    icon: '🗡️',
    description: 'Break an existing alliance for personal gain.',
    category: 'aggressive',
    kind: 'aggressive',
    baseCost: 3,
    dramaCost: 4,
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'betrayal',
    availabilityHint: 'High-risk betrayal',
    requiredRelationshipTags: ['alliance'],
    realityExclusive: true,
    yields: { influence: 0.04 },
  },
  {
    id: 'reassure',
    title: 'Reassure',
    icon: '🤗',
    description: 'Offer emotional support. Builds trust and goodwill.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: 1,
    targetMode: 'primary',
    successWeight: 2,
    yields: { influence: 0.03 },
  },
  {
    id: 'apologize',
    title: 'Clear the Air',
    icon: '🕊️',
    description: 'Own a mistake and sincerely repair tension with this player.',
    category: 'friendly',
    kind: 'rapport',
    baseCost: 1,
    dramaCost: 2,
    targetMode: 'primary',
    successWeight: 2,
    dramaMaxAffinity: 25,
    yields: { influence: 0.02 },
  },
  {
    id: 'share_intel',
    title: 'Share Intel',
    icon: '📋',
    description: 'Trade your intelligence for social leverage. Converts info into influence.',
    category: 'strategic',
    kind: 'intel_spend',
    baseCost: { energy: 1, info: 2.0 },
    dramaCost: { energy: 2, info: 1.0 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'intel',
    availabilityHint: 'Requires 200 info',
    yields: { influence: 0.06 },
  },
  // ── Aggressive / competitive actions ─────────────────────────────────────
  {
    id: 'rumor',
    title: 'Spread Rumor',
    icon: '💬',
    description: 'Plant a damaging rumor about a player.',
    category: 'aggressive',
    kind: 'aggressive',
    baseCost: { energy: 2, info: 1.0 },
    dramaCost: { energy: 3, info: 1.0 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'rumor',
    yields: { influence: 0.05 },
    realityExclusive: true,
  },
  {
    id: 'startFight',
    title: 'Start Fight',
    icon: '💥',
    description: 'Escalate tension. Risky — may backfire.',
    category: 'aggressive',
    kind: 'aggressive',
    baseCost: 3,
    dramaCost: 4,
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
    description: "Directly challenge someone's behavior or motives.",
    category: 'aggressive',
    kind: 'aggressive',
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
    kind: 'political_spend',
    baseCost: { energy: 1, influence: 2.0 },
    dramaCost: { energy: 2, influence: 2.0 },
    targetMode: 'primary',
    successWeight: 2,
    availabilityHint: 'Requires 20 influence',
    dramaMinAffinity: 5,
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
    kind: 'political_spend',
    baseCost: { energy: 2, influence: 1.0, info: 1.0 },
    dramaCost: { energy: 3, influence: 1.0, info: 1.0 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'houseguests',
    successWeight: 1,
    outcomeTag: 'target',
    availabilityHint: 'Talk to LOH about a target',
    yields: { influence: 0.04 },
    requiredTargetStatus: ['loh', 'loh+pos'],
    dramaAllowedPhases: ['loh_results', 'social_1', 'nominations'],
  },
  {
    id: 'suggest_replacement',
    title: 'Suggest Replacement',
    icon: '🔄',
    description: 'Pitch a replacement nominee to the POS holder or LOH.',
    category: 'strategic',
    kind: 'political_spend',
    baseCost: { energy: 2, influence: 1.0, info: 1.0 },
    dramaCost: { energy: 3, influence: 1.0, info: 1.0 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'non_nominees',
    successWeight: 1,
    outcomeTag: 'target',
    availabilityHint: 'Requires LOH or POS holder',
    yields: { influence: 0.04 },
    requiredTargetStatus: ['loh', 'loh+pos', 'pos', 'nominated+pos'],
    dramaAllowedPhases: [
      'nomination_results',
      'pos_comp_announcement',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
    ],
  },
  {
    id: 'ask_use_safety',
    title: 'Ask to Use Safety',
    icon: '🛡️',
    description: 'Ask the POS holder to use safety on a nominee.',
    category: 'strategic',
    kind: 'political_spend',
    baseCost: { energy: 2, influence: 1.0 },
    dramaCost: { energy: 3, influence: 1.0 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'nominees',
    allowActorAsSubject: true,
    successWeight: 1,
    outcomeTag: 'protection',
    availabilityHint: 'Talk to POS about a nominee',
    requiredTargetStatus: ['pos', 'loh+pos', 'nominated+pos'],
    dramaAllowedPhases: [
      'social_1',
      'nomination_results',
      'pos_comp_announcement',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
    ],
  },
  {
    id: 'ask_safety_plan',
    title: 'Ask Safety Plan',
    icon: '🛡️',
    description: 'Ask the Safety holder what they intend to do. They may be honest or stay vague.',
    category: 'strategic',
    kind: 'intel_gain',
    baseCost: { energy: 1 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'safety_intel',
    availabilityHint: 'Available while Safety is still undecided',
    requiredTargetStatus: ['pos', 'loh+pos', 'nominated+pos'],
    allowedPhases: ['pos_results', 'pos_ceremony'],
  },
  {
    id: 'ask_hold_safety',
    title: 'Respect Nominations',
    icon: '✋',
    description:
      'As LOH, ask the Safety holder not to use Safety and leave your nominations unchanged.',
    category: 'strategic',
    kind: 'political_spend',
    baseCost: { energy: 2, influence: 1 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'safety_request',
    availabilityHint: 'LOH only, before Safety is used',
    requiredActorStatus: ['loh', 'loh+pos'],
    requiredTargetStatus: ['pos', 'loh+pos', 'nominated+pos'],
    allowedPhases: ['pos_results', 'pos_ceremony'],
  },
  {
    id: 'warn_about_danger',
    title: 'Warn About Danger',
    icon: '⚠️',
    description:
      'Tell this housemate the LOH named them as a target. They may appreciate it, but the LOH could find out.',
    category: 'strategic',
    kind: 'intel_spend',
    baseCost: { energy: 1, info: 1 },
    targetMode: 'primary',
    successWeight: 2,
    outcomeTag: 'warning',
    availabilityHint: 'Requires target intel from the LOH',
    dramaOnly: true,
    allowedPhases: [
      'social_1',
      'nominations',
      'nomination_results',
      'pre_veto_public_save',
      'pos_comp_announcement',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
    ],
  },
  {
    id: 'ask_why_nominated',
    title: 'Ask Why You Were Nominated',
    icon: '❓',
    description: 'Press the LOH for a candid explanation of why they put you at risk.',
    category: 'strategic',
    kind: 'intel_gain',
    baseCost: { energy: 1 },
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'nomination_reason',
    availabilityHint: 'Available when you are nominated',
    requiredTargetStatus: ['loh', 'loh+pos'],
  },
  {
    id: 'ask_loh_target',
    title: 'Ask LOH Target',
    icon: '🗣️',
    description: 'Ask the LOH who they currently want out, including a possible backup plan.',
    category: 'strategic',
    kind: 'intel_gain',
    baseCost: { energy: 1 },
    targetMode: 'primary',
    successWeight: 2,
    availabilityHint: 'Ask the current LOH about their plan',
    yields: { info: 1 },
    requiredTargetStatus: ['loh', 'loh+pos'],
  },
  {
    id: 'warn_about_player',
    title: 'Warn About Player',
    icon: '⚠️',
    description: 'Warn an ally about a player you find suspicious.',
    category: 'strategic',
    kind: 'intel_spend',
    baseCost: { energy: 1, info: 1.0 },
    dramaCost: { energy: 2, info: 1.0 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'houseguests',
    successWeight: 2,
    outcomeTag: 'warning',
    dramaRequiredRelationshipTags: ['alliance', 'bromance', 'romance'],
    yields: { influence: 0.02 },
  },
  {
    id: 'rally_votes_against',
    title: 'Rally Votes Against',
    icon: '📣',
    description: 'Rally a voter to evict a specific nominee.',
    category: 'strategic',
    kind: 'political_spend',
    baseCost: { energy: 2, influence: 2.0 },
    dramaCost: { energy: 3, influence: 2.0 },
    targetMode: 'primaryPlusSubject',
    subjectPool: 'nominees',
    successWeight: 1,
    outcomeTag: 'vote_pressure',
    dramaRequiredTargetStatus: ['active', 'pos'],
    availabilityHint: 'Requires nominees on the block',
    dramaAllowedPhases: ['pos_ceremony_results', 'social_2'],
    yields: { influence: 0.03 },
  },
  ...DRAMA_SOCIAL_ACTIONS,
  // ── AI-only shims (kept for SocialPolicy / AI engine compatibility) ────────
  // These are hidden from the human-player grid.
  {
    id: 'ally',
    title: 'Form Alliance',
    icon: '🤝',
    description: 'Propose a formal alliance with another player.',
    category: 'alliance',
    kind: 'rapport',
    baseCost: 3,
    targetMode: 'primary',
    successWeight: 1,
    outcomeTag: 'alliance',
    aiOnly: true,
    dramaMinAffinity: 1,
    dramaExcludedRelationshipTags: ['alliance'],
  },
  {
    id: 'nominate',
    title: 'Nominate Player',
    icon: '🎯',
    description: 'Strategically name a target for elimination.',
    category: 'strategic',
    kind: 'political_spend',
    baseCost: { energy: 1 },
    targetMode: 'primary',
    successWeight: 2,
    dramaRequiredActorStatus: ['loh', 'loh+pos'],
    dramaAllowedPhases: ['nominations'],
    aiOnly: true,
  },
  {
    id: 'vote_rally',
    title: 'Vote Rally',
    icon: '📣',
    description: 'Rally votes using your influence. High influence required.',
    category: 'strategic',
    kind: 'political_spend',
    baseCost: { energy: 2, influence: 5.0 },
    targetMode: 'primary',
    successWeight: 1,
    availabilityHint: 'Requires 50 influence',
    yields: { influence: 0.04 },
    aiOnly: true,
    dramaRequiredTargetStatus: ['nominated', 'nominated+pos'],
    dramaAllowedPhases: ['pos_ceremony_results', 'social_2', 'live_vote'],
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
]

/**
 * Strategy actions that are promoted in Classic as locked Reality previews.
 * The IDs cover political manipulation and persistent-story actions; the
 * small rapport toolkit remains fully playable in the base game.
 */
const REALITY_EXCLUSIVE_ACTION_IDS = new Set([
  'proposeAlliance',
  'protect',
  'betray',
  'rumor',
  'startFight',
  'pitch_target',
  'suggest_replacement',
  'ask_use_safety',
  'ask_safety_plan',
  'ask_hold_safety',
  'warn_about_danger',
  'ask_why_nominated',
  'ask_loh_target',
  'warn_about_player',
  'rally_votes_against',
])

export function isRealityExclusiveAction(action: SocialActionDefinition): boolean {
  return (
    action.realityExclusive === true ||
    action.dramaOnly === true ||
    REALITY_EXCLUSIVE_ACTION_IDS.has(action.id)
  )
}
