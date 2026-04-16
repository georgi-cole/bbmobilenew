/**
 * QuickTapRace canvas component tests.
 *
 * Since the booster prompt is now rendered on-canvas, this suite tests the
 * DOM-visible aspects of the component (HUD, canvas presence, fallback path)
 * and delegates booster / gameplay mechanics to the engine unit tests in
 * tests/unit/quickTapRace/quickTapRaceCanvasEngine.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import QuickTapRace from '../src/components/QuickTapRace/QuickTapRace';

vi.mock('../src/hooks/useQuickTapRaceAudio', () => ({
  useQuickTapRaceAudio: () => ({
    playTap: vi.fn(),
    playBooster: vi.fn(),
    playHalfTap: vi.fn(),
  }),
}));

// Minimal canvas 2D context stub so the engine can initialize in JSDOM.
function makeContextStub() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    setTransform: vi.fn(),
    scale: vi.fn(),
    set fillStyle(_v: string) {},
    set strokeStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set globalAlpha(_v: number) {},
    get globalAlpha() {
      return 1;
    },
    set font(_v: string) {},
    set textAlign(_v: CanvasTextAlign) {},
    set textBaseline(_v: CanvasTextBaseline) {},
    set shadowColor(_v: string) {},
    set shadowBlur(_v: number) {},
  };
}

function renderQuickTapRace() {
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
      <QuickTapRace seed={42} autoStart onFinish={vi.fn()} />
    </Provider>,
  );
}

describe('QuickTapRace canvas component', () => {
  // Install RAF stubs before each test so the engine's destroy() can call
  // cancelAnimationFrame during component unmount (which happens inside cleanup).
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      makeContextStub() as never,
    );
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) =>
      window.setTimeout(() => cb(performance.now()), 16) as unknown as number,
    );
    window.cancelAnimationFrame = vi.fn((handle: number) => window.clearTimeout(handle));
  });

  afterEach(() => {
    // Unmount before restoring window globals so that engine.destroy() still
    // has valid RAF functions available during React's passive cleanup phase.
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders the game canvas with the correct test-id', () => {
    renderQuickTapRace();
    expect(screen.getByTestId('quick-tap-race-canvas')).toBeInTheDocument();
  });

  it('shows the score HUD once the playing phase begins', async () => {
    renderQuickTapRace();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // The HUD score (starts at 0) and "taps" label are DOM elements.
    expect(screen.getByText('taps')).toBeInTheDocument();
  });

  it('shows the fallback alert when the canvas context is unavailable', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    renderQuickTapRace();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/game arena unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });
});
