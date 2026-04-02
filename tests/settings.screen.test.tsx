import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Settings from '../src/screens/Settings/Settings';
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
    const { store } = renderSettings();

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
    renderSettings();

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^save$/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^ok$/i }));

    expect(vi.mocked(restartApp)).toHaveBeenCalledWith('#/game');
  });

  it('shows the renamed brand and twist copy in the UI', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('tab', { name: /game ux/i }));
    fireEvent.click(screen.getByLabelText(/toggle twists/i));

    await waitFor(() => {
      expect(screen.getByText(/special safety chance/i)).toBeTruthy();
    });

    expect(screen.getByText("Public's Favorite (Public Vote)")).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/toggle public's favorite player vote/i));
    expect(screen.getByText(/award amount — 25000 eyeoleans/i)).toBeTruthy();
    expect(screen.getByText(/eyeolean prize awarded to the public's favorite player/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /about/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /the big eye/i })).toBeTruthy();
    });
  });
});
