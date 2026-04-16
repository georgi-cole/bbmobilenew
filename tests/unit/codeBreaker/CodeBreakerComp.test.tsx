import type { ComponentProps } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import CodeBreakerComp from '../../../src/components/CodeBreakerComp/CodeBreakerComp';
import {
  computeAllAiSolveProfiles,
  computeSolvedScore,
  generateSecretCode,
} from '../../../src/components/CodeBreakerComp/codeBreakerLogic';
import type {
  VaultCrackerEngineOptions,
  VaultCrackerEngineSnapshot,
  VaultCrackerWinPayload,
} from '../../../src/minigames/vaultCracker/engine/types';

type MockEngine = {
  options: VaultCrackerEngineOptions;
  resizeCalls: Array<{ width: number; height: number; dpr: number }>;
  emitProgress: (snapshot: VaultCrackerEngineSnapshot) => void;
  emitWin: (payload: VaultCrackerWinPayload) => void;
};

const mockRegistry = globalThis as typeof globalThis & { __vaultCrackerMockEngines?: MockEngine[] };
mockRegistry.__vaultCrackerMockEngines = [];

function getMockEngines(): MockEngine[] {
  return mockRegistry.__vaultCrackerMockEngines ?? [];
}

function makeSnapshot(overrides: Partial<VaultCrackerEngineSnapshot> = {}): VaultCrackerEngineSnapshot {
  return {
    phase: 'active',
    digits: [0, 0, 0, 0],
    attempts: 0,
    elapsedMs: 0,
    bestBulls: 0,
    lastGuess: null,
    guessHistory: [],
    pressure: 0.06,
    ...overrides,
  };
}

vi.mock('../../../src/minigames/vaultCracker/engine/vaultCrackerCanvasEngine', () => ({
  VaultCrackerCanvasEngine: class MockVaultCrackerCanvasEngine {
    readonly options: VaultCrackerEngineOptions;
    readonly resizeCalls: Array<{ width: number; height: number; dpr: number }> = [];

    constructor(_canvas: HTMLCanvasElement, options: VaultCrackerEngineOptions) {
      this.options = options;
      const registry = (globalThis as typeof globalThis & { __vaultCrackerMockEngines?: MockEngine[] }).__vaultCrackerMockEngines;
      registry?.push(this as unknown as MockEngine);
    }

    start() {
      this.options.onProgress?.({
        phase: 'active',
        digits: [0, 0, 0, 0],
        attempts: 0,
        elapsedMs: 0,
        bestBulls: 0,
        lastGuess: null,
        guessHistory: [],
        pressure: 0.06,
      });
    }

    pause() {}

    resume() {}

    destroy() {}

    resize(width: number, height: number, dpr: number) {
      this.resizeCalls.push({ width, height, dpr });
    }

    getSnapshot() {
      return {
        phase: 'active',
        digits: [0, 0, 0, 0],
        attempts: 0,
        elapsedMs: 0,
        bestBulls: 0,
        lastGuess: null,
        guessHistory: [],
        pressure: 0.06,
      };
    }

    handlePointerDown() {}

    handlePointerMove() {}

    handlePointerUp() {}

    handlePointerCancel() {}

    emitProgress(snapshot: VaultCrackerEngineSnapshot) {
      this.options.onProgress?.(snapshot);
    }

    emitWin(payload: VaultCrackerWinPayload) {
      this.options.onWin?.(payload);
    }
  },
}));

vi.mock('../../../src/minigames/vaultCracker/engine/input', () => ({
  attachVaultCrackerInput: () => () => undefined,
}));

class ResizeObserverMock {
  static instances: ResizeObserverMock[] = [];

  private readonly callback: ResizeObserverCallback;

  private observedTarget: Element | null = null;

  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverMock.instances.push(this);
  }

  observe(target: Element) {
    this.observedTarget = target;
    this.emit(320, 540);
  }

  unobserve() {}

  disconnect() {
    this.disconnected = true;
  }

  emit(width: number, height: number) {
    if (!this.observedTarget) return;
    const rect = {
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    Object.defineProperty(this.observedTarget, 'clientWidth', {
      configurable: true,
      value: Math.round(width),
    });
    Object.defineProperty(this.observedTarget, 'clientHeight', {
      configurable: true,
      value: Math.round(height),
    });
    Object.defineProperty(this.observedTarget, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    this.callback(
      [{ target: this.observedTarget, contentRect: rect } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

function makeStore() {
  return configureStore({
    reducer: {
      game: (state = {}) => state,
    },
  });
}

function renderCodeBreaker(props: Partial<ComponentProps<typeof CodeBreakerComp>> = {}) {
  const store = makeStore();
  const onFinish = vi.fn();

  const view = render(
    <Provider store={store}>
      <CodeBreakerComp seed={42} onFinish={onFinish} {...props} />
    </Provider>,
  );

  return { ...view, onFinish };
}

function makeParticipants() {
  return [
    { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
    { id: 'ai-1', name: 'Cipher', isHuman: false, precomputedScore: 0, previousPR: null },
    { id: 'ai-2', name: 'Tumbler', isHuman: false, precomputedScore: 0, previousPR: null },
  ];
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

describe('CodeBreakerComp', () => {
  const originalResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    vi.useFakeTimers();
    mockRegistry.__vaultCrackerMockEngines = [];
    ResizeObserverMock.instances = [];
    globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    mockRegistry.__vaultCrackerMockEngines = [];
    globalThis.ResizeObserver = originalResizeObserver;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows attempts and elapsed status chips instead of a countdown timer', () => {
    renderCodeBreaker();

    expect(screen.getByLabelText('Vault status')).toBeInTheDocument();
    expect(screen.getByText('Attempts')).toBeInTheDocument();
    expect(screen.getByText('Elapsed')).toBeInTheDocument();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.queryByText(/time's up/i)).not.toBeInTheDocument();
  });

  it('keeps the vault surface as a full-height scroll container for long attempt logs', () => {
    const { container } = renderCodeBreaker();

    const root = container.querySelector('.cb');
    expect(root).toBeTruthy();

    const styleTag = document.createElement('style');
    styleTag.textContent = readFileSync(
      resolve(process.cwd(), 'src/components/CodeBreakerComp/CodeBreakerComp.css'),
      'utf8',
    );
    document.head.appendChild(styleTag);

    try {
      const style = getComputedStyle(root as HTMLElement);
      expect(Number.parseFloat(style.height)).toBeGreaterThan(0);
      expect(style.overflowX).toBe('hidden');
      expect(style.overflowY).toBe('auto');
    } finally {
      styleTag.remove();
    }
  });

  it('only resizes the canvas engine when the observed shell size actually changes', () => {
    const { unmount } = renderCodeBreaker();
    const engine = getMockEngines()[0];
    const observer = ResizeObserverMock.instances[0];

    expect(engine.resizeCalls).toEqual([{ width: 320, height: 540, dpr: 1 }]);

    act(() => {
      observer.emit(320, 540);
      observer.emit(320.4, 540.4);
    });
    expect(engine.resizeCalls).toHaveLength(1);

    act(() => {
      observer.emit(320, 560);
    });
    expect(engine.resizeCalls).toEqual([
      { width: 320, height: 540, dpr: 1 },
      { width: 320, height: 560, dpr: 1 },
    ]);

    unmount();
    expect(observer.disconnected).toBe(true);
  });

  it('scores a solved run from attempts and elapsed time', async () => {
    const { onFinish } = renderCodeBreaker();
    const secretCode = generateSecretCode(42);

    await act(async () => {
      getMockEngines()[0].emitWin({
        ...makeSnapshot({ attempts: 2, elapsedMs: 15_000, phase: 'successAnimating' }),
        secretCode,
      });
    });

    // Results screen is not yet visible — still in 'solved' transition phase
    expect(onFinish).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });

    // Results screen must appear before onFinish is called
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByText('🔓 Vault Cracked!')).toBeInTheDocument();
    expect(screen.getByText('Code was:')).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: /continue/i }).click();
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(computeSolvedScore(2, 15_000));
  });

  it('shows the competition scoreboard before completing the minigame flow', async () => {
    const onComplete = vi.fn();
    renderCodeBreaker({
      onFinish: undefined,
      onComplete,
      participantIds: ['human', 'ai-1', 'ai-2'],
      participants: makeParticipants(),
    });

    await act(async () => {
      getMockEngines()[0].emitWin({
        ...makeSnapshot({ attempts: 2, elapsedMs: 15_000, phase: 'successAnimating' }),
        secretCode: generateSecretCode(42),
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });

    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText('🔓 Vault Cracked!')).toBeInTheDocument();
    expect(screen.getByText('You (You)')).toBeInTheDocument();
    const aiSolveProfiles = computeAllAiSolveProfiles(42, ['human', 'ai-1', 'ai-2'], 'human');
    expect(screen.getByText('Cipher')).toBeInTheDocument();
    expect(
      screen.getByText(`${aiSolveProfiles['ai-1'].attempts} attempts • ${formatElapsed(aiSolveProfiles['ai-1'].elapsedMs)}`),
    ).toBeInTheDocument();
    expect(screen.getByText('Tumbler')).toBeInTheDocument();
    expect(
      screen.getByText(`${aiSolveProfiles['ai-2'].attempts} attempts • ${formatElapsed(aiSolveProfiles['ai-2'].elapsedMs)}`),
    ).toBeInTheDocument();

    await act(async () => {
      screen.getByRole('button', { name: /continue/i }).click();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('shows a scrollable attempt history for all guesses during gameplay', async () => {
    renderCodeBreaker();
    const engine = getMockEngines()[0];

    // No history panel while no guesses have been made
    expect(screen.queryByText('Attempt History')).not.toBeInTheDocument();

    // Emit three progress snapshots simulating successive guesses
    const guessHistory = [
      { digits: [1, 2, 3, 4], bulls: 0, cows: 1 },
      { digits: [5, 6, 7, 8], bulls: 1, cows: 0 },
      { digits: [9, 0, 1, 2], bulls: 2, cows: 1 },
    ];

    await act(async () => {
      engine.emitProgress(makeSnapshot({ attempts: 3, guessHistory }));
    });

    // History panel must appear and show all three attempts
    expect(screen.getByText('Attempt History')).toBeInTheDocument();
    expect(screen.getByText('3 attempts')).toBeInTheDocument();
    expect(screen.getByText('Attempt #3')).toBeInTheDocument();
    expect(screen.getByText('Attempt #2')).toBeInTheDocument();
    expect(screen.getByText('Attempt #1')).toBeInTheDocument();
    // Most-recent attempt is first (reversed order)
    expect(screen.getByText('9 0 1 2')).toBeInTheDocument();
    expect(screen.getByText('5 6 7 8')).toBeInTheDocument();
    expect(screen.getByText('1 2 3 4')).toBeInTheDocument();
  });
});
