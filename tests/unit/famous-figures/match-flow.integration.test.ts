/**
 * Integration test: simulate a full 3-round Famous Figures match
 * with one human player and one AI player.
 */
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import famousFiguresReducer, {
  startFamousFigures,
  submitPlayerGuess,
  advancePlayerCursor,
  revealNextHint,
  endRound,
  nextRound,
  FAMOUS_FIGURES,
  getPlayerFigureIndex,
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
    const s0 = ff(store);
    const fig1 = FAMOUS_FIGURES[getPlayerFigureIndex(s0, HUMAN, s0.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: HUMAN, guess: fig1.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: HUMAN, targetRound: 0 }));

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

    const s1 = ff(store);
    const fig2 = FAMOUS_FIGURES[getPlayerFigureIndex(s1, HUMAN, s1.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: HUMAN, guess: fig2.canonicalName }));
    store.dispatch(advancePlayerCursor({ playerId: HUMAN, targetRound: 1 }));

    expect(ff(store).playerCorrect[HUMAN]).toBe(true);
    expect(ff(store).playerScores[HUMAN]).toBe(17); // 10 + 7

    store.dispatch(endRound());
    expect(ff(store).playerRoundScores[HUMAN][1]).toBe(7); // 2 hints = 7 pts
    store.dispatch(nextRound());

    expect(ff(store).currentRound).toBe(2);
    expect(ff(store).status).toBe('round_active');

    // ── Round 3: AI answers correctly (their own figure), human misses ────
    const s2 = ff(store);
    const fig3Ai = FAMOUS_FIGURES[getPlayerFigureIndex(s2, AI, s2.currentRound)];
    store.dispatch(submitPlayerGuess({ playerId: AI, guess: fig3Ai.canonicalName }));
    // AI immediately dispatches advancePlayerCursor (no overlay for AI)
    store.dispatch(advancePlayerCursor({ playerId: AI, targetRound: 2 }));
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

  it('human cursor advances after advancePlayerCursor, status stays round_active while AI pending', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [HUMAN, AI], competitionType: 'HOH', seed: SEED }));

    expect(ff(store).status).toBe('round_active');
    expect(ff(store).currentRound).toBe(0);

    const s0 = ff(store);
    const fig = FAMOUS_FIGURES[getPlayerFigureIndex(s0, HUMAN, 0)];
    store.dispatch(submitPlayerGuess({ playerId: HUMAN, guess: fig.canonicalName }));

    // Cursor must NOT advance yet — advancePlayerCursor not dispatched
    expect(ff(store).playerRoundCursor[HUMAN]).toBe(0);
    // AI hasn't answered → round stays active (not round_reveal)
    expect(ff(store).status).toBe('round_active');

    // After advancePlayerCursor, cursor advances but round still active (AI pending)
    store.dispatch(advancePlayerCursor({ playerId: HUMAN, targetRound: 0 }));
    expect(ff(store).playerRoundCursor[HUMAN]).toBe(1);
    expect(ff(store).status).toBe('round_active');
  });

  it('human can complete all 3 rounds before global endRound', () => {
    const store = makeStore();
    store.dispatch(startFamousFigures({ participantIds: [HUMAN, AI], competitionType: 'HOH', seed: SEED }));

    // Human solves all 3 rounds; AI never answers.
    // After endRound/nextRound each round becomes the current global round,
    // so each human answer is a current-round answer requiring advancePlayerCursor.
    for (let round = 0; round < 3; round++) {
      const s = ff(store);
      expect(s.status).toBe('round_active');
      expect(s.currentRound).toBe(round);
      const fig = FAMOUS_FIGURES[getPlayerFigureIndex(s, HUMAN, round)];
      store.dispatch(submitPlayerGuess({ playerId: HUMAN, guess: fig.canonicalName }));
      // Cursor must NOT advance until advancePlayerCursor fires
      expect(ff(store).playerRoundCursor[HUMAN]).toBe(round);
      store.dispatch(advancePlayerCursor({ playerId: HUMAN, targetRound: round }));
      expect(ff(store).playerRoundCursor[HUMAN]).toBe(round + 1);
      // AI hasn't answered → round stays active (not round_reveal)
      expect(ff(store).status).toBe('round_active');
      // Advance round via endRound/nextRound to proceed (AI still inactive)
      store.dispatch(endRound());
      if (round < 2) store.dispatch(nextRound());
    }

    store.dispatch(nextRound());
    // After all 3 rounds, match is complete
    expect(ff(store).status).toBe('complete');
    // Human cursor is 3 (completed all rounds)
    expect(ff(store).playerRoundCursor[HUMAN]).toBe(3);
  });
});
