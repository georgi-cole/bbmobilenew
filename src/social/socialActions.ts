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
  category: ActionCategory;
  /** Energy cost as a plain number or a cost-shape object. */
  baseCost: number | { energy?: number; info?: number };
  /** Optional weight hint for future AI probability weighting. */
  successWeight?: number;
  /** Tag applied to relationship entries when this action fires (e.g. 'betrayal'). */
  outcomeTag?: string;
}

/** Canonical list of social actions available in the game. */
export const SOCIAL_ACTIONS: SocialActionDefinition[] = [
  {
    id: 'compliment',
    title: 'Compliment',
    category: 'friendly',
    baseCost: 1,
    successWeight: 3,
  },
  {
    id: 'rumor',
    title: 'Spread Rumor',
    category: 'aggressive',
    baseCost: 2,
    successWeight: 2,
    outcomeTag: 'rumor',
  },
  {
    id: 'whisper',
    title: 'Whisper',
    category: 'strategic',
    baseCost: { energy: 1, info: 1 },
    successWeight: 2,
  },
  {
    id: 'proposeAlliance',
    title: 'Propose Alliance',
    category: 'alliance',
    baseCost: 3,
    successWeight: 1,
    outcomeTag: 'alliance',
  },
  {
    id: 'startFight',
    title: 'Start Fight',
    category: 'aggressive',
    baseCost: 3,
    successWeight: 1,
    outcomeTag: 'betrayal',
  },
];
