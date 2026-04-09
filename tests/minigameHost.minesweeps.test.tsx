import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';

vi.mock('../src/components/Minesweeps/Minesweeps', () => ({
  default: () => <div data-testid="minesweeps-game">Minesweeps Game</div>,
}));

vi.mock('../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-wrapper">Legacy Wrapper</div>,
}));

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, settings: settingsReducer } });
}

const MINESWEEPS_GAME = {
  key: 'minesweeps',
  title: 'Minesweeps',
  description: 'Classic minesweeper puzzle',
  instructions: ['Tap cells to reveal them'],
  metricKind: 'accuracy' as const,
  metricLabel: 'Score',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'authoritative' as const,
  implementation: 'react' as const,
  reactComponentKey: 'Minesweeps',
  legacy: false,
  weight: 1,
  category: 'logic' as const,
  retired: false,
};

const LEGACY_GAME = {
  key: 'countHouse',
  title: 'Count House',
  description: 'Legacy test double.',
  instructions: ['Count the items.'],
  metricKind: 'count' as const,
  metricLabel: 'Count',
  timeLimitMs: 60_000,
  authoritative: false,
  scoringAdapter: 'raw' as const,
  modulePath: 'count-house.js',
  legacy: true,
  weight: 1,
  category: 'mental' as const,
  retired: false,
};

import MinigameHost from '../src/components/MinigameHost/MinigameHost';

describe('MinigameHost — Minesweeps routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the React Minesweeps component instead of the legacy wrapper', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <MinigameHost
          game={MINESWEEPS_GAME}
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

    expect(screen.getByTestId('minesweeps-game')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
  });

  it('still uses the legacy wrapper for legacy entries', async () => {
    const store = makeStore();

    render(
      <Provider store={store}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          onDone={vi.fn()}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId('legacy-wrapper')).toBeTruthy();
    expect(screen.queryByTestId('minesweeps-game')).toBeNull();
  });
});
