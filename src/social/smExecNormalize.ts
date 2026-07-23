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

import { resolveActionTargetMode } from './socialActions';
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
export function normalizeActionCost(
  action: SocialActionDefinition,
  targetCount = 0,
  dramaMode = false,
): number {
  const cost = dramaMode && action.dramaCost ? action.dramaCost : action.baseCost;
  const base = normalizeCost(cost);
  if (resolveActionTargetMode(action, dramaMode) !== 'multi' || !action.energyPerTarget) return base;
  return Math.max(base, Math.max(0, targetCount) * action.energyPerTarget);
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

const BANK_POINT_SCALE = 100;
const DENOMINATED_INFLUENCE_COST_SCALE = 10;

/**
 * Convert a float resource value to integer points using the provided scale.
 * e.g. scale 100: 1.0 → 100, 0.02 → 2, 2.0 → 200.
 */
function toScaledIntPts(v: number, scale: number): number {
  return Math.round(v * scale);
}

/**
 * Return the full { energy, influence, info } cost object for a social action.
 * energy defaults to 1 if unspecified; influence and info default to 0.
 *
 * Cost units are intentionally asymmetric:
 * - influence costs are authored in whole influence units and denominated to ×10
 *   (e.g. 2.0 → 20) so requirements match the single-digit influence economy
 * - info costs remain in the legacy bank-point scale ×100 (e.g. 2.0 → 200)
 *
 * Influence yields are normalized separately by normalizeActionYields and remain
 * authored in legacy fractional bank units (e.g. 0.02 → +2).
 */
export function normalizeActionCosts(
  action: SocialActionDefinition,
  targetCount = 0,
  dramaMode = false,
): {
  energy: number;
  influence: number;
  info: number;
} {
  return {
    energy: normalizeActionCost(action, targetCount, dramaMode),
    influence: toScaledIntPts(normalizeAuxCost(dramaMode && action.dramaCost ? action.dramaCost : action.baseCost, 'influence'), DENOMINATED_INFLUENCE_COST_SCALE),
    info: toScaledIntPts(normalizeAuxCost(dramaMode && action.dramaCost ? action.dramaCost : action.baseCost, 'info'), BANK_POINT_SCALE),
  };
}

/**
 * Return the { influence, info } yields for a social action as integer points
 * scaled by the legacy bank-point scale ×100. Absent or zero yields return 0.
 */
export function normalizeActionYields(action: SocialActionDefinition): {
  influence: number;
  info: number;
} {
  const y = action.yields ?? {};
  return {
    influence: toScaledIntPts(y.influence ?? 0, BANK_POINT_SCALE),
    info: toScaledIntPts(y.info ?? 0, BANK_POINT_SCALE),
  };
}
