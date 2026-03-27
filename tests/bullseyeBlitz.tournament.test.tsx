import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('../src/components/BullseyeBlitz/BullseyeBlitz.css', () => ({}));
const TEST_ROUND_DURATION = 1;
// Keep spawns just under the shortened test round length so timers advance
// naturally without introducing random target buttons we do not need here.
const TEST_SPAWN_INTERVAL_MS = 999;

vi.mock('../src/components/BullseyeBlitz/bullseyeBlitzUtils', async () => {
  const actual = await vi.importActual<typeof import('../src/components/BullseyeBlitz/bullseyeBlitzUtils')>(
    '../src/components/BullseyeBlitz/bullseyeBlitzUtils',
  );
  return {
    ...actual,
    getBullseyeRoundConfig: (roundNumber: number) => ({
      ...actual.getBullseyeRoundConfig(roundNumber),
      durationSeconds: TEST_ROUND_DURATION,
      spawnIntervalMs: TEST_SPAWN_INTERVAL_MS,
    }),
  };
});

import BullseyeBlitz from '../src/components/BullseyeBlitz/BullseyeBlitz';
import gameReducer from '../src/store/gameSlice';
import type { MinigameSession, Player } from '../src/types';

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
}

function makeStore(players: Player[]) {
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: {
      game: {
        season: 1,
        week: 2,
        phase: 'hoh_comp',
        seed: 42,
        hohId: null,
        prevHohId: null,
        nomineeIds: [],
        publicModeEnabled: true,
        povWinnerId: null,
        replacementNeeded: false,
        povSavedId: null,
        awaitingNominations: false,
        pendingNominee1Id: null,
        awaitingPovDecision: false,
        awaitingPovSaveTarget: false,
        lastHohCompFinisherId: null,
        publicSavedNomineeId: null,
        nominationContext: null,
        awaitingPublicSave: false,
        votes: {},
        awaitingHumanVote: false,
        awaitingTieBreak: false,
        tiedNomineeIds: null,
        awaitingFinal3Eviction: false,
        awaitingFinal3Plea: false,
        f3Part1WinnerId: null,
        f3Part2WinnerId: null,
        voteResults: null,
        evictionSplashId: null,
        pendingEviction: null,
        players,
        tvFeed: [],
        isLive: false,
      },
    },
  });
}

function renderTournament(session: MinigameSession, players: Player[]) {
  return render(
    <Provider store={makeStore(players)}>
      <BullseyeBlitz session={session} players={players} autoStart />
    </Provider>,
  );
}

function renderBullseyeChallenge(players: Player[]) {
  return render(
    <Provider store={makeStore(players)}>
      <BullseyeBlitz players={players} />
    </Provider>,
  );
}

async function advanceUntil(assertion: () => boolean, maxSteps = 250) {
  for (let i = 0; i < maxSteps; i += 1) {
    if (assertion()) return;
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync();
    });
  }
  throw new Error('Timed out waiting for BullseyeBlitz state to advance.');
}

describe('BullseyeBlitz tournament flow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('displays challenge mode hint text on ready screen', () => {
    renderBullseyeChallenge(makePlayers(3));

    expect(
      screen.getByText(/tap the bullseyes, avoid the bombs — rack up the highest score you can!/i),
    ).toBeInTheDocument();
  });

  it('offers skip or spectator mode when the human is eliminated', async () => {
    const players = makePlayers(4);
    const session: MinigameSession = {
      key: 'targetPractice',
      participants: players.map((player) => player.id),
      seed: 42,
      options: { timeLimit: 20 },
      aiScores: { p1: 220, p2: 200, p3: 180 },
    };

    renderTournament(session, players);
    await advanceUntil(() => !!screen.queryByRole('button', { name: /skip to final results/i }));

    expect(screen.getByRole('button', { name: /skip to final results/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /keep watching/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /skip to final results/i }));

    expect(screen.getByText(/wins Bullseye Blitz/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('autoplays the remaining rounds in spectator mode without a continue button', async () => {
    const players = makePlayers(5);
    const session: MinigameSession = {
      key: 'targetPractice',
      participants: players.map((player) => player.id),
      seed: 9,
      options: { timeLimit: 20 },
      aiScores: { p1: 240, p2: 220, p3: 210, p4: 190 },
    };

    renderTournament(session, players);
    await advanceUntil(() => !!screen.queryByRole('button', { name: /keep watching/i }));

    fireEvent.click(screen.getByRole('button', { name: /keep watching/i }));

    expect(screen.getAllByText(/spectator mode/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Round 2 • 3 players • 1 eliminated/i)).toBeInTheDocument();
    expect(screen.getByText(/Round heats up — faster spawns and more hazards./i)).toBeInTheDocument();
    expect(screen.queryByText(/skip to final results/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/continue to round/i)).not.toBeInTheDocument();

    await advanceUntil(() => !!screen.queryByText(/wins Bullseye Blitz/i), 400);

    expect(screen.getByText(/wins Bullseye Blitz/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });
});
