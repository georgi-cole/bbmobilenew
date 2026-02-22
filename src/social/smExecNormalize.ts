/**
 * smExecNormalize — cost normalization helpers for SocialManeuvers.
 *
 * Ported from BBMobile's sm-exec-normalize.js.
 *
 * Public API:
 *   normalizeCost(value)        → number (energy units)
 *   normalizeActionCost(action) → number (energy units for the action)
 */

import type { SocialActionDefinition } from './socialActions';

/**
 * Coerce an action cost value into a plain energy number.
 * - Undefined / null → 1 (default cost)
 * - number            → returned as-is
 * - object            → `energy` field (must be a finite non-negative number), falling back to 1
 * - any other type    → 1 (default cost)
 */
export function normalizeCost(
  value: number | { energy?: number; info?: number } | undefined | null,
): number {
  // Default cost for undefined / null
  if (value === undefined || value === null) return 1;

  // If it's already a number, return as-is
  if (typeof value === 'number') return value;

  // For objects, validate the `energy` field
  if (typeof value === 'object') {
    const energy = (value as { energy?: number }).energy;
    if (typeof energy === 'number' && Number.isFinite(energy) && energy >= 0) {
      return energy;
    }
  }

  // Fallback: any unexpected or invalid input yields the default cost
  return 1;
}

/**
 * Return the normalised energy cost for a social action definition.
 */
export function normalizeActionCost(action: SocialActionDefinition): number {
  return normalizeCost(action.baseCost);
}
