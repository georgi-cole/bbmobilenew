import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Settings from '../src/screens/Settings/Settings';
import gameReducer from '../src/store/gameSlice';
import settingsReducer, { setGameUX } from '../src/store/settingsSlice';

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
  it('shows Compact Roster in normal Settings with only supported layout choices', () => {
    renderSettings();

    expect(screen.getByLabelText(/toggle compact roster/i)).toBeTruthy();

    const layoutSelect = screen.getByLabelText(/compact roster layout/i);
    const optionLabels = within(layoutSelect).getAllByRole('option').map((option) => option.textContent);

    expect(optionLabels).toEqual(['2 rows of 8 avatars', '4x4 smaller avatars']);
    expect(optionLabels).not.toContain('Horizontal slider');
  });

  it('normalizes a stored slider layout to the supported smaller-avatar mode', () => {
    const store = makeStore();

    store.dispatch(setGameUX({ compactRosterLayout: 'slider' }));
    renderSettings(store);

    expect(store.getState().settings.gameUX.compactRosterLayout).toBe('small');
    expect(screen.getByLabelText(/compact roster layout/i)).toHaveValue('small');
  });
});
