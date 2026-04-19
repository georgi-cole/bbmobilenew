import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Credits from '../Credits';

const EXIT_FADE_MS = 420;

function renderCredits() {
  return render(
    <MemoryRouter initialEntries={['/credits']}>
      <Routes>
        <Route path="/credits" element={<Credits />} />
        <Route path="/" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Credits', () => {
  let playSpy: ReturnType<typeof vi.spyOn>;
  let pauseSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  });

  afterEach(() => {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    vi.useRealTimers();
  });

  it('renders and starts the legacy credits video immediately', () => {
    renderCredits();

    const stage = screen.getByRole('button', { name: 'Tap to exit credits' });
    const video = screen.getByLabelText('Credits video');

    expect(stage).toBeInTheDocument();
    expect(video).toHaveAttribute('src', expect.stringContaining('assets/endcreditskq.mp4'));
    expect(video).toHaveAttribute('autoplay');
    expect(video).toHaveAttribute('playsinline');
    expect(video).toHaveAttribute('preload', 'auto');
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('exits on tap and pauses the credits video', () => {
    vi.useFakeTimers();

    renderCredits();

    const stage = screen.getByRole('button', { name: 'Tap to exit credits' });

    act(() => {
      fireEvent.click(stage);
      vi.advanceTimersByTime(EXIT_FADE_MS);
    });

    expect(pauseSpy).toHaveBeenCalled();
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('exits when Escape is pressed', () => {
    vi.useFakeTimers();

    renderCredits();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
      vi.advanceTimersByTime(EXIT_FADE_MS);
    });

    expect(pauseSpy).toHaveBeenCalled();
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('returns home after the credits video finishes', () => {
    vi.useFakeTimers();

    renderCredits();

    const video = screen.getByLabelText('Credits video');

    act(() => {
      fireEvent.ended(video);
      vi.advanceTimersByTime(EXIT_FADE_MS);
    });

    expect(pauseSpy).toHaveBeenCalled();
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });
});
