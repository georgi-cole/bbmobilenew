import { afterEach, describe, expect, it, vi } from 'vitest'
import { savedRunsKeyForProfile, type SavedSeasonSnapshot } from './saveStatePersistence'
import {
  createRunSnapshotAutosaveController,
  RUN_SNAPSHOT_AUTOSAVE_DELAY_MS,
} from './runSnapshotAutosave'

type SaveRunSnapshot = (profileId: string, snapshot: SavedSeasonSnapshot) => boolean

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
  } as unknown as SavedSeasonSnapshot
}

function createSaveSpy() {
  return vi.fn<SaveRunSnapshot>(() => true)
}

function setRunIdentity(activeRunId: string | null, lastPlayedRunId: string | null, extra = {}) {
  localStorage.setItem(
    savedRunsKeyForProfile('profile-1'),
    JSON.stringify({ version: 2, profileId: 'profile-1', activeRunId, lastPlayedRunId, ...extra })
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('runSnapshotAutosave', () => {
  it('coalesces rapid updates for one run and persists only the newest snapshot', () => {
    vi.useFakeTimers()
    const save = createSaveSpy()
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 2))
    controller.schedule('profile-1', snapshot('classic-run', 3))
    controller.schedule('profile-1', snapshot('classic-run', 4))

    expect(save).not.toHaveBeenCalled()
    expect(controller.pendingCount()).toBe(1)

    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![1].game.week).toBe(4)
    expect(controller.pendingCount()).toBe(0)
  })

  it('keeps different run slots independent inside the same save window', () => {
    vi.useFakeTimers()
    const save = createSaveSpy()
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

  it('does not let the first slot write invalidate another slot in the same flush', () => {
    vi.useFakeTimers()
    setRunIdentity('classic-run', 'classic-run')
    const save = vi.fn<SaveRunSnapshot>((_profileId, nextSnapshot) => {
      setRunIdentity(nextSnapshot.game.runId ?? null, nextSnapshot.game.runId ?? null)
      return true
    })
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 2, 'classic'))
    controller.schedule('profile-1', snapshot('survival-run', 9, 'survival'))
    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).toHaveBeenCalledTimes(2)
  })

  it('flushes synchronously for lifecycle boundaries', () => {
    vi.useFakeTimers()
    const save = createSaveSpy()
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 5))
    controller.flush()

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![1].game.week).toBe(5)
    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('can discard a run that was cleared before its pending autosave fires', () => {
    vi.useFakeTimers()
    const save = createSaveSpy()
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 6))
    controller.discard('profile-1', 'classic')
    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).not.toHaveBeenCalled()
    expect(controller.pendingCount()).toBe(0)
  })

  it('does not resurrect an active run when persistence clears it after autosave was queued', () => {
    vi.useFakeTimers()
    setRunIdentity('classic-run', 'classic-run')
    const save = createSaveSpy()
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 7))
    setRunIdentity(null, null)
    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).not.toHaveBeenCalled()
    expect(controller.pendingCount()).toBe(0)
  })

  it('detects a legacy-run clear that migrates the profile metadata', () => {
    vi.useFakeTimers()
    const save = createSaveSpy()
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('legacy-run', 7))
    setRunIdentity(null, null)
    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).not.toHaveBeenCalled()
  })

  it('allows a genuinely newer snapshot scheduled after persistence changes', () => {
    vi.useFakeTimers()
    setRunIdentity('old-run', 'old-run')
    const save = createSaveSpy()
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('old-run', 7))
    setRunIdentity(null, null)
    controller.schedule('profile-1', snapshot('new-run', 1))
    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![1].game.runId).toBe('new-run')
  })

  it('does not invalidate a queued save when only unrelated metadata changes', () => {
    vi.useFakeTimers()
    setRunIdentity('classic-run', 'classic-run', { stats: { achievement: 'before' } })
    const save = createSaveSpy()
    const controller = createRunSnapshotAutosaveController(save)

    controller.schedule('profile-1', snapshot('classic-run', 8))
    setRunIdentity('classic-run', 'classic-run', { stats: { achievement: 'after' } })
    vi.advanceTimersByTime(RUN_SNAPSHOT_AUTOSAVE_DELAY_MS)

    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![1].game.week).toBe(8)
  })
})
