/**
 * Traveling Dots — competition regression tests.
 *
 * Covers:
 *  1. Winner is derived from canonical scores.
 *  2. Last-place finisher is derived from canonical scores.
 *  3. Explicit lastPlaceId (from the component) takes priority over score derivation.
 *  4. Public mode auto-nominee matches the last-place finisher.
 *  5. Human nomination flow continues correctly after the game resolves.
 *  6. AI-only nomination flow (no human) produces the correct winner + last-place.
 *  7. Scoring model: penalties and bonuses affect rankings correctly.
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
      key: 'travelingDots',
      participants: playerIds,
      seed: 42,
      options: { timeLimit: 90 },
      aiScores,
    }),
  );
}

/**
 * Dispatches three `advance()` calls so the store transitions from hoh_results
 * all the way to nomination_results.
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

describe('Traveling Dots — winner correctness', () => {
  it('winner is the player with the highest score (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 650, p2: 580, p3: 400 });

    store.dispatch(completeMinigame({ humanScore: 800 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('winner is the player with the highest score (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 870, p2: 600, p3: 480 });

    store.dispatch(completeMinigame({ humanScore: 550 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p1');
  });

  it('winner matches when scores are close', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 699, p2: 600 });

    store.dispatch(completeMinigame({ humanScore: 700 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('phase is hoh_results after completeMinigame in hoh_comp', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 600, p2: 500 });

    store.dispatch(completeMinigame({ humanScore: 700 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });
});

// ── 2. Last-place finisher correctness ────────────────────────────────────────

describe('Traveling Dots — last-place finisher correctness', () => {
  it('last-place is the player with the lowest score (AI last)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 750, p2: 600, p3: 200 });

    store.dispatch(completeMinigame({ humanScore: 820 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('last-place is the human if their score is lowest', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 800, p2: 700, p3: 600 });

    // Human times out with a low route score
    store.dispatch(completeMinigame({ humanScore: 150 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
  });

  it('explicit lastPlaceId from the component overrides score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // Score-based derivation would pick p3 (200), but component says p2 is last
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 700, p2: 300, p3: 200 });

    store.dispatch(completeMinigame({ humanScore: 800, lastPlaceId: 'p2' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('invalid lastPlaceId (equals winner) falls back to score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 680, p2: 560, p3: 200 });

    // p0 wins with 820; passing p0 as lastPlaceId is invalid — falls back to p3
    store.dispatch(completeMinigame({ humanScore: 820, lastPlaceId: 'p0' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('winner is NOT set as last-place finisher', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 650, p2: 500, p3: 350 });

    store.dispatch(completeMinigame({ humanScore: 700 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherId).not.toBe(state.hohId);
  });
});

// ── 3. Public mode auto-nominee matches last-place finisher ───────────────────

describe('Traveling Dots — Public mode auto-nominee', () => {
  it('auto-nominee in Public mode matches the last-place finisher', () => {
    const players = makePlayers(6);
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      { p1: 750, p2: 680, p3: 600, p4: 500, p5: 180 },
    );
    store.dispatch(completeMinigame({ humanScore: 820 } as CompleteMinigamePayload));

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
      { p1: 700, p2: 600, p3: 500, p4: 200 },
    );
    store.dispatch(completeMinigame({ humanScore: 800 } as CompleteMinigamePayload));

    advanceToNominationResults(store);

    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    // Only 2 nominees — no auto-third-nominee rule
    expect(afterNoms.nomineeIds).toHaveLength(2);
    expect(afterNoms.nominationContext).toBeNull();
  });
});

// ── 4. Human nomination flow after resolution ─────────────────────────────────

describe('Traveling Dots — human nomination flow after resolution', () => {
  it('phase advances to hoh_results immediately after completeMinigame', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 650, p2: 500, p3: 400 });

    store.dispatch(completeMinigame({ humanScore: 700 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).toBe('p0');
  });

  it('awaitingNominations is set for the human HOH', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 600, p2: 500, p3: 400, p4: 250 });

    store.dispatch(completeMinigame({ humanScore: 700 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.awaitingNominations).toBe(true);
  });

  it('human can commit two nominations successfully', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3', 'p4'], { p1: 600, p2: 500, p3: 400, p4: 250 });

    store.dispatch(completeMinigame({ humanScore: 700 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 5. AI-only flow ───────────────────────────────────────────────────────────

describe('Traveling Dots — AI-only nomination flow', () => {
  it('AI HOH correctly sets hohId and lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupMinigameSession(store, ['p1', 'p2', 'p3'], { p1: 780, p2: 600, p3: 300 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('AI HOH phase transitions to hoh_results', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupMinigameSession(store, ['p1', 'p2', 'p3'], { p1: 780, p2: 600, p3: 300 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });

  it('AI HOH in public mode auto-nominates last-place finisher', () => {
    const players = makePlayers(6);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(store, ['p1', 'p2', 'p3', 'p4', 'p5'], {
      p1: 850,
      p2: 700,
      p3: 580,
      p4: 450,
      p5: 160,
    });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    advanceToNominationResults(store);

    const afterNoms = store.getState().game;
    expect(afterNoms.nomineeIds).toContain('p5');
    const autoNomineeOrAlreadyPicked =
      afterNoms.nominationContext?.autoNomineeId === 'p5' ||
      afterNoms.nomineeIds.includes('p5');
    expect(autoNomineeOrAlreadyPicked).toBe(true);
  });
});

// ── 6. Scoring model edge cases ───────────────────────────────────────────────

describe('Traveling Dots — scoring model edge cases', () => {
  it('a hazard-penalized player can fall to last place despite a decent route', () => {
    // p2 has a reasonable base score but took hazard hits (-160), dropping to last
    const players = makePlayers(4);
    const store = makeStore({ players });
    // p1=720, p2=320 (hazard-penalized), p3=500
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 720, p2: 320, p3: 500 });

    // Human (p0) gets a strong score
    store.dispatch(completeMinigame({ humanScore: 800 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p2');
  });

  it('high bonus collection can lift a mediocre-route player above a pure-efficiency player', () => {
    // p0 (human): 720 pts (good efficiency + bonuses), p1: 680 pts (great efficiency, no bonuses)
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 680, p2: 400 });

    store.dispatch(completeMinigame({ humanScore: 720 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('time-out player (score near 0) finishes last even against modest competition', () => {
    // p0 timed out without finishing the route — score close to 0
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 500, p2: 350 });

    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p0');
  });

  it('auto-nominee matches the scoreboard last-place (no silent fallback)', () => {
    // Ensure results UI and nomination logic read from the same canonical data.
    // Component supplies lastPlaceId = 'p5' (first-hand knowledge of last place).
    const players = makePlayers(6);
    const store = makeStore({ players, publicModeEnabled: true });

    setupMinigameSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      { p1: 750, p2: 700, p3: 620, p4: 400, p5: 180 },
    );
    // Component-supplied lastPlaceId takes authoritative precedence over score derivation
    store.dispatch(completeMinigame({ humanScore: 820, lastPlaceId: 'p5' } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    advanceToNominationResults(store);
    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    expect(afterNoms.nominationContext?.autoNomineeId).toBe('p5');
    expect(afterNoms.nomineeIds).toContain('p5');
  });
});
