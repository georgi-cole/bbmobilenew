import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  selectNominee1,
  finalizeNominations,
  submitPovDecision,
  submitHumanVote,
  submitTieBreak,
} from '../src/store/gameSlice';
import type { GameState, Player } from '../src/types';

function makePlayers(count: number, userIndex = 0): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1, week: 1, phase: 'nominations', seed: 42,
    hohId: 'p0', nomineeIds: [], povWinnerId: null,
    replacementNeeded: false, awaitingNominations: false, pendingNominee1Id: null,
    awaitingPovDecision: false, awaitingPovSaveTarget: false,
    votes: {}, awaitingHumanVote: false, awaitingTieBreak: false, tiedNomineeIds: null,
    awaitingFinal3Eviction: false, f3Part1WinnerId: null, f3Part2WinnerId: null,
    players: makePlayers(6),
    tvFeed: [], isLive: false,
  };
  return configureStore({
    reducer: { game: gameReducer },
    preloadedState: { game: { ...base, ...overrides } },
  });
}

describe('Human HOH nominations', () => {
  it('sets awaitingNominations when human is HOH at nomination_results', () => {
    const store = makeStore({ phase: 'nominations', hohId: 'p0' });
    store.dispatch(advance()); // nominations → nomination_results
    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.awaitingNominations).toBe(true);
    expect(state.nomineeIds).toHaveLength(0);
  });

  it('AI HOH auto-nominates without blocking', () => {
    const store = makeStore({ phase: 'nominations', hohId: 'p1' }); // p1 is not user
    store.dispatch(advance()); // nominations → nomination_results
    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.awaitingNominations).toBeFalsy();
    expect(state.nomineeIds).toHaveLength(2);
  });

  it('selectNominee1 sets pendingNominee1Id', () => {
    const store = makeStore({ phase: 'nomination_results', hohId: 'p0', awaitingNominations: true });
    store.dispatch(selectNominee1('p1'));
    expect(store.getState().game.pendingNominee1Id).toBe('p1');
  });

  it('finalizeNominations sets both nominees and clears awaitingNominations', () => {
    const store = makeStore({ phase: 'nomination_results', hohId: 'p0', awaitingNominations: true, pendingNominee1Id: 'p1' });
    store.dispatch(finalizeNominations('p2'));
    const state = store.getState().game;
    expect(state.awaitingNominations).toBe(false);
    expect(state.pendingNominee1Id).toBeNull();
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toHaveLength(2);
  });

  it('finalizeNominations rejects the same player as nominee 1', () => {
    const store = makeStore({ phase: 'nomination_results', hohId: 'p0', awaitingNominations: true, pendingNominee1Id: 'p1' });
    store.dispatch(finalizeNominations('p1')); // same as nominee 1
    expect(store.getState().game.awaitingNominations).toBe(true); // still blocking
  });
});

describe('Human POV decision', () => {
  it('sets awaitingPovDecision when human is POV holder and not nominee', () => {
    const players = makePlayers(6);
    // p0 is user+pov, p1 and p2 are nominees
    players[0].status = 'pov';
    players[1].status = 'nominated';
    players[2].status = 'nominated';
    const store = makeStore({
      phase: 'pov_ceremony',
      hohId: 'p3',
      povWinnerId: 'p0',
      nomineeIds: ['p1', 'p2'],
      players,
    });
    store.dispatch(advance()); // pov_ceremony → pov_ceremony_results
    const state = store.getState().game;
    expect(state.phase).toBe('pov_ceremony_results');
    expect(state.awaitingPovDecision).toBe(true);
  });

  it('submitPovDecision(false) clears awaitingPovDecision and logs event', () => {
    const store = makeStore({ phase: 'pov_ceremony_results', povWinnerId: 'p0', awaitingPovDecision: true, nomineeIds: ['p1', 'p2'] });
    store.dispatch(submitPovDecision(false));
    const state = store.getState().game;
    expect(state.awaitingPovDecision).toBe(false);
    expect(state.awaitingPovSaveTarget).toBeFalsy();
    expect(state.tvFeed[0].text).toContain('NOT to use');
  });

  it('submitPovDecision(true) sets awaitingPovSaveTarget', () => {
    const store = makeStore({ phase: 'pov_ceremony_results', povWinnerId: 'p0', awaitingPovDecision: true, nomineeIds: ['p1', 'p2'] });
    store.dispatch(submitPovDecision(true));
    const state = store.getState().game;
    expect(state.awaitingPovDecision).toBe(false);
    expect(state.awaitingPovSaveTarget).toBe(true);
  });
});

describe('Live vote + eviction tally', () => {
  it('human eligible voter gets awaitingHumanVote set during live_vote', () => {
    const players = makePlayers(6);
    players[1].status = 'nominated';
    players[2].status = 'nominated';
    // p0 is user, p3 is HOH, p1/p2 are nominees
    const store = makeStore({
      phase: 'social_2',
      hohId: 'p3',
      nomineeIds: ['p1', 'p2'],
      players,
    });
    store.dispatch(advance()); // social_2 → live_vote
    const state = store.getState().game;
    expect(state.phase).toBe('live_vote');
    expect(state.awaitingHumanVote).toBe(true);
    // AI voters should have voted
    const aiVoterIds = ['p4', 'p5']; // p0=user, p3=HOH, p1/p2=nominees
    for (const voterId of aiVoterIds) {
      expect(state.votes?.[voterId]).toBeDefined();
    }
  });

  it('submitHumanVote adds vote and clears awaitingHumanVote', () => {
    const store = makeStore({ phase: 'live_vote', hohId: 'p3', nomineeIds: ['p1', 'p2'], awaitingHumanVote: true, votes: {} });
    store.dispatch(submitHumanVote('p1'));
    const state = store.getState().game;
    expect(state.awaitingHumanVote).toBe(false);
    expect(state.votes?.['p0']).toBe('p1');
  });

  it('eviction_results evicts nominee with most votes', () => {
    // p1 gets 2 votes, p2 gets 1 vote — p1 is evicted
    const players = makePlayers(6);
    players[1].status = 'nominated';
    players[2].status = 'nominated';
    const store = makeStore({
      phase: 'live_vote',
      hohId: 'p3',
      nomineeIds: ['p1', 'p2'],
      votes: { 'p4': 'p1', 'p5': 'p1', 'p0': 'p2' },
      players,
    });
    store.dispatch(advance()); // live_vote → eviction_results; then tally
    const state = store.getState().game;
    expect(state.phase).toBe('eviction_results');
    const p1 = state.players.find(p => p.id === 'p1');
    expect(p1?.status).toMatch(/evicted|jury/);
  });

  it('tie results in awaitingTieBreak when human is HOH', () => {
    const players = makePlayers(6);
    players[1].status = 'nominated';
    players[2].status = 'nominated';
    // p0 is user+HOH, p1/p2 are nominees, each gets 1 vote
    const store = makeStore({
      phase: 'live_vote',
      hohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      votes: { 'p3': 'p1', 'p4': 'p2' },
      players,
    });
    store.dispatch(advance()); // live_vote → eviction_results; tally finds tie
    const state = store.getState().game;
    expect(state.phase).toBe('eviction_results');
    expect(state.awaitingTieBreak).toBe(true);
    expect(state.tiedNomineeIds).toContain('p1');
    expect(state.tiedNomineeIds).toContain('p2');
  });

  it('submitTieBreak evicts chosen nominee and moves to week_end', () => {
    const players = makePlayers(6);
    players[1].status = 'nominated';
    players[2].status = 'nominated';
    const store = makeStore({
      phase: 'eviction_results',
      hohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      awaitingTieBreak: true,
      tiedNomineeIds: ['p1', 'p2'],
      players,
    });
    store.dispatch(submitTieBreak('p1'));
    const state = store.getState().game;
    expect(state.awaitingTieBreak).toBe(false);
    expect(state.phase).toBe('week_end');
    const p1 = state.players.find(p => p.id === 'p1');
    expect(p1?.status).toMatch(/evicted|jury/);
  });
});
