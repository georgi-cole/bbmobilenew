import { describe, expect, it, vi } from 'vitest'
import { hydrateGame } from '../gameSlice'
import { voxPublicModeSyncMiddleware } from '../voxPublicModeSyncMiddleware'

function runHydrationSync(options: {
  active: boolean
  gamePublicMode: boolean
  settingPublicMode: boolean
}) {
  const state = {
    game: {
      voxPopuli: { status: options.active ? 'active' : 'inactive' },
      publicModeEnabled: options.gamePublicMode,
    },
    settings: {
      sim: { publicMode: options.settingPublicMode },
    },
  }
  const api = {
    getState: () => state,
    dispatch: vi.fn(),
  }
  const next = vi.fn((nextAction) => nextAction)

  voxPublicModeSyncMiddleware(api as never)(next as never)(
    { type: hydrateGame.type, payload: {} } as never
  )

  return { api, next }
}

describe('voxPublicModeSyncMiddleware', () => {
  it('repairs a hydrated active Vox save whose Public Mode setting and game state disagree', () => {
    const { api } = runHydrationSync({
      active: true,
      gamePublicMode: false,
      settingPublicMode: true,
    })

    expect(api.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'game/requestPublicModeChange',
        payload: true,
      })
    )
  })

  it('does not alter non-Vox or already-synchronized saves', () => {
    expect(
      runHydrationSync({ active: false, gamePublicMode: false, settingPublicMode: true }).api.dispatch
    ).not.toHaveBeenCalled()
    expect(
      runHydrationSync({ active: true, gamePublicMode: true, settingPublicMode: true }).api.dispatch
    ).not.toHaveBeenCalled()
  })
})
