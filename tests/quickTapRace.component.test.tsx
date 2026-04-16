/**
 * QuickTapRace canvas component tests.
 *
 * Since the booster prompt is now rendered on-canvas, this suite tests the
 * DOM-visible aspects of the component (HUD, canvas presence, fallback path)
 * and delegates booster / gameplay mechanics to the engine unit tests in
 * tests/unit/quickTapRace/quickTapRaceCanvasEngine.test.ts.
 *
 * Covers:
 *  1. Canvas presence with correct test-id.
 *  2. HUD score visible once playing phase begins.
 *  3. Fallback alert when canvas context unavailable.
 *  4. Challenge-path reseeding: each component mount uses a fresh crypto seed
 *     even when the same non-zero seed prop is supplied (no session).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import QuickTapRace from '../src/components/QuickTapRace/QuickTapRace';
import * as cryptoSpinModule from '../src/features/riskWheel/cryptoSpin';

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
  const originalRAF = window.requestAnimationFrame;
  const originalCAF = window.cancelAnimationFrame;

  // Install RAF stubs before each test so the engine's destroy() can call
  // cancelAnimationFrame during component unmount (which happens inside cleanup).
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      makeContextStub() as unknown as CanvasRenderingContext2D,
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
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
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

  it('shows the fallback alert when the canvas context is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    renderQuickTapRace();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/game arena unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('challenge-path reseeding: each mount uses a fresh cryptoSeed regardless of seed prop', () => {
    // When QuickTapRaceCanvasGame receives a non-zero seed prop but NO session,
    // it must call cryptoSeed() to generate a fresh per-mount seed so that
    // repeated challenge retries don't lock into the same booster sequence.
    let callCount = 0;
    const returnedSeeds: number[] = [];
    const cryptoSeedSpy = vi.spyOn(cryptoSpinModule, 'cryptoSeed').mockImplementation(() => {
      const val = 90000 + callCount * 7; // different value per call
      returnedSeeds.push(val);
      callCount += 1;
      return val;
    });

    const store = configureStore({
      reducer: {
        game: (
          state = {
            players: [{ id: 'p0', name: 'You', avatar: '🙂', status: 'active', isUser: true }],
          },
        ) => state,
      },
    });

    // Render twice with the same non-zero seed prop (simulates retry with same pendingChallenge.seed).
    render(
      <Provider store={store}>
        <QuickTapRace seed={12345} autoStart onFinish={vi.fn()} />
      </Provider>,
    );
    cleanup();
    render(
      <Provider store={store}>
        <QuickTapRace seed={12345} autoStart onFinish={vi.fn()} />
      </Provider>,
    );
    cleanup();

    // cryptoSeed() must have been called on each mount (not the prop value 12345).
    expect(cryptoSeedSpy).toHaveBeenCalledTimes(2);
    // The two resolved seeds must differ from each other AND from the prop seed.
    expect(returnedSeeds[0]).not.toBe(12345);
    expect(returnedSeeds[1]).not.toBe(12345);
    expect(returnedSeeds[0]).not.toBe(returnedSeeds[1]);

    cryptoSeedSpy.mockRestore();
  });
});
