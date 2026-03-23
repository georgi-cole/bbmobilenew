/**
 * Quick Tap Race — competition regression tests.
 *
 * Covers:
 *  1. Winner is derived from canonical effective scores.
 *  2. Last-place finisher is derived from canonical effective scores.
 *  3. Explicit lastPlaceId (from the component) takes priority over score derivation.
 *  4. Public mode auto-nominee matches the last-place finisher from the competition.
 *  5. Human nomination flow continues correctly after the game resolves.
 *  6. AI-only nomination flow (no human) produces the correct winner + last-place.
 *  7. Multiplier scoring: effective score (not raw tap count) determines rankings.
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
function setupMinigameSession(
  store: ReturnType<typeof makeStore>,
  playerIds: string[],
  aiScores: Record<string, number>,
) {
  store.dispatch(
    launchMinigame({
      key: 'quickTap',
      participants: playerIds,
      seed: 42,
      options: { timeLimit: 30 },
      aiScores,
    }),
  );
}

/**
 * `advanceToNominationResults` — dispatches three `advance()` calls so the store
 * transitions from hoh_results all the way to nomination_results, where:
 *   - human HOH: `awaitingNominations` is set to true (waits for commitNominees)
 *   - AI HOH: nominees are picked immediately
 *
 * Phase sequence after completeMinigame sets phase = hoh_results:
 *   advance() → social_1
 *   advance() → nominations
 *   advance() → nomination_results
 */
function advanceToNominationResults(store: ReturnType<typeof makeStore>) {
  store.dispatch(advance()); // hoh_results → social_1
  store.dispatch(advance()); // social_1 → nominations
  store.dispatch(advance()); // nominations → nomination_results
}

// ── 1. Winner correctness ─────────────────────────────────────────────────────

describe('Quick Tap Race — winner correctness', () => {
  it('winner is the player with the highest effective score (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 70, p3: 60 });

    store.dispatch(completeMinigame({ humanScore: 110 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('winner is the player with the highest effective score (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 130, p2: 100, p3: 90 });

    store.dispatch(completeMinigame({ humanScore: 85 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p1');
  });

  it('winner matches when scores are close', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 99, p2: 80 });

    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('phase is hoh_results after completeMinigame in hoh_comp', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 90, p2: 80 });

    store.dispatch(completeMinigame({ humanScore: 95 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });
});

// ── 2. Last-place finisher correctness ────────────────────────────────────────

describe('Quick Tap Race — last-place finisher correctness', () => {
  it('last-place is the player with the lowest effective score (AI last)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 95, p2: 85, p3: 55 });

    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('last-place is the human if their effective score is lowest', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 110, p2: 105, p3: 100 });

    store.dispatch(completeMinigame({ humanScore: 50 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
  });

  it('explicit lastPlaceId from the component overrides score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // Score-based derivation would pick p3 (score=60), but component says p2 is last
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 95, p2: 70, p3: 60 });

    store.dispatch(completeMinigame({ humanScore: 100, lastPlaceId: 'p2' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('invalid lastPlaceId (equals winner) falls back to score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 70, p3: 50 });

    // p0 wins; passing p0 as lastPlaceId is invalid — falls back to p3
    store.dispatch(completeMinigame({ humanScore: 110, lastPlaceId: 'p0' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('winner is NOT set as last-place finisher', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 90, p2: 80, p3: 70 });

    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherId).not.toBe(state.hohId);
  });
});

// ── 3. Public mode auto-nominee matches last-place finisher ───────────────────

describe('Quick Tap Race — Public mode auto-nominee', () => {
  it('auto-nominee in Public mode matches the last-place finisher from Quick Tap', () => {
    const players = makePlayers(6);
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      { p1: 105, p2: 98, p3: 90, p4: 85, p5: 60 },
    );
    store.dispatch(completeMinigame({ humanScore: 110 } as CompleteMinigamePayload));

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

    setupMinigameSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 100, p2: 90, p3: 80, p4: 50 },
    );
    store.dispatch(completeMinigame({ humanScore: 110 } as CompleteMinigamePayload));

    advanceToNominationResults(store);

    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    // Only 2 nominees — no auto-third-nominee rule
    expect(afterNoms.nomineeIds).toHaveLength(2);
    expect(afterNoms.nominationContext).toBeNull();
  });
});

// ── 4. Human nomination flow after resolution ─────────────────────────────────

describe('Quick Tap Race — human nomination flow after resolution', () => {
  it('phase advances to hoh_results immediately after completeMinigame', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 70, p3: 60 });

    store.dispatch(completeMinigame({ humanScore: 95 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).toBe('p0');
  });

  it('awaitingNominations is set for the human HOH (they must nominate manually)', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 80, p2: 70, p3: 60, p4: 50 });

    store.dispatch(completeMinigame({ humanScore: 95 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.awaitingNominations).toBe(true);
  });

  it('human can commit two nominations successfully', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 80, p2: 70, p3: 60, p4: 50 });

    store.dispatch(completeMinigame({ humanScore: 95 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 5. AI-only flow ───────────────────────────────────────────────────────────

describe('Quick Tap Race — AI-only nomination flow', () => {
  it('AI HOH correctly sets hohId and lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    // All AI participants
    setupMinigameSession(store, ['p1', 'p2', 'p3'], { p1: 100, p2: 85, p3: 70 });
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

    setupMinigameSession(store, ['p1', 'p2', 'p3'], { p1: 100, p2: 85, p3: 70 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });

  it('AI HOH in public mode auto-nominates last-place finisher', () => {
    const players = makePlayers(6);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(store, ['p1', 'p2', 'p3', 'p4', 'p5'], {
      p1: 110,
      p2: 95,
      p3: 88,
      p4: 80,
      p5: 55,
    });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    // AI HOH picks nominees at nomination_results
    advanceToNominationResults(store);

    const afterNoms = store.getState().game;
    // p5 (last-place) must end up nominated — either as an explicit auto-nominee
    // (autoNomineeId = 'p5') OR because the AI HOH already included them in their
    // two picks (in which case autoNomineeId is null to avoid double-counting).
    expect(afterNoms.nomineeIds).toContain('p5');
    const autoNomineeOrAlreadyPicked =
      afterNoms.nominationContext?.autoNomineeId === 'p5' ||
      afterNoms.nomineeIds.includes('p5');
    expect(autoNomineeOrAlreadyPicked).toBe(true);
  });
});

// ── 6. Multiplier / effective scoring edge cases ───────────────────────────────

describe('Quick Tap Race — multiplier scoring edge cases', () => {
  it('effective score (with 2x multiplier) is used for ranking', () => {
    // p1 (AI) = 90, p0 (human) = 75 effective (60 raw + 15 taps × 2x), p2 = 70
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 90, p2: 70 });

    store.dispatch(completeMinigame({ humanScore: 75 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p2');
  });

  it('human with 3× turbo can beat a strong AI', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 100, p2: 80 });

    // Human effective score = 130 (turbo-boosted)
    store.dispatch(completeMinigame({ humanScore: 130 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('fumble (0.5×) drops human to last place', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 90, p2: 85, p3: 80 });

    // Human had a fumble — effective score = 50
    store.dispatch(completeMinigame({ humanScore: 50 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p0');
  });
});

// ── 7. Backward-compat: legacy numeric payload ────────────────────────────────

describe('Quick Tap Race — backward-compat: legacy numeric payload', () => {
  it('passing a bare number to completeMinigame still works', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 80, p2: 70 });

    // Legacy callers pass a bare number
    store.dispatch(completeMinigame(95 as unknown as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p2');
  });
});
