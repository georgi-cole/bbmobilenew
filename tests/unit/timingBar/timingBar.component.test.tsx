import type { ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import TimingBar from '../../../src/components/TimingBar/TimingBar';
import type { MinigameSession, Player } from '../../../src/types';

vi.mock('../../../src/components/TimingBar/TimingBar.css', () => ({}));
vi.mock('../../../src/components/TimingBar/timingBarAi', () => ({
  simulateAiRoundSubmission: (_profile: unknown, participantId: string) => ({
    participantId,
    lockedPosition: 50,
    timeRemainingMs: 5000,
    nonLockingAttempts: 0,
    timedOut: false,
  }),
  buildAiSubmissionFn: () => (participantId: string) => ({
    participantId,
    lockedPosition: 50,
    timeRemainingMs: 5000,
    nonLockingAttempts: 0,
    timedOut: false,
  }),
}));

function renderTimingBar(
  props: Partial<ComponentProps<typeof TimingBar>> = {},
  storePlayers: Player[] = [{ id: 'p0', name: 'You', avatar: '🙂', status: 'active', isUser: true }],
) {
  const store = configureStore({
    reducer: {
      game: (
        state = {
          players: storePlayers,
        },
      ) => state,
    },
  });

  return render(
    <Provider store={store}>
      <TimingBar seed={42} onFinish={vi.fn()} {...props} />
    </Provider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TimingBar', () => {
  it('starts directly on the round intro without showing a duplicate rules screen', () => {
    renderTimingBar();

    expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Begin Round 1 ▶' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ready to compete?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Game rules' })).not.toBeInTheDocument();
  });

  it('auto-starts into gameplay for hosted mode without restoring the duplicate rules screen', async () => {
    renderTimingBar({ autoStart: true });

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    expect(screen.queryByRole('button', { name: 'Begin Round 1 ▶' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ready to compete?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Game rules' })).not.toBeInTheDocument();
  });

  it('goes straight to final results when the human is eliminated in the 2-player final', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const players: Player[] = [
      { id: 'human', name: 'You', avatar: '🙂', status: 'active', isUser: true },
      {
        id: 'opponent',
        name: 'Nico',
        avatar: '😀',
        status: 'active',
        isUser: false,
        competitionProfile: {
          overall: 90,
          physical: 90,
          mental: 90,
          endurance: 90,
          stamina: 90,
          puzzle: 90,
          luck: 90,
          social: 50,
          loyalty: 50,
          strategic: 50,
          memory: 90,
        },
      },
    ];
    const session: MinigameSession = {
      key: 'timing-bar',
      participants: players.map((player) => player.id),
      seed: 42,
      options: { timeLimit: 20 },
      aiScores: {},
    };

    renderTimingBar({ autoStart: true, players, session }, players);

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });

    expect(screen.getByRole('heading', { name: 'Last Player Standing!' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: "You've been eliminated" })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '📹 Remain as spectator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '⏩ Skip to final results' })).not.toBeInTheDocument();
    expect(screen.getByText(/Surveyeval Winner/)).toBeInTheDocument();
    expect(screen.getAllByText('Nico').length).toBeGreaterThan(0);
  });

  it('uses hosted participantIds for the authoritative winner flow', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const onFinish = vi.fn();
    const players: Player[] = [
      { id: 'human', name: 'You', avatar: '🙂', status: 'active', isUser: true },
      {
        id: 'outsider',
        name: 'Outsider',
        avatar: '😎',
        status: 'active',
        isUser: false,
      },
      {
        id: 'opponent',
        name: 'Nico',
        avatar: '😀',
        status: 'active',
        isUser: false,
        competitionProfile: {
          overall: 90,
          physical: 90,
          mental: 90,
          endurance: 90,
          stamina: 90,
          puzzle: 90,
          luck: 90,
          social: 50,
          loyalty: 50,
          strategic: 50,
          memory: 90,
        },
      },
    ];

    renderTimingBar(
      {
        onFinish,
        participantIds: ['human', 'opponent'],
      },
      players,
    );

    expect(screen.getByRole('heading', { name: 'Round 1' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Begin Round 1 ▶' }));

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1400);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Continue ▶' }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0]?.[2]).toEqual({
      authoritativeWinnerId: 'opponent',
    });
  });
});
