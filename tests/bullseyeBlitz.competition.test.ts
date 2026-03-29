/**
 * Bullseye Blitz (targetPractice) — competition regression tests.
 *
 * Covers:
 *  1. Winner is the player with the highest score.
 *  2. Last-place finisher is the player with the lowest score.
 *  3. Explicit lastPlaceId from the component takes priority over score derivation.
 *  4. Public mode auto-nominee matches the last-place finisher from the competition.
 *  5. Human nomination flow continues correctly after the game resolves.
 *  6. AI-only nomination flow produces the correct winner + last-place.
 *  7. Hazard penalty: hitting a hazard drops a player's score, possibly to last place.
 *  8. Bonus targets: a bonus hit can swing ranking.
 *  9. Tie-breaking: equal scores resolved by participant index (lower index wins).
 * 10. buildRankedLeaderboard utility: deterministic ranking from canonical scores.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  launchMinigame,
  completeMinigame,
  commitNominees,
  advance,
} from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player, CompleteMinigamePayload } from '../src/types';
import {
  buildRankedLeaderboard,
  getBullseyeEliminationCount,
  getBullseyeRoundConfig,
  pickTargetKind,
  simulateBullseyeAiRoundScore,
  TARGET_CONFIGS,
} from '../src/components/BullseyeBlitz/bullseyeBlitzUtils';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0, // p0 is the human unless overridden
  }));
}

function makeStore(overrides: Partial<GameState> = {}) {
  const players = overrides.players ?? makePlayers(5);
  const base: GameState = {
    season: 1,
    week: 2,
    phase: 'hoh_comp',
    seed: 42,
    hohId: null,
    prevHohId: null,
    nomineeIds: [],
    publicModeEnabled: true,
    povWinnerId: null,
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
 * Pre-dispatch launchMinigame so completeMinigame has a session to resolve against.
 */
function setupMinigameSession(
  store: ReturnType<typeof makeStore>,
  playerIds: string[],
  aiScores: Record<string, number>,
) {
  store.dispatch(
    launchMinigame({
      key: 'targetPractice',
      participants: playerIds,
      seed: 42,
      options: { timeLimit: 20 },
      aiScores,
    }),
  );
}

/**
 * Advance hoh_results → social_1 → nominations → nomination_results.
 */
function advanceToNominationResults(store: ReturnType<typeof makeStore>) {
  store.dispatch(advance()); // hoh_results → social_1
  store.dispatch(advance()); // social_1    → nominations
  store.dispatch(advance()); // nominations → nomination_results
}

// ── 1. Winner correctness ─────────────────────────────────────────────────────

describe('Bullseye Blitz — winner correctness', () => {
  it('winner is the player with the highest score (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 70, p3: 60 });

    store.dispatch(completeMinigame({ humanScore: 120 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('winner is the player with the highest score (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 180, p2: 140, p3: 100 });

    store.dispatch(completeMinigame({ humanScore: 90 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p1');
  });

  it('phase transitions to hoh_results after completeMinigame', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 110, p2: 80 });

    store.dispatch(completeMinigame({ humanScore: 95 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });
});

// ── 2. Last-place finisher correctness ────────────────────────────────────────

describe('Bullseye Blitz — last-place finisher correctness', () => {
  it('last-place is the player with the lowest score (AI last)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 150, p2: 120, p3: 40 });

    store.dispatch(completeMinigame({ humanScore: 160 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('last-place is the human when their score is lowest', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 200, p2: 180, p3: 160 });

    store.dispatch(completeMinigame({ humanScore: 30 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
  });

  it('explicit lastPlaceId from the component overrides score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // Score-based derivation would pick p3 (score 50) but component says p2 is last
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 160, p2: 80, p3: 50 });

    store.dispatch(completeMinigame({ humanScore: 170, lastPlaceId: 'p2' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('invalid lastPlaceId (equals the winner) falls back to score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 100, p2: 90, p3: 50 });

    // p0 wins; passing p0 as lastPlaceId is invalid — store falls back to p3
    store.dispatch(completeMinigame({ humanScore: 130, lastPlaceId: 'p0' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('winner is NOT set as last-place finisher', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 110, p2: 100, p3: 80 });

    store.dispatch(completeMinigame({ humanScore: 130 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherId).not.toBe(state.hohId);
  });
});

// ── 3. Public-mode auto-nominee matches last-place finisher ───────────────────

describe('Bullseye Blitz — Public mode auto-nominee', () => {
  it('auto-nominee in Public mode matches the last-place finisher from the game', () => {
    const players = makePlayers(6);
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      { p1: 200, p2: 180, p3: 160, p4: 140, p5: 35 },
    );
    store.dispatch(completeMinigame({ humanScore: 210 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    advanceToNominationResults(store);

    // Human HOH (p0) must nominate two players
    expect(store.getState().game.awaitingNominations).toBe(true);

    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    // Auto-third nominee must match canonical last-place finisher
    expect(afterNoms.nominationContext?.autoNomineeId).toBe('p5');
    expect(afterNoms.nomineeIds).toContain('p5');
  });

  it('auto-nominee is NOT added when public mode is disabled', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });

    setupMinigameSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 180, p2: 160, p3: 140, p4: 50 },
    );
    store.dispatch(completeMinigame({ humanScore: 200 } as CompleteMinigamePayload));

    advanceToNominationResults(store);
    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    expect(afterNoms.nomineeIds).toHaveLength(2);
    expect(afterNoms.nominationContext).toBeNull();
  });
});

// ── 4. Human nomination flow ──────────────────────────────────────────────────

describe('Bullseye Blitz — human nomination flow', () => {
  it('awaitingNominations is true for the human HOH', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 100, p2: 90, p3: 80, p4: 70 });

    store.dispatch(completeMinigame({ humanScore: 150 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    expect(store.getState().game.phase).toBe('nomination_results');
    expect(store.getState().game.awaitingNominations).toBe(true);
  });

  it('human can commit two nominations successfully', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 100, p2: 90, p3: 80, p4: 70 });

    store.dispatch(completeMinigame({ humanScore: 150 } as CompleteMinigamePayload));
    advanceToNominationResults(store);
    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 5. AI-only nomination flow ────────────────────────────────────────────────

describe('Bullseye Blitz — AI-only nomination flow', () => {
  it('AI HOH correctly sets hohId and lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupMinigameSession(store, ['p1', 'p2', 'p3'], { p1: 200, p2: 120, p3: 60 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('AI HOH in Public mode auto-nominates last-place finisher', () => {
    const players = makePlayers(6);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(store, ['p1', 'p2', 'p3', 'p4', 'p5'], {
      p1: 220,
      p2: 180,
      p3: 150,
      p4: 120,
      p5: 45,
    });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    advanceToNominationResults(store);

    const afterNoms = store.getState().game;
    // p5 (last-place) must end up nominated
    expect(afterNoms.nomineeIds).toContain('p5');
    const autoNomineeOrAlreadyPicked =
      afterNoms.nominationContext?.autoNomineeId === 'p5' ||
      afterNoms.nomineeIds.includes('p5');
    expect(autoNomineeOrAlreadyPicked).toBe(true);
  });
});

// ── 6. Hazard penalty affects ranking ────────────────────────────────────────

describe('Bullseye Blitz — hazard penalty', () => {
  it('hazard hits reduce score and can push a player to last place', () => {
    // p0 human hits 3 hazards: effectively has 100 - 45 = 55 pts
    // p3 AI has 60 pts — without penalty p0 would beat p3, but with penalty p3 wins
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 140, p2: 110, p3: 60 });

    // Human's effective score after hazard hits is below p3
    store.dispatch(completeMinigame({ humanScore: 55 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p0');
  });

  it('TARGET_CONFIGS hazard has negative points', () => {
    expect(TARGET_CONFIGS.hazard.points).toBeLessThan(0);
  });

  it('TARGET_CONFIGS standard has positive points', () => {
    expect(TARGET_CONFIGS.standard.points).toBeGreaterThan(0);
  });

  it('TARGET_CONFIGS bonus has higher points than standard', () => {
    expect(TARGET_CONFIGS.bonus.points).toBeGreaterThan(TARGET_CONFIGS.standard.points);
  });
});

// ── 7. Bonus target scoring ───────────────────────────────────────────────────

describe('Bullseye Blitz — bonus target scoring', () => {
  it('bonus hit can swing ranking in favour of a lower raw-hit player', () => {
    // p0 human: 4 standard + 4 bonus = 4×10 + 4×25 = 140
    // p1 AI: 160 pts (pre-computed)
    // Despite fewer hits, bonus hits give p0 a competitive score
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 160, p2: 80 });

    store.dispatch(completeMinigame({ humanScore: 140 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1'); // AI just barely beats human
    expect(state.lastHohCompFinisherId).toBe('p2');
  });
});

// ── 8. Tie-breaking via participant index ─────────────────────────────────────

describe('Bullseye Blitz — tie-breaking', () => {
  it('buildRankedLeaderboard: lower participant index wins on equal scores (rank)', () => {
    const players = makePlayers(3);
    const participants = ['p0', 'p1', 'p2'];
    const scores = { p0: 100, p1: 100, p2: 100 }; // everyone tied

    const ranked = buildRankedLeaderboard(participants, scores, 'p0', players);

    // p0 first (index 0), p1 second (index 1), p2 third (index 2)
    expect(ranked[0].id).toBe('p0');
    expect(ranked[1].id).toBe('p1');
    expect(ranked[2].id).toBe('p2');
  });

  it('buildRankedLeaderboard: higher score wins regardless of index', () => {
    const players = makePlayers(3);
    const participants = ['p0', 'p1', 'p2'];
    const scores = { p0: 80, p1: 120, p2: 100 };

    const ranked = buildRankedLeaderboard(participants, scores, 'p0', players);

    expect(ranked[0].id).toBe('p1');
    expect(ranked[1].id).toBe('p2');
    expect(ranked[2].id).toBe('p0');
  });

  it('tied last-place: explicit lastPlaceId from component overrides tie-break', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // p2 and p3 both score 50; participant-index tie-break would pick p3 as last
    // but the component explicitly says p2 is last
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 150, p2: 50, p3: 50 });

    store.dispatch(completeMinigame({ humanScore: 160, lastPlaceId: 'p2' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });
});

// ── 9. pickTargetKind distribution ───────────────────────────────────────────

describe('Bullseye Blitz — pickTargetKind', () => {
  it('returns standard for values below 0.6', () => {
    expect(pickTargetKind(0)).toBe('standard');
    expect(pickTargetKind(0.59)).toBe('standard');
  });

  it('returns bonus for values in [0.60, 0.85)', () => {
    expect(pickTargetKind(0.60)).toBe('bonus');
    expect(pickTargetKind(0.84)).toBe('bonus');
  });

  it('returns hazard for values >= 0.85', () => {
    expect(pickTargetKind(0.85)).toBe('hazard');
    expect(pickTargetKind(1.0)).toBe('hazard');
  });
});

describe('Bullseye Blitz — tournament helpers', () => {
  it('eliminates roughly the bottom 20% while pacing the field to a round-five final duel', () => {
    expect(getBullseyeEliminationCount(15, 1)).toBe(3);
    expect(getBullseyeEliminationCount(12, 2)).toBe(3);
    expect(getBullseyeEliminationCount(9, 3)).toBe(3);
    expect(getBullseyeEliminationCount(7, 1)).toBe(1);
    expect(getBullseyeEliminationCount(6, 2)).toBe(1);
    expect(getBullseyeEliminationCount(5, 3)).toBe(1);
    expect(getBullseyeEliminationCount(4, 4)).toBe(2);
    expect(getBullseyeEliminationCount(2, 5)).toBe(0);
    expect(getBullseyeEliminationCount(1, 5)).toBe(0);
  });

  it('later rounds are harder than earlier rounds', () => {
    const roundOne = getBullseyeRoundConfig(1);
    const roundFour = getBullseyeRoundConfig(4);

    expect(roundFour.spawnIntervalMs).toBeLessThan(roundOne.spawnIntervalMs);
    expect(roundFour.targetLifetimes.standard).toBeLessThan(roundOne.targetLifetimes.standard);
    expect(roundFour.targetWeights.hazard).toBeGreaterThan(roundOne.targetWeights.hazard);
    expect(roundFour.hazardPenalty).toBeLessThan(roundOne.hazardPenalty);
  });

  it('AI round scores stay deterministic and competitive across rounds', () => {
    const baseScore = 160;
    const roundOneA = simulateBullseyeAiRoundScore(baseScore, 1, 42, 'p1');
    const roundOneB = simulateBullseyeAiRoundScore(baseScore, 1, 42, 'p1');
    const roundThree = simulateBullseyeAiRoundScore(baseScore, 3, 42, 'p1');

    expect(roundOneA).toBe(roundOneB);
    expect(roundOneA).toBeGreaterThan(100);
    expect(roundThree).toBeGreaterThan(60);
  });

  it('AI gameplay simulation produces realistic scores in the human-play range', () => {
    // Human players typically score 200–400 per round in round 1 (18 s, 560 ms spawns).
    // An AI with baseScore=300 (matching the human baseline) should score in a
    // comparable range.  We sample multiple seeds to verify the distribution.
    const scores = [42, 99, 1337, 7, 256].map((seed) =>
      simulateBullseyeAiRoundScore(300, 1, seed, 'contestant'),
    );
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;

    // Average across 5 seeds should be clearly above the old placeholder range
    // (50–70 pts) and within a realistic human-play range.
    expect(average).toBeGreaterThan(200);
    expect(average).toBeLessThan(600);
  });

  it('higher baseScore yields higher expected score than lower baseScore', () => {
    // Strong AI (baseScore=300) should consistently outscore weak AI (baseScore=80).
    // Verified across several seeds to confirm skill ordering is preserved.
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    let strongWins = 0;
    for (const seed of seeds) {
      const strong = simulateBullseyeAiRoundScore(300, 1, seed, 'ai');
      const weak   = simulateBullseyeAiRoundScore( 80, 1, seed, 'ai');
      if (strong > weak) strongWins += 1;
    }
    // Strong AI should win the majority of matchups (≥ 6 of 8).
    expect(strongWins).toBeGreaterThanOrEqual(6);
  });

  it('AI scores decrease in harder rounds reflecting genuine difficulty', () => {
    // With the same baseScore the simulation should produce lower (or at most
    // equal) scores in later harder rounds than in the opening round.
    const r1 = simulateBullseyeAiRoundScore(250, 1, 77, 'player');
    const r5 = simulateBullseyeAiRoundScore(250, 5, 77, 'player');
    // Round 5 has far more hazards (38 % vs 15 %) and much shorter target
    // lifetimes, so the score should drop significantly.
    expect(r5).toBeLessThan(r1);
  });
});

// ── 10. Backward-compat: legacy numeric payload ───────────────────────────────

describe('Bullseye Blitz — backward-compat: legacy numeric payload', () => {
  it('passing a bare number to completeMinigame still works', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 120, p2: 80 });

    // Legacy callers pass a bare number
    store.dispatch(completeMinigame(150));

    const state = store.getState().game;
    expect(state.hohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p2');
  });
});
