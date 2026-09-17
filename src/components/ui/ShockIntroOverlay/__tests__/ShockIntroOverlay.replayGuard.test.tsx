import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ShockIntroOverlay from '../ShockIntroOverlay'

function makeStore(shockKey: 'vox_populi' | 'cupid_arrow', eventId: string) {
  const state = {
    game: {
      tvFeed: [
        {
          id: eventId,
          text: `${shockKey} season opening`,
          type: 'twist',
          major: shockKey,
          meta: {
            major: shockKey,
            phase: 'season_start',
            week: 1,
            broadcastConsumed: false,
          },
        },
      ],
    },
  }

  return configureStore({
    reducer: () => state,
  })
}

function renderIntro(
  store: ReturnType<typeof makeStore>,
  shockKey: 'vox_populi' | 'cupid_arrow',
  onComplete: () => void
) {
  return render(
    <Provider store={store}>
      <ShockIntroOverlay active shockKey={shockKey} onComplete={onComplete} />
    </Provider>
  )
}

describe('ShockIntroOverlay season-start replay guard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['vox_populi', 'cupid_arrow'] as const)(
    'does not replay an acknowledged %s fullscreen shock after a route remount',
    async (shockKey) => {
      const store = makeStore(shockKey, `day-1-${shockKey}`)
      const firstComplete = vi.fn()
      const firstRender = renderIntro(store, shockKey, firstComplete)

      fireEvent.click(screen.getByRole('button', { name: 'OK' }))
      expect(firstComplete).toHaveBeenCalledTimes(1)
      firstRender.unmount()

      const remountComplete = vi.fn()
      renderIntro(store, shockKey, remountComplete)

      expect(screen.queryByTestId('shock-intro-overlay')).toBeNull()
      await waitFor(() => expect(remountComplete).toHaveBeenCalled())
    }
  )

  it('does not suppress a new season-start event with a new event id', () => {
    const firstStore = makeStore('vox_populi', 'vox-season-a')
    const firstRender = renderIntro(firstStore, 'vox_populi', vi.fn())
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    firstRender.unmount()

    const nextStore = makeStore('vox_populi', 'vox-season-b')
    renderIntro(nextStore, 'vox_populi', vi.fn())

    expect(screen.getByTestId('shock-intro-overlay')).toBeTruthy()
  })
})
