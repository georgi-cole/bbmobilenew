import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import famousFiguresReducer, {
  startFamousFigures,
  revealNextHint,
  advanceTimer,
  submitPlayerGuess,
  endRound,
  nextRound,
  resetFamousFigures,
  markFamousFiguresOutcomeResolved,
  finishAllRounds,
  FAMOUS_FIGURES,
  getPlayerFigureIndex,
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
    const s0 = getState(store);
    const figureIndex = getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound);
    const figure = FAMOUS_FIGURES[figureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figure.canonicalName }));
    const s = getState(store);
    expect(s.playerCorrect[PLAYER_A]).toBe(true);
    expect(s.playerScores[PLAYER_A]).toBeGreaterThan(0);
    expect(s.correctPlayers).toContain(PLAYER_A);
  });

  it('correct answer with multiple participants leaves round active until all solved', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));
    expect(getState(store).status).toBe('round_active');
    const s0 = getState(store);
    const figureA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    // First player solves — round should stay active since PLAYER_B hasn't answered
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    const s = getState(store);
    expect(s.playerCorrect[PLAYER_A]).toBe(true);
    expect(s.playerScores[PLAYER_A]).toBeGreaterThan(0);
    expect(s.status).toBe('round_active');
    expect(s.roundComplete).toBe(false);
  });

  it('playerCorrectTimestamp is recorded on correct answer', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    const s0 = getState(store);
    const figure = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    const before = Date.now();
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figure.canonicalName, timestamp: 12345 }));
    expect(getState(store).playerCorrectTimestamp[PLAYER_A]).toBe(12345);
    const after = Date.now();
    // Verify fallback timestamp is in range when not provided
    const store2 = makeStore();
    store2.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    const s02 = store2.getState().famousFigures;
    const fig2 = FAMOUS_FIGURES[getPlayerFigureIndex(s02, PLAYER_A, s02.currentRound)];
    store2.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig2.canonicalName }));
    const ts = store2.getState().famousFigures.playerCorrectTimestamp[PLAYER_A];
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 50);
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

  it('duplicate suppression is case-insensitive (normalised comparison)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'Einstein' }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'einstein' })); // same after normalisation
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'EINSTEIN' }));
    const s = getState(store);
    // All three normalise to the same string — only 1 entry should be stored
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

  it('advanceTimer is blocked after all participants solve the round', () => {
    const store = makeStore();
    // Single participant — solving closes the round immediately (all solved)
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    const s0 = getState(store);
    const figure = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figure.canonicalName }));
    expect(getState(store).roundComplete).toBe(true);
    const phaseBeforeAdvance = getState(store).timerPhase;
    store.dispatch(advanceTimer());
    // Phase should NOT have changed since roundComplete is true
    expect(getState(store).timerPhase).toBe(phaseBeforeAdvance);
  });

  it('advanceTimer is NOT blocked when only some participants have solved', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));
    const s0 = getState(store);
    const figureA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    // Only PLAYER_A solves — PLAYER_B has not, so roundComplete stays false
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    expect(getState(store).roundComplete).toBe(false);
    expect(getState(store).status).toBe('round_active');
    const phaseBefore = getState(store).timerPhase;
    store.dispatch(advanceTimer());
    // Timer should have advanced since the round is not yet complete
    expect(getState(store).timerPhase).not.toBe(phaseBefore);
  });

  it('second correct guess by the same player is rejected (duplicate-correct guard)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));
    const s0 = getState(store);
    const figureA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    // PLAYER_A answers correctly
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    expect(getState(store).playerCorrect[PLAYER_A]).toBe(true);
    const scoreAfterA = getState(store).playerScores[PLAYER_A];
    // PLAYER_A tries to submit again — should be rejected (already marked correct)
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    expect(getState(store).playerScores[PLAYER_A]).toBe(scoreAfterA);
  });

  it('when all participants solve, round transitions to round_reveal', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));
    const s0 = getState(store);
    const figureA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    const figureB = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_B, s0.currentRound)];
    // PLAYER_A solves their personal figure — round stays active
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figureA.canonicalName }));
    expect(getState(store).status).toBe('round_active');
    expect(getState(store).playerScores[PLAYER_A]).toBeGreaterThan(0);
    // PLAYER_B solves their personal figure — now all participants solved → round_reveal
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_B, guess: figureB.canonicalName }));
    const s = getState(store);
    expect(s.playerScores[PLAYER_B]).toBeGreaterThan(0);
    expect(s.playerCorrect[PLAYER_B]).toBe(true);
    expect(s.status).toBe('round_reveal');
    expect(s.roundComplete).toBe(true);
  });

  it('advanceTimer progresses past hint_5 to overtime (timer deadlock fix)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    // Advance through all hint phases
    for (let i = 0; i < 5; i++) store.dispatch(revealNextHint());
    expect(getState(store).timerPhase).toBe('hint_5');
    // Firing advanceTimer (not revealNextHint) should transition to overtime
    store.dispatch(advanceTimer());
    expect(getState(store).timerPhase).toBe('overtime');
    // One more advance → done
    store.dispatch(advanceTimer());
    expect(getState(store).timerPhase).toBe('done');
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

  // ── playerRoundCursor tests ────────────────────────────────────────────────

  it('playerRoundCursor starts at 0 for all participants after startFamousFigures', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(0);
    expect(getState(store).playerRoundCursor[PLAYER_B]).toBe(0);
  });

  it('playerRoundCursor increments immediately on a correct guess', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(0);
    const s0 = getState(store);
    const figure = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, s0.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figure.canonicalName }));
    // Cursor must be 1 immediately — before endRound or nextRound
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);
  });

  it('playerRoundCursor does NOT increment on a wrong guess', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: 'completely wrong xyzzy' }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(0);
  });

  it('playerRoundCursor reaches totalRounds after 3 correct guesses across rounds', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));

    for (let round = 0; round < 3; round++) {
      const s = getState(store);
      const fig = FAMOUS_FIGURES[getPlayerFigureIndex(s, PLAYER_A, s.currentRound)];
      store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig.canonicalName }));
      // After the last correct guess the round auto-closes (single participant),
      // advance to next round if not yet complete.
      if (round < 2) {
        store.dispatch(nextRound());
      }
    }

    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(3);
  });

  it('all players see the same figures (shared matchFigureOrder)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 42 }));
    const s = getState(store);
    // matchFigureOrder is shared — all players have the same figure per round.
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
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 5 }));
    const s = getState(store);
    expect(s.playerFigureQueues[PLAYER_A]).toHaveLength(s.totalRounds);
    expect(s.playerFigureQueues[PLAYER_B]).toHaveLength(s.totalRounds);
  });

  it('playerRoundCursor tracks per-player independently (A done early, B still on round 0)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));

    // PLAYER_A solves round 0; PLAYER_B does not
    const s0 = getState(store);
    const figA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, 0)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figA.canonicalName }));

    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);
    // PLAYER_B hasn't answered yet — cursor stays 0
    expect(getState(store).playerRoundCursor[PLAYER_B]).toBe(0);
    // Round is still active since PLAYER_B hasn't solved
    expect(getState(store).status).toBe('round_active');
  });

  it('humanDoneWithRound: cursor advances beyond currentRound on correct guess', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));
    const s0 = getState(store);
    expect(s0.currentRound).toBe(0);
    const figA = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER_A, 0)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: figA.canonicalName }));
    const s = getState(store);
    // humanDoneWithRound condition: cursor > currentRound
    expect(s.playerRoundCursor[PLAYER_A]).toBeGreaterThan(s.currentRound);
    // Round must remain active — PLAYER_B hasn't answered
    expect(s.status).toBe('round_active');
  });

  // ── matchFigureOrder tests ─────────────────────────────────────────────────

  it('matchFigureOrder is populated with totalRounds figures on startFamousFigures', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 99 }));
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
    store1.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 77 }));
    store2.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 77 }));
    expect(getState(store1).matchFigureOrder).toEqual(getState(store2).matchFigureOrder);
  });

  it('matchFigureOrder differs for different seeds', () => {
    const store1 = makeStore();
    const store2 = makeStore();
    store1.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 1 }));
    store2.dispatch(startFamousFigures({ participantIds: [PLAYER_A], competitionType: 'HOH', seed: 999 }));
    // With high probability two different seeds produce different orderings
    expect(getState(store1).matchFigureOrder).not.toEqual(getState(store2).matchFigureOrder);
  });

  it('human can submit for targetRound ahead of currentRound', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));
    const s0 = getState(store);
    const fig0 = FAMOUS_FIGURES[s0.matchFigureOrder[0]];

    // PLAYER_A answers round 0 correctly (cursor becomes 1)
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig0.canonicalName }));
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(1);
    expect(getState(store).status).toBe('round_active'); // PLAYER_B hasn't answered

    // PLAYER_A answers round 1 AHEAD (targetRound=1, global still on 0)
    const fig1 = FAMOUS_FIGURES[getState(store).matchFigureOrder[1]];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig1.canonicalName, targetRound: 1 }));
    // Cursor should advance to 2
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(2);
    // Global round still 0 — PLAYER_B hasn't answered
    expect(getState(store).currentRound).toBe(0);
    expect(getState(store).status).toBe('round_active');
    // Score should include both rounds
    expect(getState(store).playerScores[PLAYER_A]).toBeGreaterThan(0);
  });

  it('finishAllRounds atomically completes remaining rounds and transitions to complete', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));

    // Pre-compute AI submissions for round 0 so finishAllRounds can apply them
    const s0 = getState(store);
    const fig0 = FAMOUS_FIGURES[s0.matchFigureOrder[0]];

    // PLAYER_A answers all 3 rounds ahead
    for (let r = 0; r < 3; r++) {
      const s = getState(store);
      const fig = FAMOUS_FIGURES[s.matchFigureOrder[r]];
      store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: fig.canonicalName, targetRound: r }));
    }
    expect(getState(store).playerRoundCursor[PLAYER_A]).toBe(3);
    // PLAYER_B hasn't answered — global still on round 0
    expect(getState(store).status).toBe('round_active');

    // Dispatch finishAllRounds — should complete the match
    store.dispatch(finishAllRounds());
    expect(getState(store).status).toBe('complete');
    expect(getState(store).winnerId).toBeDefined();
    // PLAYER_A earned points across 3 rounds
    expect(getState(store).playerScores[PLAYER_A]).toBeGreaterThan(0);
    // Suppress unused variable warning
    void fig0;
  });

  it('doEndRound uses playerPersonalRoundScores when available (ahead-answer fix)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER_A, PLAYER_B], competitionType: 'HOH', seed: 1 }));
    const s0 = getState(store);

    // PLAYER_A answers round 0 (earns 10 pts, 0 hints)
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: FAMOUS_FIGURES[s0.matchFigureOrder[0]].canonicalName }));
    // PLAYER_A answers round 1 AHEAD (earns points based on hintsRevealed=0)
    store.dispatch(submitPlayerGuess({ playerId: PLAYER_A, guess: FAMOUS_FIGURES[s0.matchFigureOrder[1]].canonicalName, targetRound: 1 }));

    // Global round 0 ends — PLAYER_A's round 0 score should be 10 (not 20)
    store.dispatch(endRound());
    const scoreRound0 = getState(store).playerRoundScores[PLAYER_A][0];
    const personalRound0 = getState(store).playerPersonalRoundScores[PLAYER_A][0];
    expect(scoreRound0).toBe(personalRound0); // must match personalRoundScores
    expect(scoreRound0).toBeGreaterThan(0);
  });
});
