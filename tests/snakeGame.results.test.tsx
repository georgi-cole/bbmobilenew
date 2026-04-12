import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import SnakeGame from '../src/components/SnakeGame/SnakeGame';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import { getGame } from '../src/minigames/registry';

vi.mock('../src/ai/competition/snakeAiSimulator', () => ({
  simulateSnakeAiScore: vi.fn(({ playerId }: { playerId: string }) => {
    if (playerId === 'p1') return { score: 900, completionMs: null };
    if (playerId === 'p2') return { score: 400, completionMs: null };
    return { score: 0, completionMs: null };
  }),
}));

function makeStore() {
  const baseGameState = gameReducer(undefined, { type: '@@INIT' });

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
    },
    preloadedState: {
      game: {
        ...baseGameState,
        players: [
          { id: 'p0', name: 'You', avatar: '🙂', status: 'active', isUser: true },
          { id: 'p1', name: 'Alex', avatar: '😎', status: 'active', isUser: false },
          { id: 'p2', name: 'Blair', avatar: '🤖', status: 'active', isUser: false },
        ],
      },
    },
  });
}

function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    set fillStyle(_: string) {},
  });
}

async function driveGameToWaiting() {
  await act(async () => {
    vi.advanceTimersByTime(2700);
  });
}

describe('SnakeGame competition reveal flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubCanvas();
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows the async waiting screen before auto-revealing the ranking', async () => {
    const onFinish = vi.fn();
    const store = makeStore();

    render(
      <Provider store={store}>
        <SnakeGame
          autoStart
          seed={42}
          participantIds={['p0', 'p1', 'p2']}
          onFinish={onFinish}
        />
      </Provider>,
    );

    await driveGameToWaiting();

    expect(screen.getByText(/Some players still wrapping up/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /snake activity animation/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/snake game board/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/direction controls/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /competition results/i })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(9999);
    });
    expect(screen.queryByRole('region', { name: /competition results/i })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByRole('region', { name: /competition results/i })).toBeInTheDocument();
    expect(screen.getByText(/Alex wins!/i)).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
  });

  it('unlocks fast forward after 4 seconds and resolves the wait in 2 seconds', async () => {
    const onFinish = vi.fn();
    const store = makeStore();

    render(
      <Provider store={store}>
        <SnakeGame
          autoStart
          seed={42}
          participantIds={['p0', 'p1', 'p2']}
          onFinish={onFinish}
        />
      </Provider>,
    );

    await driveGameToWaiting();

    expect(screen.queryByRole('button', { name: /fast forward/i })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    fireEvent.click(screen.getByRole('button', { name: /fast forward/i }));

    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.queryByRole('region', { name: /competition results/i })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onFinish).toHaveBeenCalledWith(0);
  });
});

describe('Snake registry instructions', () => {
  it('documents the async ranking reveal in the rules copy', () => {
    const snake = getGame('snake');
    expect(snake?.instructions).toContain(
      'Runs resolve asynchronously — start independently, then wait for the full ranking reveal',
    );
  });
});
