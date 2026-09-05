import type { PlayerStatus } from '../types'
import { evaluateSocialActionEligibility } from './socialActionEligibility'
import { resolveActionTargetMode, type SocialActionDefinition } from './socialActions'
import { getEffectiveSocialMode } from './socialMode'
import type { DramaSocialNetwork, RelationshipsMap } from './types'
import { isActionAllowedForRealityPreset } from './socialActionManager'

interface SocialExecutionState {
  game?: {
    phase?: string
    week?: number
    dramaSocialMode?: boolean
    players?: Array<{ id: string; status: string; isUser?: boolean }>
    voxPopuli?: { status?: 'inactive' | 'scheduled' | 'active' | 'complete' } | null
  }
  settings?: { gameUX?: { dramaMode?: boolean; realityModePreset?: string } }
  vip?: {
    isActive?: boolean
    entitlements?: { dramaMode?: boolean }
  }
  social?: {
    relationships?: RelationshipsMap
    dramaNetwork?: DramaSocialNetwork
  }
}

export interface SocialExecutionSelection {
  action: SocialActionDefinition
  actorId: string
  targetIds?: readonly string[]
  subjectId?: string
  requireCompleteSelection?: boolean
  allowAIOnly?: boolean
}

/**
 * One caller-facing gate shared by UI and AI. SocialManeuvers keeps its own
 * affordability and mutation guards; this function prevents stale or invalid
 * selections from ever reaching it in either Normal or Drama mode.
 */
export function validateSocialExecution(
  state: SocialExecutionState,
  selection: SocialExecutionSelection
) {
  if (state.game?.voxPopuli?.status === 'active' && selection.action.unavailableInVox) {
    return { eligible: false, reason: 'This action does not apply to Vox Populi rules.' }
  }
  const realityPreset = state.settings?.gameUX?.realityModePreset
  if (realityPreset && !isActionAllowedForRealityPreset(selection.action, realityPreset)) {
    return { eligible: false, reason: 'Unavailable for the selected Reality intensity.' }
  }
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const targetMode = resolveActionTargetMode(selection.action, dramaMode)
  const targetIds = targetMode === 'none' ? [] : (selection.targetIds ?? [])
  const players = state.game?.players ?? []
  const actorStatus = players.find((player) => player.id === selection.actorId)?.status as
    | PlayerStatus
    | undefined
  const primaryTargetStatus = targetIds.length
    ? (players.find((player) => player.id === targetIds[0])?.status as PlayerStatus | undefined)
    : null

  return evaluateSocialActionEligibility({
    action: selection.action,
    actorId: selection.actorId,
    targetIds,
    subjectId: selection.subjectId,
    phase: state.game?.phase,
    week: state.game?.week,
    players,
    actorStatus,
    primaryTargetStatus,
    relationships: state.social?.relationships,
    dramaNetwork: state.social?.dramaNetwork,
    dramaMode,
    requireCompleteSelection: selection.requireCompleteSelection ?? true,
    allowAIOnly: selection.allowAIOnly ?? false,
  })
}

export function createDeterministicSocialRandom(seedParts: readonly unknown[]): () => number {
  let state =
    seedParts
      .map((part) => String(part ?? ''))
      .join('|')
      .split('')
      .reduce(
        (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) | 0,
        0x9e3779b9
      ) >>> 0

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x1_0000_0000
  }
}
