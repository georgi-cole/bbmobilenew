import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import famousFiguresReducer, {
  startFamousFigures,
  revealNextHint,
  submitPlayerGuess,
  endRound,
  nextRound,
  resetFamousFigures,
  markFamousFiguresOutcomeResolved,
  FAMOUS_FIGURES,
} from '../../../src/features/famousFigures/famousFiguresSlice';
import type { FamousFiguresState } from '../../../src/features/famousFigures/famousFiguresSlice';

// ─── Test store factory ───────────────────────────────────────────────────────

function makeStore(preloaded?: Partial<FamousFiguresState>) {
  return configureStore({
    reducer: { famousFigures: famousFiguresReducer },
    preloadedState: preloaded ? { famousFigures: { ...getInitialState(), ...preloaded } } : undefined,
  });
}

function getInitialState(): FamousFiguresState {
  return famousFiguresReducer(undefined, { type: '@@init' });
}

function getState(store: ReturnType<typeof makeStore>) {
  return store.getState().famousFigures;
}

const PLAYER_A = 'player-a';
const PLAYER_B = 'player-b';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('famousFiguresSlice', () => {
  it('initial state is idle', () => {
    const store = makeStore();
    expect(getState(store).status).toBe('idle');
  });

  it('startFamousFigures transitions to round_active', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 42 }));
    const s = getState(store);
    expect(s.status).toBe('round_active');
    expect(s.currentRound).toBe(0);
    expect(s.totalRounds).toBe(3);
    expect(s.playerScores[PLAYER_A]).toBe(0);
    expect(s.playerScores[PLAYER_B]).toBe(0);
    expect(s.figureOrder.length).toBe(FAMOUS_FIGURES.length);
    expect(s.outcomeResolved).toBe(false);
  });

  it('submitPlayerGuess with correct answer awards points', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    const figureIndex = getState(store).currentFigureIndex;
    const figure = FAMOUS_FIGURES[figureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figure.canonicalName }));
    const s = getState(store);
    expect(s.playerCorrect[PLAYER_A]).toBe(true);
    expect(s.playerScores[PLAYER_A]).toBeGreaterThan(0);
    expect(s.correctPlayers).toContain(PLAYER_A);
  });

  it('submitPlayerGuess with wrong answer does not change score', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'xyzzy completely wrong answer' }));
    const s = getState(store);
    expect(s.playerCorrect[PLAYER_A]).toBe(false);
    expect(s.playerScores[PLAYER_A]).toBe(0);
  });

  it('duplicate guess suppression', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'wrong guess' }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'wrong guess' })); // duplicate
    const s = getState(store);
    expect(s.playerGuesses[PLAYER_A]).toHaveLength(1);
  });

  it('revealNextHint increments hintsRevealed', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    expect(getState(store).hintsRevealed).toBe(0);
    store.dispatch(revealNextHint());
    expect(getState(store).hintsRevealed).toBe(1);
    store.dispatch(revealNextHint());
    expect(getState(store).hintsRevealed).toBe(2);
  });

  it('revealNextHint does not exceed 5', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    for (let i = 0; i < 10; i++) store.dispatch(revealNextHint());
    expect(getState(store).hintsRevealed).toBe(5);
  });

  it('endRound transitions to round_reveal', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    store.dispatch(endRound());
    expect(getState(store).status).toBe('round_reveal');
    expect(getState(store).roundComplete).toBe(true);
  });

  it('nextRound increments currentRound', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    store.dispatch(endRound());
    store.dispatch(nextRound());
    const s = getState(store);
    expect(s.currentRound).toBe(1);
    expect(s.status).toBe('round_active');
  });

  it('after 3 rounds nextRound transitions to complete', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));

    for (let round = 0; round < 3; round++) {
      expect(getState(store).status).toBe('round_active');
      store.dispatch(endRound());
      expect(getState(store).status).toBe('round_reveal');
      store.dispatch(nextRound());
    }

    expect(getState(store).status).toBe('complete');
  });

  it('winnerId is player with highest score', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 2 }));

    // Round 1: PLAYER_A answers correctly with 0 hints
    const fig1 = FAMOUS_FIGURES[getState(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig1.canonicalName }));
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 2: no one answers
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 3: no one answers
    store.dispatch(endRound());
    store.dispatch(nextRound());

    const s = getState(store);
    expect(s.status).toBe('complete');
    expect(s.winnerId).toBe(PLAYER_A);
  });

  it('outcomeResolved idempotency', () => {
    const store = makeStore();
    store.dispatch(markFamousFiguresOutcomeResolved());
    expect(getState(store).outcomeResolved).toBe(true);
    store.dispatch(markFamousFiguresOutcomeResolved()); // idempotent
    expect(getState(store).outcomeResolved).toBe(true);
  });

  it('resetFamousFigures returns to idle', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    store.dispatch(resetFamousFigures());
    expect(getState(store).status).toBe('idle');
    expect(getState(store).playerScores).toEqual({});
  });
});
