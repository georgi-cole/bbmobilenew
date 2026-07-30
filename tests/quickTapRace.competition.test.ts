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
 *  8. startMinigame for quickTap uses direct AI scoring (no hybrid resolution).
 *  9. Regression: repeated startMinigame calls produce different session seeds.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  launchMinigame,
  completeMinigame,
  commitNominees,
  advance,
  startMinigame,
} from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player, CompleteMinigamePayload } from '../src/types';
import { selectBoosterPrompts } from '../src/ai/competition/quickTapSimulation';
import {
  simulateMinigameAiScore,
  getDefaultCompetitionProfile,
} from '../src/ai/competition';

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
 * transitions from loh_results all the way to nomination_results, where:
 *   - human LOH: `awaitingNominations` is set to true (waits for commitNominees)
 *   - AI LOH: nominees are picked immediately
 *
 * Phase sequence after completeMinigame sets phase = loh_results:
 *   advance() → social_1
 *   advance() → nominations
 *   advance() → nomination_results
 */
function advanceToNominationResults(store: ReturnType<typeof makeStore>) {
  store.dispatch(advance()); // loh_results → social_1
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

    expect(store.getState().game.lohId).toBe('p0');
  });

  it('winner is the player with the highest effective score (AI wins)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 130, p2: 100, p3: 90 });

    store.dispatch(completeMinigame({ humanScore: 85 } as CompleteMinigamePayload));

    expect(store.getState().game.lohId).toBe('p1');
  });

  it('winner matches when scores are close', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 99, p2: 80 });

    store.dispatch(completeMinigame({ humanScore: 100 } as CompleteMinigamePayload));

    expect(store.getState().game.lohId).toBe('p0');
  });

  it('phase is loh_results after completeMinigame in loh_comp', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 90, p2: 80 });

    store.dispatch(completeMinigame({ humanScore: 95 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('loh_results');
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
    expect(state.lastHohCompFinisherId).not.toBe(state.lohId);
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

    // loh_results → social_1 → nominations → nomination_results
    advanceToNominationResults(store);

    // Human LOH (p0) must nominate two players
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
  it('phase advances to loh_results immediately after completeMinigame', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 80, p2: 70, p3: 60 });

    store.dispatch(completeMinigame({ humanScore: 95 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('loh_results');
    expect(store.getState().game.lohId).toBe('p0');
  });

  it('awaitingNominations is set for the human LOH (they must nominate manually)', () => {
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
  it('AI LOH correctly sets lohId and lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    // All AI participants
    setupMinigameSession(store, ['p1', 'p2', 'p3'], { p1: 100, p2: 85, p3: 70 });
    // humanScore is unused when no human is in participants
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('AI LOH phase transitions to loh_results', () => {
    const players = makePlayers(4);
    players.forEach((p) => { p.isUser = false; });
    const store = makeStore({ players });

    setupMinigameSession(store, ['p1', 'p2', 'p3'], { p1: 100, p2: 85, p3: 70 });
    store.dispatch(completeMinigame({ humanScore: 0 } as CompleteMinigamePayload));

    expect(store.getState().game.phase).toBe('loh_results');
  });

  it('AI LOH in public mode auto-nominates last-place finisher', () => {
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

    // AI LOH picks nominees at nomination_results
    advanceToNominationResults(store);

    const afterNoms = store.getState().game;
    // p5 (last-place) must end up nominated — either as an explicit auto-nominee
    // (autoNomineeId = 'p5') OR because the AI LOH already included them in their
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
    expect(state.lohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p2');
  });

  it('human with 3× turbo can beat a strong AI', () => {
    const players = makePlayers(3);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2'], { p1: 100, p2: 80 });

    // Human effective score = 130 (turbo-boosted)
    store.dispatch(completeMinigame({ humanScore: 130 } as CompleteMinigamePayload));

    expect(store.getState().game.lohId).toBe('p0');
  });

  it('fumble (0.5×) drops human to last place', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });
    setupMinigameSession(store, ['p0', 'p1', 'p2', 'p3'], { p1: 90, p2: 85, p3: 80 });

    // Human had a fumble — effective score = 50
    store.dispatch(completeMinigame({ humanScore: 50 } as CompleteMinigamePayload));

    const state = store.getState().game;
    expect(state.lohId).toBe('p1');
    expect(state.lastHohCompFinisherId).toBe('p0');
  });
});

// ── 8. startMinigame direct AI scoring (no hybrid resolution) ─────────────────

describe('Quick Tap Race — startMinigame uses direct AI scoring', () => {
  it('session does NOT have hybridResolveOnComplete set', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    store.dispatch(
      startMinigame({
        key: 'quickTap',
        participants: ['p0', 'p1', 'p2', 'p3'],
        seed: 42,
        options: { timeLimit: 30 },
      }),
    );

    const session = store.getState().game.pendingMinigame;
    expect(session).not.toBeNull();
    expect(session?.hybridResolveOnComplete).toBeFalsy();
  });

  it('AI scores are precomputed and stored in session.aiScores', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    store.dispatch(
      startMinigame({
        key: 'quickTap',
        participants: ['p0', 'p1', 'p2', 'p3'],
        seed: 42,
        options: { timeLimit: 30 },
      }),
    );

    const session = store.getState().game.pendingMinigame;
    expect(session).not.toBeNull();
    // All three AI participants should have a precomputed score
    expect(typeof session?.aiScores?.['p1']).toBe('number');
    expect(typeof session?.aiScores?.['p2']).toBe('number');
    expect(typeof session?.aiScores?.['p3']).toBe('number');
    // Human participant (p0) must not appear in aiScores
    expect(session?.aiScores?.['p0']).toBeUndefined();
  });

  it('AI scores fall within the competitive Quick Tap band [50, 350]', () => {
    const players = makePlayers(5);
    const store = makeStore({ players });

    store.dispatch(
      startMinigame({
        key: 'quickTap',
        participants: ['p0', 'p1', 'p2', 'p3', 'p4'],
        seed: 99,
        options: { timeLimit: 30 },
      }),
    );

    const session = store.getState().game.pendingMinigame;
    expect(session).not.toBeNull();
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      const score = session?.aiScores?.[id] ?? -1;
      expect(score).toBeGreaterThanOrEqual(50);
      expect(score).toBeLessThanOrEqual(350);
    }
  });

  it('each invocation generates a fresh session seed — same opts.seed never reuses the same session seed', () => {
    // Regression: startMinigame must not store opts.seed directly as session.seed.
    // Each call should produce a fresh invocationSeed so repeated launches
    // (restarts, reloads, debug-panel re-runs) do not replay the same game.
    // Mock Math.random to return controlled, distinct values for each invocation.
    const randomValues = [0.1, 0.2, 0.3, 0.4, 0.5];
    let callIndex = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues[callIndex++] ?? 0.9);

    const players = makePlayers(4);
    const seeds: number[] = [];

    for (let i = 0; i < 5; i++) {
      const store = makeStore({ players: JSON.parse(JSON.stringify(players)) });
      store.dispatch(
        startMinigame({ key: 'quickTap', participants: ['p0', 'p1', 'p2', 'p3'], seed: 7, options: { timeLimit: 30 } }),
      );
      const sessionSeed = store.getState().game.pendingMinigame?.seed;
      expect(typeof sessionSeed).toBe('number');
      seeds.push(sessionSeed as number);
    }

    // All 5 session seeds must not be the same value (i.e. fresh per invocation).
    const unique = new Set(seeds);
    expect(unique.size).toBeGreaterThan(1);

    // The incoming seed must not be copied verbatim for every invocation. A derived
    // session seed may equal opts.seed by chance, so only assert that they are not
    // all the same as the provided seed.
    expect(seeds.every((s) => s === 7)).toBe(false);

    vi.restoreAllMocks();
  });

  it('completeMinigame uses the precomputed AI scores (not hybrid-resolved)', () => {
    const players = makePlayers(4);
    const store = makeStore({ players });

    store.dispatch(
      startMinigame({
        key: 'quickTap',
        participants: ['p0', 'p1', 'p2', 'p3'],
        seed: 42,
        options: { timeLimit: 30 },
      }),
    );

    const precomputedAiScores = (store.getState().game.pendingMinigame?.aiScores ?? {}) as Record<string, number>;
    const expectedLastFinisherId = Object.entries(precomputedAiScores).reduce(
      (slowestId, [id, score]) =>
        score < precomputedAiScores[slowestId] ? id : slowestId,
      Object.keys(precomputedAiScores)[0],
    );

    // Human wins with a very high score so we can verify AI placements come from the
    // precomputed session scores rather than being re-resolved near the human score.
    store.dispatch(completeMinigame({ humanScore: 9999 } as CompleteMinigamePayload));

    const game = store.getState().game;

    // After completing, lohId should be human (p0 wins with score 9999)
    expect(game.lohId).toBe('p0');

    // The last finisher among the HOH competition participants should be the AI with
    // the lowest precomputed score captured at startMinigame time.
    expect(game.lastHohCompFinisherId).toBe(expectedLastFinisherId);
  });
});

// ── 9. Regression: different booster sequences across repeated launches ────────

describe('Quick Tap Race — repeated launches produce fresh booster sequences', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('session.seed differs across repeated startMinigame calls with the same opts.seed', () => {
    // Regression for the bug where booster prompts were always the same because
    // session.seed was copied verbatim from opts.seed.  Mock Math.random to
    // return controlled, distinct values so the test is fully deterministic.
    const randomValues = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    let callIndex = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues[callIndex++] ?? 0.9);

    const players = makePlayers(3);
    const sessionSeeds: number[] = [];

    for (let i = 0; i < 6; i++) {
      const store = makeStore({ players: JSON.parse(JSON.stringify(players)) });
      store.dispatch(
        startMinigame({
          key: 'quickTap',
          participants: ['p0', 'p1', 'p2'],
          seed: 42, // same base seed every time — mimics real replay scenario
          options: { timeLimit: 30 },
        }),
      );
      const session = store.getState().game.pendingMinigame;
      expect(session).not.toBeNull();
      sessionSeeds.push(session!.seed);
    }

    // Must see more than one distinct seed value across 6 launches.
    const unique = new Set(sessionSeeds);
    expect(unique.size).toBeGreaterThan(1);

    // The incoming opts.seed must not be copied verbatim for every invocation.
    expect(sessionSeeds.every((s) => s === 42)).toBe(false);
  });

  it('AI scores and session.seed are consistent within one invocation', () => {
    // The human UI and precomputed AI scores must share the same invocationSeed.
    // Verify this by re-computing each AI score from the stored session.seed and
    // confirming it matches what startMinigame stored in session.aiScores.
    const players = makePlayers(3);
    const store = makeStore({ players });

    store.dispatch(
      startMinigame({
        key: 'quickTap',
        participants: ['p0', 'p1', 'p2'],
        seed: 99,
        options: { timeLimit: 30 },
      }),
    );

    const session = store.getState().game.pendingMinigame;
    expect(session).not.toBeNull();

    // Recompute each AI score from the stored session seed and confirm it matches.
    const aiParticipants: Array<{ pid: string; index: number }> = [
      { pid: 'p1', index: 1 },
      { pid: 'p2', index: 2 },
    ];
    for (const { pid, index } of aiParticipants) {
      const storedScore = session!.aiScores?.[pid];
      expect(typeof storedScore).toBe('number');
      const recomputed = simulateMinigameAiScore({
        gameKey: 'quickTap',
        seed: session!.seed,
        playerId: pid,
        participantIndex: index,
        profile: getDefaultCompetitionProfile(),
        timeLimitSeconds: 30,
      });
      expect(storedScore).toBe(recomputed);
    }

    // Human is not in aiScores
    expect(session!.aiScores?.['p0']).toBeUndefined();
    // Session seed must be a valid 32-bit unsigned integer
    expect(session!.seed).toBeGreaterThanOrEqual(0);
    expect(session!.seed).toBeLessThanOrEqual(0xffffffff);
  });

  it('booster sequences differ across repeated launches with the same opts.seed', () => {
    // Regression: repeated Quick Tap launches must not always produce the same
    // booster trio.  Mock Math.random so each invocation gets a distinct,
    // controlled seed and the test is fully deterministic.
    const randomValues = [0.1, 0.25, 0.5, 0.7, 0.85, 0.95];
    let callIndex = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => randomValues[callIndex++] ?? 0.9);

    const players = makePlayers(3);
    const boosterSequences = new Set<string>();

    for (let invocationIndex = 0; invocationIndex < 6; invocationIndex++) {
      const store = makeStore({ players: JSON.parse(JSON.stringify(players)) });
      store.dispatch(
        startMinigame({
          key: 'quickTap',
          participants: ['p0', 'p1', 'p2'],
          seed: 42, // same base seed every time — mimics the real-world repeat scenario
          options: { timeLimit: 30 },
        }),
      );
      const session = store.getState().game.pendingMinigame;
      expect(session).not.toBeNull();
      if (!session) {
        throw new Error('startMinigame did not create a pending minigame session');
      }
      const boosterTypes = selectBoosterPrompts(session.seed).map((p) => p.type).join(',');
      boosterSequences.add(boosterTypes);
    }

    // With 6 launches using distinct controlled seeds we must see multiple booster trios.
    expect(boosterSequences.size).toBeGreaterThan(1);
  });
});
