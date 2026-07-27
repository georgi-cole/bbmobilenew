import { SOCIAL_INITIAL_STATE } from './constants'
import { normalizeDramaSocialNetwork } from './dramaModeEngine'
import { normalizeRelationshipsForTags } from './socialAlliance'
import { SOCIAL_STATE_VERSION, type SocialStateWithHistory } from './socialHistory'
import { getSocialRuntimeConfig } from './socialRuntimeConfig'
import type { SocialActionLogEntry, SocialState } from './types'

export type SocialResourceKind = 'energy' | 'influence' | 'info'

function finiteOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function getSocialResourceCap(kind: SocialResourceKind): number {
  const config = getSocialRuntimeConfig()
  if (kind === 'energy') {
    return Math.max(config.economy.normal.energyCap, config.economy.drama.energyCap)
  }
  return kind === 'influence' ? config.economy.influenceCap : config.economy.infoCap
}

export function clampSocialResource(value: unknown, kind: SocialResourceKind): number {
  return Math.max(0, Math.min(getSocialResourceCap(kind), finiteOrZero(value)))
}

function sanitiseBank(raw: unknown, kind: SocialResourceKind): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const result: Record<string, number> = {}
  for (const [playerId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!playerId) continue
    result[playerId] = clampSocialResource(value, kind)
  }
  return result
}

function cloneInitialState(): SocialState {
  return {
    ...SOCIAL_INITIAL_STATE,
    energyBank: {},
    influenceBank: {},
    infoBank: {},
    relationships: {},
    sessionLogs: [],
    incomingInteractions: [],
    incomingInteractionLogs: [],
    scheduledIncomingInteractions: [],
    incomingInteractionDelivery: {
      ...SOCIAL_INITIAL_STATE.incomingInteractionDelivery,
    },
    socialMemory: {},
    commitments: [],
    dramaNetwork: normalizeDramaSocialNetwork(),
    influenceWeights: {},
    weekStartRelSnapshot: {},
  }
}

/**
 * Upgrade older social saves without discarding fields introduced after they
 * were created. Invalid resource values are repaired instead of poisoning the
 * simulation with negative balances or NaN.
 */
export function migrateSocialState(raw: SocialState): SocialState {
  const input = (raw ?? {}) as SocialStateWithHistory
  const base = cloneInitialState()
  const historyLimit = getSocialRuntimeConfig().history.maxActionHistory
  const legacyHistory = Array.isArray(input.actionHistory)
    ? input.actionHistory
    : Array.isArray(input.sessionLogs)
      ? input.sessionLogs
      : []

  const migrated: SocialStateWithHistory = {
    ...base,
    ...input,
    socialStateVersion: SOCIAL_STATE_VERSION,
    energyBank: sanitiseBank(input.energyBank, 'energy'),
    influenceBank: sanitiseBank(input.influenceBank, 'influence'),
    infoBank: sanitiseBank(input.infoBank, 'info'),
    relationships: normalizeRelationshipsForTags(input.relationships ?? {}),
    sessionLogs: Array.isArray(input.sessionLogs) ? input.sessionLogs : [],
    actionHistory: (legacyHistory as SocialActionLogEntry[]).slice(-historyLimit),
    incomingInteractions: Array.isArray(input.incomingInteractions)
      ? input.incomingInteractions
      : [],
    incomingInteractionLogs: Array.isArray(input.incomingInteractionLogs)
      ? input.incomingInteractionLogs
      : [],
    scheduledIncomingInteractions: Array.isArray(input.scheduledIncomingInteractions)
      ? input.scheduledIncomingInteractions
      : [],
    incomingInteractionDelivery: {
      ...base.incomingInteractionDelivery,
      ...(input.incomingInteractionDelivery ?? {}),
      deliveredThisPhase: Math.max(
        0,
        Math.round(finiteOrZero(input.incomingInteractionDelivery?.deliveredThisPhase))
      ),
    },
    socialMemory:
      input.socialMemory && typeof input.socialMemory === 'object' ? input.socialMemory : {},
    commitments: Array.isArray(input.commitments) ? input.commitments : [],
    dramaNetwork: normalizeDramaSocialNetwork(input.dramaNetwork),
    influenceWeights:
      input.influenceWeights && typeof input.influenceWeights === 'object'
        ? input.influenceWeights
        : {},
    panelOpen: input.panelOpen === true,
    incomingInboxOpen: input.incomingInboxOpen === true,
    weekStartRelSnapshot:
      input.weekStartRelSnapshot && typeof input.weekStartRelSnapshot === 'object'
        ? input.weekStartRelSnapshot
        : {},
  }

  return migrated
}
