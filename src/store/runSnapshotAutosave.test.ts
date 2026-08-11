import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SavedSeasonSnapshot } from './saveStatePersistence'
import {
  createRunSnapshotAutosaveController,
  RUN_SNAPSHOT_AUTOSAVE_DELAY_MS,
} from './runSnapshotAutosave'

function snapshot(
  runId: string,
  week: number,
  mode: 'classic' | 'survival' = 'classic'
): SavedSeasonSnapshot {
  return {
    version: 1,
    profileId: 'profile-1',
    savedAt: `2026-08-11T20:00:${String(week).padStart(2, '0')}.000Z`,
    game: {
      mode,
      week,
      status: 'active',
      runId,
      gameId: runId,
      players: [],
    },
    finale: {},
    social: {},
  } as SavedSeasonSnapshot
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('runSnapshotAutosave', () => {
  it('coalesces rapid updates for one run and persists only the newest snapshot', () => {
    vi.useFakeTimers()
    const save = vi.fn(() => true)
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 2))
    controller.schedule('profile-1', snapshot('classic-run', 3))
    controller.schedule('profile-1', snapshot('classic-run', 4))

    expect(save).not.toHaveBeenCalled()
    expect(controller.pendingCount()).toBe(1)

    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[1].game.week).toBe(4)
    expect(controller.pendingCount()).toBe(0)
  })

  it('keeps different run slots independent inside the same save window', () => {
    vi.useFakeTimers()
    const save = vi.fn(() => true)
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 2, 'classic'))
    controller.schedule('profile-1', snapshot('survival-run', 9, 'survival'))

    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).toHaveBeenCalledTimes(2)
    expect(save.mock.calls.map((call) => call[1].game.runId)).toEqual([
      'classic-run',
      'survival-run',
    ])
  })

  it('flushes synchronously for lifecycle boundaries', () => {
    vi.useFakeTimers()
    const save = vi.fn(() => true)
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 5))
    controller.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[1].game.week).toBe(5)
    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('can discard a run that was cleared before its pending autosave fires', () => {
    vi.useFakeTimers()
    const save = vi.fn(() => true)
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 6))
    controller.discard('profile-1', 'classic')
    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).not.toHaveBeenCalled()
    expect(controller.pendingCount()).toBe(0)
  })
})
