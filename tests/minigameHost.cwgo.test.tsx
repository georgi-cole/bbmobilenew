/**
 * MinigameHost — CWGO routing smoke test.
 *
 * Verifies that:
 *  1. When game.implementation === 'react' and reactComponentKey === 'ClosestWithoutGoingOver',
 *     MinigameHost renders ClosestWithoutGoingOverComp (not LegacyMinigameWrapper).
 *  2. Legacy games (no implementation field) continue to use LegacyMinigameWrapper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import cwgoReducer from '../src/features/cwgo/cwgoCompetitionSlice';
import gameReducer from '../src/store/gameSlice';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock ClosestWithoutGoingOverComp so we don't need full Redux/framer-motion setup
vi.mock('../src/components/ClosestWithoutGoingOverComp', () => ({
  default: () => <div data-testid="cwgo-comp">CWGO Component</div>,
}));

// Mock LegacyMinigameWrapper so it doesn't attempt dynamic imports
vi.mock('../src/minigames/LegacyMinigameWrapper', () => ({
  default: () => <div data-testid="legacy-wrapper">Legacy Wrapper</div>,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({ reducer: { game: gameReducer, cwgo: cwgoReducer } });
}

// Minimal GameRegistryEntry for CWGO (React-implemented)
const CWGO_GAME = {
  key: 'dontGoOver',
  title: "Don't go over",
  description: 'Tournament-style numeric-guessing competition.',
  instructions: ['Guess without going over.'],
  metricKind: 'accuracy' as const,
  metricLabel: 'Placement',
  timeLimitMs: 0,
  authoritative: true,
  scoringAdapter: 'authoritative' as const,
  implementation: 'react' as const,
  reactComponentKey: 'ClosestWithoutGoingOver',
  legacy: false,
  weight: 1,
  category: 'trivia' as const,
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
  weight: 2,
  category: 'arcade' as const,
  retired: false,
};

// Import MinigameHost after mocks are set up
import MinigameHost from '../src/components/MinigameHost/MinigameHost';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MinigameHost — CWGO routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders ClosestWithoutGoingOverComp for a React-implemented game', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    render(
      <Provider store={store}>
        <MinigameHost
          game={CWGO_GAME}
          gameOptions={{ seed: 42, prizeType: 'HOH' }}
          participants={[{ id: 'p1', name: 'Alice', isHuman: true, precomputedScore: 0, previousPR: null }]}
          onDone={onDone}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    // Advance timers to trigger the playing phase transition
    await act(async () => {
      vi.runAllTimers();
    });

    expect(screen.getByTestId('cwgo-comp')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
  });

  it('renders LegacyMinigameWrapper for a legacy game', async () => {
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
    expect(screen.queryByTestId('cwgo-comp')).toBeNull();
  });
});
