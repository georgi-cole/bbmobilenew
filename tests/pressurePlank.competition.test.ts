/**
 * Pressure Plank — competition regression tests.
 *
 * Covers:
 *  1. Winner is derived from canonical scores (survival time → 0–100 scaled).
 *  2. Last-place finisher is derived from canonical scores.
 *  3. Explicit lastPlaceId (from the component) takes priority over score derivation.
 *  4. Public mode auto-nominee matches the last-place finisher from the competition.
 *  5. Human nomination flow continues correctly after the game resolves.
 *  6. AI-only nomination flow (no human) produces the correct winner + last-place.
 *  7. Backward-compat: legacy numeric payload still works.
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
import { rankPressurePlankResults } from '../src/components/PressurePlank/pressurePlankLogic';

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
 * Pre-dispatches launchMinigame with key='pressurePlank' so completeMinigame
 * has a session to resolve against.
 */
function setupPressurePlankSession(
  store: ReturnType<typeof makeStore>,
  playerIds: string[],
  aiScores: Record<string, number>,
) {
  store.dispatch(
    launchMinigame({
      key: 'pressurePlank',
      participants: playerIds,
      seed: 42,
      options: { timeLimit: 120 },
      aiScores,
    }),
  );
}

/**
 * `advanceToNominationResults` — dispatches three `advance()` calls to get
 * from loh_results → social_1 → nominations → nomination_results.
 *
 * At nomination_results:
 *  - human LOH: `awaitingNominations` is set (must call commitNominees)
 *  - AI LOH: nominees are picked immediately
 */
function advanceToNominationResults(store: ReturnType<typeof makeStore>) {
  store.dispatch(advance()); // loh_results → social_1
  store.dispatch(advance()); // social_1 → nominations
  store.dispatch(advance()); // nominations → nomination_results
}

// ── 1. Winner correctness ─────────────────────────────────────────────────────

describe('Pressure Plank — winner correctness', () => {
  it('winner is the player with the highest score (human wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // p0 (human) score = 80, AI scores: p1=60, p2=55, p3=40
    setupPressurePlankSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 60, p2: 55, p3: 40 });

    store.dispatch(completeMinigame({ humanScore: 80 } as CompleteMinigamePayload));

    expect(store.getState().game.lohId).toBe('p0');
  });

  it('winner is the player with the highest score (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 90, p2: 70, p3: 55 });

    store.dispatch(completeMinigame({ humanScore: 50 } as CompleteMinigamePayload));

    expect(store.getState().game.lohId).toBe('p1');
  });

  it('winner is correct when scores are very close', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1', 'p2'], { p1: 75, p2: 74 });

    store.dispatch(completeMinigame({ humanScore: 74 } as CompleteMinigamePayload));

    expect(store.getState().game.lohId).toBe('p1');
  });

  it('phase transitions to loh_results after completeMinigame', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1', 'p2'], { p1: 70, p2: 60 });

    store.dispatch(completeMinigame({ humanScore: 80 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('loh_results');
  });
});

// ── 2. Last-place finisher correctness ────────────────────────────────────────

describe('Pressure Plank — last-place finisher correctness', () => {
  it('last-place is the player with the lowest score (AI last)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // p3 has lowest score → last place
    setupPressurePlankSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 70, p3: 30 });

    store.dispatch(completeMinigame({ humanScore: 85 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('last-place is the human when they have the lowest score', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 90, p2: 80, p3: 70 });

    store.dispatch(completeMinigame({ humanScore: 20 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
  });

  it('last-place is distinct from the winner', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 85, p2: 75, p3: 40 });

    store.dispatch(completeMinigame({ humanScore: 90 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p3');
    expect(state.lohId).not.toBe(state.lastHohCompFinisherId);
  });

  it('canonical score order rejects an inconsistent lastPlaceId override', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    // Score-based would pick p3 (score=30), but component says p2 is last
    setupPressurePlankSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 85, p2: 40, p3: 30 });

    store.dispatch(
      completeMinigame({ humanScore: 90, lastPlaceId: 'p2' } as CompleteMinigamePayload),
    );

    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });

  it('invalid lastPlaceId (equals winner) falls back to score-based derivation', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 70, p3: 30 });

    // p0 wins, so lastPlaceId='p0' is invalid — store should ignore it
    store.dispatch(
      completeMinigame({ humanScore: 90, lastPlaceId: 'p0' } as CompleteMinigamePayload),
    );

    const state = store.getState().game;
    expect(state.lohId).toBe('p0');
    // Score-based fallback: p3 has lowest score
    expect(state.lastHohCompFinisherId).toBe('p3');
  });
});

// ── 3. Public mode auto-nominee ────────────────────────────────────────────────

describe('Pressure Plank — public mode auto-nominee', () => {
  it('auto-nominee matches the last-place finisher (AI last place)', () => {
    const players = makePlayers(6);
    const store = makeStore({ players, publicModeEnabled: true });

    setupPressurePlankSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      { p1: 85, p2: 75, p3: 65, p4: 55, p5: 20 },
    );
    // p0 (human) wins with score 90; p5 is last
    store.dispatch(completeMinigame({ humanScore: 90 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    advanceToNominationResults(store);

    // Human LOH must nominate — auto-third should be p5
    expect(store.getState().game.awaitingNominations).toBe(true);
    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    expect(afterNoms.nominationContext?.autoNomineeId).toBe('p5');
    expect(afterNoms.nomineeIds).toContain('p5');
  });

  it('auto-nominee matches the last-place finisher (human last place)', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: true });

    setupPressurePlankSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 90, p2: 80, p3: 70, p4: 60 },
    );
    // p0 (human) finishes last with score=10; p1 wins
    store.dispatch(completeMinigame({ humanScore: 10 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p0');
    // Winner should be p1
    expect(store.getState().game.lohId).toBe('p1');
  });

  it('auto-nominee is NOT added when public mode is disabled', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });

    setupPressurePlankSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 80, p2: 70, p3: 60, p4: 40 },
    );
    store.dispatch(completeMinigame({ humanScore: 90 } as CompleteMinigamePayload));

    advanceToNominationResults(store);
    store.dispatch(commitNominees(['p1', 'p2']));

    const afterNoms = store.getState().game;
    expect(afterNoms.nomineeIds).toHaveLength(2);
    expect(afterNoms.nominationContext).toBeNull();
  });
});

// ── 4. Human nomination flow after resolution ─────────────────────────────────

describe('Pressure Plank — human nomination flow', () => {
  it('phase advances to loh_results immediately after completeMinigame', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 70, p2: 60, p3: 50 });

    store.dispatch(completeMinigame({ humanScore: 80 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('loh_results');
    expect(store.getState().game.lohId).toBe('p0');
  });

  it('awaitingNominations is set for the human LOH', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });
    setupPressurePlankSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 70, p2: 60, p3: 50, p4: 40 },
    );

    store.dispatch(completeMinigame({ humanScore: 80 } as CompleteMinigamePayload));
    advanceToNominationResults(store);

    const state = store.getState().game;
    expect(state.phase).toBe('nomination_results');
    expect(state.awaitingNominations).toBe(true);
  });

  it('human can commit two nominations successfully', () => {
    const players = makePlayers(5);
    const store = makeStore({ players, publicModeEnabled: false });
    setupPressurePlankSession(
      store,
      ['p0', 'p1', 'p2', 'p3', 'p4'],
      { p1: 70, p2: 60, p3: 50, p4: 40 },
    );

    store.dispatch(completeMinigame({ humanScore: 80 } as CompleteMinigamePayload));
    advanceToNominationResults(store);
    store.dispatch(commitNominees(['p2', 'p3']));

    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toContain('p3');
    expect(state.awaitingNominations).toBe(false);
  });
});

// ── 5. AI-only nomination flow ─────────────────────────────────────────────────

describe('Pressure Plank — AI-only nomination flow', () => {
  it('AI LOH correctly sets lohId and lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupPressurePlankSession(store, ['p1', 'p2', 'p3'], { p1: 80, p2: 60, p3: 30 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('AI LOH phase transitions to loh_results', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupPressurePlankSession(store, ['p1', 'p2', 'p3'], { p1: 80, p2: 60, p3: 30 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('loh_results');
  });

  it('AI LOH in public mode auto-nominates last-place finisher', () => {
    const players = makePlayers(6);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players, publicModeEnabled: true });

    setupPressurePlankSession(
      store,
      ['p1', 'p2', 'p3', 'p4', 'p5'],
      { p1: 90, p2: 75, p3: 65, p4: 55, p5: 20 },
    );
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p5');

    advanceToNominationResults(store);

    const afterNoms = store.getState().game;
    // p5 (last-place) must be nominated — either as auto-third or picked by AI LOH
    expect(afterNoms.nomineeIds).toContain('p5');
    const autoNomineeOrAlreadyPicked =
      afterNoms.nominationContext?.autoNomineeId === 'p5' ||
      afterNoms.nomineeIds.includes('p5');
    expect(autoNomineeOrAlreadyPicked).toBe(true);
  });

  it('AI-only: pendingMinigame is cleared after resolution', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupPressurePlankSession(store, ['p1', 'p2', 'p3'], { p1: 75, p2: 55, p3: 35 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.pendingMinigame).toBeNull();
  });
});

// ── 6. Score derivation / survival semantics ──────────────────────────────────

describe('Pressure Plank — score and survival semantics', () => {
  it('higher score beats lower score regardless of label', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    // p0=75, p1=90 → p1 wins
    setupPressurePlankSession(store, ['p0', 'p1', 'p2'], { p1: 90, p2: 50 });

    store.dispatch(completeMinigame({ humanScore: 75 } as CompleteMinigamePayload));

    expect(store.getState().game.lohId).toBe('p1');
    expect(store.getState().game.lastHohCompFinisherId).toBe('p2');
  });

  it('tie in survival time uses the shared deterministic ordering', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    // All tied
    setupPressurePlankSession(store, ['p0', 'p1', 'p2'], { p1: 70, p2: 70 });

    store.dispatch(completeMinigame({ humanScore: 70 } as CompleteMinigamePayload));

    const state = store.getState().game;
    const expectedWinner = rankPressurePlankResults(
      ['p0', 'p1', 'p2'],
      { p0: 70, p1: 70, p2: 70 },
      42,
    )[0].playerId;
    expect(state.lohId).toBe(expectedWinner);
    expect(state.phase).toBe('loh_results');
  });

  it('ignores a stale winner override and keeps the longest survival authoritative', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1', 'p2'], { p1: 80, p2: 50 });
    store.dispatch(
      completeMinigame({ humanScore: 96.487, winnerId: 'p1' } as CompleteMinigamePayload),
    );
    expect(store.getState().game.lohId).toBe('p0');
  });

  it('two participants — winner and last-place are different players', () => {
    const players = makePlayers(2);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1'], { p1: 40 });

    store.dispatch(completeMinigame({ humanScore: 75 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p1');
  });
});

// ── 7. Backward-compat: legacy numeric payload ────────────────────────────────

describe('Pressure Plank — backward-compat: legacy numeric payload', () => {
  it('passing a bare number to completeMinigame still works', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupPressurePlankSession(store, ['p0', 'p1', 'p2'], { p1: 70, p2: 55 });

    // Legacy callers pass a bare number
    store.dispatch(completeMinigame(80));

    const state = store.getState().game;
    expect(state.lohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p2');
  });
});
