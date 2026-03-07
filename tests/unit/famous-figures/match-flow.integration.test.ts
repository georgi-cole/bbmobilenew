/**
 * Integration test: simulate a full 3-round Famous Figures match
 * with one human player and one AI player.
 */
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import famousFiguresReducer, {
  startFamousFigures,
  submitPlayerGuess,
  revealNextHint,
  endRound,
  nextRound,
  FAMOUS_FIGURES,
} from '../../../src/features/famousFigures/famousFiguresSlice';
import type { FamousFiguresState } from '../../../src/features/famousFigures/famousFiguresSlice';

function makeStore() {
  return configureStore({ reducer: { famousFigures: famousFiguresReducer } });
}

function ff(store: ReturnType<typeof makeStore>): FamousFiguresState {
  return store.getState().famousFigures;
}

const HUMAN = 'human-player';
const AI = 'ai-player';
const SEED = 42;

describe('match-flow integration', () => {
  it('simulates a full 3-round match', () => {
    const store = makeStore();

    // ── Start match ──────────────────────────────────────────────────────
    store.dispatch(startFamousFigures({
      participantIds: [HUMAN, AI],
      competitionType: 'HOH',
      seed: SEED,
    }));

    expect(ff(store).status).toBe('round_active');
    expect(ff(store).currentRound).toBe(0);

    // ── Round 1: human guesses correctly with 0 hints ────────────────────
    const fig1 = FAMOUS_FIGURES[ff(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: HUMAN, guess: fig1.canonicalName }));

    expect(ff(store).playerCorrect[HUMAN]).toBe(true);
    expect(ff(store).playerScores[HUMAN]).toBe(10); // 0 hints = 10 pts
    expect(ff(store).correctPlayers).toContain(HUMAN);

    store.dispatch(endRound());
    expect(ff(store).status).toBe('round_reveal');
    expect(ff(store).playerRoundScores[HUMAN][0]).toBe(10);

    store.dispatch(nextRound());
    expect(ff(store).status).toBe('round_active');
    expect(ff(store).currentRound).toBe(1);

    // ── Round 2: human requests 2 hints then guesses correctly ────────────
    store.dispatch(revealNextHint());
    store.dispatch(revealNextHint());
    expect(ff(store).hintsRevealed).toBe(2);

    const fig2 = FAMOUS_FIGURES[ff(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: HUMAN, guess: fig2.canonicalName }));

    expect(ff(store).playerCorrect[HUMAN]).toBe(true);
    expect(ff(store).playerScores[HUMAN]).toBe(17); // 10 + 7

    store.dispatch(endRound());
    expect(ff(store).playerRoundScores[HUMAN][1]).toBe(7); // 2 hints = 7 pts
    store.dispatch(nextRound());

    expect(ff(store).currentRound).toBe(2);
    expect(ff(store).status).toBe('round_active');

    // ── Round 3: AI answers correctly, human misses ───────────────────────
    const fig3 = FAMOUS_FIGURES[ff(store).currentFigureIndex];
    store.dispatch(submitPlayerGuess({ playerId: AI, guess: fig3.canonicalName }));
    store.dispatch(submitPlayerGuess({ playerId: HUMAN, guess: 'completely wrong answer xyzzy' }));

    expect(ff(store).playerCorrect[AI]).toBe(true);
    // HUMAN submitted a wrong answer — playerCorrect remains false
    expect(ff(store).playerCorrect[HUMAN] ?? false).toBe(false);
    expect(ff(store).playerScores[AI]).toBeGreaterThan(0);

    store.dispatch(endRound());
    expect(ff(store).playerRoundScores[HUMAN][2]).toBe(0);
    expect(ff(store).status).toBe('round_reveal');

    store.dispatch(nextRound());

    // ── Final state ───────────────────────────────────────────────────────
    const final = ff(store);
    expect(final.status).toBe('complete');

    // Human has 17 pts; AI has points from round 3 only
    const humanTotal = final.playerScores[HUMAN];
    const aiTotal = final.playerScores[AI];
    expect(humanTotal).toBe(17);
    expect(aiTotal).toBeGreaterThan(0);

    // Human won overall (17 > AI's single-round score of at most 10)
    expect(final.winnerId).toBe(HUMAN);
  });

  it('handles all-wrong round correctly (no winners, 0 pts)', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [HUMAN, AI], competitionType: 'POV', seed: 99 }));

    // Nobody answers correctly
    store.dispatch(submitPlayerGuess({ playerId: HUMAN, guess: 'nobody right xyzzy abc' }));
    store.dispatch(submitPlayerGuess({ playerId: AI, guess: 'also completely wrong abc' }));

    store.dispatch(endRound());
    const s = ff(store);
    expect(s.playerRoundScores[HUMAN][0]).toBe(0);
    expect(s.playerRoundScores[AI][0]).toBe(0);
    expect(s.correctPlayers).toHaveLength(0);
  });
});
