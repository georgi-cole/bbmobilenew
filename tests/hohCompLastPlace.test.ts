/**
 * LOH competition last-place mismatch regression tests.
 *
 * Validates that lastHohCompFinisherId is set from the authoritative
 * competition outcome — either:
 *   - For scored/ranked comps: the player with the lowest score.
 *   - For last-player-standing comps: the first-eliminated player.
 *
 * These tests document and guard the fix for:
 *   "LOH competition results scoreboard shows Player A as last, but
 *    nominations auto-add Player B as 'last in LOH comp'."
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, { applyMinigameWinner, activateDoubleEviction, advance } from '../src/store/gameSlice';
import settingsReducer from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import holdTheWallReducer, {
  startHoldTheWall,
  dropPlayer,
} from '../src/features/holdTheWall/holdTheWallSlice';
import glassBridgeReducer from '../src/features/glassBridge/glassBridgeSlice';
import cwgoReducer, {
  startCwgoCompetition,
  setGuesses,
  chooseDuelPair,
  revealDuelResults,
  confirmDuelElimination,
} from '../src/features/cwgo/cwgoCompetitionSlice';
import { CWGO_QUESTIONS } from '../src/features/cwgo/cwgoQuestions';
import { resolveHoldTheWallOutcome } from '../src/features/holdTheWall/thunks';
import { resolveCompetitionOutcome } from '../src/features/cwgo/thunks';
import type { GameState, Player } from '../src/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
  }));
}

function makeGameStore(overrides: Partial<GameState> = {}) {
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
    players: makePlayers(6),
    tvFeed: [],
    isLive: false,
  };

  return configureStore({
    reducer: {
      game: gameReducer,
      settings: settingsReducer,
      publicOpinion: publicOpinionReducer,
      holdTheWall: holdTheWallReducer,
      glassBridge: glassBridgeReducer,
      cwgo: cwgoReducer,
    },
    preloadedState: {
      game: { ...base, ...overrides } as GameState,
    },
  });
}

// ── Scored / ranked comps ─────────────────────────────────────────────────────

describe('LOH comp last-place mismatch — scored comps', () => {
  it('explicit lastPlaceId takes priority over scores (first-pass scoreboard match)', () => {
    // Simulate: famousFigures/biographyBlitz thunk passes lastPlaceId derived
    // from playerScores. The player passed as lastPlaceId must become the auto-nominee.
    const players = makePlayers(5);
    const store = makeGameStore({ players });

    const scores: Record<string, number> = { p0: 100, p1: 80, p2: 60, p3: 40, p4: 10 };
    // p4 has the lowest score, BUT we explicitly pass p2 as last place
    // (simulating a case where a feature's own ranking logic disagrees with raw scores).
    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: players.map((p) => p.id),
      scores,
      lastPlaceId: 'p2',
    }));

    const state = store.getState().game;
    expect(state.lohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p2');
  });

  it('without lastPlaceId, score-based derivation still works (lowest scorer)', () => {
    const players = makePlayers(5);
    const store = makeGameStore({ players });

    const scores: Record<string, number> = { p0: 100, p1: 80, p2: 60, p3: 40, p4: 10 };
    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: players.map((p) => p.id),
      scores,
    }));

    expect(store.getState().game.lastHohCompFinisherId).toBe('p4');
  });

  it('lastPlaceId is ignored if it equals the winner (falls back to score-based)', () => {
    const players = makePlayers(4);
    const store = makeGameStore({ players });

    const scores: Record<string, number> = { p0: 100, p1: 50, p2: 30, p3: 10 };
    // Defensive: passing winner as lastPlaceId must be ignored
    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: players.map((p) => p.id),
      scores,
      lastPlaceId: 'p0',
    }));

    // Falls back to scores: p3 has the lowest non-winner score
    expect(store.getState().game.lastHohCompFinisherId).toBe('p3');
  });
});

// ── Last-player-standing comps: HoldTheWall ───────────────────────────────────

describe('LOH comp last-place mismatch — HoldTheWall (last-player-standing)', () => {
  it('first player to drop becomes lastHohCompFinisherId via resolveHoldTheWallOutcome', () => {
    const players = makePlayers(4);
    const store = makeGameStore({ players });

    // Start HoldTheWall with p0 as human (no auto-drop for human)
    store.dispatch(startHoldTheWall({
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: 'p0',
      prizeType: 'LOH',
      seed: 1,
    }));

    // Simulate: p2 drops first, then p3, then p0 — p1 wins
    store.dispatch(dropPlayer('p2'));
    store.dispatch(dropPlayer('p3'));
    store.dispatch(dropPlayer('p0'));
    // At this point: p1 is the last player standing → winner

    store.dispatch(resolveHoldTheWallOutcome() as never);
    const state = store.getState().game;

    expect(state.lohId).toBe('p1');
    // First to drop (p2) must be the auto-nominee, matching the UI
    expect(state.lastHohCompFinisherId).toBe('p2');
  });

  it('second player to drop does NOT become lastHohCompFinisherId', () => {
    const players = makePlayers(4);
    const store = makeGameStore({ players });

    store.dispatch(startHoldTheWall({
      participantIds: ['p0', 'p1', 'p2', 'p3'],
      humanId: null,
      prizeType: 'LOH',
      seed: 2,
    }));

    // p3 drops first, then p2
    store.dispatch(dropPlayer('p3'));
    store.dispatch(dropPlayer('p2'));
    store.dispatch(dropPlayer('p1'));
    // p0 wins

    store.dispatch(resolveHoldTheWallOutcome() as never);
    const state = store.getState().game;

    expect(state.lohId).toBe('p0');
    expect(state.lastHohCompFinisherId).toBe('p3'); // first dropped, NOT p2
    expect(state.lastHohCompFinisherId).not.toBe('p2');
  });
});

// ── Last-player-standing comps: CWGO (elimination order) ─────────────────────

describe('LOH comp last-place mismatch — CWGO (elimination tracking)', () => {
  it('first player eliminated in CWGO becomes lastHohCompFinisherId', () => {
    // Deterministic test: 2 players, p0 guesses 999999 (way over any CWGO answer),
    // p1 guesses 0 (always under). After mass round: p0 eliminated, p1 wins.
    // resolveCompetitionOutcome must then set lastHohCompFinisherId = p0.
    const players = makePlayers(3);
    const store = makeGameStore({ players });

    store.dispatch(startCwgoCompetition({
      participantIds: ['p0', 'p1'],
      prizeType: 'LOH',
      seed: 42,
    }));

    // Verify eliminationOrder starts empty
    expect(store.getState().cwgo.eliminationOrder).toEqual([]);

    // p0 goes over (999999 > any CWGO answer), p1 stays under → p0 eliminated
    for (let loss = 0; loss < 3; loss += 1) {
      if (store.getState().cwgo.status === 'choose_duel') {
        store.dispatch(chooseDuelPair(['p0', 'p1']));
      }
      const answer = CWGO_QUESTIONS[store.getState().cwgo.questionIdx].answer;
      store.dispatch(setGuesses({ p0: answer + 1, p1: Math.max(0, answer - 1) }));
      store.dispatch(revealDuelResults());
      store.dispatch(confirmDuelElimination());
    }

    // Verify CWGO reached 'complete' with p0 eliminated first
    const cwgoState = store.getState().cwgo;
    expect(cwgoState.status).toBe('complete');
    expect(cwgoState.aliveIds).toEqual(['p1']);
    expect(cwgoState.eliminationOrder).toEqual(['p0']);

    // Dispatch outcome: resolveCompetitionOutcome passes eliminationOrder[0]='p0'
    // as lastPlaceId to applyMinigameWinner
    store.dispatch(resolveCompetitionOutcome() as never);

    const gameState = store.getState().game;
    expect(gameState.lohId).toBe('p1');
    // The first-eliminated player must become the auto-third-nominee source
    expect(gameState.lastHohCompFinisherId).toBe('p0');
  });
});

// ── Pre-veto public save gating still works after fix ────────────────────────

describe('pre_veto_public_save phase gating (unchanged by last-place fix)', () => {
  it('pre_veto_public_save triggers normally when 3 nominees and public mode enabled', () => {
    const players = makePlayers(8);
    const store = makeGameStore({
      phase: 'nomination_results',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p3'],  // 3 nominees
      publicModeEnabled: true,
      nominationContext: {
        hohNomineeIds: ['p1', 'p2'],
        autoNomineeId: 'p3',
        publicSaveApplied: false,
      },
      players,
    });

    store.dispatch({ type: 'game/advance' });
    const state = store.getState().game;

    expect(state.phase).toBe('pre_veto_public_save');
    expect(state.awaitingPublicSave).toBe(true);
  });

  it('double eviction: no 4th nominee and no pre_veto_public_save', () => {
    // Use activateDoubleEviction (the real action) and verify the nominations path:
    // - DE uses 3 nominees (by twist rule), auto-third-nominee rule is SKIPPED
    // - nomination_results → advances to next phase (NOT pre_veto_public_save)
    const players = makePlayers(8);
    players[0].status = 'loh';
    const store = makeGameStore({
      phase: 'nominations',
      lohId: 'p0',
      publicModeEnabled: true,
      lastHohCompFinisherId: 'p5',
      players,
      doubleEviction: { usedCount: 1, weekActive: false, pendingSecondEviction: null },
    });

    // Activate double eviction using the real action
    store.dispatch(activateDoubleEviction());
    expect(store.getState().game.doubleEviction?.weekActive).toBe(true);

    // Advance through nominations (AI LOH picks 3 by DE rule)
    store.dispatch(advance()); // nominations → nomination_results (AI picks 3)
    const afterNominations = store.getState().game;
    expect(afterNominations.phase).toBe('nomination_results');
    // DE: AI nominates exactly 3 — auto-third-nominee rule must NOT add a 4th
    expect(afterNominations.nomineeIds).toHaveLength(3);

    // Advance to next phase — must NOT be pre_veto_public_save in DE weeks
    store.dispatch(advance()); // nomination_results → pos_comp_announcement (skips public save)
    const afterNomResults = store.getState().game;
    expect(afterNomResults.phase).not.toBe('pre_veto_public_save');
    expect(afterNomResults.awaitingPublicSave).toBeFalsy();
    // After nomination_results in DE, should proceed toward pov
    expect(afterNomResults.phase).toBe('pos_comp_announcement');
  });
});
