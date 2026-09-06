import { describe, expect, it } from 'vitest'
import gameReducer, {
  advance,
  createInitialGameState,
  requestPublicModeChange,
  setPhase,
} from '../gameSlice'

describe('in-season Public Mode activation', () => {
  it('queues an enabled setting until the next Day Start without changing the active cycle', () => {
    const activeCycle = {
      ...createInitialGameState({ seed: 1901 }),
      phase: 'social_1' as const,
      publicModeEnabled: false,
      pendingPublicModeEnabled: null,
    }

    const queued = gameReducer(activeCycle, requestPublicModeChange(true))

    expect(queued.publicModeEnabled).toBe(false)
    expect(queued.pendingPublicModeEnabled).toBe(true)
    expect(queued.phase).toBe('social_1')

    const nextDay = gameReducer({ ...queued, phase: 'week_end' }, advance())

    expect(nextDay.phase).toBe('week_start')
    expect(nextDay.publicModeEnabled).toBe(true)
    expect(nextDay.pendingPublicModeEnabled).toBeNull()
    expect(nextDay.tvFeed.some((event) => event.text.includes('Public Mode is now live'))).toBe(
      true
    )
  })

  it('applies the setting immediately when the game is already at a safe boundary', () => {
    const dayStart = gameReducer(createInitialGameState({ seed: 1902 }), setPhase('week_start'))
    const updated = gameReducer(
      { ...dayStart, publicModeEnabled: false, pendingPublicModeEnabled: null },
      requestPublicModeChange(true)
    )

    expect(updated.publicModeEnabled).toBe(true)
    expect(updated.pendingPublicModeEnabled).toBeNull()
  })

  it('keeps the current cycle intact when disabling, then turns Public Mode off at the next Day Start', () => {
    const activeCycle = {
      ...createInitialGameState({ seed: 1903 }),
      phase: 'social_2' as const,
      publicModeEnabled: true,
      pendingPublicModeEnabled: null,
    }

    const queued = gameReducer(activeCycle, requestPublicModeChange(false))

    expect(queued.publicModeEnabled).toBe(true)
    expect(queued.pendingPublicModeEnabled).toBe(false)

    const nextDay = gameReducer({ ...queued, phase: 'week_end' }, advance())

    expect(nextDay.phase).toBe('week_start')
    expect(nextDay.publicModeEnabled).toBe(false)
    expect(nextDay.pendingPublicModeEnabled).toBeNull()
    expect(nextDay.tvFeed.some((event) => event.text.includes('Public Mode is now off'))).toBe(true)
  })
})
