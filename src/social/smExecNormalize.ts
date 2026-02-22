/**
 * smExecNormalize — cost normalization helpers for SocialManeuvers.
 *
 * Ported from BBMobile's sm-exec-normalize.js.
 *
 * Public API:
 *   normalizeCost(value)         → number (energy units)
 *   normalizeActionCosts(action) → number (energy units for the action)
 */

import type { SocialActionDefinition } from './socialActions';

/**
 * Coerce an action cost value into a plain energy number.
 * - Undefined / null → 1 (default cost)
 * - number            → returned as-is
 * - object            → `energy` field, falling back to 1
 */
export function normalizeCost(
  value: number | { energy?: number; info?: number } | undefined | null,
): number {
  if (value === undefined || value === null) return 1;
  if (typeof value === 'number') return value;
  return value.energy ?? 1;
}

/**
 * Return the normalised energy cost for a social action definition.
 */
export function normalizeActionCosts(action: SocialActionDefinition): number {
  return normalizeCost(action.baseCost);
}
