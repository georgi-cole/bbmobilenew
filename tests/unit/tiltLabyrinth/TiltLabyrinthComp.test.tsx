import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactNode } from 'react';
import TiltLabyrinthComp from '../../../src/components/TiltLabyrinthComp/TiltLabyrinthComp';
import {
  calculateTiltAdjustedTime,
  resolveCollisions,
} from '../../../src/components/TiltLabyrinthComp/tiltLabyrinthCollision';
import tiltLabyrinthReducer, {
  setHumanScore,
} from '../../../src/features/tiltLabyrinth/tiltLabyrinthSlice';

vi.mock('../../../src/components/TiltLabyrinthComp/TiltLabyrinthComp.css', () => ({}));
vi.mock('../../../src/components/MinigameHost/MinigameCompleteWrapper', () => ({
  default: ({
    children,
    placementsNode,
    onContinue,
  }: {
    children: ReactNode;
    placementsNode: ReactNode;
    onContinue: () => void;
  }) => (
    <div>
      {children}
      {placementsNode}
      <button type="button" onClick={onContinue}>
        Continue
      </button>
    </div>
  ),
}));

const COLLISION_CONFIG = {
  radius: 6,
  cellPx: 25,
  mazeCols: 19,
  mazeRows: 19,
  mazeWidth: 19 * 25,
  mazeHeight: 19 * 25,
  maxCollisionStepPx: 1.5,
} as const;

function makeMaze() {
  return Array.from({ length: 19 }, () =>
    Array.from({ length: 19 }, () => ({
      walls: { top: false, right: false, bottom: false, left: false },
    })),
  );
}

function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    createRadialGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    set fillStyle(_: string) {},
    set strokeStyle(_: string) {},
    set lineWidth(_: number) {},
    set lineCap(_: CanvasLineCap) {},
    set lineJoin(_: CanvasLineJoin) {},
    set font(_: string) {},
    set textAlign(_: CanvasTextAlign) {},
    set textBaseline(_: CanvasTextBaseline) {},
    set shadowColor(_: string) {},
    set shadowBlur(_: number) {},
  });
}

function makeStore() {
  return configureStore({
    reducer: { tiltLabyrinth: tiltLabyrinthReducer },
  });
}

describe('Tilt Labyrinth adjusted scoring', () => {
  it('accepts unlimited raw time and adds three seconds per hazard hit', () => {
    expect(calculateTiltAdjustedTime(7 * 60_000, 4)).toBe(432_000);
  });
});
describe('TiltLabyrinthComp movement hardening', () => {
  beforeEach(() => {
    stubCanvas();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prevents tunneling through walls when a move spans past the blocking segment', () => {
    const maze = makeMaze();
    maze[0][0].walls.right = true;
    maze[0][1].walls.left = true;

    const startX = 12.5;
    const startY = 12.5;
    const velocityX = 40;

    const result = resolveCollisions(maze, startX + velocityX, startY, velocityX, 0, COLLISION_CONFIG);

    expect(result.bx).toBeLessThan(19.5);
    expect(result.by).toBe(startY);
    expect(result.vx).toBe(0);
  });

  it('keeps movement flowing on the open axis when the ball hits a wall diagonally', () => {
    const maze = makeMaze();
    maze[0][0].walls.right = true;
    maze[0][1].walls.left = true;

    const startX = 12.5;
    const startY = 12.5;
    const velocityX = 18;
    const velocityY = 12;

    const result = resolveCollisions(
      maze,
      startX + velocityX,
      startY + velocityY,
      velocityX,
      velocityY,
      COLLISION_CONFIG,
    );

    expect(result.bx).toBeLessThan(19.5);
    expect(result.by).toBeGreaterThan(startY);
    expect(result.vx).toBe(0);
    expect(result.vy).toBe(velocityY);
  });

  it('shows elapsed time and hazard penalties without a time limit', () => {
    render(
      <Provider store={makeStore()}>
        <TiltLabyrinthComp
          participantIds={['human', 'ai-1']}
          participants={[
            {
              id: 'human',
              name: 'You',
              isHuman: true,
              precomputedScore: 0,
              previousPR: null,
            },
            {
              id: 'ai-1',
              name: 'Alex',
              isHuman: false,
              precomputedScore: 0,
              previousPR: null,
            },
          ]}
          prizeType="LOH"
          seed={42}
          onComplete={vi.fn()}
        />
      </Provider>,
    );

    expect(screen.queryByLabelText(/time remaining/i)).not.toBeInTheDocument();
    expect(screen.getByText(/arrow keys \/ wasd or drag/i)).toBeInTheDocument();
    expect(screen.getByText(/time 0.00s/i)).toBeInTheDocument();
    expect(screen.getByText(/hazards 0.*\+0s/i)).toBeInTheDocument();
  });

  it('continues with the recorded human finish time even when the leaderboard lacks a human entry', () => {
    const onComplete = vi.fn();
    const completedState = {
      phase: 'complete' as const,
      competitionType: 'LOH' as const,
      seed: 42,
      participants: [{ id: 'ai-1', name: 'Alex', isHuman: false }],
      humanPlayerId: 'human',
      aiScores: { 'ai-1': 6000 },
      humanScore: 4321,
      finalScores: { 'ai-1': 6000 },
      winnerId: 'ai-1',
      lastPlaceId: null,
      outcomeResolved: true,
    };
    const store = configureStore({
      reducer: {
        tiltLabyrinth: () => completedState,
      },
    });

    render(
      <Provider store={store}>
        <TiltLabyrinthComp
          participantIds={['human', 'ai-1']}
          participants={[
            {
              id: 'human',
              name: 'You',
              isHuman: true,
              precomputedScore: 0,
              previousPR: null,
            },
            {
              id: 'ai-1',
              name: 'Alex',
              isHuman: false,
              precomputedScore: 0,
              previousPR: null,
            },
          ]}
          prizeType="LOH"
          seed={42}
          onComplete={onComplete}
        />
      </Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onComplete).toHaveBeenCalledWith({
      rawValue: 4321,
      rawResults: { 'ai-1': 6000 },
      authoritativeWinnerId: 'ai-1',
      authoritativeLastPlaceId: null,
    });
  });

  it('preserves completed results when the parent recreates participant arrays', () => {
    const store = makeStore();
    const props = {
      participantIds: ['human', 'ai-1'],
      participants: [
        { id: 'human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
        { id: 'ai-1', name: 'Alex', isHuman: false, precomputedScore: 0, previousPR: null },
      ],
      prizeType: 'LOH' as const,
      seed: 42,
      onComplete: vi.fn(),
    };
    const view = render(
      <Provider store={store}>
        <TiltLabyrinthComp {...props} />
      </Provider>,
    );

    act(() => {
      store.dispatch(setHumanScore(4321));
    });
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();

    view.rerender(
      <Provider store={store}>
        <TiltLabyrinthComp
          {...props}
          participantIds={[...props.participantIds]}
          participants={props.participants.map((participant) => ({ ...participant }))}
        />
      </Provider>,
    );

    expect(store.getState().tiltLabyrinth.phase).toBe('complete');
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });
});
