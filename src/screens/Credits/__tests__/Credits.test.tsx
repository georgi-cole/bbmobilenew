import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Credits from '../Credits';

const cinematicAudioMocks = vi.hoisted(() => ({
  create: vi.fn(),
  play: vi.fn(),
  fadeOutAndStop: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../../../services/sound/cinematicAudio', () => ({
  createCinematicAudio: cinematicAudioMocks.create,
}));

const CREDITS_TOTAL_MS = 19_600;
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
  afterEach(() => {
    cinematicAudioMocks.create.mockReset();
    cinematicAudioMocks.play.mockReset();
    cinematicAudioMocks.fadeOutAndStop.mockReset();
    cinematicAudioMocks.dispose.mockReset();
    vi.useRealTimers();
  });

  it('starts the credits sound and auto-exits after the full run', () => {
    vi.useFakeTimers();
    cinematicAudioMocks.create.mockReturnValue({
      play: cinematicAudioMocks.play,
      fadeOutAndStop: cinematicAudioMocks.fadeOutAndStop,
      dispose: cinematicAudioMocks.dispose,
    });

    renderCredits();

    const stage = screen.getByRole('button', { name: 'Tap to exit credits' });
    const credits = screen.getByLabelText('Credits');

    expect(stage).toHaveStyle({
      backgroundImage: expect.stringContaining('assets/credits/credits-background.png'),
    });
    expect(credits).toHaveTextContent('Thank YOU for playing');
    expect(credits).not.toHaveTextContent('Created by: Georgi Cole');
    expect(cinematicAudioMocks.create).toHaveBeenCalledWith(
      expect.stringContaining('assets/sounds/credits_sound.mp3'),
    );
    expect(cinematicAudioMocks.play).toHaveBeenCalledTimes(1);
    expect(credits).not.toHaveTextContent('Created by: Georgi Cole');

    act(() => {
      vi.advanceTimersByTime(CREDITS_TOTAL_MS + EXIT_FADE_MS);
    });

    expect(cinematicAudioMocks.fadeOutAndStop).toHaveBeenCalledWith(EXIT_FADE_MS);
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('exits on tap and fades the credits sound out', () => {
    vi.useFakeTimers();
    cinematicAudioMocks.create.mockReturnValue({
      play: cinematicAudioMocks.play,
      fadeOutAndStop: cinematicAudioMocks.fadeOutAndStop,
      dispose: cinematicAudioMocks.dispose,
    });

    renderCredits();

    const stage = screen.getByRole('button', { name: 'Tap to exit credits' });

    act(() => {
      fireEvent.click(stage);
      vi.advanceTimersByTime(EXIT_FADE_MS);
    });

    expect(cinematicAudioMocks.fadeOutAndStop).toHaveBeenCalledWith(EXIT_FADE_MS);
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('exits when Escape is pressed', () => {
    vi.useFakeTimers();
    cinematicAudioMocks.create.mockReturnValue({
      play: cinematicAudioMocks.play,
      fadeOutAndStop: cinematicAudioMocks.fadeOutAndStop,
      dispose: cinematicAudioMocks.dispose,
    });

    renderCredits();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
      vi.advanceTimersByTime(EXIT_FADE_MS);
    });

    expect(cinematicAudioMocks.fadeOutAndStop).toHaveBeenCalledWith(EXIT_FADE_MS);
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });
});
