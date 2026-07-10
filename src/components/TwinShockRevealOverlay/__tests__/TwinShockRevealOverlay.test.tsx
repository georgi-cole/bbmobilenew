import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TwinShockRevealOverlay from '../TwinShockRevealOverlay';

describe('TwinShockRevealOverlay', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    vi.useFakeTimers();
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('temporarily hides the live target tile while the reveal overlay is playing', () => {
    const tile = document.createElement('div');
    tile.dataset.playerId = 'ali';
    document.body.appendChild(tile);

    const { unmount } = render(
      <TwinShockRevealOverlay
        reveal={{
          type: 'ali_enters',
          replacedPlayerId: 'finn',
          replacedPlayerName: 'Finn',
          replacedPlayerAvatar: '/finn.webp',
          incomingPlayerId: 'ali',
          incomingName: 'Ali',
          incomingAvatar: '/ali.webp',
        }}
        getTileRect={() => new DOMRect(10, 20, 80, 80)}
        onDone={vi.fn()}
      />,
    );

    expect(tile.style.opacity).toBe('0');
    expect(tile.style.visibility).toBe('hidden');

    unmount();

    expect(tile.style.opacity).toBe('');
    expect(tile.style.visibility).toBe('');
  });

  it('renders exactly one full-frame portrait throughout the swap', () => {
    const { container, unmount } = render(
      <TwinShockRevealOverlay
        reveal={{
          type: 'ali_enters',
          replacedPlayerId: 'finn',
          replacedPlayerName: 'Finn',
          replacedPlayerAvatar: '/finn.webp',
          incomingPlayerId: 'ali',
          incomingName: 'Ali',
          incomingAvatar: '/ali.webp',
        }}
        getTileRect={() => new DOMRect(10, 20, 80, 100)}
        onDone={vi.fn()}
      />,
    );

    expect(container.querySelectorAll('.twin-shock-reveal__avatar')).toHaveLength(1);
    expect(container.querySelector('img')).toHaveAttribute('src', '/finn.webp');

    act(() => vi.advanceTimersByTime(2100));

    expect(container.querySelectorAll('.twin-shock-reveal__avatar')).toHaveLength(1);
    expect(container.querySelector('img')).toHaveAttribute('src', '/ali.webp');

    unmount();
  });
});
