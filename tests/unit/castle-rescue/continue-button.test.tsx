import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CastleRescueGame from '../../../src/minigames/castleRescue/CastleRescueGame';

let latestRaf: FrameRequestCallback | null = null;

beforeEach(() => {
  latestRaf = null;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    latestRaf = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function renderCompleted(onFinish?: (score: number) => void) {
  render(<CastleRescueGame seed={42} autoStart timeLimitMs={0} onFinish={onFinish} />);
  expect(latestRaf).not.toBeNull();
  await act(async () => {
    latestRaf?.(performance.now());
  });
}

describe('CastleRescueGame overlay actions', () => {
  it('shows Continue when onFinish is provided', async () => {
    await renderCompleted(vi.fn());
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('shows Play Again when onFinish is omitted', async () => {
    await renderCompleted();
    expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument();
  });

  it('calls onFinish exactly once on timeout, not again on button click', async () => {
    const onFinish = vi.fn();
    await renderCompleted(onFinish);

    expect(onFinish).toHaveBeenCalledTimes(1);
    const continueButton = screen.getByRole('button', { name: /continue/i });
    fireEvent.click(continueButton);
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(typeof onFinish.mock.calls[0][0]).toBe('number');
  });

  it('keeps the completion button reliably tappable and disables the board underneath', async () => {
    await renderCompleted(vi.fn());

    const overlayButton = screen.getByRole('button', { name: /continue/i });
    const board = screen.getByLabelText(/castle rescue match-3 board/i);
    expect(overlayButton.style.touchAction).toBe('manipulation');
    expect(overlayButton.style.pointerEvents).toBe('auto');
    expect(board).toBeInTheDocument();
  });
});
