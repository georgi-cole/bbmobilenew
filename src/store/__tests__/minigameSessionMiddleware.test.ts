import { describe, expect, it, vi } from 'vitest'
import { minigameSessionMiddleware } from '../minigameSessionMiddleware'

describe('minigameSessionMiddleware', () => {
  it('clears all minigame state immediately after a season reset', () => {
    const dispatch = vi.fn()
    const next = vi.fn((action) => action)
    const invoke = minigameSessionMiddleware({
      dispatch,
      getState: vi.fn(),
    } as never)(next)
    const resetAction = { type: 'game/resetGame' }

    expect(invoke(resetAction)).toBe(resetAction)
    expect(next).toHaveBeenCalledWith(resetAction)
    expect(dispatch.mock.calls.map(([action]) => action.type)).toContain(
      'majorityRules/resetMajorityRules'
    )
    expect(dispatch).toHaveBeenCalledTimes(14)
  })

  it('does not reset minigames for unrelated actions', () => {
    const dispatch = vi.fn()
    const next = vi.fn((action) => action)
    const invoke = minigameSessionMiddleware({
      dispatch,
      getState: vi.fn(),
    } as never)(next)

    invoke({ type: 'game/advanceWeek' })

    expect(dispatch).not.toHaveBeenCalled()
  })
})
