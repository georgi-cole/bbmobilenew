import { describe, expect, it } from 'vitest'
import { resolveGameManagerRule, type GameManagerRule } from './gameManager'

const baseRule: GameManagerRule = {
  id: 'base',
  enabled: true,
  priority: 10,
  trigger: 'day',
  day: 4,
  competition: 'LOH',
  selection: 'random',
  outcome: 'play',
}

describe('resolveGameManagerRule', () => {
  it('uses only matching enabled rules and honors their priority', () => {
    const result = resolveGameManagerRule(
      {
        enabled: true,
        rules: [
          baseRule,
          { ...baseRule, id: 'disabled', priority: 100, enabled: false },
          { ...baseRule, id: 'pos', priority: 90, competition: 'POS' },
          { ...baseRule, id: 'winning-rule', priority: 20, selection: 'game', gameKey: 'quickTap' },
        ],
      },
      { day: 4, playerCount: 12, competition: 'LOH' }
    )

    expect(result?.id).toBe('winning-rule')
  })

  it('matches player-count rules and can be globally disabled', () => {
    const playerRule: GameManagerRule = {
      ...baseRule,
      id: 'final-five',
      trigger: 'players',
      playerCount: 5,
      day: undefined,
      competition: 'any',
    }

    expect(
      resolveGameManagerRule(
        { enabled: true, rules: [playerRule] },
        { day: 8, playerCount: 5, competition: 'POS' }
      )?.id
    ).toBe('final-five')
    expect(
      resolveGameManagerRule(
        { enabled: false, rules: [playerRule] },
        { day: 8, playerCount: 5, competition: 'POS' }
      )
    ).toBeNull()
  })
})
