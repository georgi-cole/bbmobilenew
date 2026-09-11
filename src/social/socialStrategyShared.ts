import type { MiddlewareAPI } from '@reduxjs/toolkit'
import type { GameState, Player } from '../types'
import type { SocialState } from './types'

export type StrategyApi = Pick<MiddlewareAPI, 'dispatch'>

export type StrategyState = {
  game: GameState
  social: SocialState
  challenge?: {
    history?: Array<{
      partial?: boolean
      participants?: string[]
    }>
  }
}

export interface BehaviorPressure {
  partialExitCount: number
  quietStreak: number
  exitPressure: number
  quietPressure: number
  total: number
}

export interface DayEndPlan {
  pressure: BehaviorPressure
  observerIds: string[]
  misinformationListenerIds: string[]
}

function hashString(source: string): number {
  let value = 2166136261
  for (const character of source) {
    value ^= character.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

export function seededUnit(seed: number, salt: string): number {
  let value = (seed ^ hashString(salt)) >>> 0
  value += 0x6d2b79f5
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

export function activeStrategyPlayers(state: StrategyState): Player[] {
  return state.game.players.filter(
    (player) => player.status !== 'evicted' && player.status !== 'jury'
  )
}

export function strategyHumanPlayer(state: StrategyState): Player | null {
  return activeStrategyPlayers(state).find((player) => player.isUser) ?? null
}

export function strategyAffinity(state: StrategyState, sourceId: string, targetId: string): number {
  return state.social.relationships[sourceId]?.[targetId]?.affinity ?? 0
}

export function strategyTags(
  state: StrategyState,
  sourceId: string,
  targetId: string
): Set<string> {
  return new Set(state.social.relationships[sourceId]?.[targetId]?.tags ?? [])
}

export function isActiveStrategyNemesis(
  state: StrategyState,
  ownerId: string,
  targetId: string
): boolean {
  return Object.values(state.social.reality?.relationshipAutonomy?.nemeses ?? {}).some(
    (nemesis) =>
      nemesis.status === 'ACTIVE' && nemesis.ownerId === ownerId && nemesis.targetId === targetId
  )
}

export function sortScoredPlayers(
  left: { player: Player; score: number },
  right: { player: Player; score: number }
): number {
  return right.score - left.score || left.player.id.localeCompare(right.player.id)
}
