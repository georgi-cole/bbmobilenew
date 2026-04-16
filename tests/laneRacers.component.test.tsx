import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LaneRacersCanvasGame from '../src/minigames/laneRacers/LaneRacersCanvasGame';

const mockEngineInstance = {
  getSnapshot: vi.fn(() => ({
    phase: 'active',
    countdownText: '',
    timeLeftMs: 60_000,
    playerScore: 0,
    playerRawTaps: 0,
    playerCombo: 0,
    playerShieldCharges: 0,
    playerEffectLabel: null,
    playerEffectIcon: null,
    playerHeat: 0,
    playerPickupDodgeMs: 0,
    statusText: 'Race live — build momentum',
    leadingRacerId: 'p0',
    rankings: [{ id: 'p0', name: 'You', score: 0, rawTaps: 0, isPlayer: true, finishMs: null, progress: 0 }],
    result: null,
    seed: 42,
  })),
  start: vi.fn(),
  resize: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  destroy: vi.fn(),
  handleControlTap: vi.fn(),
  armPickupDodge: vi.fn(),
};

vi.mock('../src/hooks/useQuickTapRaceAudio', () => ({
  useQuickTapRaceAudio: () => ({
    playTap: vi.fn(),
    playBooster: vi.fn(),
    playHalfTap: vi.fn(),
  }),
}));

vi.mock('../src/minigames/laneRacers/engine/input', () => ({
  attachQuickTapRaceInput: vi.fn(() => vi.fn()),
}));

vi.mock('../src/minigames/laneRacers/engine/quickTapRaceCanvasEngine', () => ({
  QuickTapRaceCanvasEngine: vi.fn(() => mockEngineInstance),
}));

function renderLaneRacers() {
  const store = configureStore({
    reducer: {
      game: (
        state = {
          players: [{ id: 'p0', name: 'You', avatar: '🙂', status: 'active', isUser: true }],
        },
      ) => state,
    },
  });

  return render(
    <Provider store={store}>
      <LaneRacersCanvasGame seed={42} onFinish={vi.fn()} participantIds={['p0', 'p1']} />
    </Provider>,
  );
}

describe('Lane Racers canvas component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders dedicated tap and dodge controls', () => {
    renderLaneRacers();

    fireEvent.pointerDown(screen.getByRole('button', { name: /^tap$/i }));
    fireEvent.click(screen.getByRole('button', { name: /dodge next pickup/i }));

    expect(mockEngineInstance.handleControlTap).toHaveBeenCalledTimes(1);
    expect(mockEngineInstance.armPickupDodge).toHaveBeenCalledTimes(1);
  });

  it('removes the extra mobile stat cards from the side panel', () => {
    renderLaneRacers();

    expect(screen.queryByText(/raw taps/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^combo$/i)).not.toBeInTheDocument();
  });
});
