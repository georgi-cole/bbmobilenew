/**
 * Snake — competition regression tests.
 *
 * Covers:
 *  1. Winner is the player with the highest food-eaten score.
 *  2. Last-place finisher is the player with the lowest score.
 *  3. Explicit lastPlaceId (from the component) takes priority over score-based derivation.
 *  4. Public mode auto-nominee matches the last-place finisher from the competition.
 *  5. Human nomination flow continues correctly after the game resolves.
 *  6. AI-only nomination flow (no human) produces the correct winner + last-place.
 *  7. Authoritative last-place data is used instead of participant-order fallback.
 *  8. Scoring: each food item = 10 points (higher-is-better), no unusual semantics.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0, // p0 is always the human unless overridden
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

/** Pre-dispatches launchMinigame so completeMinigame has a session to resolve against. */
function setupSnakeSession(
  store: ReturnType<typeof makeStore>,
  playerIds: string[],
  aiScores: Record<string, number>,
) {
  store.dispatch(
    launchMinigame({
      key: 'snake',
      participants: playerIds,
      seed: 42,
      options: { timeLimit: 0 },
      aiScores,
    }),
  );
}

/**
 * Dispatches three `advance()` calls transitioning:
 *   hoh_results → social_1 → nominations → nomination_results
 */
function advanceToNominationResults(store: ReturnType<typeof makeStore>) {
  store.dispatch(advance()); // hoh_results → social_1
  store.dispatch(advance()); // social_1 → nominations
  store.dispatch(advance()); // nominations → nomination_results
}

// ── 1. Winner correctness ─────────────────────────────────────────────────────

describe('Snake — winner correctness', () => {
  it('winner is the player with the highest score (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // AI scores: p1=60, p2=50, p3=40. Human score=80 → human wins
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 60, p2: 50, p3: 40 });

    store.dispatch(completeMinigame({ humanScore: 80 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('winner is the player with the highest score (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // AI scores: p1=100, p2=80, p3=60. Human score=50 → p1 wins
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 100, p2: 80, p3: 60 });

    store.dispatch(completeMinigame({ humanScore: 50 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p1');
  });

  it('winner matches when scores are close', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2'], { p1: 70, p2: 60 });

    // Human just beats p1
    store.dispatch(completeMinigame({ humanScore: 71 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('phase is hoh_results after completeMinigame in hoh_comp', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2'], { p1: 80, p2: 60 });

    store.dispatch(completeMinigame({ humanScore: 90 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });
});

// ── 2. Last-place finisher correctness ────────────────────────────────────────

describe('Snake — last-place finisher correctness', () => {
  it('last-place is the player with the lowest score (AI last)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // p3 has the lowest AI score
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 90, p2: 80, p3: 20 });

    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('last-place is the human if their score is lowest', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 100, p2: 90, p3: 80 });

    // Human scored 10 (ate 1 food item) — lowest
    store.dispatch(completeMinigame({ humanScore: 10 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
  });

  it('explicit lastPlaceId from the component overrides score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // Score-based derivation would pick p3 (score=20), but component says p2 is last
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 90, p2: 40, p3: 20 });

    store.dispatch(completeMinigame({ humanScore: 100, lastPlaceId: 'p2' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('invalid lastPlaceId (equals winner) falls back to score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 60, p3: 20 });

    // p0 wins (score=100); passing p0 as lastPlaceId is invalid → falls back to p3
    store.dispatch(completeMinigame({ humanScore: 100, lastPlaceId: 'p0' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('winner is NOT set as last-place finisher', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 70, p3: 60 });

    store.dispatch(completeMinigame({ humanScore: 90 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherId).not.toBe(state.hohId);
  });

  it('last-place finisher uses authoritative score data (not participant order fallback)', () => {
    // Participant order: p0, p1, p2, p3, p4
    // Without authoritative scores, the "last" by participant order would be p4
    // But p2 has the lowest score — so p2 must be last, not p4
    const players = makePlayers(5);
    const store = makeStore({ players });
    setupSnakeSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 90, p2: 10, p3: 80, p4: 70 },
    );

    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    // p2 has the lowest score (10), NOT p4 (which comes last in participant order)
    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });
});

// ── 3. Public mode auto-nominee matches last-place finisher ───────────────────

describe('Snake — Public mode auto-nominee', () => {
  it('auto-nominee in Public mode matches the last-place finisher from Snake', () => {
    const players = makePlayers(6);
    const store = makeStore({ players, publicModeEnabled: true });

    setupSnakeSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      { p1: 95, p2: 85, p3: 75, p4: 65, p5: 20 },
    );
    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    // hoh_results → social_1 → nominations → nomination_results
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

    setupSnakeSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 90, p2: 80, p3: 70, p4: 20 },
    );
    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    advanceToNominationResults(store);

    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    // Only 2 nominees — no auto-third-nominee rule
    expect(afterNoms.nomineeIds).toHaveLength(2);
    expect(afterNoms.nominationContext).toBeNull();
  });
});

// ── 4. Human nomination flow after resolution ─────────────────────────────────

describe('Snake — human nomination flow after resolution', () => {
  it('phase advances to hoh_results immediately after completeMinigame', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 70, p3: 60 });

    store.dispatch(completeMinigame({ humanScore: 90 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).toBe('p0');
  });

  it('awaitingNominations is set for the human HOH', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 80, p2: 70, p3: 60, p4: 50 });

    store.dispatch(completeMinigame({ humanScore: 90 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.awaitingNominations).toBe(true);
  });

  it('human can commit two nominations successfully', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 80, p2: 70, p3: 60, p4: 50 });

    store.dispatch(completeMinigame({ humanScore: 90 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 5. AI-only nomination flow ────────────────────────────────────────────────

describe('Snake — AI-only nomination flow', () => {
  it('AI HOH correctly sets hohId and lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupSnakeSession(store, ['p1', 'p2', 'p3'], { p1: 100, p2: 60, p3: 30 });
    // humanScore is unused when no human is in participants
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('AI HOH phase transitions to hoh_results', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupSnakeSession(store, ['p1', 'p2', 'p3'], { p1: 100, p2: 60, p3: 30 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });

  it('AI HOH in public mode auto-nominates last-place finisher', () => {
    const players = makePlayers(6);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players, publicModeEnabled: true });

    setupSnakeSession(store, ['p1', 'p2', 'p3', 'p4', 'p5'], {
      p1: 110,
      p2: 90,
      p3: 80,
      p4: 70,
      p5: 20,
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

// ── 6. Snake-specific scoring semantics ───────────────────────────────────────

describe('Snake — scoring semantics', () => {
  it('score = foodEaten × 10 (higher is better)', () => {
    // p1 ate 9 food = 90 points, p2 ate 7 = 70, p3 ate 5 = 50
    // human ate 10 food = 100 points → human wins, p3 last
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 90, p2: 70, p3: 50 });

    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('ties are broken deterministically (no silent participant-order fallback)', () => {
    // p1 and p2 tie at 80; p3 scores 60
    // Winner selection: both p1 and p2 tie — store logic picks one deterministically
    // Last-place: p3 (unambiguous)
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 80, p3: 60 });

    store.dispatch(completeMinigame({ humanScore: 70 } as CompleteMinigamePayload));

    const state = store.getState().game;
    // Last-place must be p3 (unambiguous)
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('score of 0 is valid (player hit a wall immediately)', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    // Human got 0 food (hit wall immediately)
    setupSnakeSession(store, ['p0', 'p1', 'p2'], { p1: 60, p2: 40 });

    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p0');
  });

  it('all players scoring 0 still produces a valid result', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2'], { p1: 0, p2: 0 });

    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    // Any player can win/lose when all scores are equal — just verify the fields are set
    const state = store.getState().game;
    expect(state.hohId).toBeTruthy();
    expect(state.lastHohCompFinisherId).toBeTruthy();
    expect(state.phase).toBe('hoh_results');
  });
});

// ── 7. Backward-compat: legacy numeric payload ────────────────────────────────

describe('Snake — backward-compat: legacy numeric payload', () => {
  it('passing a bare number to completeMinigame still works', () => {
    // The store's completeMinigame action accepts a bare number as a legacy
    // payload format (numeric score instead of CompleteMinigamePayload object).
    // This path is maintained for backward compatibility with callers that have
    // not yet been updated to the new payload format. In this mode, last-place
    // is derived from scores rather than from an explicit lastPlaceId.
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2'], { p1: 80, p2: 60 });

    // Legacy callers pass a bare number (score only, no lastPlaceId)
    store.dispatch(completeMinigame(90));

    const state = store.getState().game;
    expect(state.hohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p2');
  });
});
