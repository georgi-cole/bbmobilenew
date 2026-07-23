import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const persistenceMocks = vi.hoisted(() => ({
  saveRunSnapshot: vi.fn(() => true),
}))

vi.mock('../saveStatePersistence', async () => {
  const actual =
    await vi.importActual<typeof import('../saveStatePersistence')>('../saveStatePersistence')
  return {
    ...actual,
    saveRunSnapshot: persistenceMocks.saveRunSnapshot,
  }
})

describe('store background persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    persistenceMocks.saveRunSnapshot.mockClear()
    localStorage.clear()
    localStorage.setItem(
      'bbmobilenew:profiles:v1',
      JSON.stringify({
        activeProfileId: 'profile-background-save',
        isGuest: false,
        profiles: [
          {
            avatar: 'P',
            createdAt: '2026-07-22T00:00:00.000Z',
            id: 'profile-background-save',
            name: 'Persistence Player',
          },
        ],
      })
    )
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    })
  })

  it('saves meaningful active-profile progress when the app becomes hidden', async () => {
    const [{ store }, { hydrateGame }] = await Promise.all([
      import('../store'),
      import('../gameSlice'),
    ])

    store.dispatch(
      hydrateGame({
        ...store.getState().game,
        runId: 'run-background-save',
        week: 2,
      })
    )
    persistenceMocks.saveRunSnapshot.mockClear()

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))

    expect(persistenceMocks.saveRunSnapshot).toHaveBeenCalledTimes(1)
    expect(persistenceMocks.saveRunSnapshot).toHaveBeenCalledWith(
      'profile-background-save',
      expect.objectContaining({
        game: expect.objectContaining({
          runId: 'run-background-save',
          week: 2,
        }),
        profileId: 'profile-background-save',
        version: 1,
      })
    )
  })
})
