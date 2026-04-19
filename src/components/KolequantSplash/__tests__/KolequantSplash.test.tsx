import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import KolequantSplash from '../KolequantSplash';

describe('KolequantSplash', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders only the logo and trimmed copyright text', () => {
    const { container } = render(<KolequantSplash duration={2400} />);

    expect(screen.getByAltText('Kolequant')).toBeInTheDocument();
    expect(screen.getByText('© 2026')).toBeInTheDocument();
    expect(container.querySelector('.kq-splash__electric')).toBeNull();
    expect(container.querySelector('.kq-splash__logo-frame')).toBeNull();
    expect(container.firstChild).toHaveStyle({ '--kq-splash-duration': '2400ms' });
  });

  it('calls onFinish after the requested duration', async () => {
    const onFinish = vi.fn();

    render(<KolequantSplash duration={1500} onFinish={onFinish} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1499);
    });
    expect(onFinish).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
