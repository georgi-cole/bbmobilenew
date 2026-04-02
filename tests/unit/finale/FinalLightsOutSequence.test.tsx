import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import FinalLightsOutSequence from '../../../src/components/FinalLightsOutSequence/FinalLightsOutSequence';

const TV_VIEWPORT_RECT = {
  top: 96,
  left: 64,
  width: 320,
  height: 180,
  right: 384,
  bottom: 276,
  x: 64,
  y: 96,
  toJSON: () => undefined,
} satisfies DOMRect;

afterEach(() => {
  document.body.classList.remove('no-animations');
  document.body.querySelector('.tv-zone__viewport')?.remove();
  vi.useRealTimers();
});

describe('FinalLightsOutSequence', () => {
  it('projects the farewell message into the existing main TV viewport', async () => {
    vi.useFakeTimers();

    const viewport = document.createElement('div');
    viewport.className = 'tv-zone__viewport';
    viewport.getBoundingClientRect = () => TV_VIEWPORT_RECT;
    document.body.appendChild(viewport);

    render(<FinalLightsOutSequence onComplete={vi.fn()} publicFavoriteWinnerName="Juror 1" />);

    const tv = screen.getByTestId('final-lights-off-tv');
    expect(tv).toHaveClass('flo-tv-frame--anchored');
    expect(tv).toHaveStyle({
      top: '96px',
      left: '64px',
      width: '320px',
      height: '180px',
    });

    for (const ms of [800, 1400, 1400, 1400]) {
      await act(async () => {
        vi.advanceTimersByTime(ms);
      });
    }

    expect(screen.getByText(/This is not a Goodbye/i)).toBeInTheDocument();
    expect(screen.getByText(/Public's Favorite:/i)).toBeInTheDocument();
  });
});
