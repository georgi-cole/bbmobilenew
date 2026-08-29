import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import gameReducer, { advance, setPhase } from '../src/store/gameSlice';
import type { GameState, Player } from '../src/types';

const TRIBUNAL_MESSAGE = `Congrats all, you've just made it to tribunal. Your voices will crown the winner.`;

function makePlayers(): Player[] {
  return [
    { id: 'p0', name: 'Player 0', avatar: '🧑', status: 'active', isUser: true },
    { id: 'p1', name: 'Player 1', avatar: '🧑', status: 'active' },
    { id: 'p2', name: 'Player 2', avatar: '🧑', status: 'active' },
    { id: 'j0', name: 'Juror 0', avatar: '🧑', status: 'jury' },
  ];
}

function makeStore(overrides: Partial<GameState> = {}) {
  const game: GameState = {
    season: 1,
    week: 4,
    phase: 'week_end',
    seed: 42,
    lohId: 'p0',
    nomineeIds: [],
    posWinnerId: null,
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    players: makePlayers(),
    tvFeed: [],
    isLive: false,
    ...overrides,
  };
  return configureStore({ reducer: { game: gameReducer }, preloadedState: { game } });
}

describe('Tribunal phase announcement', () => {
  it('queues the one-time shock message immediately before the next day message', () => {
    const store = makeStore();

    store.dispatch(advance());

    const state = store.getState().game;
    expect(state.phase).toBe('week_start');
    expect(state.tribunalPhaseAnnounced).toBe(true);
    expect(state.tvFeed[0].text).toContain('Day 5 has begun. Get ready.');
    expect(state.tvFeed[1]).toMatchObject({
      text: TRIBUNAL_MESSAGE,
      meta: { major: 'tribunal_phase' },
    });
    expect(state.tvFeed[0].meta?.announcementPrerollEventId).toBe(state.tvFeed[1].id);

    store.dispatch(setPhase('week_end'));
    store.dispatch(advance());

    expect(store.getState().game.tvFeed.filter((event) => event.text === TRIBUNAL_MESSAGE)).toHaveLength(1);
  });

  it('does not announce before the first Tribunal member exists', () => {
    const players = makePlayers().map((player) => (
      player.status === 'jury' ? { ...player, status: 'evicted' as const } : player
    ));
    const store = makeStore({ players });

    store.dispatch(advance());

    expect(store.getState().game.tribunalPhaseAnnounced).not.toBe(true);
    expect(store.getState().game.tvFeed.some((event) => event.text === TRIBUNAL_MESSAGE)).toBe(false);
  });
});
