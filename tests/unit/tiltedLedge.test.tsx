/**
 * Unit tests for TiltedLedge component.
 *
 * Covers:
 *  1. Renders Start and Stop buttons initially.
 *  2. Clicking Stop before Start calls onFinish with 0.
 *  3. Clicking Start then Stop calls onFinish with a number.
 *  4. onFinish receives a non-negative integer elapsed seconds value.
 *  5. After starting, the Pause button replaces the Start button.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import TiltedLedge from '../../src/components/TiltedLedge/TiltedLedge';

// jsdom does not implement HTMLCanvasElement.getContext — stub it out.
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    set fillStyle(_v: string) {},
    set font(_v: string) {},
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TiltedLedge', () => {
  it('renders Start and Stop buttons on mount', () => {
    render(<TiltedLedge onFinish={vi.fn()} autoStart={false} />);
    expect(screen.getByRole('button', { name: /start tilted ledge/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop tilted ledge/i })).toBeInTheDocument();
  });

  it('shows Pause button (not Start) after clicking Start', () => {
    render(<TiltedLedge onFinish={vi.fn()} autoStart={false} />);
    fireEvent.click(screen.getByRole('button', { name: /start tilted ledge/i }));
    expect(screen.getByRole('button', { name: /pause tilted ledge/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start tilted ledge/i })).not.toBeInTheDocument();
  });

  it('calls onFinish with 0 when Stop is clicked without starting', () => {
    const onFinish = vi.fn();
    render(<TiltedLedge onFinish={onFinish} autoStart={false} />);
    fireEvent.click(screen.getByRole('button', { name: /stop tilted ledge/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0]).toBe(0);
  });

  it('calls onFinish with a number when Start then Stop are clicked', async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(<TiltedLedge onFinish={onFinish} autoStart={false} />);

    fireEvent.click(screen.getByRole('button', { name: /start tilted ledge/i }));

    // Advance time by 3.5 seconds
    await act(async () => {
      vi.advanceTimersByTime(3500);
    });

    fireEvent.click(screen.getByRole('button', { name: /stop tilted ledge/i }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    const elapsed: number = onFinish.mock.calls[0][0];
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);

    vi.useRealTimers();
  });

  it('onFinish elapsed value is a non-negative integer', () => {
    const onFinish = vi.fn();
    render(<TiltedLedge onFinish={onFinish} autoStart={false} />);
    fireEvent.click(screen.getByRole('button', { name: /stop tilted ledge/i }));
    const elapsed: number = onFinish.mock.calls[0][0];
    expect(Number.isInteger(elapsed)).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});
