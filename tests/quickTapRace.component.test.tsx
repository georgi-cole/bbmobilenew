import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import QuickTapRace from '../src/components/QuickTapRace/QuickTapRace';
import { completeMinigame } from '../src/store/gameSlice';
import type { QuickTapRaceResult } from '../src/minigames/quickTapRace/engine/types';

const audioMocks = vi.hoisted(() => ({
  playTap: vi.fn(),
  playBooster: vi.fn(),
  playHalfTap: vi.fn(),
}));

vi.mock('../src/components/QuickTapRace/QuickTapRace.css', () => ({}));
vi.mock('../src/hooks/useQuickTapRaceAudio', () => ({
  useQuickTapRaceAudio: () => audioMocks,
}));
vi.mock('../src/minigames/quickTapRace/engine/input', () => ({
  attachQuickTapRaceInput: () => vi.fn(),
}));

const { engineInstances, MockQuickTapRaceCanvasEngine } = vi.hoisted(() => {
  type EngineResult = {
    humanScore: number;
    winnerId: string;
    lastPlaceId: string | null;
    rankings: Array<{ id: string; score: number; isPlayer: boolean }>;
  };

  type EngineOptionsRecord = {
    seed?: number;
    onFinish: (result: EngineResult) => void;
  };

  const instances: Array<{ options: EngineOptionsRecord }> = [];

  class EngineMock {
    readonly options: EngineOptionsRecord;

    constructor(_canvas: HTMLCanvasElement, options: EngineOptionsRecord) {
      this.options = options;
      instances.push(this);
    }

    start() {}
    pause() {}
    resume() {}
    destroy() {}
    resize() {}
    handlePointerTap() {}
    handlePointerRelease() {}

    getSnapshot() {
      return {
        phase: 'countdown' as const,
        countdownText: '3',
        timeLeftMs: 30_000,
        playerScore: 0,
        playerRawTaps: 0,
        playerCombo: 0,
        playerShieldCharges: 0,
        playerEffectLabel: null,
        playerEffectIcon: null,
        playerHeat: 0,
        statusText: 'Ready',
        leadingRacerId: null,
        rankings: [],
        result: null,
        seed: this.options.seed !== undefined && this.options.seed !== 0 ? this.options.seed : 999,
      };
    }
  }

  return { engineInstances: instances, MockQuickTapRaceCanvasEngine: EngineMock };
});

vi.mock('../src/minigames/quickTapRace/engine/quickTapRaceCanvasEngine', () => ({
  QuickTapRaceCanvasEngine: MockQuickTapRaceCanvasEngine,
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

const TEST_RESULT: QuickTapRaceResult = {
  seed: 77,
  winnerId: 'p0',
  lastPlaceId: 'p2',
  humanScore: 184,
  humanRawTaps: 121,
  scores: { p0: 184, p1: 163, p2: 149 },
  rankings: [
    { id: 'p0', name: 'You', score: 184, rawTaps: 121, isPlayer: true, finishMs: null, progress: 0.86 },
    { id: 'p1', name: 'Nova', score: 163, rawTaps: 163, isPlayer: false, finishMs: null, progress: 0.74 },
    { id: 'p2', name: 'Iris', score: 149, rawTaps: 149, isPlayer: false, finishMs: null, progress: 0.69 },
  ],
};

function createStore() {
  const store = configureStore({
    reducer: {
      game: (
        state = {
          players: [{ id: 'p0', name: 'You', avatar: '🙂', status: 'active', isUser: true }],
        },
      ) => state,
    },
  });
  const originalDispatch = store.dispatch.bind(store);
  store.dispatch = vi.fn((action) => originalDispatch(action));
  return store;
}

describe('QuickTapRace canvas wrapper', () => {
  beforeEach(() => {
    engineInstances.length = 0;
    audioMocks.playTap.mockReset();
    audioMocks.playBooster.mockReset();
    audioMocks.playHalfTap.mockReset();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards the explicit host seed into the canvas engine', () => {
    const store = createStore();

    render(
      <Provider store={store}>
        <QuickTapRace
          seed={77}
          participantIds={['p0', 'p1']}
          participants={[
            { id: 'p0', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'p1', name: 'Nova', isHuman: false, precomputedScore: 165, previousPR: null },
          ]}
          onFinish={vi.fn()}
        />
      </Provider>,
    );

    expect(engineInstances).toHaveLength(1);
    expect(engineInstances[0].options.seed).toBe(77);
  });

  it('hands the completed session result back through completeMinigame with canonical ids', async () => {
    const user = userEvent.setup();
    const store = createStore();

    render(
      <Provider store={store}>
        <QuickTapRace
          session={{
            key: 'quickTap',
            participants: ['p0', 'p1', 'p2'],
            seed: 42,
            options: { timeLimit: 30 },
            aiScores: { p1: 163, p2: 149 },
          }}
          players={[
            { id: 'p0', name: 'You', avatar: '🙂', status: 'active', isUser: true },
            { id: 'p1', name: 'Nova', avatar: '😀', status: 'active' },
            { id: 'p2', name: 'Iris', avatar: '😎', status: 'active' },
          ]}
        />
      </Provider>,
    );

    await act(async () => {
      engineInstances[0].options.onFinish(TEST_RESULT);
    });

    expect(screen.getByText(/race complete/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /continue/i }));

    expect(store.dispatch).toHaveBeenCalledWith(
      completeMinigame({
        humanScore: 184,
        winnerId: 'p0',
        lastPlaceId: 'p2',
      }),
    );
  });

  it('passes the final hosted score to MinigameHost flows after the finish animation resolves', async () => {
    const onFinish = vi.fn();
    const store = createStore();

    render(
      <Provider store={store}>
        <QuickTapRace
          seed={91}
          participantIds={['p0', 'p1', 'p2']}
          participants={[
            { id: 'p0', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
            { id: 'p1', name: 'Nova', isHuman: false, precomputedScore: 171, previousPR: null },
            { id: 'p2', name: 'Iris', isHuman: false, precomputedScore: 159, previousPR: null },
          ]}
          onFinish={onFinish}
        />
      </Provider>,
    );

    await act(async () => {
      engineInstances[0].options.onFinish(TEST_RESULT);
    });

    expect(onFinish).toHaveBeenCalledWith(184);
  });
});
