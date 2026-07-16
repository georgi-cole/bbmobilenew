import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TwinShockIntroCinematic from '../TwinShockIntroCinematic';

vi.mock('../../../services/sound/SoundManager', () => ({
  SoundManager: {
    panicStopAllMusic: vi.fn(),
    syncMusic: vi.fn(),
  },
}));

vi.mock('../../../services/sound/cinematicAudio', () => ({
  createCinematicAudio: () => ({
    play: vi.fn(),
    fadeOutAndStop: vi.fn(),
    dispose: vi.fn(),
  }),
}));

describe('TwinShockIntroCinematic', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const reveal = {
    type: 'combined' as const,
    playerId: 'lia',
    fromName: 'Lia',
    fromAvatar: '/lia.webp',
    toName: 'Lia & Ali',
    toAvatar: '/lia-ali.webp',
  };

  it('reviews their lives before reaching the present-day reveal', () => {
    const onComplete = vi.fn();
    const { container } = render(
      <TwinShockIntroCinematic reveal={reveal} onComplete={onComplete} />,
    );

    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'signal');
    act(() => vi.advanceTimersByTime(1_600));
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'childhood');
    act(() => vi.advanceTimersByTime(2_900));
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'grown');
    act(() => vi.advanceTimersByTime(2_900));
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'reveal');
    act(() => vi.advanceTimersByTime(3_700));
    expect(container.querySelector('.twin-intro')).toHaveAttribute('data-stage', 'verdict');
    act(() => vi.advanceTimersByTime(5_400));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('can be skipped into the existing avatar-change animation', () => {
    const onComplete = vi.fn();
    render(<TwinShockIntroCinematic reveal={reveal} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    act(() => vi.advanceTimersByTime(420));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
