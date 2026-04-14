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

  it('moves the help button above the first row and strengthens repeated hints on the same row', async () => {
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

    // After reveal animation, check the human is going first (turn order with seed 42 may vary;
    // we just verify the Request Help button appears in the playing phase for the human).
    const helpBtn = screen.queryByRole('button', { name: /request help/i });
    expect(helpBtn).not.toBeNull();
    expect(helpBtn!.textContent).toMatch(/3 left/i);

    const hintArea = container.querySelector('.gb-bridge-container .gb-hint-area');
    const firstRow = container.querySelector('.gb-bridge-container .gb-row');
    expect(hintArea).not.toBeNull();
    expect(firstRow).not.toBeNull();
    expect(hintArea!.nextElementSibling).toBe(firstRow);

    const currentRow = store.getState().glassBridge.currentPlayerRow;
    const currentRowState = store.getState().glassBridge.rows[currentRow - 1];
    const expectedHints = currentRowState.safeSide === 'right'
      ? [65, 90, 99]
      : [35, 10, 1];

    const observedHints: number[] = [];

    // Click the hint button three times on the same row.
    await act(async () => {
      fireEvent.click(helpBtn!);
    });
    let hintMsg = screen.queryByRole('status');
    expect(hintMsg).not.toBeNull();
    observedHints.push(Number(hintMsg!.textContent!.match(/(\d+)%/)?.[1] ?? '0'));
    expect(screen.getByRole('button', { name: /request help/i }).textContent).toMatch(/2 left/i);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /request help/i }));
    });
    hintMsg = screen.queryByRole('status');
    expect(hintMsg).not.toBeNull();
    observedHints.push(Number(hintMsg!.textContent!.match(/(\d+)%/)?.[1] ?? '0'));
    expect(screen.getByRole('button', { name: /request help/i }).textContent).toMatch(/1 left/i);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /request help/i }));
    });
    hintMsg = screen.queryByRole('status');
    expect(hintMsg).not.toBeNull();
    observedHints.push(Number(hintMsg!.textContent!.match(/(\d+)%/)?.[1] ?? '0'));

    // Hint penalty should be recorded in Redux state (30 000 ms).
    const state = store.getState();
    const userProgress = state.glassBridge.progress['user'];
    expect(userProgress?.hintPenaltyMs).toBe(HINT_PENALTY_MS * 3);
    expect(observedHints).toEqual(expectedHints);

    const exhaustedBtn = screen.getByRole('button', { name: /you're on your own/i });
    expect(exhaustedBtn).toBeDisabled();
  });

  it('generates a fresh session seed on each mount when no explicit seed is provided', async () => {
    const generatedSeeds = [0x12345678, 0x9abcdef0];
    let seedIndex = 0;
    const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const cryptoObject = originalCryptoDescriptor?.value ?? {
      getRandomValues: <T extends ArrayBufferView | null>(array: T): T => array,
    };

    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: cryptoObject,
    });

    const getRandomValuesSpy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      if (array instanceof Uint32Array && array.length > 0) {
        array[0] = generatedSeeds[Math.min(seedIndex, generatedSeeds.length - 1)];
        seedIndex += 1;
      }
      return array;
    });

    try {
      const firstStore = makeStore();
      const firstRender = render(
        <Provider store={firstStore}>
          <GlassBridgeComp
            participantIds={['user', 'ai-1']}
            participants={[
              { id: 'user', name: 'You', isHuman: true },
              { id: 'ai-1', name: 'AI One', isHuman: false },
            ]}
          />
        </Provider>,
      );

      await advance(0);
      const firstSeed = firstStore.getState().glassBridge.seed;
      firstRender.unmount();

      const secondStore = makeStore();
      render(
        <Provider store={secondStore}>
          <GlassBridgeComp
            participantIds={['user', 'ai-1']}
            participants={[
              { id: 'user', name: 'You', isHuman: true },
              { id: 'ai-1', name: 'AI One', isHuman: false },
            ]}
          />
        </Provider>,
      );

      await advance(0);
      const secondSeed = secondStore.getState().glassBridge.seed;

      expect(firstSeed).toBe(generatedSeeds[0]);
      expect(secondSeed).toBe(generatedSeeds[1]);
      expect(secondSeed).not.toBe(firstSeed);
    } finally {
      getRandomValuesSpy.mockRestore();
      if (originalCryptoDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'crypto');
      }
    }
  });
});
