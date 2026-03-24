/**
 * MinigameHost — EstimationGame routing regression test.
 *
 * Verifies that:
 *  1. When game.implementation === 'react' and reactComponentKey === 'EstimationGame',
 *     MinigameHost renders EstimationGame via the generic reactComponents lookup
 *     and NEVER via LegacyMinigameWrapper.
 *  2. The onFinish callback from EstimationGame advances the host to the results
 *     phase and calls onDone with the final score.
 *  3. LegacyMinigameWrapper is not invoked for a React-implemented game even when
 *     no modulePath is defined.
 *
 * Regression for: "Failed to load game: [LegacyMinigameWrapper] No modulePath
 * defined for game 'estimationGame'. React-implemented games (implementation ===
 * 'react') should not use LegacyMinigameWrapper."
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import cwgoReducer from '../src/features/cwgo/cwgoCompetitionSlice';
import holdTheWallReducer from '../src/features/holdTheWall/holdTheWallSlice';
import gameReducer from '../src/store/gameSlice';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock the reactComponents map so EstimationGame calls onFinish when rendered.
vi.mock('../src/minigames/reactComponents', () => ({
  default: {
    EstimationGame: ({ onFinish }: { onFinish?: (v: number) => void }) => (
      <div
        data-testid="estimation-game-comp"
        onClick={() => onFinish?.(175)}
      >
        Estimation Game Component
      </div>
    ),
  },
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

// EstimationGame registry entry shape (matches src/minigames/registry.ts)
const ESTIMATION_GAME = {
  key: 'estimationGame',
  title: 'Estimation',
  description: 'Three rounds of rapid estimation — count objects before they vanish',
  instructions: [
    'Objects flash on screen briefly — count as many as you can!',
    'When the board hides, enter your estimate before the timer runs out',
    'Three rounds of increasing difficulty',
    'Closest estimate wins each round — highest total score wins the competition',
  ],
  metricKind: 'accuracy' as const,
  metricLabel: 'Accuracy pts',
  timeLimitMs: 0,
  authoritative: false,
  scoringAdapter: 'raw' as const,
  implementation: 'react' as const,
  reactComponentKey: 'EstimationGame',
  legacy: false,
  weight: 1,
  category: 'logic' as const,
  retired: false,
};

// Import component under test after mocks
import MinigameHost from '../src/components/MinigameHost/MinigameHost';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MinigameHost — EstimationGame routing (regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders EstimationGame (not LegacyMinigameWrapper) for estimationGame', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    render(
      <Provider store={store}>
        <MinigameHost
          game={ESTIMATION_GAME}
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

    expect(screen.getByTestId('estimation-game-comp')).toBeTruthy();
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
  });

  it('does NOT invoke LegacyMinigameWrapper even though estimationGame has no modulePath', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    // Confirm no modulePath is set (matches the actual registry entry)
    expect((ESTIMATION_GAME as Record<string, unknown>).modulePath).toBeUndefined();

    render(
      <Provider store={store}>
        <MinigameHost
          game={ESTIMATION_GAME}
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

    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();
    expect(screen.getByTestId('estimation-game-comp')).toBeTruthy();
  });

  it('advances to results phase when EstimationGame calls onFinish', async () => {
    const store = makeStore();
    const onDone = vi.fn();

    render(
      <Provider store={store}>
        <MinigameHost
          game={ESTIMATION_GAME}
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

    // Simulate EstimationGame calling onFinish with score 175
    await act(async () => {
      fireEvent.click(screen.getByTestId('estimation-game-comp'));
    });

    // Should show the host results screen
    expect(screen.getByText('🏁 Finished!')).toBeTruthy();
    expect(screen.getByText('175')).toBeTruthy();

    // Click continue to forward to onDone
    await act(async () => {
      fireEvent.click(screen.getByText('Continue ▶'));
    });

    expect(onDone).toHaveBeenCalledWith(175, false);
  });

  it('throws an error (not warning) when a react game has no reactComponentKey', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const store = makeStore();
    const onDone = vi.fn();

    const BROKEN_REACT_GAME = {
      ...ESTIMATION_GAME,
      key: 'brokenReactGame',
      reactComponentKey: undefined as unknown as string,
    };

    render(
      <Provider store={store}>
        <MinigameHost
          game={BROKEN_REACT_GAME}
          gameOptions={{}}
          onDone={onDone}
          skipRules
          skipCountdown
        />
      </Provider>,
    );

    // React 18 re-throws render errors from act(); catch and assert
    let caughtError: Error | undefined;
    try {
      await act(async () => {
        vi.runAllTimers();
      });
    } catch (err) {
      caughtError = err as Error;
    }

    expect(caughtError?.message).toMatch(/reactComponentKey defined|no reactComponentKey/i);

    // LegacyMinigameWrapper must NOT be rendered for a react-implemented game
    expect(screen.queryByTestId('legacy-wrapper')).toBeNull();

    errorSpy.mockRestore();
  });
});
