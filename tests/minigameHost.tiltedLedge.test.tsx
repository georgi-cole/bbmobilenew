/**
 * MinigameHost — TiltedLedge routing smoke test.
 *
 * Verifies that:
 *  1. When game.implementation === 'react' and reactComponentKey === 'TiltedLedge',
 *     MinigameHost renders TiltedLedge via the generic reactComponents lookup
 *     (not LegacyMinigameWrapper).
 *  2. The onFinish callback from TiltedLedge advances the host to the results phase
 *     and ultimately calls onDone with the elapsed-seconds value.
 *  3. Legacy games are unaffected.
 *  4. A warning is emitted if reactComponentKey is missing or not found in the map.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import cwgoReducer from '../src/features/cwgo/cwgoCompetitionSlice';
import holdTheWallReducer from '../src/features/holdTheWall/holdTheWallSlice';
import gameReducer from '../src/store/gameSlice';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock the reactComponents map so TiltedLedge calls onFinish when rendered.
vi.mock('../src/minigames/reactComponents', () => ({
  default: {
    TiltedLedge: ({ onFinish }: { onFinish?: (v: number) => void }) => (
      <div
        data-testid="tilted-ledge-comp"
        onClick={() => onFinish?.(42)}
      >
        TiltedLedge Component
      </div>
    ),
    ClosestWithoutGoingOver: () => <div data-testid="cwgo-in-map">CWGO in map</div>,
    HoldTheWall: () => <div data-testid="htw-in-map">HTW in map</div>,
  },
}));

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

// Minimal GameRegistryEntry for TiltedLedge (React-implemented)
const TILTED_LEDGE_GAME = {
  key: 'tiltedLedge',
  title: 'The Tilted Ledge',
  description: 'Keep balance on a tilting ledge.',
  instructions: ['Tap to balance.'],
  metricKind: 'endurance' as const,
  metricLabel: 'Time (s)',
  timeLimitMs: 0,
  authoritative: false,
  scoringAdapter: 'raw' as const,
  implementation: 'react' as const,
  reactComponentKey: 'TiltedLedge',
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

describe('MinigameHost — TiltedLedge routing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders TiltedLedge for a tiltedLedge React-implemented game', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    render(
      <Provider store={store}>
        <MinigameHost
          game={TILTED_LEDGE_GAME}
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

    expect(screen.getByTestId('tilted-ledge-comp')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
    expect(screen.queryByTestId('cwgo-comp')).toBeNull();
    expect(screen.queryByTestId('htw-comp')).toBeNull();
  });

  it('advances to results phase when TiltedLedge calls onFinish', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    render(
      <Provider store={store}>
        <MinigameHost
          game={TILTED_LEDGE_GAME}
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

    // Simulate TiltedLedge calling onFinish with 42 seconds
    await act(async () => {
      fireEvent.click(screen.getByTestId('tilted-ledge-comp'));
    });

    // Should show the host results screen
    expect(screen.getByText('🏁 Finished!')).toBeTruthy();
    expect(screen.getByText('42')).toBeTruthy();

    // Click continue to forward to onDone
    await act(async () => {
      fireEvent.click(screen.getByText('Continue ▶'));
    });

    expect(onDone).toHaveBeenCalledWith(42, false);
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
    expect(screen.queryByTestId('tilted-ledge-comp')).toBeNull();
  });

  it('emits a console warning when reactComponentKey is not in the map', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = makeStore();
    const onDone = vi.fn();

    const UNKNOWN_REACT_GAME = {
      ...TILTED_LEDGE_GAME,
      key: 'unknownGame',
      reactComponentKey: 'NonExistentComponent',
    };

    render(
      <Provider store={store}>
        <MinigameHost
          game={UNKNOWN_REACT_GAME}
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

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("reactComponentKey 'NonExistentComponent' not found"),
    );
    // Falls back to LegacyMinigameWrapper
    expect(screen.getByTestId('legacy-wrapper')).toBeTruthy();

    warnSpy.mockRestore();
  });
});
