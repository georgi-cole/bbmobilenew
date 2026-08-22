import type { GameCategory } from '../minigames/registry'

export type ManagedCompetition = 'LOH' | 'POS' | 'any'
export type GameManagerTrigger = 'day' | 'players'
export type GameManagerSelection = 'random' | 'category' | 'game'
export type GameManagerOutcome = 'play' | 'random' | 'player'

export interface GameManagerRule {
  id: string
  enabled: boolean
  /** Higher numbers win when more than one rule applies. */
  priority: number
  trigger: GameManagerTrigger
  day?: number
  playerCount?: number
  competition: ManagedCompetition
  selection: GameManagerSelection
  category?: GameCategory
  gameKey?: string
  /** Play normally, pick a random winner after the game, or name the winner. */
  outcome: GameManagerOutcome
  winnerId?: string
}

export interface GameManagerConfig {
  enabled: boolean
  rules: GameManagerRule[]
}

export const DEFAULT_GAME_MANAGER_CONFIG: GameManagerConfig = {
  enabled: true,
  rules: [],
}

export function normalizeGameManagerConfig(config?: Partial<GameManagerConfig>): GameManagerConfig {
  return {
    enabled: config?.enabled !== false,
    rules: Array.isArray(config?.rules)
      ? config.rules.filter((rule): rule is GameManagerRule => Boolean(rule?.id))
      : [],
  }
}

export function resolveGameManagerRule(
  config: GameManagerConfig | undefined,
  context: { day: number; playerCount: number; competition: Exclude<ManagedCompetition, 'any'> }
): GameManagerRule | null {
  if (!config?.enabled) return null
  return (
    config.rules
      .filter((rule) => {
        if (!rule.enabled) return false
        if (rule.competition !== 'any' && rule.competition !== context.competition) return false
        return rule.trigger === 'day'
          ? rule.day === context.day
          : rule.playerCount === context.playerCount
      })
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null
  )
}

export function describeGameManagerRule(rule: GameManagerRule): string {
  const when =
    rule.trigger === 'day' ? `Day ${rule.day ?? '?'}` : `${rule.playerCount ?? '?'} players`
  const selection =
    rule.selection === 'game'
      ? (rule.gameKey ?? 'a selected game')
      : rule.selection === 'category'
        ? `${rule.category ?? 'any'} game`
        : 'random game'
  return `${when} · ${rule.competition} · ${selection}`
}
