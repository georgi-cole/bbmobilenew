import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router'
import Settings from '../src/screens/Settings/Settings'
import SettingsAdmin from '../src/screens/SettingsAdmin/SettingsAdmin'
import { APP_VERSION } from '../src/appVersion'
import gameReducer from '../src/store/gameSlice'
import settingsReducer, { setGameUX } from '../src/store/settingsSlice'
import vipReducer, { initializeVip } from '../src/store/vipSlice'
import { restartApp } from '../src/utils/restartApp'
import { I18nProvider } from '../src/i18n'
import profilesReducer from '../src/store/profilesSlice'

vi.mock('../src/utils/restartApp', () => ({
  restartApp: vi.fn(),
}))

function makeStore(
  vipActive = false,
  publicModeOwned = false,
  tribunalHouseOwned = false,
  dramaModeOwned = false
) {
  const store = configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      vip: vipReducer,
      profiles: profilesReducer,
    },
  })
  if (vipActive || publicModeOwned || tribunalHouseOwned || dramaModeOwned) {
    store.dispatch(
      initializeVip.fulfilled(
        {
          billingAvailable: true,
          isActive: vipActive,
          entitlements: {
            survivalMode: false,
            publicMode: publicModeOwned,
            tribunalHouse: tribunalHouseOwned,
            dramaMode: dramaModeOwned,
            noAds: false,
          },
          products: {},
          verifiedAt: new Date().toISOString(),
        },
        'vip-test'
      )
    )
  }
  return store
}

function renderSettings(
  initialEntries = ['/settings'],
  vipActive = false,
  publicModeOwned = false,
  tribunalHouseOwned = false,
  dramaModeOwned = false,
  dramaModeActive = false
) {
  const store = makeStore(vipActive, publicModeOwned, tribunalHouseOwned, dramaModeOwned)
  if (dramaModeActive) {
    store.dispatch(setGameUX({ dramaMode: true, dramaModeAdminOverride: true }))
  }
  render(
    <Provider store={store}>
      <I18nProvider>
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
          <Routes>
            <Route path="/game" element={<div>Game route</div>} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </Provider>
  )
  return { store }
}

function renderSettingsAdmin(initialEntries = ['/settingsatiste']) {
  const store = makeStore()
  render(
    <Provider store={store}>
      <I18nProvider>
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
          <Routes>
            <Route path="/game" element={<div>Game route</div>} />
            <Route path="/settingsatiste" element={<SettingsAdmin />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </Provider>
  )
  return { store }
}

describe('Settings screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
  })

  it('uses the back button as a normal navigation action', async () => {
    renderSettings(['/game', '/settings'])

    fireEvent.click(screen.getByRole('button', { name: /go back/i }))

    await waitFor(() => {
      expect(screen.getByText('Game route')).toBeTruthy()
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('replaces the comp-selection save button with the general save flow', async () => {
    const { store } = renderSettingsAdmin()

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }))

    await waitFor(() => {
      expect(screen.getByText(/comp selection/i)).toBeTruthy()
    })

    expect(screen.queryByRole('button', { name: /save selection/i })).toBeNull()

    fireEvent.change(screen.getByLabelText(/cast size/i), {
      target: { value: '6' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(store.getState().settings.gameUX.castSize).toBe(6)
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/settings saved\. restart the game now/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /not now/i }))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('hard restarts the app from the save confirmation prompt', async () => {
    renderSettingsAdmin()

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }))

    expect(vi.mocked(restartApp)).toHaveBeenCalledWith('#/game')
  })

  it('shows only the compact mode toggle in advanced Settings', async () => {
    const { store } = renderSettingsAdmin()

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/toggle compact mode/i)).toBeTruthy()
    })

    const compactRosterToggle = screen.getByLabelText(/toggle compact mode/i)
    if (!(compactRosterToggle as HTMLInputElement).checked) {
      fireEvent.click(compactRosterToggle)
    }

    await waitFor(() => {
      expect(store.getState().settings.gameUX.compactRoster).toBe(true)
    })

    expect(screen.queryByLabelText(/compact roster layout/i)).toBeNull()
  })

  it('persists a Reality Mode admin override from Advanced Settings', async () => {
    const { store } = renderSettingsAdmin()

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }))
    const dramaModeToggle = await screen.findByLabelText(/toggle reality mode/i)
    fireEvent.click(dramaModeToggle)

    expect(store.getState().settings.gameUX.dramaMode).toBe(true)
    expect(store.getState().settings.gameUX.dramaModeAdminOverride).toBe(true)
  })

  it('shows Public Mode in normal Settings as a store-gated toggle', async () => {
    const { store } = renderSettings()

    const publicModeToggle = screen.getByLabelText(/toggle public mode/i)
    expect(publicModeToggle).not.toBeChecked()
    expect(screen.getAllByText('Store').length).toBeGreaterThan(0)

    fireEvent.click(publicModeToggle)

    expect(store.getState().settings.sim.publicMode).toBe(false)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(
      screen.getByText(/public mode is available as a permanent one-time purchase/i)
    ).toBeTruthy()
    expect(screen.queryByText(/advanced settings/i)).toBeNull()
  })

  it('allows a VIP owner to change Public Mode', () => {
    const { store } = renderSettings(['/settings'], true)
    const publicModeToggle = screen.getByLabelText(/toggle public mode/i)

    expect(publicModeToggle).not.toBeChecked()
    fireEvent.click(publicModeToggle)

    expect(store.getState().settings.sim.publicMode).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('allows a standalone Public Mode owner to change Public Mode without VIP', () => {
    const { store } = renderSettings(['/settings'], false, true)
    const publicModeToggle = screen.getByLabelText(/toggle public mode/i)

    fireEvent.click(publicModeToggle)

    expect(store.getState().settings.sim.publicMode).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('gates Reality Mode for standard users', () => {
    const { store } = renderSettings()
    const dramaModeToggle = screen.getByLabelText(/toggle reality mode/i)

    fireEvent.click(dramaModeToggle)

    expect(store.getState().settings.gameUX.dramaMode).toBe(false)
    expect(
      screen.getByText(/reality mode is available as a permanent one-time purchase/i)
    ).toBeTruthy()
  })

  it('shows and allows disabling Reality Mode when debug settings enabled it', () => {
    const { store } = renderSettings(['/settings'], false, false, false, false, true)
    const dramaModeToggle = screen.getByLabelText(/toggle reality mode/i) as HTMLInputElement

    expect(dramaModeToggle.checked).toBe(true)
    fireEvent.click(dramaModeToggle)

    expect(store.getState().settings.gameUX.dramaMode).toBe(false)
    expect(store.getState().settings.gameUX.dramaModeAdminOverride).toBe(false)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('allows a standalone Reality Mode owner to enable it without VIP', () => {
    const { store } = renderSettings(['/settings'], false, false, false, true)

    fireEvent.click(screen.getByLabelText(/toggle reality mode/i))

    expect(store.getState().settings.gameUX.dramaMode).toBe(true)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows Reality details only when the owned mode is turned on', () => {
    const { store } = renderSettings(['/settings'], false, false, false, true)

    expect(screen.queryByLabelText(/reality style/i)).toBeNull()
    expect(screen.queryByLabelText(/romance storylines/i)).toBeNull()

    fireEvent.click(screen.getByLabelText(/toggle reality mode/i))

    const preset = screen.getByLabelText(/reality style/i) as HTMLSelectElement
    expect(preset.value).toBe('tv')
    expect(screen.getByLabelText(/romance storylines/i)).toBeTruthy()
    expect(Array.from(preset.options).find((option) => option.value === 'adult')?.disabled).toBe(
      true
    )

    fireEvent.change(preset, { target: { value: 'casual' } })
    expect(store.getState().settings.gameUX.realityModePreset).toBe('casual')
  })

  it('lets Advanced Settings manage Reality details while the mode is off', async () => {
    renderSettingsAdmin()
    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }))

    const preset = (await screen.findByLabelText(/reality style/i)) as HTMLSelectElement
    expect(preset.value).toBe('tv')
    expect(Array.from(preset.options).find((option) => option.value === 'adult')?.disabled).toBe(
      true
    )
    expect(screen.getByLabelText(/romance storylines/i)).toBeTruthy()
  })

  it('does not expose the unreleased Tribunal House setting', () => {
    renderSettings()
    expect(screen.queryByLabelText(/toggle tribunal house/i)).toBeNull()
  })

  it('keeps VIP themes locked for standard users', () => {
    const { store } = renderSettings()
    const theme = screen.getByLabelText(/^theme$/i)

    expect(screen.getByRole('option', { name: /neon.*vip/i })).toBeTruthy()
    fireEvent.change(theme, { target: { value: 'neon' } })

    expect(store.getState().settings.display.themePreset).toBe('midnight')
    expect(
      screen.getByText(/vip themes is available as a permanent one-time purchase/i)
    ).toBeTruthy()
  })

  it('allows a VIP owner to select a VIP theme', () => {
    const { store } = renderSettings(['/settings'], true)
    fireEvent.change(screen.getByLabelText(/^theme$/i), { target: { value: 'neon' } })

    expect(store.getState().settings.display.themePreset).toBe('neon')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the renamed brand and twist copy in the UI', async () => {
    renderSettingsAdmin()

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }))
    const twistsToggle = screen.getByLabelText(/toggle twists/i)
    if (!(twistsToggle as HTMLInputElement).checked) {
      fireEvent.click(twistsToggle)
    }

    await waitFor(() => {
      expect(screen.getByText(/special safety chance/i)).toBeTruthy()
    })

    expect(screen.getByText("Public's Favorite (Public Vote)")).toBeTruthy()
    const favoritePlayerToggle = screen.getByLabelText(/toggle public's favorite player vote/i)
    if (!(favoritePlayerToggle as HTMLInputElement).checked) {
      fireEvent.click(favoritePlayerToggle)
    }
    expect(screen.getByText(/award amount — 25000 eyeoleans/i)).toBeTruthy()
    expect(screen.getByText(/eyeolean prize awarded to the public's favorite player/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: /about/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /the big eye/i })).toBeTruthy()
    })
    expect(screen.getByText(`Version ${APP_VERSION}`)).toBeTruthy()
  })

  it('loads the requested default Game UX configuration for a fresh store', async () => {
    renderSettingsAdmin()

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }))

    await waitFor(() => {
      expect(screen.getByText(/back 2 the game chance — 85%/i)).toBeTruthy()
    })

    expect(screen.getByLabelText(/toggle confirm major actions/i)).toBeChecked()
    expect(screen.getByLabelText(/toggle show tooltips/i)).toBeChecked()
    expect(screen.getByLabelText(/toggle compact mode/i)).not.toBeChecked()
    expect(screen.getByLabelText(/toggle haptic feedback/i)).toBeChecked()
    expect(screen.getByLabelText(/toggle animations/i)).toBeChecked()
    expect(screen.getByLabelText(/toggle public mode/i)).not.toBeChecked()
    expect(screen.getByLabelText(/toggle twists/i)).toBeChecked()
    expect(screen.getByText(/double elimination chance — 35%/i)).toBeTruthy()
    expect(screen.getByText(/special safety chance — 75%/i)).toBeTruthy()
    expect(screen.getByLabelText(/toggle public's favorite player vote/i)).toBeChecked()
    expect(
      (screen.getByLabelText(/public's favorite award amount/i) as HTMLInputElement).value
    ).toBe('25000')
    expect(screen.getByLabelText(/toggle spectator mode/i)).toBeChecked()
    expect(screen.getByLabelText(/toggle tribunal house/i)).not.toBeChecked()
    expect((screen.getByLabelText(/cast size/i) as HTMLInputElement).value).toBe('16')
    expect((screen.getByLabelText(/selection mode/i) as HTMLSelectElement).value).toBe(
      'competition-map'
    )
  })

  it('lets QA set a forced secret mission week in debug settings', async () => {
    const { store } = renderSettingsAdmin()

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/secret mission force week \(debug\)/i)).toBeTruthy()
    })

    const forceWeekSlider = screen.getByLabelText(/secret mission force week \(debug\)/i)
    expect(screen.getByText(/secret mission force week — disabled/i)).toBeTruthy()

    fireEvent.change(forceWeekSlider, {
      target: { value: '9' },
    })

    await waitFor(() => {
      expect(store.getState().settings.sim.secretMissionTriggerWeekOverride).toBe(9)
    })
    expect(screen.getByText(/secret mission force week — week 9/i)).toBeTruthy()

    fireEvent.change(forceWeekSlider, {
      target: { value: '0' },
    })

    await waitFor(() => {
      expect(store.getState().settings.sim.secretMissionTriggerWeekOverride).toBeNull()
    })
    expect(screen.getByText(/secret mission force week — disabled/i)).toBeTruthy()
  })
})
