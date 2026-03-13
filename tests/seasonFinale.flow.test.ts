import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  advanceInterview,
  completeFinale,
  resumeAfterPublicFavorite,
  startGoodbyeSequence,
  startLightsOff,
  startPublicFavorite,
  startWinnerCinematic,
  startWinnerInterview,
} from '../src/store/gameSlice';
import type { GameState, Player } from '../src/types';

function makePlayers(): Player[] {
  return [
    { id: 'winner', name: 'Winner', avatar: '🧑', status: 'active', finalRank: 1, isWinner: true },
    { id: 'runner', name: 'Runner Up', avatar: '🧑', status: 'active', finalRank: 2 },
    { id: 'jury-1', name: 'Juror 1', avatar: '🧑', status: 'jury' },
    { id: 'jury-2', name: 'Juror 2', avatar: '🧑', status: 'jury' },
  ];
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 10,
    phase: 'jury',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    povWinnerId: null,
    replacementNeeded: false,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    aiReplacementStep: 0,
    aiReplacementWaiting: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    players: makePlayers(),
    tvFeed: [],
    isLive: false,
    seasonFinale: null,
  };

  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: { ...base, ...overrides } },
  });
}

describe('seasonFinale state machine', () => {
  it('starts with an explicit winner cinematic state', () => {
    const store = makeStore();

    store.dispatch(startWinnerCinematic({
      winnerId: 'winner',
      seed: 11,
      publicFavoriteEnabled: true,
    }));

    expect(store.getState().game.seasonFinale).toEqual({
      phase: 'winnerCinematic',
      winnerId: 'winner',
      interviewIndex: 2,
      goodbyeIndex: 0,
      isChatOpen: false,
      isLightsOffAnimating: false,
      publicFavoriteEnabled: true,
    });
  });

  it('flows through interview, public favorite, goodbye, lights off, and season complete', () => {
    const store = makeStore();

    store.dispatch(startWinnerCinematic({
      winnerId: 'winner',
      seed: 7,
      publicFavoriteEnabled: true,
    }));
    store.dispatch(startWinnerInterview());
    expect(store.getState().game.seasonFinale?.phase).toBe('winnerInterview');
    expect(store.getState().game.seasonFinale?.isChatOpen).toBe(true);

    store.dispatch(advanceInterview());
    expect(store.getState().game.seasonFinale?.phase).toBe('publicFavoriteSetup');

    store.dispatch(startPublicFavorite());
    expect(store.getState().game.seasonFinale?.phase).toBe('publicFavoriteFlow');
    expect(store.getState().game.seasonFinale?.isChatOpen).toBe(false);

    store.dispatch(resumeAfterPublicFavorite({ winnerId: 'jury-1' }));
    expect(store.getState().game.seasonFinale?.phase).toBe('goodbyeSequence');
    expect(store.getState().game.seasonFinale?.publicFavoriteWinnerId).toBe('jury-1');

    store.dispatch(startLightsOff());
    expect(store.getState().game.seasonFinale?.phase).toBe('lightsOffTransition');
    expect(store.getState().game.seasonFinale?.isLightsOffAnimating).toBe(true);

    store.dispatch(completeFinale());
    expect(store.getState().game.seasonFinale?.phase).toBe('seasonComplete');
    expect(store.getState().game.seasonFinale?.isLightsOffAnimating).toBe(false);
  });

  it('can skip Public Favorite and go directly into goodbye sequence', () => {
    const store = makeStore();

    store.dispatch(startWinnerCinematic({
      winnerId: 'winner',
      seed: 4,
      publicFavoriteEnabled: false,
    }));
    store.dispatch(startWinnerInterview());
    store.dispatch(startGoodbyeSequence());

    expect(store.getState().game.seasonFinale?.phase).toBe('goodbyeSequence');
    expect(store.getState().game.seasonFinale?.publicFavoriteWinnerId).toBeUndefined();
  });

  it('blocks advance() while the explicit season finale is still active', () => {
    const store = makeStore({ phase: 'week_end' });
    store.dispatch(startWinnerCinematic({
      winnerId: 'winner',
      seed: 3,
      publicFavoriteEnabled: false,
    }));

    store.dispatch(advance());

    expect(store.getState().game.phase).toBe('week_end');
    expect(store.getState().game.seasonFinale?.phase).toBe('winnerCinematic');
  });
});
