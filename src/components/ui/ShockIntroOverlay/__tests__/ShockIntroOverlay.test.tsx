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

  it('uses the staged Back 2 the Game announcement copy for battle back shock keys', () => {
    render(
      <ShockIntroOverlay active shockKey="battle_back_shock" onComplete={vi.fn()} />,
    );

    expect(screen.getByText('Shock Twist')).toBeTruthy();
    expect(screen.getByText(/Back 2 the Game has been activated/i)).toBeTruthy();
  });

  it('renders the provided TV announcement copy and hides the info button', () => {
    render(
      <ShockIntroOverlay
        active
        shockKey="double_eviction"
        announcement={{
          key: 'double_eviction',
          title: 'Double Elimination!',
          subtitle: 'Tonight the LOH nominates three. Two will be eliminated.',
          isLive: true,
          autoDismissMs: null,
        }}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /Announcement: Double Elimination!/i, hidden: true })).toBeTruthy();
    expect(screen.getByText(/Tonight the LOH nominates three/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /More info/i })).toBeNull();
  });
});
