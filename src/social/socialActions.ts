/**
 * Social action definitions for the SocialManeuvers subsystem.
 *
 * Each entry describes a social action a player can perform during a social
 * phase. baseCost can be a plain number (energy units) or an object with
 * separate energy and info costs.
 */

export type ActionCategory = 'friendly' | 'strategic' | 'aggressive' | 'alliance';

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
  /** Energy cost as a plain number or a cost-shape object. */
  baseCost: number | { energy?: number; info?: number };
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
}

/** Canonical list of social actions available in the game. */
export const SOCIAL_ACTIONS: SocialActionDefinition[] = [
  {
    id: 'compliment',
    title: 'Compliment',
    icon: '✨',
    description: 'Give genuine praise to build rapport.',
    category: 'friendly',
    baseCost: 1,
    successWeight: 3,
  },
  {
    id: 'rumor',
    title: 'Spread Rumor',
    icon: '💬',
    description: 'Plant a damaging rumor about a houseguest.',
    category: 'aggressive',
    baseCost: 2,
    successWeight: 2,
    outcomeTag: 'rumor',
  },
  {
    id: 'whisper',
    title: 'Whisper',
    icon: '🤫',
    description: 'Share private intel to gain trust.',
    category: 'strategic',
    baseCost: { energy: 1, info: 1 },
    successWeight: 2,
  },
  {
    id: 'proposeAlliance',
    title: 'Propose Alliance',
    icon: '🤝',
    description: 'Propose a formal alliance. Success creates a lasting bond.',
    category: 'alliance',
    baseCost: 3,
    successWeight: 1,
    outcomeTag: 'alliance',
    availabilityHint: 'Requires positive affinity',
  },
  {
    id: 'startFight',
    title: 'Start Fight',
    icon: '💥',
    description: 'Escalate tension. Risky — may backfire.',
    category: 'aggressive',
    baseCost: 3,
    successWeight: 1,
    outcomeTag: 'conflict',
    availabilityHint: 'Risky — may backfire',
  },
  // Actions referenced by socialConfig.ts (used by SocialPolicy).
  {
    id: 'ally',
    title: 'Form Alliance',
    icon: '🤝',
    description: 'Propose a formal alliance with another player.',
    category: 'alliance',
    baseCost: 3,
    successWeight: 1,
    outcomeTag: 'alliance',
  },
  {
    id: 'protect',
    title: 'Offer Protection',
    icon: '🛡️',
    description: 'Promise safety to a vulnerable houseguest.',
    category: 'friendly',
    baseCost: 2,
    successWeight: 2,
  },
  {
    id: 'betray',
    title: 'Betray Ally',
    icon: '🗡️',
    description: 'Break an existing alliance for personal gain.',
    category: 'aggressive',
    baseCost: 3,
    successWeight: 1,
    outcomeTag: 'betrayal',
    availabilityHint: 'High-risk betrayal',
  },
  {
    id: 'nominate',
    title: 'Nominate Player',
    icon: '🎯',
    description: 'Strategically name a target for eviction.',
    category: 'strategic',
    baseCost: { energy: 1 },
    successWeight: 2,
  },
  {
    id: 'idle',
    title: 'Stay Idle',
    icon: '😴',
    description: 'Wait and observe. Costs nothing.',
    category: 'strategic',
    baseCost: 0,
    successWeight: 1,
    needsTargets: false,
  },
];
