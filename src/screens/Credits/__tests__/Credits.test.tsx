import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const contentMock = vi.hoisted(() => ({
  load: vi.fn(() => Promise.resolve({
    cards: [
      {
        id: 'runtime-producer',
        fromSecond: 0,
        toSecond: 4,
        lines: [{ text: 'Runtime Producer', style: 'name' }],
      },
    ],
    source: 'runtime' as const,
    url: '/config/credits.json',
  })),
  reset: () => {
    contentMock.load.mockClear();
  },
}));

const playerMock = vi.hoisted(() => {
  type PlayerListener = (event: { detail: undefined }) => void;
  let endedListener: PlayerListener | null = null;
  let playListener: PlayerListener | null = null;
  let latestProps: Record<string, unknown> = {};

  const pause = vi.fn();
  const seekTo = vi.fn();
  const isPlaying = vi.fn(() => true);
  const play = vi.fn(() => {
    playListener?.({ detail: undefined });
  });
  const addEventListener = vi.fn((name: string, listener: PlayerListener) => {
    if (name === 'ended') endedListener = listener;
    if (name === 'play') playListener = listener;
  });
  const removeEventListener = vi.fn((name: string, listener: PlayerListener) => {
    if (name === 'ended' && endedListener === listener) endedListener = null;
    if (name === 'play' && playListener === listener) playListener = null;
  });

  return {
    pause,
    seekTo,
    play,
    isPlaying,
    addEventListener,
    removeEventListener,
    setLatestProps: (props: Record<string, unknown>) => {
      latestProps = props;
    },
    getLatestProps: () => latestProps,
    emitEnded: () => endedListener?.({ detail: undefined }),
    emitPlay: () => playListener?.({ detail: undefined }),
    reset: () => {
      endedListener = null;
      playListener = null;
      latestProps = {};
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
    inputProps?: unknown;
  };

  const Player = React.forwardRef<unknown, MockPlayerProps>((props, ref) => {
    playerMock.setLatestProps(props as Record<string, unknown>);
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

vi.mock('../../../cinematic/credits/creditsContent', () => ({
  loadCreditsContent: contentMock.load,
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
    contentMock.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the WebGL composition and an explicit skip control', () => {
    renderCredits();

    expect(screen.getByRole('button', { name: 'Skip credits' })).toBeInTheDocument();
    expect(screen.getByLabelText('WebGL credits cinematic')).toBeInTheDocument();
    expect(screen.getByLabelText('WebGL credits player')).toHaveAttribute('data-autoplay', 'true');
    expect(screen.queryByLabelText('Credits video')).not.toBeInTheDocument();
    expect(playerMock.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
  });

  it('exits only through the explicit skip control after playback has started', () => {
    vi.useFakeTimers();
    renderCredits();

    act(() => {
      playerMock.emitPlay();
      fireEvent.click(screen.getByLabelText('Credits cinematic'));
    });
    expect(screen.queryByText('Home screen')).not.toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Skip credits' }));
      vi.advanceTimersByTime(EXIT_FADE_MS);
    });

    expect(playerMock.pause).toHaveBeenCalled();
    expect(screen.getByText('Home screen')).toBeInTheDocument();
  });

  it('offers a synchronized tap-to-start fallback when autoplay is blocked', () => {
    vi.useFakeTimers();
    soundtrackMock.isPlaying.mockReturnValue(false);
    renderCredits();

    const startButton = screen.getByRole('button', { name: 'Tap to start credits' });
    expect(screen.getByText('Tap to begin')).toBeInTheDocument();
    expect(screen.getByLabelText('WebGL credits player')).toHaveAttribute('data-autoplay', 'false');

    act(() => {
      fireEvent.click(startButton);
    });

    expect(soundtrackMock.start).toHaveBeenCalled();
    expect(playerMock.seekTo).toHaveBeenCalledWith(0);
    expect(playerMock.play).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Tap to start credits' })).not.toBeInTheDocument();
  });

  it('passes the runtime-loaded credit cards into the composition', async () => {
    renderCredits();

    await waitFor(() => expect(contentMock.load).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      const props = playerMock.getLatestProps();
      const inputProps = props.inputProps as { credits?: Array<{ id: string }> } | undefined;
      expect(inputProps?.credits?.[0]?.id).toBe('runtime-producer');
    });

    expect(screen.getByLabelText('WebGL credits cinematic')).toHaveAttribute(
      'data-content-source',
      'runtime',
    );
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
