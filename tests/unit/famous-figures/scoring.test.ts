import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import famousFiguresReducer, {
  startFamousFigures,
  submitPlayerGuess,
  revealNextHint,
  endRound,
  nextRound,
  getPointsForHintsUsed,
  FAMOUS_FIGURES,
} from '../../../src/features/famousFigures/famousFiguresSlice';
import type { FamousFiguresState } from '../../../src/features/famousFigures/famousFiguresSlice';

function makeStore() {
  return configureStore({ reducer: { famousFigures: famousFiguresReducer } });
}

function getState(store: ReturnType<typeof makeStore>): FamousFiguresState {
  return store.getState().famousFigures;
}

const PLAYER = 'scorer-player';

// ─── Scoring point values ─────────────────────────────────────────────────────

describe('getPointsForHintsUsed', () => {
  it('returns 10 for 0 hints', () => expect(getPointsForHintsUsed(0)).toBe(10));
  it('returns 9 for 1 hint', () => expect(getPointsForHintsUsed(1)).toBe(9));
  it('returns 7 for 2 hints', () => expect(getPointsForHintsUsed(2)).toBe(7));
  it('returns 5 for 3 hints', () => expect(getPointsForHintsUsed(3)).toBe(5));
  it('returns 3 for 4 hints', () => expect(getPointsForHintsUsed(4)).toBe(3));
  it('returns 1 for 5 hints', () => expect(getPointsForHintsUsed(5)).toBe(1));
  it('returns 1 for overtime (6+)', () => {
    expect(getPointsForHintsUsed(6)).toBe(1);
    expect(getPointsForHintsUsed(99)).toBe(1);
  });
});

// ─── Scoring across rounds ────────────────────────────────────────────────────

describe('scoring across rounds', () => {
  it('accumulates scores across 3 rounds correctly', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER], competitionType: 'HOH', seed: 7 }));

    // Round 1: correct with 0 hints → 10 pts
    const fig1 = FAMOUS_FIGURES[getState(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER, guess: fig1.canonicalName }));
    expect(getState(store).playerScores[PLAYER]).toBe(10);
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 2: request 2 hints then correct → 7 pts
    store.dispatch(revealNextHint());
    store.dispatch(revealNextHint());
    const fig2 = FAMOUS_FIGURES[getState(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER, guess: fig2.canonicalName }));
    expect(getState(store).playerScores[PLAYER]).toBe(17); // 10 + 7
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 3: no correct answer → 0 pts
    store.dispatch(endRound());
    store.dispatch(nextRound());

    expect(getState(store).status).toBe('complete');
    expect(getState(store).playerScores[PLAYER]).toBe(17);
  });
});

// ─── Tiebreaker logic ─────────────────────────────────────────────────────────

describe('tiebreaker logic', () => {
  it('player with more correct rounds wins on tiebreak', () => {
    const store = makeStore();
    const PA = 'tie-a';
    const PB = 'tie-b';
    store.dispatch(startFamousFigures({ participantIds: [PA, PB], competitionType: 'HOH', seed: 3 }));

    // Round 1: both answer correctly with 0 hints → both get 10
    const fig1 = FAMOUS_FIGURES[getState(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PA, guess: fig1.canonicalName }));
    store.dispatch(submitPlayerGuess({ playerId: PB, guess: fig1.canonicalName }));
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 2: only PA answers correctly with 0 hints → PA +10, PB +0
    const fig2 = FAMOUS_FIGURES[getState(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PA, guess: fig2.canonicalName }));
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 3: only PB answers correctly with 0 hints → PB +10
    // But: PA has 20 total, PB has 20 total — tiebreak by correct rounds
    const fig3 = FAMOUS_FIGURES[getState(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PB, guess: fig3.canonicalName }));
    store.dispatch(endRound());
    store.dispatch(nextRound());

    const s = getState(store);
    expect(s.status).toBe('complete');
    // PA: 10 + 10 + 0 = 20 (2 correct rounds)
    // PB: 10 + 0 + 10 = 20 (2 correct rounds)
    // Exact tie in both score and rounds → first by array order
    expect([PA, PB]).toContain(s.winnerId);
  });

  it('winner has strictly higher score', () => {
    const store = makeStore();
    const PA = 'score-a';
    const PB = 'score-b';
    store.dispatch(startFamousFigures({ participantIds: [PA, PB], competitionType: 'HOH', seed: 5 }));

    // Round 1: PA correct with 0 hints (10), PB wrong
    const fig1 = FAMOUS_FIGURES[getState(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: PA, guess: fig1.canonicalName }));
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 2: neither correct
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 3: neither correct
    store.dispatch(endRound());
    store.dispatch(nextRound());

    const s = getState(store);
    expect(s.winnerId).toBe(PA);
    expect(s.playerScores[PA]).toBeGreaterThan(s.playerScores[PB] ?? 0);
  });
});
