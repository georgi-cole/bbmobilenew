import { act, fireEvent, render, screen } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import glassBridgeReducer, {
  finaliseOrderSelection,
  recordNumberChoice,
  startPlaying,
  resolveStep,
  HINT_PENALTY_MS,
} from '../../../features/glassBridge/glassBridgeSlice';
import GlassBridgeComp from '../GlassBridgeComp';

const playSafeStep = vi.fn();
const playDeath = vi.fn();
const playWinner = vi.fn();
const playNewTurn = vi.fn();
const timeoutBannerPattern = /time is over\. the path is collapsing\.|the clock has died — the path is collapsing!|no time remains\. the bridge is breaking apart!/i;
const helpButtonPattern = /seek guidance|ask the expert|one last whisper/i;
const exhaustedHelpPattern = /no more aid remains|the expert is silent now|you must face the path alone/i;

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

function makeRect(top: number, bottom: number, width = 360): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: width,
    width,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
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

    expect(screen.getByText(timeoutBannerPattern)).toBeTruthy();
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
    const helpBtn = screen.queryByRole('button', { name: helpButtonPattern });
    expect(helpBtn).not.toBeNull();
    expect(helpBtn!.textContent).toMatch(/3 left/i);

    const floatingUi = container.querySelector('.gb-floating-ui');
    const bridgeContainer = container.querySelector('.gb-bridge-container');
    const hintArea = container.querySelector('.gb-floating-ui .gb-hint-area');
    const firstRow = container.querySelector('.gb-bridge-container .gb-row');
    expect(floatingUi).not.toBeNull();
    expect(bridgeContainer).not.toBeNull();
    expect(hintArea).not.toBeNull();
    expect(firstRow).not.toBeNull();
    expect(floatingUi!.nextElementSibling).toBe(bridgeContainer);

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
    expect(screen.getByRole('button', { name: helpButtonPattern }).textContent).toMatch(/2 left/i);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: helpButtonPattern }));
    });
    hintMsg = screen.queryByRole('status');
    expect(hintMsg).not.toBeNull();
    observedHints.push(Number(hintMsg!.textContent!.match(/(\d+)%/)?.[1] ?? '0'));
    expect(screen.getByRole('button', { name: helpButtonPattern }).textContent).toMatch(/1 left/i);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: helpButtonPattern }));
    });
    hintMsg = screen.queryByRole('status');
    expect(hintMsg).not.toBeNull();
    observedHints.push(Number(hintMsg!.textContent!.match(/(\d+)%/)?.[1] ?? '0'));

    // Hint penalty should be recorded in Redux state (30 000 ms).
    const state = store.getState();
    const userProgress = state.glassBridge.progress['user'];
    expect(userProgress?.hintPenaltyMs).toBe(HINT_PENALTY_MS * 3);
    expect(observedHints).toEqual(expectedHints);

    const exhaustedBtn = screen.getByRole('button', { name: exhaustedHelpPattern });
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

  it('shows a spectator fast-forward button and cycles 1x, 2x, 3x playback', async () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <GlassBridgeComp
          participantIds={['user', 'ai-1']}
          participants={[
            { id: 'user', name: 'You', isHuman: true },
            { id: 'ai-1', name: 'AI One', isHuman: false },
          ]}
          seed={1}
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

    expect(store.getState().glassBridge.turnOrder[0]).toBe('user');

    const firstRow = store.getState().glassBridge.rows[0];
    const wrongSide = firstRow.safeSide === 'left' ? 'right' : 'left';
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${wrongSide} tile.*step here`, 'i') }));

    await advance(1_100);

    expect(screen.getByRole('dialog', { name: /eliminated/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /continue watching/i }));

    let ffwdBtn = screen.getByRole('button', { name: /playback speed 1x/i });
    expect(ffwdBtn.textContent).toContain('1×');

    fireEvent.click(ffwdBtn);
    ffwdBtn = screen.getByRole('button', { name: /playback speed 2x/i });
    expect(ffwdBtn.textContent).toContain('2×');

    fireEvent.click(ffwdBtn);
    ffwdBtn = screen.getByRole('button', { name: /playback speed 3x/i });
    expect(ffwdBtn.textContent).toContain('3×');
  });

  it('accelerates the visible countdown when spectator playback speed increases', async () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <GlassBridgeComp
          participantIds={['user', 'ai-1']}
          participants={[
            { id: 'user', name: 'You', isHuman: true },
            { id: 'ai-1', name: 'AI One', isHuman: false },
          ]}
          seed={1}
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

    const firstRow = store.getState().glassBridge.rows[0];
    const wrongSide = firstRow.safeSide === 'left' ? 'right' : 'left';
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`${wrongSide} tile.*step here`, 'i') }));

    await advance(1_100);
    fireEvent.click(screen.getByRole('button', { name: /continue watching/i }));

    fireEvent.click(screen.getByRole('button', { name: /playback speed 1x/i }));
    await advance(1_000);
    expect(screen.getByLabelText('Time remaining').textContent).toContain('0:28');

    fireEvent.click(screen.getByRole('button', { name: /playback speed 2x/i }));
    await advance(500);
    expect(screen.getByLabelText('Time remaining').textContent).toContain('0:27');
  });

  it('auto-scrolls the active row into view on mobile as the player advances', async () => {
    const originalInnerWidth = window.innerWidth;
    const originalMatchMedia = window.matchMedia;
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    const scrollToSpy = vi.fn();

    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 640px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToSpy,
    });

    try {
      const store = makeStore();
      const { container } = render(
        <Provider store={store}>
          <GlassBridgeComp
            participantIds={['user', 'ai-1']}
            participants={[
              { id: 'user', name: 'You', isHuman: true },
              { id: 'ai-1', name: 'AI One', isHuman: false },
            ]}
            seed={1}
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

      const scrollContainer = container.querySelector('.gb-playing') as HTMLDivElement | null;
      const floatingUi = container.querySelector('.gb-floating-ui') as HTMLDivElement | null;
      const hintArea = container.querySelector('.gb-floating-ui .gb-hint-area') as HTMLDivElement | null;
      const rows = Array.from(container.querySelectorAll('.gb-row')) as HTMLDivElement[];

      expect(scrollContainer).not.toBeNull();
      expect(floatingUi).not.toBeNull();
      expect(hintArea).not.toBeNull();
      expect(rows.length).toBeGreaterThan(1);

      Object.defineProperty(scrollContainer!, 'scrollTop', {
        configurable: true,
        writable: true,
        value: 0,
      });
      Object.defineProperty(scrollContainer!, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(0, 240)),
      });
      Object.defineProperty(floatingUi!, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(48, 96)),
      });
      Object.defineProperty(rows[0], 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(110, 170)),
      });
      Object.defineProperty(rows[1], 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(230, 290)),
      });

      await act(async () => {
        const safeSide = store.getState().glassBridge.rows[0].safeSide;
        store.dispatch(resolveStep({ chosenSide: safeSide, now: Date.now() }));
      });

      expect(scrollToSpy).toHaveBeenCalledWith({ top: 62, behavior: 'smooth' });
    } finally {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        value: originalScrollTo,
      });
    }
  });

  it('uses instant auto-scroll when animations are disabled', async () => {
    const originalInnerWidth = window.innerWidth;
    const originalMatchMedia = window.matchMedia;
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    const scrollToSpy = vi.fn();

    document.body.classList.add('no-animations');
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 390,
    });
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 640px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: scrollToSpy,
    });

    try {
      const store = makeStore();
      const { container } = render(
        <Provider store={store}>
          <GlassBridgeComp
            participantIds={['user', 'ai-1']}
            participants={[
              { id: 'user', name: 'You', isHuman: true },
              { id: 'ai-1', name: 'AI One', isHuman: false },
            ]}
            seed={1}
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

      const scrollContainer = container.querySelector('.gb-playing') as HTMLDivElement | null;
      const floatingUi = container.querySelector('.gb-floating-ui') as HTMLDivElement | null;
      const rows = Array.from(container.querySelectorAll('.gb-row')) as HTMLDivElement[];

      expect(scrollContainer).not.toBeNull();
      expect(floatingUi).not.toBeNull();
      expect(rows.length).toBeGreaterThan(1);

      Object.defineProperty(scrollContainer!, 'scrollTop', {
        configurable: true,
        writable: true,
        value: 0,
      });
      Object.defineProperty(scrollContainer!, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(0, 240)),
      });
      Object.defineProperty(floatingUi!, 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(48, 96)),
      });
      Object.defineProperty(rows[0], 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(110, 170)),
      });
      Object.defineProperty(rows[1], 'getBoundingClientRect', {
        configurable: true,
        value: vi.fn(() => makeRect(230, 290)),
      });

      await act(async () => {
        const safeSide = store.getState().glassBridge.rows[0].safeSide;
        store.dispatch(resolveStep({ chosenSide: safeSide, now: Date.now() }));
      });

      expect(scrollToSpy).toHaveBeenCalledWith({ top: 62, behavior: 'auto' });
    } finally {
      document.body.classList.remove('no-animations');
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
      Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
        configurable: true,
        value: originalScrollTo,
      });
    }
  });

  it('renders crystal visual layers and promotes a safely revealed tile after a correct step', async () => {
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

    const allTiles = Array.from(container.querySelectorAll('.gb-tile'));
    expect(allTiles.length).toBeGreaterThan(0);
    expect(allTiles.every(tile => tile.querySelector('.gb-tile-crystal'))).toBe(true);
    expect(allTiles.every(tile => tile.querySelector('.gb-tile-void'))).toBe(true);
    expect(allTiles.every(tile => tile.querySelector('.gb-tile-shards'))).toBe(true);
    expect(container.querySelector('.gb-abyss-particles')).not.toBeNull();
    expect(container.querySelector('.gb-abyss-falloff')).not.toBeNull();

    const safeSide = store.getState().glassBridge.rows[0].safeSide;
    await act(async () => {
      store.dispatch(resolveStep({ chosenSide: safeSide, now: Date.now() + 1_000 }));
    });

    expect(container.querySelectorAll('.gb-tile-safe')).toHaveLength(1);
  });
});
