import type { Middleware } from '@reduxjs/toolkit'
import type { Player } from '../types'
import { updatePlayer } from './gameSlice'

type RootLike = {
  game: {
    players: Player[]
    dayStartShock?: { targetId: string } | null
    twinShock?: {
      pendingRevealAnimation?:
        | { type: 'combined' }
        | { type: 'ali_enters'; replacedPlayerId: string }
        | null
    }
  }
}

type ActionLike = {
  type?: unknown
  payload?: unknown
}

function payloadPlayerId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  for (const key of ['playerId', 'targetId', 'evicteeId', 'removedPlayerId']) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/** Resolve removals that must never be promoted into the Final Tribunal. */
export function resolveExtraordinaryRemovalPlayerId(
  action: ActionLike,
  before: RootLike
): string | null {
  const type = typeof action.type === 'string' ? action.type : ''

  if (type === 'game/selfEvict') {
    return before.game.players.find((player) => player.isUser)?.id ?? null
  }

  if (type === 'game/confirmDayStartShock') {
    return before.game.dayStartShock?.targetId ?? null
  }

  if (type === 'game/completeTwinShockRevealAnimation') {
    const reveal = before.game.twinShock?.pendingRevealAnimation
    return reveal?.type === 'ali_enters' ? reveal.replacedPlayerId : null
  }

  // Future death/leave/forced-removal reducers can opt in simply by carrying a
  // player ID in their payload; ordinary evictions never match these names.
  const normalized = type.toLowerCase()
  const isExtraordinary =
    normalized.includes('death') ||
    normalized.includes('leavegame') ||
    normalized.includes('forcedremoval') ||
    normalized.includes('extraordinaryremoval')
  return isExtraordinary ? payloadPlayerId(action.payload) : null
}

/**
 * Marks the affected player after the original reducer has committed the
 * removal. Because the flag lives on Player, it is included in normal run
 * persistence and cannot drift from the saved game state.
 */
export const tribunalEligibilityMiddleware: Middleware<unknown, RootLike> =
  (storeApi) => (next) => (action) => {
    const before = storeApi.getState()
    const playerId = resolveExtraordinaryRemovalPlayerId(action as ActionLike, before)
    const result = next(action)

    if (!playerId) return result

    const player = storeApi.getState().game.players.find((candidate) => candidate.id === playerId)
    if (!player || player.tribunalEligible === false) return result

    storeApi.dispatch(updatePlayer({ ...player, tribunalEligible: false }))
    return result
  }
