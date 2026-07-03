import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import HouseguestGrid, { type Houseguest } from '../src/components/HouseguestGrid/HouseguestGrid';

vi.mock('../src/components/HouseguestGrid/AvatarTile', () => ({
  default: ({ name }: { name: string }) => <div>{name}</div>,
}));

function makeStore() {
  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
  });
}

const houseguests: Houseguest[] = Array.from({ length: 16 }, (_, index) => ({
  id: `p${index + 1}`,
  name: `Player ${index + 1}`,
}));

function renderGrid(store = makeStore()) {
  render(
    <Provider store={store}>
      <HouseguestGrid
        houseguests={houseguests}
        footerSelector=".missing-nav"
        overlaySelector={null}
        occupancyLabel="16/16"
      />
    </Provider>,
  );
  return { store };
}

describe('HouseguestGrid compact roster prompt', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('innerWidth', 390);
    vi.stubGlobal('innerHeight', 260);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('prompts for compact roster when the measured 16-player grid is cramped', async () => {
    const { store } = renderGrid();

    expect(await screen.findByText('This screen is cramped. Switch to compact roster?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '2 rows of 8 avatars' }));

    expect(store.getState().settings.gameUX.compactRoster).toBe(true);
    expect(store.getState().settings.gameUX.compactRosterLayout).toBe('two-rows');
  });
});
