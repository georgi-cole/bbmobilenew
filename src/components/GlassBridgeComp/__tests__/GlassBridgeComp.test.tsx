import { act, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import glassBridgeReducer, {
  finaliseOrderSelection,
  recordNumberChoice,
  startPlaying,
  HINT_PENALTY_MS,
} from '../../../features/glassBridge/glassBridgeSlice';
import GlassBridgeComp from '../GlassBridgeComp';

const playSafeStep = vi.fn();
const playDeath = vi.fn();
const playWinner = vi.fn();
const playNewTurn = vi.fn();

vi.mock('../../../hooks/useGlassBridgeAudio', () => ({
  useGlassBridgeAudio: () => ({
    playSafeStep,
    playDeath,
    playWinner,
    playNewTurn,
  }),
}));

vi.mock('../../../features/glassBridge/thunks', () => ({
  resolveGlassBridgeOutcome: () => () => {},
}));

function makeStore() {
  return configureStore({
    reducer: {
      glassBridge: glassBridgeReducer,
    },
  });
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe('GlassBridgeComp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-29T00:00:00Z'));
    playSafeStep.mockReset();
    playDeath.mockReset();
    playWinner.mockReset();
    playNewTurn.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the bridge-collapse timeout sequence before showing results', async () => {
    const store = makeStore();
    const { container } = render(
      <Provider store={store}>
        <GlassBridgeComp
          participantIds={['user', 'ai-1']}
          participants={[
            { id: 'user', name: 'You', isHuman: true },
            { id: 'ai-1', name: 'AI One', isHuman: false },
          ]}
          seed={42}
        />
      </Provider>,
    );

    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: /pick number 1/i }));

    await act(async () => {
      store.dispatch(recordNumberChoice({ playerId: 'ai-1', number: 2 }));
      store.dispatch(finaliseOrderSelection());
      store.dispatch(startPlaying({ now: Date.now() }));
    });

    expect(screen.getByLabelText('Time remaining').textContent).toContain('0:32');

    await advance(32_250);

    expect(screen.getByText("Time's up! The path is collapsing!")).toBeTruthy();
    expect(screen.queryByText('Path Complete')).toBeNull();
    expect(container.querySelectorAll('.gb-tile-timeout-break').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.gb-avatar-bar-timeout').length).toBeGreaterThan(0);
    expect(playDeath).toHaveBeenCalled();

    await advance(2_500);

    expect(screen.getByText('Path Complete')).toBeTruthy();
  });

  it('shows the Request Help button during human turn and grants a hint on click', async () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <GlassBridgeComp
          participantIds={['user', 'ai-1']}
          participants={[
            { id: 'user', name: 'You', isHuman: true },
            { id: 'ai-1', name: 'AI One', isHuman: false },
          ]}
          seed={42}
        />
      </Provider>,
    );

    await advance(0);
    fireEvent.click(screen.getByRole('button', { name: /pick number 1/i }));

    await act(async () => {
      store.dispatch(recordNumberChoice({ playerId: 'ai-1', number: 2 }));
      store.dispatch(finaliseOrderSelection());
      store.dispatch(startPlaying({ now: Date.now() }));
    });

    // After reveal animation, check the human is going first (turn order with seed 42 may vary;
    // we just verify the Request Help button appears in the playing phase for the human).
    const helpBtn = screen.queryByRole('button', { name: /request help/i });
    expect(helpBtn).not.toBeNull();
    expect(helpBtn!.textContent).toMatch(/3 left/i);

    // Click the hint button.
    await act(async () => {
      fireEvent.click(helpBtn!);
    });

    // The Expert hint message should appear.
    const hintMsg = screen.queryByRole('status');
    expect(hintMsg).not.toBeNull();
    expect(hintMsg!.textContent).toMatch(/The Expert says there is a \d+% chance/i);

    // Hint penalty should be recorded in Redux state (30 000 ms).
    const state = store.getState();
    const userProgress = state.glassBridge.progress['user'];
    expect(userProgress?.hintPenaltyMs).toBe(HINT_PENALTY_MS);

    // Button should now show 2 hints left.
    expect(screen.getByRole('button', { name: /request help/i }).textContent).toMatch(/2 left/i);
  });
});
