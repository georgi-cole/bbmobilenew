import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import type { Player } from '../../../types';
import PublicSaveReveal from '../PublicSaveReveal';

function makePlayer(id: string, name: string): Player {
  return {
    id,
    name,
    avatar: '🧑',
    status: 'nominated',
  };
}

const nominees = [
  makePlayer('p1', 'Blue'),
  makePlayer('p2', 'Kian'),
  makePlayer('p3', 'Georgi'),
];

const approvals = {
  p1: 42,
  p2: 43,
  p3: 50,
};

describe('PublicSaveReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.classList.remove('no-animations');
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.classList.remove('no-animations');
  });

  it('keeps approvals hidden until the five-second reveal point', () => {
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={approvals}
        savedId="p3"
        onDone={vi.fn()}
      />,
    );

    expect(screen.getAllByText('?? %')).toHaveLength(3);
    expect(screen.queryByText('42%')).toBeNull();
    expect(screen.queryByText('43%')).toBeNull();
    expect(screen.queryByText('50%')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByText('?? %')).toBeNull();
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByText('43%')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('shows saved and nominated outcome badges before auto-dismiss', () => {
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={approvals}
        savedId="p3"
        onDone={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(7600);
    });

    expect(screen.getByText('Saved')).toBeTruthy();
    expect(document.querySelectorAll('.psr__status-pill--nominated')).toHaveLength(2);
  });

  it('supports tap-to-skip and only fires onDone once', () => {
    const onDone = vi.fn();
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={approvals}
        savedId="p3"
        onDone={onDone}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tap to skip' }));
    expect(onDone).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('auto-completes after the full ten-second sequence', () => {
    const onDone = vi.fn();
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={approvals}
        savedId="p3"
        onDone={onDone}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(9999);
    });
    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
