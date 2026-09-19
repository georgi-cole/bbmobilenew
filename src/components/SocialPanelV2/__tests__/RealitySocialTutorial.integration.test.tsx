import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'
import { Provider } from 'react-redux'
import gameReducer from '../../../store/gameSlice'
import settingsReducer from '../../../store/settingsSlice'
import profilesReducer from '../../../store/profilesSlice'
import vipReducer from '../../../store/vipSlice'
import socialReducer, { openSocialPanel } from '../../../social/socialSlice'
import { I18nProvider } from '../../../i18n/I18nProvider'
import SocialPanelV2 from '../SocialPanelV2'
import {
  markRealitySocialTutorialHandled,
  realitySocialTutorialStorageKey,
} from '../../../onboarding/realitySocialTutorialPreference'

function makeStore({ vipOwned }: { vipOwned: boolean }) {
  const base = configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      profiles: profilesReducer,
      vip: vipReducer,
      social: socialReducer,
    },
  })
  const initial = base.getState()
  const profile = {
    id: 'profile-a',
    name: 'Player',
    avatar: '👤',
    createdAt: '2026-01-01T00:00:00.000Z',
  }

  const preloadedState: typeof initial = {
    ...initial,
    game: {
      ...initial.game,
      phase: 'social_1',
    },
    settings: {
      ...initial.settings,
      gameUX: {
        ...initial.settings.gameUX,
        dramaMode: vipOwned,
      },
    },
    profiles: {
      profiles: [profile],
      activeProfileId: profile.id,
      isGuest: false,
    },
    vip: {
      ...initial.vip,
      status: 'ready',
      isActive: vipOwned,
      entitlements: {
        ...initial.vip.entitlements,
        dramaMode: vipOwned,
      },
    },
  }

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      profiles: profilesReducer,
      vip: vipReducer,
      social: socialReducer,
    },
    preloadedState,
  })
}

function renderPanel(store: ReturnType<typeof makeStore>) {
  act(() => {
    store.dispatch(openSocialPanel())
  })
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <I18nProvider>
          <SocialPanelV2 />
        </I18nProvider>
      </Provider>
    </MemoryRouter>
  )
}

describe('Reality Social first-use tutorial', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not consume the premium tutorial when Social is used before upgrading', () => {
    const normalStore = makeStore({ vipOwned: false })
    renderPanel(normalStore)

    expect(screen.queryByTestId('reality-social-tutorial-prompt')).toBeNull()
    expect(screen.queryByTestId('reality-social-tutorial')).toBeNull()
    expect(window.localStorage.getItem(realitySocialTutorialStorageKey('profile-a'))).toBeNull()

    cleanup()

    const vipStore = makeStore({ vipOwned: true })
    renderPanel(vipStore)

    expect(screen.getByTestId('reality-social-tutorial-prompt')).toBeInTheDocument()
    expect(screen.getByText('Welcome to Reality Social')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quick tour' }))

    expect(screen.queryByTestId('reality-social-tutorial-prompt')).toBeNull()
    expect(screen.getByTestId('reality-social-tutorial')).toBeInTheDocument()
  })

  it('does not reopen after that profile has handled the guide', () => {
    markRealitySocialTutorialHandled('profile-a', false)

    const store = makeStore({ vipOwned: true })
    renderPanel(store)

    expect(screen.queryByTestId('reality-social-tutorial-prompt')).toBeNull()
    expect(screen.queryByTestId('reality-social-tutorial')).toBeNull()
  })
})
