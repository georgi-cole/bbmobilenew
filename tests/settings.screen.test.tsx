import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Settings from '../src/screens/Settings/Settings';
import SettingsAdmin from '../src/screens/SettingsAdmin/SettingsAdmin';
import { APP_VERSION } from '../src/appVersion';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import { restartApp } from '../src/utils/restartApp';

vi.mock('../src/utils/restartApp', () => ({
  restartApp: vi.fn(),
}));

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });
}

function renderSettings(initialEntries = ['/settings']) {
  const store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
        <Routes>
          <Route path="/game" element={<div>Game route</div>} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

function renderSettingsAdmin(initialEntries = ['/settingsatiste']) {
  const store = makeStore();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialEntries.length - 1}>
        <Routes>
          <Route path="/game" element={<div>Game route</div>} />
          <Route path="/settingsatiste" element={<SettingsAdmin />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

describe('Settings screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the back button as a normal navigation action', async () => {
    renderSettings(['/game', '/settings']);

    fireEvent.click(screen.getByRole('button', { name: /go back/i }));

    await waitFor(() => {
      expect(screen.getByText('Game route')).toBeTruthy();
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('replaces the comp-selection save button with the general save flow', async () => {
    const { store } = renderSettingsAdmin();

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }));

    await waitFor(() => {
      expect(screen.getByText(/comp selection/i)).toBeTruthy();
    });

    expect(screen.queryByRole('button', { name: /save selection/i })).toBeNull();

    fireEvent.change(screen.getByLabelText(/cast size/i), {
      target: { value: '6' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(store.getState().settings.gameUX.castSize).toBe(6);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/settings saved\. restart the game now/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /not now/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('hard restarts the app from the save confirmation prompt', async () => {
    renderSettingsAdmin();

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));

    expect(vi.mocked(restartApp)).toHaveBeenCalledWith('#/game');
  });

  it('shows only the compact mode toggle in advanced Settings', async () => {
    const { store } = renderSettingsAdmin();

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/toggle compact mode/i)).toBeTruthy();
    });

    const compactRosterToggle = screen.getByLabelText(/toggle compact mode/i);
    if (!(compactRosterToggle as HTMLInputElement).checked) {
      fireEvent.click(compactRosterToggle);
    }

    await waitFor(() => {
      expect(store.getState().settings.gameUX.compactRoster).toBe(true);
    });

    expect(screen.queryByLabelText(/compact roster layout/i)).toBeNull();
  });

  it('shows Public Mode in normal Settings as a VIP-gated toggle', async () => {
    const { store } = renderSettings();

    const publicModeToggle = screen.getByLabelText(/toggle public mode/i);
    expect(publicModeToggle).toBeChecked();
    expect(screen.getByText('VIP')).toBeTruthy();

    fireEvent.click(publicModeToggle);

    expect(store.getState().settings.sim.publicMode).toBe(true);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/public mode is a vip setting/i)).toBeTruthy();
  });

  it('shows the renamed brand and twist copy in the UI', async () => {
    renderSettingsAdmin();

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }));
    const twistsToggle = screen.getByLabelText(/toggle twists/i);
    if (!(twistsToggle as HTMLInputElement).checked) {
      fireEvent.click(twistsToggle);
    }

    await waitFor(() => {
      expect(screen.getByText(/special safety chance/i)).toBeTruthy();
    });

    expect(screen.getByText("Public's Favorite (Public Vote)")).toBeTruthy();
    const favoritePlayerToggle = screen.getByLabelText(/toggle public's favorite player vote/i);
    if (!(favoritePlayerToggle as HTMLInputElement).checked) {
      fireEvent.click(favoritePlayerToggle);
    }
    expect(screen.getByText(/award amount — 25000 eyeoleans/i)).toBeTruthy();
    expect(screen.getByText(/eyeolean prize awarded to the public's favorite player/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /about/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /the big eye/i })).toBeTruthy();
    });
    expect(screen.getByText(`Version ${APP_VERSION}`)).toBeTruthy();
  });

  it('loads the requested default Game UX configuration for a fresh store', async () => {
    renderSettingsAdmin();

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }));

    await waitFor(() => {
      expect(screen.getByText(/back 2 the game chance — 85%/i)).toBeTruthy();
    });

    expect(screen.getByLabelText(/toggle confirm major actions/i)).toBeChecked();
    expect(screen.getByLabelText(/toggle show tooltips/i)).toBeChecked();
    expect(screen.getByLabelText(/toggle compact mode/i)).not.toBeChecked();
    expect(screen.getByLabelText(/toggle haptic feedback/i)).toBeChecked();
    expect(screen.getByLabelText(/toggle animations/i)).toBeChecked();
    expect(screen.getByLabelText(/toggle public mode/i)).toBeChecked();
    expect(screen.getByLabelText(/toggle twists/i)).toBeChecked();
    expect(screen.getByText(/double elimination chance — 35%/i)).toBeTruthy();
    expect(screen.getByText(/special safety chance — 75%/i)).toBeTruthy();
    expect(screen.getByLabelText(/toggle public's favorite player vote/i)).toBeChecked();
    expect((screen.getByLabelText(/public's favorite award amount/i) as HTMLInputElement).value).toBe('25000');
    expect(screen.getByLabelText(/toggle spectator mode/i)).toBeChecked();
    expect(screen.getByLabelText(/toggle tribunal house/i)).toBeChecked();
    expect((screen.getByLabelText(/cast size/i) as HTMLInputElement).value).toBe('16');
    expect((screen.getByLabelText(/selection mode/i) as HTMLSelectElement).value).toBe('unique');
  });

  it('lets QA set a forced secret mission week in debug settings', async () => {
    const { store } = renderSettingsAdmin();

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/secret mission force week \(debug\)/i)).toBeTruthy();
    });

    const forceWeekSlider = screen.getByLabelText(/secret mission force week \(debug\)/i);
    expect(screen.getByText(/secret mission force week — disabled/i)).toBeTruthy();

    fireEvent.change(forceWeekSlider, {
      target: { value: '9' },
    });

    await waitFor(() => {
      expect(store.getState().settings.sim.secretMissionTriggerWeekOverride).toBe(9);
    });
    expect(screen.getByText(/secret mission force week — week 9/i)).toBeTruthy();

    fireEvent.change(forceWeekSlider, {
      target: { value: '0' },
    });

    await waitFor(() => {
      expect(store.getState().settings.sim.secretMissionTriggerWeekOverride).toBeNull();
    });
    expect(screen.getByText(/secret mission force week — disabled/i)).toBeTruthy();
  });
});
