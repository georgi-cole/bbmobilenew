import { describe, expect, it } from 'vitest'
import { deriveBehaviorPressure } from '../socialStrategyMiddleware'

describe('deriveBehaviorPressure', () => {
  it('does not treat one or two competition exits as throwing suspicion', () => {
    expect(deriveBehaviorPressure({ partialExitCount: 1, quietStreak: 0 })).toMatchObject({
      exitPressure: 0,
      total: 0,
    })
    expect(deriveBehaviorPressure({ partialExitCount: 2, quietStreak: 0 })).toMatchObject({
      exitPressure: 0,
      total: 0,
    })
  })

  it('starts competition suspicion on the third early exit', () => {
    expect(deriveBehaviorPressure({ partialExitCount: 3, quietStreak: 0 })).toMatchObject({
      exitPressure: 1,
      total: 1,
    })
    expect(deriveBehaviorPressure({ partialExitCount: 5, quietStreak: 0 })).toMatchObject({
      exitPressure: 3,
      total: 3,
    })
  })

  it('requires a social inactivity streak before adding quiet-game suspicion', () => {
    expect(deriveBehaviorPressure({ partialExitCount: 0, quietStreak: 1 })).toMatchObject({
      quietPressure: 0,
      total: 0,
    })
    expect(deriveBehaviorPressure({ partialExitCount: 0, quietStreak: 2 })).toMatchObject({
      quietPressure: 1,
      total: 1,
    })
  })

  it('combines repeated exits and prolonged social absence without unbounded growth', () => {
    expect(deriveBehaviorPressure({ partialExitCount: 8, quietStreak: 5 })).toEqual({
      partialExitCount: 8,
      quietStreak: 5,
      exitPressure: 3,
      quietPressure: 3,
      total: 6,
    })
  })
})
