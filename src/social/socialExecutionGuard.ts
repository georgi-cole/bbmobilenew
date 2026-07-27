import { evaluateSocialActionEligibility } from './socialActionEligibility'
import { resolveActionTargetMode, type SocialActionDefinition } from './socialActions'
import { getEffectiveSocialMode } from './socialMode'
import type { DramaSocialNetwork, RelationshipsMap } from './types'

interface SocialExecutionState {
  game?: {
    phase?: string
    dramaSocialMode?: boolean
    players?: Array<{ id: string; status: string; isUser?: boolean }>
  }
  settings?: { gameUX?: { dramaMode?: boolean } }
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
  const dramaMode = getEffectiveSocialMode(state) === 'drama'
  const targetMode = resolveActionTargetMode(selection.action, dramaMode)
  const targetIds = targetMode === 'none' ? [] : (selection.targetIds ?? [])
  const players = state.game?.players ?? []
  const actorStatus = players.find((player) => player.id === selection.actorId)?.status

  return evaluateSocialActionEligibility({
    action: selection.action,
    actorId: selection.actorId,
    targetIds,
    subjectId: selection.subjectId,
    phase: state.game?.phase,
    players,
    actorStatus,
    primaryTargetStatus:
      targetIds.length > 0
        ? (players.find((player) => player.id === targetIds[0])?.status as never)
        : null,
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
