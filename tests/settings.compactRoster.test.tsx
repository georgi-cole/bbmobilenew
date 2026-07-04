import { afterEach, describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Settings from '../src/screens/Settings/Settings';
import gameReducer from '../src/store/gameSlice';
import settingsReducer, { loadSettings, STORAGE_KEY } from '../src/store/settingsSlice';

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });
}

function renderSettings(store = makeStore()) {
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return { store };
}

describe('Settings compact roster controls', () => {
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('shows only Compact mode in normal Settings without a separate layout choice', () => {
    renderSettings();

    expect(screen.getByLabelText(/toggle compact mode/i)).toBeTruthy();
    expect(screen.queryByLabelText(/compact roster layout/i)).toBeNull();
    expect(screen.queryByText(/4x4 smaller avatars/i)).toBeNull();
    expect(screen.queryByText(/2 rows of 8 avatars/i)).toBeNull();
  });

  it('migrates the old smaller-avatar layout to compact mode', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        gameUX: {
          compactRoster: false,
          compactRosterLayout: 'small',
        },
      }),
    );

    expect(loadSettings().gameUX.compactRoster).toBe(true);
  });

  it('does not force compact mode for the old two-row layout unless compact was already on', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        gameUX: {
          compactRoster: false,
          compactRosterLayout: 'two-rows',
        },
      }),
    );

    expect(loadSettings().gameUX.compactRoster).toBe(false);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        gameUX: {
          compactRoster: true,
          compactRosterLayout: 'two-rows',
        },
      }),
    );

    expect(loadSettings().gameUX.compactRoster).toBe(true);
  });
});
