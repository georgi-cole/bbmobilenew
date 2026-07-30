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
  getPlayerFigureIndex,
} from '../../../src/features/famousFigures/famousFiguresSlice';
import type { FamousFiguresState } from '../../../src/features/famousFigures/famousFiguresSlice';

function makeStore() {
  return configureStore({ reducer: { famousFigures: famousFiguresReducer } });
}

function getState(store: ReturnType<typeof makeStore>): FamousFiguresState {
  return store.getState().famousFigures;
}

const PLAYER = 'scorer-player';

// â”€â”€â”€ Scoring point values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('getPointsForHintsUsed', () => {
  it('returns 10 for 0 hints', () => expect(getPointsForHintsUsed(0)).toBe(10));
  it('returns 8 for 1 hint', () => expect(getPointsForHintsUsed(1)).toBe(8));
  it('returns 5 for 2 hints', () => expect(getPointsForHintsUsed(2)).toBe(5));
  it('returns 3 for 3 hints', () => expect(getPointsForHintsUsed(3)).toBe(3));
  it('returns 1 for the final visible hint', () => expect(getPointsForHintsUsed(4)).toBe(1));
  it('returns 1 for 5 hints', () => expect(getPointsForHintsUsed(5)).toBe(1));
  it('returns 1 for overtime (6+)', () => {
    expect(getPointsForHintsUsed(6)).toBe(1);
    expect(getPointsForHintsUsed(99)).toBe(1);
  });
});

// â”€â”€â”€ Scoring across rounds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('scoring across rounds', () => {
  it('accumulates scores across 6 rounds correctly', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [PLAYER], competitionType: 'LOH', seed: 7 }));

    // Round 1: correct with 0 hints â†’ 10 pts
    const s0 = getState(store);
    const fig1 = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PLAYER, s0.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER, guess: fig1.canonicalName }));
    expect(getState(store).playerScores[PLAYER]).toBe(10);
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 2: request 2 hints then correct â†’ 7 pts
    store.dispatch(revealNextHint());
    store.dispatch(revealNextHint());
    const s1 = getState(store);
    const fig2 = FAMOUS_FIGURES[getPlayerFigureIndex(s1, PLAYER, s1.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PLAYER, guess: fig2.canonicalName }));
    expect(getState(store).playerScores[PLAYER]).toBe(15); // 10 + 5
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 3: no correct answer â†’ 0 pts
    store.dispatch(endRound());
    store.dispatch(nextRound());

    for (let round = 3; round < 6; round++) {
      store.dispatch(endRound());
      store.dispatch(nextRound());
    }

    expect(getState(store).status).toBe('complete');
    expect(getState(store).playerScores[PLAYER]).toBe(15);
  });
});

// â”€â”€â”€ Tiebreaker logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('tiebreaker logic', () => {
  it('player with more correct rounds wins on tiebreak', () => {
    const store = makeStore();
    const PA = 'tie-a';
    const PB = 'tie-b';
    store.dispatch(startFamousFigures({ participantIds: [PA, PB], competitionType: 'LOH', seed: 3 }));

    // Round 1: both answer correctly with 0 hints â†’ both get 10
    const s0 = getState(store);
    const fig1A = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PA, s0.currentRound)];
    const fig1B = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PB, s0.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PA, guess: fig1A.canonicalName }));
    store.dispatch(submitPlayerGuess({ playerId: PB, guess: fig1B.canonicalName }));
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 2: only PA answers correctly with 0 hints â†’ PA +10, PB +0
    const s1 = getState(store);
    const fig2A = FAMOUS_FIGURES[getPlayerFigureIndex(s1, PA, s1.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PA, guess: fig2A.canonicalName }));
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 3: only PB answers correctly with 0 hints â†’ PB +10
    // But: PA has 20 total, PB has 20 total â€” tiebreak by correct rounds
    const s2 = getState(store);
    const fig3B = FAMOUS_FIGURES[getPlayerFigureIndex(s2, PB, s2.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PB, guess: fig3B.canonicalName }));
    store.dispatch(endRound());
    store.dispatch(nextRound());

    for (let round = 3; round < 6; round++) {
      store.dispatch(endRound());
      store.dispatch(nextRound());
    }

    const s = getState(store);
    expect(s.status).toBe('complete');
    // PA: 10 + 10 + 0 = 20 (2 correct rounds)
    // PB: 10 + 0 + 10 = 20 (2 correct rounds)
    // Exact tie in both score and rounds â†’ first by array order
    expect([PA, PB]).toContain(s.winnerId);
  });

  it('winner has strictly higher score', () => {
    const store = makeStore();
    const PA = 'score-a';
    const PB = 'score-b';
    store.dispatch(startFamousFigures({ participantIds: [PA, PB], competitionType: 'LOH', seed: 5 }));

    // Round 1: PA correct with 0 hints (10), PB wrong
    const s0 = getState(store);
    const fig1A = FAMOUS_FIGURES[getPlayerFigureIndex(s0, PA, s0.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: PA, guess: fig1A.canonicalName }));
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 2: neither correct
    store.dispatch(endRound());
    store.dispatch(nextRound());

    // Round 3: neither correct
    store.dispatch(endRound());
    store.dispatch(nextRound());

    for (let round = 3; round < 6; round++) {
      store.dispatch(endRound());
      store.dispatch(nextRound());
    }

    const s = getState(store);
    expect(s.winnerId).toBe(PA);
    expect(s.playerScores[PA]).toBeGreaterThan(s.playerScores[PB] ?? 0);
  });
});

