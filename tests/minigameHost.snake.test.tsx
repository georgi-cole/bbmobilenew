/**
 * MinigameHost — Snake routing smoke test.
 *
 * Verifies that:
 *  1. When game.implementation === 'react' and reactComponentKey === 'SnakeGame',
 *     MinigameHost renders SnakeGame (not LegacyMinigameWrapper).
 *  2. The snake registry entry is wired as a React game (not legacy).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock SnakeGame so we don't need a canvas or RAF environment
vi.mock('../src/components/SnakeGame/SnakeGame', () => ({
  default: () => <div data-testid="snake-game">Snake Game</div>,
}));

// Mock LegacyMinigameWrapper so it doesn't attempt dynamic imports
vi.mock('../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-wrapper">Legacy Wrapper</div>,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, settings: settingsReducer } });
}

// Minimal GameRegistryEntry for Snake (React-implemented, post-migration)
const SNAKE_GAME = {
  key: 'snake',
  title: 'Snake',
  description: 'Classic snake game — eat food and grow',
  instructions: ['Avoid walls and your tail'],
  metricKind: 'points' as const,
  metricLabel: 'Score',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'authoritative' as const,
  implementation: 'react' as const,
  reactComponentKey: 'SnakeGame',
  legacy: false,
  weight: 2,
  category: 'arcade' as const,
  retired: false,
};

// Minimal GameRegistryEntry for a legacy game (for negative test)
const LEGACY_GAME = {
  key: 'cardClash',
  title: 'Card Clash',
  description: 'Memory card matching.',
  instructions: ['Match pairs.'],
  metricKind: 'count' as const,
  metricLabel: 'Matches',
  timeLimitMs: 60_000,
  authoritative: false,
  scoringAdapter: 'raw' as const,
  modulePath: 'card-clash.js',
  legacy: true,
  weight: 1,
  category: 'memory' as const,
  retired: false,
};

// Import MinigameHost after mocks are set up
import MinigameHost from '../src/components/MinigameHost/MinigameHost';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MinigameHost — Snake routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders SnakeGame for a React-implemented snake game', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    render(
      <Provider store={store}>
        <MinigameHost
          game={SNAKE_GAME}
          gameOptions={{ seed: 42 }}
          onDone={onDone}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId('snake-game')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
  });

  it('renders LegacyMinigameWrapper for a legacy game (not Snake)', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    render(
      <Provider store={store}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{ seed: 1 }}
          onDone={onDone}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId('legacy-wrapper')).toBeTruthy();
    expect(screen.queryByTestId('snake-game')).toBeNull();
  });
});
