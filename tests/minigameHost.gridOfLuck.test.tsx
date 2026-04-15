import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import { getGame } from '../src/minigames/registry';

vi.mock('../src/components/GridOfLuck/GridOfLuck', () => ({
  default: () => <div data-testid="grid-of-luck-game">Grid of Luck</div>,
}));

vi.mock('../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-wrapper">Legacy Wrapper</div>,
}));

import MinigameHost from '../src/components/MinigameHost/MinigameHost';

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, settings: settingsReducer } });
}

describe('MinigameHost — Grid of Luck routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the React Grid of Luck component instead of the legacy wrapper', async () => {
    const store = makeStore();
    const gridOfLuckGame = getGame('gridOfLuck');

    expect(gridOfLuckGame).toBeDefined();

    render(
      <Provider store={store}>
        <MinigameHost
          game={gridOfLuckGame!}
          gameOptions={{ seed: 42 }}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId('grid-of-luck-game')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
  });
});
