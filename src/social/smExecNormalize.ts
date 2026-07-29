/**
 * smExecNormalize — cost normalization helpers for SocialManeuvers.
 *
 * Energy, Influence, and Information are strategic resources in every social
 * intensity. Reality Mode may override the authored price, but Normal Mode
 * uses the base multi-resource price rather than silently zeroing aux costs.
 */

import { resolveActionTargetMode } from './socialActions'
import type { SocialActionDefinition } from './socialActions'

type CostValue = number | { energy?: number; influence?: number; info?: number } | undefined | null

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

export function normalizeAuxCost(value: CostValue, field: 'influence' | 'info'): number {
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
  const authoredCost = dramaMode && action.dramaCost ? action.dramaCost : action.baseCost
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
