import type { Middleware } from '@reduxjs/toolkit'
import { setEnergyBankEntry } from './socialSlice'

type RelationshipResourceState = {
  social?: {
    energyBank?: Record<string, number>
  }
}

type RelationshipUpdateAction = {
  type: 'social/updateRelationship'
  payload?: {
    source?: string
    tags?: string[]
    actionSource?: 'manual' | 'system'
  }
}

/**
 * Relationship tags describe social state; they must not silently spend Social Energy.
 *
 * Legacy socialMiddleware still applies a -3 energy side effect to manual
 * `betrayal` relationship updates. Alliance/bromance breaks deliberately keep the
 * betrayal tag because the relationship memory and drama systems need it, but the
 * economy now prices those actions separately (0 energy, influence fallout).
 *
 * Keep this policy immediately before socialMiddleware. It snapshots the actor's
 * energy around a manual betrayal-tag update and restores it after the legacy
 * tag-driven side effect runs. Explicit action costs have already been charged by
 * SocialManeuvers before updateRelationship is dispatched, so this restores only
 * the hidden relationship-tag debit rather than refunding the action itself.
 */
export const relationshipResourcePolicyMiddleware: Middleware = (api) => (next) => (action) => {
  if (
    typeof action !== 'object' ||
    action === null ||
    !('type' in action) ||
    (action as RelationshipUpdateAction).type !== 'social/updateRelationship'
  ) {
    return next(action)
  }

  const payload = (action as RelationshipUpdateAction).payload
  const sourceId = payload?.source
  const isManualBetrayal =
    Boolean(sourceId) &&
    payload?.actionSource !== 'system' &&
    payload?.tags?.includes('betrayal') === true

  if (!isManualBetrayal || !sourceId) return next(action)

  const beforeEnergy =
    (api.getState() as RelationshipResourceState).social?.energyBank?.[sourceId] ?? 0
  const result = next(action)
  const afterEnergy =
    (api.getState() as RelationshipResourceState).social?.energyBank?.[sourceId] ?? 0

  if (afterEnergy !== beforeEnergy) {
    api.dispatch(setEnergyBankEntry({ playerId: sourceId, value: beforeEnergy }))
  }

  return result
}
