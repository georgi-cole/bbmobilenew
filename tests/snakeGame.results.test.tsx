import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import SnakeGame from '../src/components/SnakeGame/SnakeGame';
import gameReducer from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import { getGame } from '../src/minigames/registry';
import { simulateSnakeAiScore } from '../src/ai/competition/snakeAiSimulator';

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

const snakeStyles = readFileSync(
  path.resolve(process.cwd(), 'src/components/SnakeGame/SnakeGame.css'),
  'utf8',
);

function ensureSnakeStylesInjected() {
  if (document.getElementById('snake-test-styles')) return;
  const style = document.createElement('style');
  style.id = 'snake-test-styles';
  style.textContent = snakeStyles;
  document.head.appendChild(style);
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

  it('renders a larger Nokia status line for points and time', () => {
    const store = makeStore();
    ensureSnakeStylesInjected();

    render(
      <Provider store={store}>
        <SnakeGame seed={42} participantIds={['p0', 'p1', 'p2']} onFinish={vi.fn()} />
      </Provider>,
    );

    const statusLine = screen.getByText(/0 PTS\s+0:00\.0/i) as HTMLElement;
    const styles = getComputedStyle(statusLine);
    const normalizedStyles = snakeStyles.replace(/\s+/g, ' ');

    expect(statusLine).toHaveClass('snake-status-line');
    expect(normalizedStyles).toContain('font-size: clamp(9px, 2.4vw, 12px);');
    expect(styles.getPropertyValue('padding-top')).toBe('1px');
    expect(styles.getPropertyValue('padding-right')).toBe('5px');
    expect(styles.getPropertyValue('padding-bottom')).toBe('1px');
    expect(styles.getPropertyValue('padding-left')).toBe('5px');
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

// ── Leaderboard ordering contract ────────────────────────────────────────────
//
// sortScoreEntries (private to SnakeGame.tsx) defines race-to-1000 ranking:
//  1. Completers (completionMs != null) rank above non-completers.
//  2. Among completers: faster (lower ms) ranks higher.
//  3. Among non-completers: higher score ranks higher.
//
// We verify this via the rendered leaderboard by driving the game to the
// results screen with a mock that returns controlled completion times.

describe('SnakeGame leaderboard ordering — sortScoreEntries contract', () => {
  let simulateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(), clearRect: vi.fn(), fillText: vi.fn(), beginPath: vi.fn(),
      closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      save: vi.fn(), restore: vi.fn(),
      set fillStyle(_: string) {},
      set font(_: string) {},
      set textAlign(_: string) {},
      set textBaseline(_: string) {},
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    simulateMock = simulateSnakeAiScore as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function makeStore3() {
    const base = gameReducer(undefined, { type: '@@INIT' });
    return configureStore({
      reducer: { game: gameReducer, settings: settingsReducer },
      preloadedState: {
        game: {
          ...base,
          players: [
            { id: 'p0', name: 'You', avatar: '🙂', status: 'active', isUser: true },
            { id: 'p1', name: 'FastAI', avatar: '🤖', status: 'active', isUser: false },
            { id: 'p2', name: 'SlowAI', avatar: '🤖', status: 'active', isUser: false },
            { id: 'p3', name: 'DidNotFinish', avatar: '🤖', status: 'active', isUser: false },
          ],
        },
      },
    });
  }

  async function driveToResults(store: ReturnType<typeof makeStore3>) {
    render(
      <Provider store={store}>
        <SnakeGame
          autoStart
          seed={42}
          participantIds={['p0', 'p1', 'p2', 'p3']}
          onFinish={vi.fn()}
        />
      </Provider>,
    );
    // Advance past game-over + 1.2s delay + 10s reveal
    await act(async () => { vi.advanceTimersByTime(13000); });
  }

  it('completers rank above non-completers', async () => {
    // p1 and p2 complete (different times); p0 and p3 don't complete
    simulateMock.mockImplementation(({ playerId }: { playerId: string }) => {
      if (playerId === 'p1') return { score: 1000, completionMs: 8000 };
      if (playerId === 'p2') return { score: 1000, completionMs: 15000 };
      if (playerId === 'p3') return { score: 600, completionMs: null };
      return { score: 0, completionMs: null };
    });

    await driveToResults(makeStore3());

    const items = screen.getAllByRole('listitem');
    const names = items.map((li) => li.textContent ?? '');

    const fastAiIdx = names.findIndex((t) => t.includes('FastAI'));
    const slowAiIdx = names.findIndex((t) => t.includes('SlowAI'));
    const dnfIdx = names.findIndex((t) => t.includes('DidNotFinish'));

    // Both completers should appear before non-completers
    expect(fastAiIdx).toBeGreaterThanOrEqual(0);
    expect(slowAiIdx).toBeGreaterThanOrEqual(0);
    expect(dnfIdx).toBeGreaterThanOrEqual(0);
    expect(fastAiIdx).toBeLessThan(dnfIdx);
    expect(slowAiIdx).toBeLessThan(dnfIdx);
  });

  it('faster completer ranks above slower completer', async () => {
    simulateMock.mockImplementation(({ playerId }: { playerId: string }) => {
      if (playerId === 'p1') return { score: 1000, completionMs: 8000 };  // faster
      if (playerId === 'p2') return { score: 1000, completionMs: 15000 }; // slower
      if (playerId === 'p3') return { score: 600, completionMs: null };
      return { score: 0, completionMs: null };
    });

    await driveToResults(makeStore3());

    const items = screen.getAllByRole('listitem');
    const names = items.map((li) => li.textContent ?? '');

    const fastAiIdx = names.findIndex((t) => t.includes('FastAI'));
    const slowAiIdx = names.findIndex((t) => t.includes('SlowAI'));

    expect(fastAiIdx).toBeGreaterThanOrEqual(0);
    expect(slowAiIdx).toBeGreaterThanOrEqual(0);
    expect(fastAiIdx).toBeLessThan(slowAiIdx);
  });

  it('among non-completers, higher score ranks higher', async () => {
    simulateMock.mockImplementation(({ playerId }: { playerId: string }) => {
      if (playerId === 'p1') return { score: 300, completionMs: null };
      if (playerId === 'p2') return { score: 600, completionMs: null }; // higher
      if (playerId === 'p3') return { score: 200, completionMs: null };
      return { score: 0, completionMs: null };
    });

    await driveToResults(makeStore3());

    const items = screen.getAllByRole('listitem');
    const names = items.map((li) => li.textContent ?? '');

    const p1Idx = names.findIndex((t) => t.includes('FastAI'));   // 300 pts
    const p2Idx = names.findIndex((t) => t.includes('SlowAI'));   // 600 pts — should be higher
    const p3Idx = names.findIndex((t) => t.includes('DidNotFinish')); // 200 pts

    expect(p2Idx).toBeGreaterThanOrEqual(0);
    expect(p1Idx).toBeGreaterThanOrEqual(0);
    expect(p3Idx).toBeGreaterThanOrEqual(0);
    expect(p2Idx).toBeLessThan(p1Idx);
    expect(p1Idx).toBeLessThan(p3Idx);
  });
});
