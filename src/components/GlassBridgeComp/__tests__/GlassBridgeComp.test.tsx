import { act, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import glassBridgeReducer, {
  finaliseOrderSelection,
  recordNumberChoice,
  startPlaying,
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

    expect(screen.getByText("Time's up! The bridge is collapsing.")).toBeTruthy();
    expect(screen.queryByText('Bridge Complete')).toBeNull();
    expect(container.querySelectorAll('.gb-tile-timeout-break').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.gb-avatar-bar-timeout').length).toBeGreaterThan(0);
    expect(playDeath).toHaveBeenCalled();

    await advance(2_500);

    expect(screen.getByText('Bridge Complete')).toBeTruthy();
  });
});
