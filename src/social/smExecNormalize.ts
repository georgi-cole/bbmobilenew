/**
 * smExecNormalize — cost normalization helpers for SocialManeuvers.
 *
 * Ported from BBMobile's sm-exec-normalize.js.
 *
 * Public API:
 *   normalizeCost(value)           → number (energy units)
 *   normalizeActionCost(action)    → number (energy units for the action)
 *   normalizeAuxCost(value, field) → number (auxiliary resource units)
 *   normalizeActionCosts(action)   → { energy, influence, info }
 */

import type { SocialActionDefinition } from './socialActions';

type CostValue =
  | number
  | { energy?: number; influence?: number; info?: number }
  | undefined
  | null;

/**
 * Coerce an action cost value into a plain energy number.
 * - Undefined / null → 1 (default cost)
 * - number            → returned as-is
 * - object            → `energy` field (must be a finite non-negative number), falling back to 1
 * - any other type    → 1 (default cost)
 */
export function normalizeCost(value: CostValue): number {
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

/**
 * Extract an auxiliary resource cost (influence or info) from a cost value.
 * Returns 0 for plain numbers (energy-only), missing fields, or invalid values.
 */
export function normalizeAuxCost(value: CostValue, field: 'influence' | 'info'): number {
  if (value === undefined || value === null || typeof value === 'number') return 0;
  if (typeof value === 'object') {
    const v = (value as Record<string, unknown>)[field];
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  }
  return 0;
}

/**
 * Convert a float resource value to integer points (×100, rounded).
 * e.g. 1.0 → 100, 0.02 → 2, 2.0 → 200.
 */
function toIntPts(v: number): number {
  return Math.round(v * 100);
}

/**
 * Return the full { energy, influence, info } cost object for a social action.
 * energy defaults to 1 if unspecified; influence and info default to 0.
 * Influence and info are returned as integer points scaled by 100
 * (i.e. 1.00 float == 100 integer pts).
 */
export function normalizeActionCosts(action: SocialActionDefinition): {
  energy: number;
  influence: number;
  info: number;
} {
  return {
    energy: normalizeCost(action.baseCost),
    influence: toIntPts(normalizeAuxCost(action.baseCost, 'influence')),
    info: toIntPts(normalizeAuxCost(action.baseCost, 'info')),
  };
}

/**
 * Return the { influence, info } yields for a social action as integer points
 * scaled by 100.  Absent or zero yields return 0.
 */
export function normalizeActionYields(action: SocialActionDefinition): {
  influence: number;
  info: number;
} {
  const y = action.yields ?? {};
  return {
    influence: toIntPts(y.influence ?? 0),
    info: toIntPts(y.info ?? 0),
  };
}
