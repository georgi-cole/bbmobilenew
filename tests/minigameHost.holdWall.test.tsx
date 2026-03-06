/**
 * MinigameHost — HoldTheWall routing smoke test.
 *
 * Verifies that:
 *  1. When game.implementation === 'react' and reactComponentKey === 'HoldTheWall',
 *     MinigameHost renders HoldTheWallComp (not LegacyMinigameWrapper).
 *  2. Legacy games continue to use LegacyMinigameWrapper.
 *  3. CWGO routing is unaffected.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import cwgoReducer from '../src/features/cwgo/cwgoCompetitionSlice';
import holdTheWallReducer from '../src/features/holdTheWall/holdTheWallSlice';
import gameReducer from '../src/store/gameSlice';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/components/ClosestWithoutGoingOverComp', () => ({
  default: () => <div data-testid="cwgo-comp">CWGO Component</div>,
}));

vi.mock('../src/components/HoldTheWallComp/HoldTheWallComp', () => ({
  default: () => <div data-testid="htw-comp">HoldTheWall Component</div>,
}));

vi.mock('../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-wrapper">Legacy Wrapper</div>,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: { game: gameReducer, cwgo: cwgoReducer, holdTheWall: holdTheWallReducer },
  });
}

// Minimal GameRegistryEntry for HoldTheWall (React-implemented)
const HTW_GAME = {
  key: 'holdWall',
  title: 'Hold the Wall',
  description: 'Endurance competition.',
  instructions: ['Press and hold.'],
  metricKind: 'endurance' as const,
  metricLabel: 'Placement',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'authoritative' as const,
  implementation: 'react' as const,
  reactComponentKey: 'HoldTheWall',
  legacy: false,
  weight: 1,
  category: 'endurance' as const,
  retired: false,
};

// Minimal GameRegistryEntry for a legacy game
const LEGACY_GAME = {
  key: 'quickTap',
  title: 'Quick Tap Race',
  description: 'Tap as many times as possible.',
  instructions: ['Tap quickly.'],
  metricKind: 'count' as const,
  metricLabel: 'Taps',
  timeLimitMs: 30_000,
  authoritative: false,
  scoringAdapter: 'raw' as const,
  modulePath: 'quick-tap.js',
  legacy: true,
  weight: 1,
  category: 'arcade' as const,
  retired: false,
};

// ── Import component under test ───────────────────────────────────────────────

import MinigameHost from '../src/components/MinigameHost/MinigameHost';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MinigameHost — HoldTheWall routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders HoldTheWallComp for a holdWall React-implemented game', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    render(
      <Provider store={store}>
        <MinigameHost
          game={HTW_GAME}
          gameOptions={{ seed: 42, prizeType: 'HOH' }}
          participants={[
            { id: 'p1', name: 'Alice', isHuman: true, precomputedScore: 0, previousPR: null },
          ]}
          onDone={onDone}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId('htw-comp')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
    expect(screen.queryByTestId('cwgo-comp')).toBeNull();
  });

  it('renders LegacyMinigameWrapper for a legacy game', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    render(
      <Provider store={store}>
        <MinigameHost
          game={LEGACY_GAME}
          gameOptions={{}}
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
    expect(screen.queryByTestId('htw-comp')).toBeNull();
    expect(screen.queryByTestId('cwgo-comp')).toBeNull();
  });
});
