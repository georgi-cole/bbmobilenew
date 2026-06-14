import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

  it('adds decimal places only when rounded approval percentages tie', () => {
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={{
          p1: 42.141,
          p2: 42.149,
          p3: 50.4,
        }}
        savedId="p3"
        onDone={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText('42.14%')).toBeTruthy();
    expect(screen.getByText('42.15%')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('highlights the saved nominee before auto-dismiss', () => {
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

    expect(document.querySelector('.psr__nominee--saved')).toBeTruthy();
    expect(document.querySelectorAll('.psr__status-pill')).toHaveLength(0);
  });

  it('keeps only the trimmed tv copy visible', () => {
    render(
      <PublicSaveReveal
        nominees={nominees}
        approvals={approvals}
        savedId="p3"
        onDone={vi.fn()}
      />,
    );

    expect(screen.getByText('Public Save')).toBeTruthy();
    expect(
      screen.getByText('Before safety battle, the player with highest public support is saved.'),
    ).toBeTruthy();
    expect(screen.queryByText('The Audience Decides')).toBeNull();
    expect(screen.queryByText('Tap to skip')).toBeNull();
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
