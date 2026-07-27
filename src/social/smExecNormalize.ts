/**
 * smExecNormalize — cost normalization helpers for SocialManeuvers.
 *
 * Normal Mode deliberately uses one visible resource: Energy. Drama Mode may
 * additionally spend Influence and Intel. The authored action definitions stay
 * backward-compatible, while this boundary ensures Normal cannot accidentally
 * depend on hidden premium currencies.
 */

import { resolveActionTargetMode } from './socialActions'
import type { SocialActionDefinition } from './socialActions'

type CostValue =
  | number
  | { energy?: number; influence?: number; info?: number }
  | undefined
  | null

export function normalizeCost(value: CostValue): number {
  if (value === undefined || value === null) return 1
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? value : 1
  }
  if (typeof value === 'object') {
    const energy = value.energy
    if (typeof energy === 'number' && Number.isFinite(energy) && energy >= 0) {
      return energy
    }
  }
  return 1
}

export function normalizeActionCost(
  action: SocialActionDefinition,
  targetCount = 0,
  dramaMode = false
): number {
  const cost = dramaMode && action.dramaCost ? action.dramaCost : action.baseCost
  const base = normalizeCost(cost)
  if (resolveActionTargetMode(action, dramaMode) !== 'multi' || !action.energyPerTarget) {
    return base
  }
  return Math.max(base, Math.max(0, targetCount) * action.energyPerTarget)
}

export function normalizeAuxCost(
  value: CostValue,
  field: 'influence' | 'info'
): number {
  if (value === undefined || value === null || typeof value === 'number') return 0
  const candidate = value[field]
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
    ? candidate
    : 0
}

const BANK_POINT_SCALE = 100
const DENOMINATED_INFLUENCE_COST_SCALE = 10

function toScaledIntPts(value: number, scale: number): number {
  return Math.round(value * scale)
}

export function normalizeActionCosts(
  action: SocialActionDefinition,
  targetCount = 0,
  dramaMode = false
): {
  energy: number
  influence: number
  info: number
} {
  const energy = normalizeActionCost(action, targetCount, dramaMode)
  if (!dramaMode) return { energy, influence: 0, info: 0 }

  const authoredCost = action.dramaCost ?? action.baseCost
  return {
    energy,
    influence: toScaledIntPts(
      normalizeAuxCost(authoredCost, 'influence'),
      DENOMINATED_INFLUENCE_COST_SCALE
    ),
    info: toScaledIntPts(normalizeAuxCost(authoredCost, 'info'), BANK_POINT_SCALE),
  }
}

export function normalizeActionYields(action: SocialActionDefinition): {
  influence: number
  info: number
} {
  const yields = action.yields ?? {}
  return {
    influence: toScaledIntPts(yields.influence ?? 0, BANK_POINT_SCALE),
    info: toScaledIntPts(yields.info ?? 0, BANK_POINT_SCALE),
  }
}
