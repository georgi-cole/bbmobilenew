import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import Credits from '../Credits';

const EXIT_FADE_MS = 420;
const soundtrackMock = vi.hoisted(() => ({
  getFrame: vi.fn(() => 0),
  isPlaying: vi.fn(() => true),
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(),
  reset: () => {
    soundtrackMock.getFrame.mockReturnValue(0);
    soundtrackMock.isPlaying.mockReturnValue(true);
    soundtrackMock.start.mockClear();
    soundtrackMock.start.mockResolvedValue(undefined);
    soundtrackMock.stop.mockClear();
  },
}));

const playerMock = vi.hoisted(() => {
  type PlayerListener = (event: { detail: undefined }) => void;
  let endedListener: PlayerListener | null = null;
  let playListener: PlayerListener | null = null;

  const pause = vi.fn();
  const seekTo = vi.fn();
  const isPlaying = vi.fn(() => true);
  const play = vi.fn(() => {
    playListener?.({ detail: undefined });
  });
  const addEventListener = vi.fn((name: string, listener: PlayerListener) => {
    if (name === 'ended') {
      endedListener = listener;
    }
    if (name === 'play') {
      playListener = listener;
    }
  });
  const removeEventListener = vi.fn((name: string, listener: PlayerListener) => {
    if (name === 'ended' && endedListener === listener) {
      endedListener = null;
    }
    if (name === 'play' && playListener === listener) {
      playListener = null;
    }
  });

  return {
    pause,
    seekTo,
    play,
    isPlaying,
    addEventListener,
    removeEventListener,
    emitEnded: () => endedListener?.({ detail: undefined }),
    emitPlay: () => playListener?.({ detail: undefined }),
    reset: () => {
      endedListener = null;
      playListener = null;
      pause.mockClear();
      seekTo.mockClear();
      play.mockClear();
      isPlaying.mockReset();
      isPlaying.mockReturnValue(true);
      addEventListener.mockClear();
      removeEventListener.mockClear();
    },
  };
});

vi.mock('@remotion/player', async () => {
  const React = await import('react');

  type MockPlayerProps = {
    autoPlay?: boolean;
  };

  const Player = React.forwardRef<unknown, MockPlayerProps>((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      pause: playerMock.pause,
      seekTo: playerMock.seekTo,
      play: playerMock.play,
      isPlaying: playerMock.isPlaying,
      addEventListener: playerMock.addEventListener,
      removeEventListener: playerMock.removeEventListener,
    }));

    return React.createElement('div', {
      'aria-label': 'WebGL credits player',
      'data-autoplay': String(Boolean(props.autoPlay)),
    });
  });

  return { Player };
});


vi.mock('../../../cinematic/audio/creditsSoundtrack', () => ({
  getCreditsSoundtrackFrame: soundtrackMock.getFrame,
  isCreditsSoundtrackPlaying: soundtrackMock.isPlaying,
  startCreditsSoundtrackFromGesture: soundtrackMock.start,
  stopCreditsSoundtrack: soundtrackMock.stop,
}));

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
  beforeEach(() => {
    playerMock.reset();
    soundtrackMock.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders and starts the WebGL credits composition immediately', () => {
    renderCredits();

    expect(screen.getByRole('button', { name: 'Tap to exit credits' })).toBeInTheDocument();
    expect(screen.getByLabelText('WebGL credits cinematic')).toBeInTheDocument();
    expect(screen.getByLabelText('WebGL credits player')).toHaveAttribute('data-autoplay', 'true');
    expect(screen.queryByLabelText('Credits video')).not.toBeInTheDocument();
    expect(playerMock.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
  });

  it('exits on tap after playback has started', () => {
    vi.useFakeTimers();
    renderCredits();

    act(() => {
      playerMock.emitPlay();
    });

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Tap to exit credits' }));
      vi.advanceTimersByTime(EXIT_FADE_MS);
    });

    expect(playerMock.pause).toHaveBeenCalled();
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('offers a tap-to-start fallback when autoplay is blocked', () => {
    vi.useFakeTimers();
    soundtrackMock.isPlaying.mockReturnValue(false);
    renderCredits();

    const startButton = screen.getByRole('button', { name: 'Tap to start credits' });
    expect(screen.getByText('Tap to begin')).toBeInTheDocument();

    act(() => {
      fireEvent.click(startButton);
    });

    expect(soundtrackMock.start).toHaveBeenCalled();
    expect(playerMock.seekTo).toHaveBeenCalledWith(0);
    expect(playerMock.play).toHaveBeenCalled();
    expect(screen.queryByText('Home screen')).not.toBeInTheDocument();
  });

  it('exits when Escape is pressed', () => {
    vi.useFakeTimers();
    renderCredits();

    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
      vi.advanceTimersByTime(EXIT_FADE_MS);
    });

    expect(playerMock.pause).toHaveBeenCalled();
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('returns home after the WebGL composition finishes', () => {
    vi.useFakeTimers();
    renderCredits();

    act(() => {
      playerMock.emitEnded();
    });

    expect(playerMock.pause).toHaveBeenCalled();
    expect(screen.getByTestId('credits-end-guard')).toHaveClass('is-visible', 'is-instant');

    act(() => {
      vi.advanceTimersByTime(EXIT_FADE_MS);
    });

    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });
});
