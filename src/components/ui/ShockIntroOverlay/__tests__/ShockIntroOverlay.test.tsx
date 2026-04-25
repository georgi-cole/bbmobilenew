import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShockIntroOverlay from '../ShockIntroOverlay';

describe('ShockIntroOverlay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('restarts the completion timer when the shock key changes mid-stinger', () => {
    const onComplete = vi.fn();
    const { rerender } = render(
      <ShockIntroOverlay active shockKey="twist" onComplete={onComplete} />,
    );

    vi.advanceTimersByTime(500);

    rerender(
      <ShockIntroOverlay active shockKey="double_eviction" onComplete={onComplete} />,
    );

    vi.advanceTimersByTime(1099);
    expect(onComplete).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('uses the Back 2 the Game title for staged battle back announcement keys', () => {
    render(
      <ShockIntroOverlay active shockKey="battle_back_shock" onComplete={vi.fn()} />,
    );

    expect(screen.getByText('BACK 2 THE GAME')).toBeTruthy();
  });
});
