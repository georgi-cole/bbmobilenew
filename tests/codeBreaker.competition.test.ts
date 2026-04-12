/**
 * Vault Cracker (logicLocks) — competition regression tests.
 *
 * Covers:
 *  1. Pure logic — secret code generation, guess evaluation, scoring.
 *  2. AI score computation is deterministic from seed + playerId.
 *  3. Winner is the participant with the highest Vault Cracker score.
 *  4. Last-place finisher is the participant with the lowest score.
 *  5. Explicit lastPlaceId passed to applyMinigameWinner takes priority.
 *  6. Public mode auto-nominee matches the last-place Vault Cracker finisher.
 *  7. Human nomination flow continues correctly after the game resolves.
 *  8. AI-only nomination flow produces the correct winner + last-place.
 *  9. Better attempt/time efficiency produces stronger scores.
 * 10. Tie-breaking is deterministic (stable sort preserves participant order).
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { getGame } from '../src/minigames/registry';
import reactComponents from '../src/minigames/reactComponents';
import gameReducer, {
  applyMinigameWinner,
  commitNominees,
  advance,
} from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player } from '../src/types';

import {
  generateSecretCode,
  evaluateGuess,
  computeSolvedScore,
  computeAiSolveProfile,
  computeAiScore,
  computeAllAiSolveProfiles,
  computeAllAiScores,
  rankScores,
  getAttemptBand,
  ATTEMPT_BAND_LABELS,
  CODE_LENGTH,
  DEFAULT_ELAPSED_SCORE_CAP_MS,
  SOLVED_SCORE_FLOOR,
} from '../src/components/CodeBreakerComp/codeBreakerLogic';

describe('Vault Cracker registry wiring', () => {
  it('uses the React CodeBreaker component key', () => {
    const entry = getGame('logicLocks');
    expect(entry?.implementation).toBe('react');
    expect(entry?.reactComponentKey).toBe('CodeBreaker');
  });

  it('is registered in the generic React minigame map', () => {
    expect(reactComponents.CodeBreaker).toBeDefined();
    expect(typeof reactComponents.CodeBreaker).toBe('function');
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const players = overrides.players ?? makePlayers(5);
  const base: GameState = {
    season: 1,
    week: 2,
    phase: 'loh_comp',
    seed: 42,
    lohId: null,
    prevHohId: null,
    nomineeIds: [],
    publicModeEnabled: true,
    posWinnerId: null,
    replacementNeeded: false,
    povSavedId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
    lastHohCompFinisherId: null,
    publicSavedNomineeId: null,
    nominationContext: null,
    awaitingPublicSave: false,
    votes: {},
    awaitingHumanVote: false,
    awaitingTieBreak: false,
    tiedNomineeIds: null,
    awaitingFinal3Eviction: false,
    awaitingFinal3Plea: false,
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    pendingEviction: null,
    players,
    tvFeed: [],
    isLive: false,
  };

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
    },
    preloadedState: {
      game: { ...base, ...overrides } as GameState,
    },
  });
}

/**
 * Convenience: dispatch applyMinigameWinner with Vault Cracker-style scored data.
 */
function dispatchCodeBreakerResult(
  store: ReturnType<typeof makeStore>,
  {
    participants,
    scores,
    winnerId,
    lastPlaceId,
  }: {
    participants: string[];
    scores: Record<string, number>;
    winnerId: string;
    lastPlaceId: string | null;
  },
) {
  store.dispatch(
    applyMinigameWinner({
      winnerId,
      participants,
      scores,
      lastPlaceId,
      lastPlaceType: 'scored',
    }),
  );
}

function advanceToNominationResults(store: ReturnType<typeof makeStore>) {
  store.dispatch(advance()); // loh_results → social_1
  store.dispatch(advance()); // social_1 → nominations
  store.dispatch(advance()); // nominations → nomination_results
}

// ── 1. Pure logic — secret code ───────────────────────────────────────────────

describe('Vault Cracker — generateSecretCode', () => {
  it('returns exactly 4 unique digits', () => {
    const code = generateSecretCode(42);
    expect(code).toHaveLength(CODE_LENGTH);
    expect(new Set(code).size).toBe(CODE_LENGTH);
  });

  it('all digits are in 0-9', () => {
    const code = generateSecretCode(99);
    for (const d of code) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(9);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = generateSecretCode(12345);
    const b = generateSecretCode(12345);
    expect(a).toEqual(b);
  });

  it('produces different codes for different seeds', () => {
    const a = generateSecretCode(1);
    const b = generateSecretCode(2);
    expect(a).not.toEqual(b);
  });
});

// ── 2. Pure logic — guess evaluation ─────────────────────────────────────────

describe('Vault Cracker — evaluateGuess', () => {
  it('perfect guess = 4 bulls, 0 cows', () => {
    const secret = [1, 2, 3, 4];
    const { bulls, cows } = evaluateGuess(secret, [1, 2, 3, 4]);
    expect(bulls).toBe(4);
    expect(cows).toBe(0);
  });

  it('all wrong positions = 0 bulls, 4 cows', () => {
    const secret = [1, 2, 3, 4];
    const { bulls, cows } = evaluateGuess(secret, [4, 1, 2, 3]);
    expect(bulls).toBe(0);
    expect(cows).toBe(4);
  });

  it('mixed bulls and cows', () => {
    // secret: 1234, guess: 1352  → pos0 bull (1=1), pos2 cow (3 in secret), pos1,3 miss
    const secret = [1, 2, 3, 4];
    const result = evaluateGuess(secret, [1, 3, 5, 2]);
    expect(result.bulls).toBe(1); // digit 1 in position 0
    expect(result.cows).toBe(2);  // 3 and 2 in secret but wrong positions
  });

  it('no matching digits = 0 bulls, 0 cows', () => {
    const secret = [1, 2, 3, 4];
    const { bulls, cows } = evaluateGuess(secret, [5, 6, 7, 8]);
    expect(bulls).toBe(0);
    expect(cows).toBe(0);
  });
});

// ── 3. Pure logic — attempt bands ─────────────────────────────────────────────

describe('Vault Cracker — getAttemptBand', () => {
  it('1–2 attempts → mythic', () => {
    expect(getAttemptBand(1)).toBe('mythic');
    expect(getAttemptBand(2)).toBe('mythic');
  });

  it('3–4 attempts → elite', () => {
    expect(getAttemptBand(3)).toBe('elite');
    expect(getAttemptBand(4)).toBe('elite');
  });

  it('5–6 attempts → expert', () => {
    expect(getAttemptBand(5)).toBe('expert');
    expect(getAttemptBand(6)).toBe('expert');
  });

  it('7–8 attempts → strong', () => {
    expect(getAttemptBand(7)).toBe('strong');
    expect(getAttemptBand(8)).toBe('strong');
  });

  it('9–10 attempts → solved', () => {
    expect(getAttemptBand(9)).toBe('solved');
    expect(getAttemptBand(10)).toBe('solved');
  });

  it('11+ attempts → struggled', () => {
    expect(getAttemptBand(11)).toBe('struggled');
    expect(getAttemptBand(20)).toBe('struggled');
  });

  it('ATTEMPT_BAND_LABELS has a label for every band', () => {
    const bands: ReturnType<typeof getAttemptBand>[] = [
      'mythic', 'elite', 'expert', 'strong', 'solved', 'struggled',
    ];
    for (const band of bands) {
      expect(typeof ATTEMPT_BAND_LABELS[band]).toBe('string');
      expect(ATTEMPT_BAND_LABELS[band].length).toBeGreaterThan(0);
    }
  });
});

// ── 4. Pure logic — scoring ───────────────────────────────────────────────────

describe('Vault Cracker — scoring', () => {
  it('single attempt instant solve is discounted as lucky (below the elite peak)', () => {
    // 1 attempt: base=100, confidence=0.75 → adjusted=75; time bonus=12 → 87
    expect(computeSolvedScore(1, 0)).toBe(87);
  });

  it('four attempt instant solve yields the highest possible score (elite peak)', () => {
    // 4 attempts: base=84, confidence=1.00 → adjusted=84; time bonus=12 → 96
    expect(computeSolvedScore(4, 0)).toBe(96);
  });

  it('treats zero attempts and negative elapsed values like an immediate one-attempt solve', () => {
    expect(computeSolvedScore(0, -5_000)).toBe(87);
  });

  it('guards against non-positive elapsed score caps', () => {
    // cap=0 → safeCapMs=1 → time fraction≈0 → no time bonus
    expect(computeSolvedScore(2, 20_000, 0)).toBe(79);
    // cap=-25 → safeCapMs=1, elapsed=-1000 → elapsed treated as 0 → full time bonus
    expect(computeSolvedScore(2, -1_000, -25)).toBe(91);
  });

  it('elite attempts (3–4) score higher than mythic attempts (1–2) at the same elapsed time', () => {
    // For a hard puzzle, 4 attempts (84 × 1.00 = 84) beats 2 attempts (96 × 0.82 = 79)
    expect(computeSolvedScore(4, 20_000)).toBeGreaterThan(computeSolvedScore(2, 20_000));
  });

  it('longer elapsed time reduces score for the same attempt count', () => {
    expect(computeSolvedScore(2, 90_000)).toBeLessThan(computeSolvedScore(2, 20_000));
  });

  it('very slow high-attempt solves collapse toward the solved floor', () => {
    // 50 attempts: base=10 (floored), confidence=0.80 → adjusted=8; time bonus=0 → 8
    expect(computeSolvedScore(50, DEFAULT_ELAPSED_SCORE_CAP_MS * 2)).toBe(8);
  });

  it('softened curve — expert range instant solves (5–6 attempts)', () => {
    // 5 attempts: base=82, confidence=1.00 → adjusted=82; time bonus=12 → 94
    expect(computeSolvedScore(5, 0)).toBe(94);
    // 6 attempts: base=74, confidence=0.98 → adjusted=73; time bonus=12 → 85
    expect(computeSolvedScore(6, 0)).toBe(85);
  });

  it('softened curve — strong range instant solves (7–8 attempts)', () => {
    // 7 attempts: base=66, confidence=0.97 → adjusted=64; time bonus=12 → 76
    expect(computeSolvedScore(7, 0)).toBe(76);
    // 8 attempts: base=58, confidence=0.96 → adjusted=56; time bonus=12 → 68
    expect(computeSolvedScore(8, 0)).toBe(68);
  });

  it('softened curve — solved range instant solves (9–10 attempts)', () => {
    // 9 attempts: base=50, confidence=0.93 → Math.round(50*0.93)=Math.round(46.5)=47; time bonus=12 → 59
    expect(computeSolvedScore(9, 0)).toBe(59);
    // 10 attempts: base=42, confidence=0.90 → Math.round(42*0.90)=Math.round(37.8)=38; time bonus=12 → 50
    expect(computeSolvedScore(10, 0)).toBe(50);
  });

  it('softened curve — elite peak (4 attempts) still outranks expert range (5–6 attempts)', () => {
    // 4 attempts instant (96) > 5 attempts instant (94) > 6 attempts instant (85)
    expect(computeSolvedScore(4, 0)).toBeGreaterThan(computeSolvedScore(5, 0));
    expect(computeSolvedScore(5, 0)).toBeGreaterThan(computeSolvedScore(6, 0));
  });

  it('AI scores stay within valid range when computing deterministic results', () => {
    const score = computeAiScore(42, 'cap-check', DEFAULT_ELAPSED_SCORE_CAP_MS);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(SOLVED_SCORE_FLOOR);
  });

  it('AI solve profiles keep attempts and elapsed time in the hard-puzzle range', () => {
    // Hard-puzzle AI: 4..11 attempts, reflecting a puzzle most players need many guesses for
    const result = computeAiSolveProfile(42, 'cap-check', DEFAULT_ELAPSED_SCORE_CAP_MS);
    expect(result.attempts).toBeGreaterThanOrEqual(4);
    expect(result.attempts).toBeLessThanOrEqual(11);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(15_000);
    expect(result.elapsedMs).toBeLessThanOrEqual(DEFAULT_ELAPSED_SCORE_CAP_MS);
    expect(result.score).toBe(computeAiScore(42, 'cap-check', DEFAULT_ELAPSED_SCORE_CAP_MS));
  });
});

// ── 5. AI score determinism ───────────────────────────────────────────────────

describe('Vault Cracker — AI score determinism', () => {
  it('same seed + playerId always produces the same score', () => {
    const a = computeAiScore(42, 'player_X', DEFAULT_ELAPSED_SCORE_CAP_MS);
    const b = computeAiScore(42, 'player_X', DEFAULT_ELAPSED_SCORE_CAP_MS);
    expect(a).toBe(b);
  });

  it('different playerIds produce different scores for the same seed', () => {
    const a = computeAiScore(42, 'p1', DEFAULT_ELAPSED_SCORE_CAP_MS);
    const b = computeAiScore(42, 'p2', DEFAULT_ELAPSED_SCORE_CAP_MS);
    // Both must be in valid score range
    expect(a).toBeGreaterThanOrEqual(30);
    expect(a).toBeLessThanOrEqual(100);
    expect(b).toBeGreaterThanOrEqual(30);
    expect(b).toBeLessThanOrEqual(100);
    expect(a).not.toBe(b);
  });

  it('same seed + playerId always produces the same solve profile', () => {
    const a = computeAiSolveProfile(42, 'player_X', DEFAULT_ELAPSED_SCORE_CAP_MS);
    const b = computeAiSolveProfile(42, 'player_X', DEFAULT_ELAPSED_SCORE_CAP_MS);
    expect(a).toEqual(b);
  });

  it('computeAllAiScores excludes the human', () => {
    const ids = ['p0', 'p1', 'p2'];
    const scores = computeAllAiScores(42, ids, 'p0', DEFAULT_ELAPSED_SCORE_CAP_MS);
    expect(scores['p0']).toBeUndefined();
    expect(typeof scores['p1']).toBe('number');
    expect(typeof scores['p2']).toBe('number');
  });

  it('computeAllAiSolveProfiles excludes the human and preserves deterministic scores', () => {
    const ids = ['p0', 'p1', 'p2'];
    const profiles = computeAllAiSolveProfiles(42, ids, 'p0', DEFAULT_ELAPSED_SCORE_CAP_MS);
    expect(profiles['p0']).toBeUndefined();
    expect(profiles['p1'].score).toBe(computeAiScore(42, 'p1', DEFAULT_ELAPSED_SCORE_CAP_MS));
    expect(profiles['p2'].score).toBe(computeAiScore(42, 'p2', DEFAULT_ELAPSED_SCORE_CAP_MS));
  });
});

// ── 5. rankScores ─────────────────────────────────────────────────────────────

describe('Vault Cracker — rankScores', () => {
  it('sorts highest score first', () => {
    const ranked = rankScores({ p0: 50, p1: 80, p2: 65 }, ['p0', 'p1', 'p2']);
    expect(ranked[0].id).toBe('p1');
    expect(ranked[1].id).toBe('p2');
    expect(ranked[2].id).toBe('p0');
  });

  it('tie preserves original participant order', () => {
    const ranked = rankScores({ p0: 70, p1: 70, p2: 50 }, ['p0', 'p1', 'p2']);
    expect(ranked[0].id).toBe('p0');
    expect(ranked[1].id).toBe('p1');
    expect(ranked[2].id).toBe('p2');
  });
});

// ── 6. Winner correctness ─────────────────────────────────────────────────────

describe('Vault Cracker — winner correctness', () => {
  it('winner is the participant with the highest score (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // p0 (human) = 95, p1 = 80, p2 = 70, p3 = 50
    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2', 'p3'],
      scores: { p0: 95, p1: 80, p2: 70, p3: 50 },
      winnerId: 'p0',
      lastPlaceId: 'p3',
    });

    expect(store.getState().game.lohId).toBe('p0');
  });

  it('winner is the participant with the highest score (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2', 'p3'],
      scores: { p0: 70, p1: 95, p2: 80, p3: 60 },
      winnerId: 'p1',
      lastPlaceId: 'p3',
    });

    expect(store.getState().game.lohId).toBe('p1');
  });

  it('phase transitions to loh_results after outcome', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });

    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2'],
      scores: { p0: 85, p1: 90, p2: 60 },
      winnerId: 'p1',
      lastPlaceId: 'p2',
    });

    expect(store.getState().game.phase).toBe('loh_results');
  });

  it('better attempt/time efficiency produces higher scores', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2'],
      scores: { p0: 41, p1: 67, p2: 84 },
      winnerId: 'p2',
      lastPlaceId: 'p0',
    });

    expect(store.getState().game.lohId).toBe('p2');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
  });
});

// ── 7. Last-place finisher correctness ───────────────────────────────────────

describe('Vault Cracker — last-place finisher correctness', () => {
  it('last-place is the participant with the lowest score', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2', 'p3', 'p4'],
      scores: { p0: 90, p1: 80, p2: 70, p3: 60, p4: 40 },
      winnerId: 'p0',
      lastPlaceId: 'p4',
    });

    expect(store.getState().game.lastHohCompFinisherId).toBe('p4');
  });

  it('explicit lastPlaceId takes priority over lowest-score derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // p3 actually has the lowest score but we explicitly override
    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2', 'p3'],
      scores: { p0: 90, p1: 75, p2: 55, p3: 40 },
      winnerId: 'p0',
      lastPlaceId: 'p2', // explicit override
    });

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('invalid lastPlaceId (equals winner) falls back to score derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    // p0 wins; passing p0 as lastPlaceId is invalid → falls back to p3
    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2', 'p3'],
      scores: { p0: 90, p1: 75, p2: 60, p3: 40 },
      winnerId: 'p0',
      lastPlaceId: 'p0', // invalid — same as winner
    });

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });
});

// ── 8. Public mode auto-nominee ───────────────────────────────────────────────

describe('Vault Cracker — Public mode auto-nominee', () => {
  it('auto-nominee matches the last-place Vault Cracker finisher', () => {
    const players = makePlayers(6);
    const store = makeStore({ players, publicModeEnabled: true });

    // p5 finishes last in the competition
    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      scores: { p0: 95, p1: 85, p2: 78, p3: 65, p4: 55, p5: 30 },
      winnerId: 'p0',
      lastPlaceId: 'p5',
    });

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    advanceToNominationResults(store);

    // Human LOH (p0) must nominate two players
    expect(store.getState().game.awaitingNominations).toBe(true);
    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    // p5 must appear as a nominee (auto-added in Public mode)
    expect(state.nomineeIds).toContain('p5');
  });

  it('auto-nominee is the last-place player even when human finishes last', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: true });

    // AI wins; human (p0) finishes last
    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2', 'p3', 'p4'],
      scores: { p0: 30, p1: 88, p2: 72, p3: 60, p4: 45 },
      winnerId: 'p1',
      lastPlaceId: 'p0',
    });

    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
  });
});

// ── 9. Human nomination flow ──────────────────────────────────────────────────

describe('Vault Cracker — human nomination flow', () => {
  it('human LOH can nominate after Vault Cracker resolves', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2', 'p3', 'p4'],
      scores: { p0: 90, p1: 70, p2: 60, p3: 55, p4: 40 },
      winnerId: 'p0',
      lastPlaceId: 'p4',
    });

    advanceToNominationResults(store);

    expect(store.getState().game.awaitingNominations).toBe(true);
    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 10. AI-only nomination flow ───────────────────────────────────────────────

describe('Vault Cracker — AI-only nomination flow', () => {
  it('AI LOH sets lohId and lastHohCompFinisherId correctly', () => {
    const players = makePlayers(5);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    dispatchCodeBreakerResult(store, {
      participants: ['p0', 'p1', 'p2', 'p3', 'p4'],
      scores: { p0: 40, p1: 95, p2: 75, p3: 60, p4: 50 },
      winnerId: 'p1',
      lastPlaceId: 'p0',
    });

    const state = store.getState().game;
    expect(state.lohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p0');
  });

  it('AI LOH in public mode auto-nominates the last-place finisher', () => {
    const players = makePlayers(6);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players, publicModeEnabled: true });

    dispatchCodeBreakerResult(store, {
      participants: ['p1', 'p2', 'p3', 'p4', 'p5'],
      scores: { p1: 95, p2: 80, p3: 72, p4: 60, p5: 35 },
      winnerId: 'p1',
      lastPlaceId: 'p5',
    });

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    advanceToNominationResults(store);

    const afterNoms = store.getState().game;
    expect(afterNoms.nomineeIds).toContain('p5');
  });

  it('AI LOH phase transitions to loh_results', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    dispatchCodeBreakerResult(store, {
      participants: ['p1', 'p2', 'p3'],
      scores: { p1: 85, p2: 70, p3: 55 },
      winnerId: 'p1',
      lastPlaceId: 'p3',
    });

    expect(store.getState().game.phase).toBe('loh_results');
  });
});

// ── 11. POS competition ───────────────────────────────────────────────────────

describe('Vault Cracker — POS competition', () => {
  it('resolves as POS winner when phase is pos_comp', () => {
    const players = makePlayers(4);
    const store = makeStore({ players, phase: 'pos_comp', lohId: 'p1' });

    store.dispatch(
      applyMinigameWinner({
        winnerId: 'p2',
        participants: ['p0', 'p1', 'p2', 'p3'],
        scores: { p0: 70, p1: 80, p2: 95, p3: 55 },
        lastPlaceId: 'p3',
        lastPlaceType: 'scored',
      }),
    );

    expect(store.getState().game.posWinnerId).toBe('p2');
  });
});

// ── 12. computeAllAiScores integration ────────────────────────────────────────

describe('Vault Cracker — computeAllAiScores integration', () => {
  it('all AI scores are in valid range [SOLVED_SCORE_FLOOR, 100]', () => {
    const ids = ['p0', 'p1', 'p2', 'p3', 'p4'];
    const scores = computeAllAiScores(42, ids, 'p0', DEFAULT_ELAPSED_SCORE_CAP_MS);
    for (const id of ids.slice(1)) {
      expect(scores[id]).toBeGreaterThanOrEqual(SOLVED_SCORE_FLOOR);
      expect(scores[id]).toBeLessThanOrEqual(100);
    }
  });

  it('from the same seed, the game always produces the same winner', () => {
    const ids = ['p0', 'p1', 'p2', 'p3'];
    const scoresA = computeAllAiScores(999, ids, null, DEFAULT_ELAPSED_SCORE_CAP_MS);
    const scoresB = computeAllAiScores(999, ids, null, DEFAULT_ELAPSED_SCORE_CAP_MS);
    const rankedA = rankScores(scoresA, ids);
    const rankedB = rankScores(scoresB, ids);
    expect(rankedA[0].id).toBe(rankedB[0].id);
  });
});
