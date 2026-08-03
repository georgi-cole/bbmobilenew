import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KolequantSplash from '../KolequantSplash';

describe('KolequantSplash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the logo, preload row, progress, and trimmed copyright text', () => {
    const { container } = render(
      <KolequantSplash duration={2400} progress={42} messages={['Opening the house doors.']} />,
    );

    expect(screen.getByAltText('Kolequant')).toBeInTheDocument();
    expect(screen.getByText('Opening the house doors.')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('© 2026')).toBeInTheDocument();
    expect(container.querySelector('.kq-splash__dna-glow')).toBeInTheDocument();
    expect(container.querySelector('.kq-splash__electric')).toBeNull();
    expect(container.querySelector('.kq-splash__logo-frame')).toBeNull();
    expect(container.firstChild).not.toHaveClass('kq-splash--artwork-ready');
    expect(container.firstChild).toHaveStyle({
      '--kq-splash-min-duration': '2400ms',
      '--kq-splash-progress': '42%',
    });
  });

  it('waits for both duration and readiness before calling onFinish', async () => {
    const onFinish = vi.fn();

    const view = render(<KolequantSplash duration={1500} ready={false} onFinish={onFinish} />);

    fireEvent.load(view.container.querySelector('.kq-splash__skyline img')!);
    expect(view.container.firstChild).not.toHaveClass('kq-splash--artwork-ready');

    fireEvent.load(view.container.querySelector('.kq-splash__logo')!);
    expect(view.container.firstChild).not.toHaveClass('kq-splash--artwork-ready');

    fireEvent.load(view.container.querySelector('.kq-splash__dna-glow')!);
    expect(view.container.firstChild).toHaveClass('kq-splash--artwork-ready');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(onFinish).not.toHaveBeenCalled();

    view.rerender(<KolequantSplash duration={1500} ready onFinish={onFinish} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('shows caller status instead of rotating generic messages', () => {
    render(<KolequantSplash status="Loading the house exterior." progress={18} />);

    expect(screen.getByText('Loading the house exterior.')).toBeInTheDocument();
    expect(screen.queryByText('Starting the Kolequant engine.')).toBeNull();
  });

  it('keeps the latest finish callback without cancelling an active exit', async () => {
    const firstFinish = vi.fn();
    const latestFinish = vi.fn();
    const view = render(<KolequantSplash duration={0} ready onFinish={firstFinish} />);

    fireEvent.load(view.container.querySelector('.kq-splash__skyline img')!);
    fireEvent.load(view.container.querySelector('.kq-splash__logo')!);
    fireEvent.load(view.container.querySelector('.kq-splash__dna-glow')!);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    view.rerender(<KolequantSplash duration={0} ready onFinish={latestFinish} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });

    expect(firstFinish).not.toHaveBeenCalled();
    expect(latestFinish).toHaveBeenCalledTimes(1);
  });
});
