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

    resize() {}

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
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    const rect = {
      width: 320,
      height: 540,
      top: 0,
      left: 0,
      right: 320,
      bottom: 540,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    this.callback(
      [{ target, contentRect: rect } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  unobserve() {}

  disconnect() {}
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

  it('scores a solved run from attempts and elapsed time', async () => {
    const { onFinish } = renderCodeBreaker();
    const secretCode = generateSecretCode(42);

    await act(async () => {
      getMockEngines()[0].emitWin({
        ...makeSnapshot({ attempts: 2, elapsedMs: 15_000, phase: 'successAnimating' }),
        secretCode,
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_800);
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledWith(computeSolvedScore(2, 15_000));
    expect(screen.getByText('Vault breached in 2 attempts')).toBeInTheDocument();
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
});
