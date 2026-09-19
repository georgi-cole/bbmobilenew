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
  getSocialGuideLevel,
  isTutorialGuidePending,
  setTutorialReplayEnabled,
} from '../../../onboarding/tutorialGuidePreference'

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

describe('adaptive Social first-use tutorial', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  it('teaches Normal Social first, then offers only the Reality upgrade chapter', () => {
    const normalStore = makeStore({ vipOwned: false })
    renderPanel(normalStore)

    const normalPrompt = screen.getByTestId('reality-social-tutorial-prompt')
    expect(normalPrompt).toHaveAttribute('data-variant', 'normal')
    expect(screen.getByText('Welcome to Social')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))

    expect(getSocialGuideLevel('profile-a', false)).toBe(1)
    expect(isTutorialGuidePending('profile-a', false, 'social')).toBe(false)

    cleanup()

    const vipStore = makeStore({ vipOwned: true })
    renderPanel(vipStore)

    const upgradePrompt = screen.getByTestId('reality-social-tutorial-prompt')
    expect(upgradePrompt).toHaveAttribute('data-variant', 'reality-upgrade')
    expect(screen.getByText('Reality Mode is on')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quick tour' }))

    const upgradeTour = screen.getByTestId('reality-social-tutorial')
    expect(upgradeTour).toHaveAttribute('data-variant', 'reality-upgrade')
  })

  it('shows the full Reality guide when Reality is active on the first Social open', () => {
    const store = makeStore({ vipOwned: true })
    renderPanel(store)

    const prompt = screen.getByTestId('reality-social-tutorial-prompt')
    expect(prompt).toHaveAttribute('data-variant', 'reality')
    expect(screen.getByText('Welcome to Reality Social')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))

    expect(getSocialGuideLevel('profile-a', false)).toBe(2)

    cleanup()
    renderPanel(makeStore({ vipOwned: true }))

    expect(screen.queryByTestId('reality-social-tutorial-prompt')).toBeNull()
  })

  it('re-arms Social once when the centralized replay toggle is enabled', () => {
    const firstStore = makeStore({ vipOwned: true })
    renderPanel(firstStore)
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }))
    cleanup()

    setTutorialReplayEnabled('profile-a', false, true)
    const replayStore = makeStore({ vipOwned: true })
    renderPanel(replayStore)

    expect(screen.getByTestId('reality-social-tutorial-prompt')).toHaveAttribute(
      'data-variant',
      'reality'
    )
  })
})
