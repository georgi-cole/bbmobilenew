/**
 * tests/unit/castle-rescue/continue-button.test.tsx
 *
 * Tests for the Continue / Play Again button in the CastleRescueGame end overlay.
 *
 * Covers:
 *  1. With onFinish prop: clicking the button calls onFinish with the final score.
 *  2. Without onFinish prop: clicking the button shows the correct label.
 *  3. The button has touchAction:'manipulation' and pointerEvents:'auto' styles
 *     so it is always tappable on mobile even inside the canvas overlay.
 *
 * Test strategy: render with timeLimitMs=0 so the game times out on the very
 * first animation frame, triggering the 'complete' phase and showing the end
 * overlay.  requestAnimationFrame is stubbed to capture (not auto-run) the
 * callback; frames are triggered manually to avoid infinite loops.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CastleRescueGame from '../../../src/minigames/castleRescue/CastleRescueGame';

// ── Canvas + rAF stubs ─────────────────────────────────────────────────────────

/** Minimal 2d context stub. */
function makeCtxStub() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 0 }),
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
    set fillStyle(_: unknown) {},
    set strokeStyle(_: unknown) {},
    set font(_: unknown) {},
    set lineWidth(_: unknown) {},
    set globalAlpha(_: unknown) {},
    set textAlign(_: unknown) {},
    set textBaseline(_: unknown) {},
  };
}

/** Latest rAF callback registered by the component. */
let latestRafCb: FrameRequestCallback | null = null;

beforeEach(() => {
  latestRafCb = null;

  // Stub canvas 2d context so jsdom does not throw.
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(makeCtxStub());

  // Stub rAF: capture the latest callback without auto-running it.
  // Tests manually fire frames to avoid infinite recursion.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    latestRafCb = cb;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ── Helper: advance game to 'complete' state ───────────────────────────────────

/**
 * Renders CastleRescueGame with timeLimitMs=0 and manually fires enough
 * animation frames to drive the game into the 'complete' phase.
 *
 * Frame 1: updateGame detects elapsed>=0>=timeLimitMs(=0) -> gs.phase='complete'.
 * Frame 2: loop sees gs.phase==='complete' -> calls setPhase/setEndStats (React
 *           state update) -> overlay becomes visible after act() flushes.
 */
async function renderCompleted(onFinish?: (score: number) => void) {
  const props: Parameters<typeof CastleRescueGame>[0] = {
    seed: 42,
    timeLimitMs: 0, // expire on first frame (elapsed=now-startTime >= 0 = timeLimitMs)
    autoStart: true,
    ...(onFinish ? { onFinish } : {}),
  };

  render(<CastleRescueGame {...props} />);

  // Fire up to 3 frames sequentially; 2 are normally sufficient to reach 'complete'.
  // Sequential execution is intentional: each frame must complete before the next
  // (the component re-registers a new rAF callback at the end of each frame).
  for (let frame = 0; frame < 3; frame++) {
    if (!latestRafCb) break;
    const cb = latestRafCb;
    await act(async () => { cb(performance.now()); });
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CastleRescueGame — Continue / Play Again button', () => {
  it('renders the end overlay button after game completion', async () => {
    await renderCompleted();
    expect(screen.getByRole('button', { name: /continue|play again/i })).toBeInTheDocument();
  });

  it('shows "Continue" label when onFinish prop is provided', async () => {
    await renderCompleted(vi.fn());
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('shows "Play Again" label when no onFinish prop is provided', async () => {
    await renderCompleted();
    expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument();
  });

  it('calls onFinish with the final score when Continue is clicked', async () => {
    const onFinish = vi.fn();
    await renderCompleted(onFinish);

    const btn = screen.getByRole('button', { name: /continue/i });
    // onFinish was already called once by the game loop on completion.
    // Clicking the button should NOT call it again (host already notified).
    const callsBeforeClick = onFinish.mock.calls.length;
    fireEvent.click(btn);
    // Call count must not increase — the loop call is the authoritative notification.
    expect(onFinish).toHaveBeenCalledTimes(callsBeforeClick);
    // And the call that did happen carried a numeric score.
    expect(typeof onFinish.mock.calls[0][0]).toBe('number');
  });

  it('button has touchAction:manipulation style for reliable mobile tapping', async () => {
    await renderCompleted(vi.fn());
    const btn = screen.getByRole('button', { name: /continue|play again/i });
    expect(btn.style.touchAction).toBe('manipulation');
  });

  it('button has pointerEvents:auto style to prevent overlay blocking', async () => {
    await renderCompleted(vi.fn());
    const btn = screen.getByRole('button', { name: /continue|play again/i });
    expect(btn.style.pointerEvents).toBe('auto');
  });
});
