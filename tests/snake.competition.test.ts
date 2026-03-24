/**
 * Snake — competition regression tests.
 *
 * Covers:
 *  1. Winner is derived from canonical effective scores.
 *  2. Last-place finisher is derived from canonical effective scores.
 *  3. Explicit lastPlaceId (from the component) takes priority over score derivation.
 *  4. Public mode auto-nominee matches the last-place finisher from the competition.
 *  5. Human nomination flow continues correctly after the game resolves.
 *  6. AI-only nomination flow (no human) produces the correct winner + last-place.
 *  7. MinigameHost routes Snake to the React SnakeGame component (not legacy wrapper).
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
    isUser: i === 0,
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
 * `advanceToNominationResults` — dispatches three `advance()` calls so the store
 * transitions from hoh_results all the way to nomination_results.
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

describe('Snake — winner correctness', () => {
  it('winner is the player with the highest score (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 800, p2: 700, p3: 600 });

    // Human score 900 > all AI scores
    store.dispatch(completeMinigame({ humanScore: 900 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });

  it('winner is the player with the highest score (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 950, p2: 800, p3: 700 });

    store.dispatch(completeMinigame({ humanScore: 600 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p1');
  });

  it('phase is hoh_results after completeMinigame in hoh_comp', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2'], { p1: 700, p2: 600 });

    store.dispatch(completeMinigame({ humanScore: 800 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });

  it('winner is set even when scores are close', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2'], { p1: 490, p2: 480 });

    store.dispatch(completeMinigame({ humanScore: 500 } as CompleteMinigamePayload));

    expect(store.getState().game.hohId).toBe('p0');
  });
});

// ── 2. Last-place finisher correctness ────────────────────────────────────────

describe('Snake — last-place finisher correctness', () => {
  it('last-place is the player with the lowest score (AI last)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 800, p2: 700, p3: 400 });

    store.dispatch(completeMinigame({ humanScore: 900 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('last-place is the human if their score is lowest', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 900, p2: 850, p3: 800 });

    store.dispatch(completeMinigame({ humanScore: 300 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
  });

  it('explicit lastPlaceId from the component overrides score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // Score-based derivation would pick p3 (lowest), but component says p2 is last
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 800, p2: 600, p3: 400 });

    store.dispatch(
      completeMinigame({ humanScore: 900, lastPlaceId: 'p2' } as CompleteMinigamePayload),
    );

    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('invalid lastPlaceId equal to the winner falls back to score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 700, p2: 600, p3: 400 });

    // p0 wins — passing p0 as lastPlaceId is invalid, should fall back to p3
    store.dispatch(
      completeMinigame({ humanScore: 900, lastPlaceId: 'p0' } as CompleteMinigamePayload),
    );

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('winner is NOT set as last-place finisher', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 700, p2: 600, p3: 500 });

    store.dispatch(completeMinigame({ humanScore: 900 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherId).not.toBe(state.hohId);
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
      { p1: 900, p2: 800, p3: 700, p4: 600, p5: 300 },
    );
    // Human wins
    store.dispatch(completeMinigame({ humanScore: 1000 } as CompleteMinigamePayload));

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

    setupSnakeSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 800, p2: 700, p3: 600, p4: 300 },
    );
    store.dispatch(completeMinigame({ humanScore: 1000 } as CompleteMinigamePayload));

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
    setupSnakeSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 700, p2: 600, p3: 500 });

    store.dispatch(completeMinigame({ humanScore: 900 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
    expect(store.getState().game.hohId).toBe('p0');
  });

  it('awaitingNominations is set for the human HOH', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });
    setupSnakeSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 700, p2: 600, p3: 500, p4: 400 },
    );

    store.dispatch(completeMinigame({ humanScore: 900 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.awaitingNominations).toBe(true);
  });

  it('human can commit two nominations successfully', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });
    setupSnakeSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 700, p2: 600, p3: 500, p4: 400 },
    );

    store.dispatch(completeMinigame({ humanScore: 900 } as CompleteMinigamePayload));
    advanceToNominationResults(store);
    store.dispatch(commitNominees(['p1', 'p2']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 5. AI-only flow ───────────────────────────────────────────────────────────

describe('Snake — AI-only nomination flow', () => {
  it('AI HOH correctly sets hohId and lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupSnakeSession(store, ['p1', 'p2', 'p3'], { p1: 800, p2: 600, p3: 400 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.hohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('AI HOH phase transitions to hoh_results', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupSnakeSession(store, ['p1', 'p2', 'p3'], { p1: 800, p2: 600, p3: 400 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('hoh_results');
  });

  it('AI HOH in public mode auto-nominates last-place finisher', () => {
    const players = makePlayers(6);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players, publicModeEnabled: true });

    setupSnakeSession(store, ['p1', 'p2', 'p3', 'p4', 'p5'], {
      p1: 900,
      p2: 800,
      p3: 700,
      p4: 600,
      p5: 300,
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

// ── 6. Registry / host routing ────────────────────────────────────────────────

describe('Snake — registry entry is React, not legacy', () => {
  it('snake registry entry has implementation: react (not legacy)', async () => {
    const { getGame } = await import('../src/minigames/registry');
    const entry = getGame('snake');
    expect(entry).toBeDefined();
    expect(entry!.legacy).toBe(false);
    expect(entry!.implementation).toBe('react');
    expect(entry!.reactComponentKey).toBe('SnakeGame');
  });

  it('snake registry entry does NOT have modulePath set', async () => {
    const { getGame } = await import('../src/minigames/registry');
    const entry = getGame('snake');
    expect(entry).toBeDefined();
    // modulePath is a legacy field; it should not be present after migration
    expect((entry as Record<string, unknown>).modulePath).toBeUndefined();
  });

  it('SnakeGame is present in reactComponents map', async () => {
    const { default: reactComponents } = await import('../src/minigames/reactComponents');
    expect(reactComponents['SnakeGame']).toBeDefined();
  });
});

// ── 7. Registry verification ──────────────────────────────────────────────────
// (MinigameHost routing smoke test lives in tests/minigameHost.snake.test.tsx)
