import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import famousFiguresReducer, {
  startFamousFigures,
  revealNextHint,
  advanceTimer,
  submitPlayerGuess,
  advancePlayerCursor,
  endRound,
  nextRound,
  resetFamousFigures,
  markFamousFiguresOutcomeResolved,
  finishAllRounds,
  fastForwardCurrentRound,
  setAiSubmissionsForRound,
  getFamousFiguresAiPlan,
  getPointsForHintsUsed,
  FAMOUS_FIGURES,
  getPlayerFigureIndex,
} from '../../../src/features/famousFigures/famousFiguresSlice';
import type { FamousFiguresState } from '../../../src/features/famousFigures/famousFiguresSlice';

// â”€â”€â”€ Test store factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('famousFiguresSlice', () => {
  it('initial state is idle', () => {
    const store = makeStore();
    expect(getState(store).status).toBe('idle');
  });

  it('startFamousFigures transitions to round_active', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 42 }));
    const s = getState(store);
    expect(s.status).toBe('round_active');
    expect(s.currentRound).toBe(0);
    expect(s.totalRounds).toBe(6);
    expect(s.playerScores[PLAYER_A]).toBe(0);
    expect(s.playerScores[PLAYER_B]).toBe(0);
    expect(s.figureOrder.length).toBe(FAMOUS_FIGURES.length);
    expect(s.outcomeResolved).toBe(false);
  });

  it('submitPlayerGuess with correct answer awards points (cursor advances via advancePlayerCursor)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const figureIndex = getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound);
    const figure = FAMOUS_FIGURES[figureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figure.canonicalName }));
    const s = getState(store);
    expect(s.playerCorrect[PLAYER_A]).toBe(true);
    expect(s.playerScores[PLAYER_A]).toBeGreaterThan(0);
    expect(s.correctPlayers).toContain(PLAYER_A);
    // Cursor does NOT advance until advancePlayerCursor is dispatched
    expect(s.playerRoundCursor[PLAYER_A]).toBe(0);
    // Dispatch advancePlayerCursor â€” cursor should now be 1
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);
  });

  it('correct answer with multiple participants leaves round active until all solved', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    expect(getState(store).status).toBe('round_active');
    const s0 = getState(store);
    const figureA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    // First player solves â€” round should stay active since PLAYER_B hasn't answered
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    // Cursor not yet advanced (waiting for advancePlayerCursor)
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    const s = getState(store);
    expect(s.playerCorrect[PLAYER_A]).toBe(true);
    expect(s.playerScores[PLAYER_A]).toBeGreaterThan(0);
    expect(s.status).toBe('round_active');
    expect(s.roundComplete).toBe(false);
  });

  it('playerCorrectTimestamp is recorded on correct answer', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const figure = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    const before = Date.now();
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figure.canonicalName, timestamp: 12345 }));
    expect(getState(store).playerCorrectTimestamp[PLAYER_A]).toBe(12345);
    const after = Date.now();
    // Verify fallback timestamp is in range when not provided
    const store2 = makeStore();
    store2.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    const s02 = store2.getState().famousFigures;
    const fig2 = FAMOUS_FIGURES[getPlayerFigureIndex(s02, PLAYER_A, s02.currentRound)];
    store2.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig2.canonicalName }));
    const ts = store2.getState().famousFigures.playerCorrectTimestamp[PLAYER_A];
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 50);
  });

  it('submitPlayerGuess with wrong answer does not change score', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'xyzzy completely wrong answer' }));
    const s = getState(store);
    expect(s.playerCorrect[PLAYER_A]).toBe(false);
    expect(s.playerScores[PLAYER_A]).toBe(0);
  });

  it('duplicate guess suppression', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'wrong guess' }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'wrong guess' })); // duplicate
    const s = getState(store);
    expect(s.playerGuesses[PLAYER_A]).toHaveLength(1);
  });

  it('duplicate suppression is case-insensitive (normalised comparison)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'Einstein' }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'einstein' })); // same after normalisation
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'EINSTEIN' }));
    const s = getState(store);
    // All three normalise to the same string â€” only 1 entry should be stored
    expect(s.playerGuesses[PLAYER_A]).toHaveLength(1);
  });

  it('revealNextHint increments hintsRevealed', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    expect(getState(store).hintsRevealed).toBe(0);
    store.dispatch(revealNextHint());
    expect(getState(store).hintsRevealed).toBe(1);
    store.dispatch(revealNextHint());
    expect(getState(store).hintsRevealed).toBe(2);
    expect(getState(store).timerPhase).toBe('hint_3');
  });

  it('revealNextHint does not exceed the four visible hints', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    for (let i = 0; i < 10; i++) store.dispatch(revealNextHint());
    expect(getState(store).hintsRevealed).toBe(4);
  });

  it('advanceTimer is blocked after all participants solve the round', () => {
    const store = makeStore();
    // Single participant â€” solving + advancePlayerCursor closes the round immediately (all solved)
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const figure = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figure.canonicalName }));
    // roundComplete still false until cursor advances
    expect(getState(store).roundComplete).toBe(false);
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).roundComplete).toBe(true);
    const phaseBeforeAdvance = getState(store).timerPhase;
    store.dispatch(advanceTimer());
    // Phase should NOT have changed since roundComplete is true
    expect(getState(store).timerPhase).toBe(phaseBeforeAdvance);
  });

  it('advanceTimer is NOT blocked when only some participants have solved', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const figureA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    // Only PLAYER_A solves â€” PLAYER_B has not, so roundComplete stays false
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).roundComplete).toBe(false);
    expect(getState(store).status).toBe('round_active');
    const phaseBefore = getState(store).timerPhase;
    store.dispatch(advanceTimer());
    // Timer should have advanced since the round is not yet complete
    expect(getState(store).timerPhase).not.toBe(phaseBefore);
  });

  it('second correct guess by the same player is rejected (duplicate-correct guard)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const figureA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    // PLAYER_A answers correctly
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    expect(getState(store).playerCorrect[PLAYER_A]).toBe(true);
    const scoreAfterA = getState(store).playerScores[PLAYER_A];
    // PLAYER_A tries to submit again BEFORE advancePlayerCursor â€” should be rejected
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    expect(getState(store).playerScores[PLAYER_A]).toBe(scoreAfterA);
    // PLAYER_A tries again AFTER advancePlayerCursor â€” cursor is now 1, targetRound=0 fails guard
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    expect(getState(store).playerScores[PLAYER_A]).toBe(scoreAfterA);
  });

  it('when all participants solve (via advancePlayerCursor), round transitions to round_reveal', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const figureA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    const figureB = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_B, s0.currentRound)];
    // PLAYER_A solves their personal figure â€” round stays active
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).status).toBe('round_active');
    expect(getState(store).playerScores[PLAYER_A]).toBeGreaterThan(0);
    // PLAYER_B solves their personal figure + advancePlayerCursor â†’ all solved â†’ round_reveal
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_B, guess: figureB.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_B, targetRound: 0 }));
    const s = getState(store);
    expect(s.playerScores[PLAYER_B]).toBeGreaterThan(0);
    expect(s.playerCorrect[PLAYER_B]).toBe(true);
    expect(s.status).toBe('round_reveal');
    expect(s.roundComplete).toBe(true);
  });

  it('advanceTimer ends the round immediately after hint_5', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    // Advance through all hint phases
    for (let i = 0; i < 5; i++) store.dispatch(revealNextHint());
    expect(getState(store).timerPhase).toBe('hint_5');
    // There is no extra ten-second overtime window after the final clue.
    store.dispatch(advanceTimer());
    expect(getState(store).timerPhase).toBe('done');
    // One more advance â†’ done
    store.dispatch(advanceTimer());
    expect(getState(store).timerPhase).toBe('done');
  });

  it('fast-forward preserves each AI planned clue instead of awarding premature clue-one points', () => {
    const seed = 17;
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed }));
    const started = getState(store);
    const figure = FAMOUS_FIGURES[started.matchFigureOrder[0]];
    const plan = getFamousFiguresAiPlan(seed, 0, PLAYER_B, figure.difficulty);
    store.dispatch(setAiSubmissionsForRound({ round: 0, submissions: { [PLAYER_B]: true } }));

    store.dispatch(fastForwardCurrentRound());

    const finished = getState(store);
    expect(finished.status).toBe('round_reveal');
    expect(finished.playerScores[PLAYER_B]).toBe(getPointsForHintsUsed(plan.clueNumber - 1));
    expect(finished.playerRoundCursor[PLAYER_B]).toBe(1);
  });

  it('endRound transitions to round_reveal', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    store.dispatch(endRound());
    expect(getState(store).status).toBe('round_reveal');
    expect(getState(store).roundComplete).toBe(true);
  });

  it('nextRound increments currentRound', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    store.dispatch(endRound());
    store.dispatch(nextRound());
    const s = getState(store);
    expect(s.currentRound).toBe(1);
    expect(s.status).toBe('round_active');
  });

  it('after 6 rounds nextRound transitions to complete', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));

    for (let round = 0; round < 6; round++) {
      expect(getState(store).status).toBe('round_active');
      store.dispatch(endRound());
      expect(getState(store).status).toBe('round_reveal');
      store.dispatch(nextRound());
    }

    expect(getState(store).status).toBe('complete');
  });

  it('winnerId is player with highest score', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 2 }));

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

    for (let round = 3; round < 6; round++) {
      store.dispatch(endRound());
      store.dispatch(nextRound());
    }

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
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    store.dispatch(resetFamousFigures());
    expect(getState(store).status).toBe('idle');
    expect(getState(store).playerScores).toEqual({});
  });

  // â”€â”€ playerRoundCursor tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('playerRoundCursor starts at 0 for all participants after startFamousFigures', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(0);
    expect(getState(store).playerRoundCursor[PLAYER_B]).toBe(0);
  });

  it('playerRoundCursor does NOT increment on a correct guess until advancePlayerCursor fires', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(0);
    const s0 = getState(store);
    const figure = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figure.canonicalName }));
    // Cursor must still be 0 â€” advancePlayerCursor has not been dispatched yet
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(0);
    // Now dispatch advancePlayerCursor â€” cursor must be 1
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);
  });

  it('playerRoundCursor does NOT increment on a wrong guess', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'completely wrong xyzzy' }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(0);
  });

  it('playerRoundCursor reaches totalRounds after 6 correct guesses + advancePlayerCursor calls', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));

    for (let round = 0; round < 6; round++) {
      const s = getState(store);
      const fig = FAMOUS_FIGURES[getPlayerFigureIndex(s, PLAYER_A, s.currentRound)];
      store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig.canonicalName }));
      store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: round }));
      // After the last correct guess the round auto-closes (single participant),
      // advance to next round if not yet complete.
      if (round < 5) {
        store.dispatch(nextRound());
      }
    }

    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(6);
  });

  it('all players see the same figures (shared matchFigureOrder)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 42 }));
    const s = getState(store);
    // matchFigureOrder is shared â€” all players have the same figure per round.
    expect(s.matchFigureOrder).toHaveLength(s.totalRounds);
    const queueA = s.playerFigureQueues[PLAYER_A];
    const queueB = s.playerFigureQueues[PLAYER_B];
    expect(queueA).toBeDefined();
    expect(queueB).toBeDefined();
    // All queues must be identical to matchFigureOrder
    expect(queueA).toEqual(s.matchFigureOrder);
    expect(queueB).toEqual(s.matchFigureOrder);
  });

  it('per-player figure queues have length equal to totalRounds', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 5 }));
    const s = getState(store);
    expect(s.playerFigureQueues[PLAYER_A]).toHaveLength(s.totalRounds);
    expect(s.playerFigureQueues[PLAYER_B]).toHaveLength(s.totalRounds);
  });

  it('playerRoundCursor tracks per-player independently (A done early, B still on round 0)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));

    // PLAYER_A solves round 0; PLAYER_B does not
    const s0 = getState(store);
    const figA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, 0)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figA.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));

    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);
    // PLAYER_B hasn't answered yet â€” cursor stays 0
    expect(getState(store).playerRoundCursor[PLAYER_B]).toBe(0);
    // Round is still active since PLAYER_B hasn't solved
    expect(getState(store).status).toBe('round_active');
  });

  it('humanDoneWithRound: cursor advances beyond currentRound after advancePlayerCursor', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    expect(s0.currentRound).toBe(0);
    const figA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, 0)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figA.canonicalName }));
    // Cursor is still at 0 â€” advancePlayerCursor not yet dispatched
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(0);
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    const s = getState(store);
    // humanDoneWithRound condition: cursor > currentRound
    expect(s.playerRoundCursor[PLAYER_A]).toBeGreaterThan(s.currentRound);
    // Round must remain active â€” PLAYER_B hasn't answered
    expect(s.status).toBe('round_active');
  });

  // â”€â”€ matchFigureOrder tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('matchFigureOrder is populated with totalRounds figures on startFamousFigures', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 99 }));
    const s = getState(store);
    expect(s.matchFigureOrder).toHaveLength(s.totalRounds);
    s.matchFigureOrder.forEach((idx) => {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(FAMOUS_FIGURES.length);
    });
  });

  it('matchFigureOrder is deterministic for the same seed', () => {
    const store1 = makeStore();
    const store2 = makeStore();
    store1.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 77 }));
    store2.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 77 }));
    expect(getState(store1).matchFigureOrder).toEqual(getState(store2).matchFigureOrder);
  });

  it('matchFigureOrder differs for different seeds', () => {
    const store1 = makeStore();
    const store2 = makeStore();
    store1.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    store2.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 999 }));
    // With high probability two different seeds produce different orderings
    expect(getState(store1).matchFigureOrder).not.toEqual(getState(store2).matchFigureOrder);
  });

  it('human can submit for targetRound ahead of currentRound', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const fig0 = FAMOUS_FIGURES[s0.matchFigureOrder[0]];

    // PLAYER_A answers round 0 correctly then dispatches advancePlayerCursor (cursor becomes 1)
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig0.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);
    expect(getState(store).status).toBe('round_active'); // PLAYER_B hasn't answered

    // PLAYER_A answers round 1 AHEAD (targetRound=1, global still on 0)
    // For ahead rounds the cursor advances immediately in submitPlayerGuess
    const fig1 = FAMOUS_FIGURES[getState(store).matchFigureOrder[1]];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig1.canonicalName, targetRound: 1 }));
    // Cursor should advance to 2 immediately (ahead round)
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(2);
    // Global round still 0 â€” PLAYER_B hasn't answered
    expect(getState(store).currentRound).toBe(0);
    expect(getState(store).status).toBe('round_active');
    // Score should include both rounds
    expect(getState(store).playerScores[PLAYER_A]).toBeGreaterThan(0);
  });

  it('finishAllRounds atomically completes remaining rounds and transitions to complete', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));

    const s0 = getState(store);

    // PLAYER_A answers round 0 then dispatches advancePlayerCursor, then answers rounds 1 and 2 ahead.
    // Round 0 is the current global round so needs advancePlayerCursor.
    const fig0 = FAMOUS_FIGURES[s0.matchFigureOrder[0]];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig0.canonicalName, targetRound: 0 }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    // Rounds 1 and 2 are ahead rounds â€” cursor advances immediately in submitPlayerGuess.
    for (let r = 1; r < 3; r++) {
      const s = getState(store);
      const fig = FAMOUS_FIGURES[s.matchFigureOrder[r]];
      store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig.canonicalName, targetRound: r }));
    }
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(3);
    // PLAYER_B hasn't answered â€” global still on round 0
    expect(getState(store).status).toBe('round_active');

    // Dispatch finishAllRounds â€” should complete the match
    store.dispatch(finishAllRounds());
    expect(getState(store).status).toBe('complete');
    expect(getState(store).winnerId).toBeDefined();
    // PLAYER_A earned points across 3 rounds
    expect(getState(store).playerScores[PLAYER_A]).toBeGreaterThan(0);
    // Silence unused-variable lint (s0 used only to establish initial round reference)
    expect(s0.currentRound).toBe(0);
  });

  it('doEndRound uses playerPersonalRoundScores when available (ahead-answer fix)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);

    // PLAYER_A answers round 0 (earns 10 pts, 0 hints) then advances cursor
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: FAMOUS_FIGURES[s0.matchFigureOrder[0]].canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    // PLAYER_A answers round 1 AHEAD (earns points based on hintsRevealed=0)
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: FAMOUS_FIGURES[s0.matchFigureOrder[1]].canonicalName, targetRound: 1 }));

    // Global round 0 ends â€” PLAYER_A's round 0 score should be 10 (not 20)
    store.dispatch(endRound());
    const scoreRound0 = getState(store).playerRoundScores[PLAYER_A][0];
    const personalRound0 = getState(store).playerPersonalRoundScores[PLAYER_A][0];
    expect(scoreRound0).toBe(personalRound0); // must match personalRoundScores
    expect(scoreRound0).toBeGreaterThan(0);
  });

  // â”€â”€ advancePlayerCursor tests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('advancePlayerCursor advances cursor from 0 to 1', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const fig = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, 0)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig.canonicalName }));
    // Cursor still 0 after submitPlayerGuess for current round
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(0);
    // Now dispatch advancePlayerCursor
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);
  });

  it('advancePlayerCursor triggers doEndRound when all participants advance past currentRound', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const figA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, 0)];
    const figB = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_B, 0)];

    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figA.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    // Still active â€” PLAYER_B cursor at 0
    expect(getState(store).status).toBe('round_active');

    store.dispatch(submitPlayerGuess({ playerId: PLAYER_B, guess: figB.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_B, targetRound: 0 }));
    // Now both cursors > 0 â€” round should have closed
    expect(getState(store).status).toBe('round_reveal');
    expect(getState(store).roundComplete).toBe(true);
  });

  it('advancePlayerCursor is a no-op (idempotent) if cursor already advanced past targetRound', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const fig = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, 0)];

    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);

    // Dispatching again with the same targetRound=0 is a no-op (stale dispatch)
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);
  });

  it('advancePlayerCursor single-participant: closes round immediately', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'LOH', seed: 1 }));
    const s0 = getState(store);
    const fig = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, 0)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig.canonicalName }));
    expect(getState(store).status).toBe('round_active'); // not closed yet
    store.dispatch(advancePlayerCursor({ playerId: PLAYER_A, targetRound: 0 }));
    expect(getState(store).status).toBe('round_reveal'); // closed
  });
});

