/**
 * Third nominee + pre-veto public save — unit tests.
 *
 * Validates:
 *  1. Normal week: AI LOH nominates 2, auto-third (lastHohCompFinisherId) appended → 3 total.
 *  2. Normal week: if auto-nominee is already in LOH's picks, no duplicate added.
 *  3. Double eviction: LOH nominates 3, no 4th auto-nominee added.
 *  4. Double eviction: pre_veto_public_save phase is skipped entirely.
 *  5. Normal week: advance() enters pre_veto_public_save and sets awaitingPublicSave.
 *  6. commitPublicSave resolves the phase: removes nominee, records publicSavedNomineeId,
 *     advances to pos_comp_announcement.
 *  7. After commitPublicSave, nomineeIds has exactly 2 entries.
 *  8. Human LOH (commitNominees) appends auto-third in normal weeks.
 *  9. Human LOH (commitNominees) skips auto-third if already selected.
 * 10. advance() on loh_results records lastHohCompFinisherId.
 * 11. resolvePublicSaveNominee ranks by approval and handles ties.
 * 12. week_start resets lastHohCompFinisherId, publicSavedNomineeId, nominationContext.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  commitNominees,
  commitPublicSave,
  fastForwardToEviction,
  applyMinigameWinner,
} from '../src/store/gameSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import publicOpinionReducer from '../src/publicOpinion/publicOpinionSlice';
import type { GameState, Player } from '../src/types';
import { resolvePublicSaveNominee } from '../src/publicOpinion/PublicSaveService';
import type { PlayerPublicProfile } from '../src/publicOpinion/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayers(count: number, userIndex = -1): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }));
}

function makeStore(gameOverrides: Partial<GameState> = {}) {
  const base: GameState = {
    season: 1,
    week: 3,
    phase: 'nominations',
    seed: 42,
    lohId: 'p0',
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
    players: makePlayers(12),
    tvFeed: [],
    isLive: false,
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    specialVeto: {
      seasonUsed: false,
      activeType: null,
      activatedWeek: null,
      vipUseStage: 0,
      awaitingHolderReplacement: false,
      awaitingCoupReplacement1: false,
      awaitingCoupReplacement2: false,
      coupReplacement1Id: null,
      awaitingVipSecondUseDecision: false,
      awaitingVipSecondSaveTarget: false,
    },
  };

  return configureStore({
    reducer: { game: gameReducer, settings: settingsReducer, publicOpinion: publicOpinionReducer },
    preloadedState: {
      game: { ...base, ...gameOverrides },
      settings: DEFAULT_SETTINGS,
    },
  });
}

function makeProfile(approval: number, seasonApprovals: number[] = []): PlayerPublicProfile {
  return {
    playerId: '',
    approval,
    previousApproval: approval,
    seasonApprovals,
    completedDirectionCount: 0,
    cumulativePositiveDelta: 0,
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('third nominee — AI LOH normal week', () => {
  it('appends lastHohCompFinisherId as 3rd nominee when AI nominates 2', () => {
    const store = makeStore({
      phase: 'nominations',
      lohId: 'p0',
      lastHohCompFinisherId: 'p5',
    });

    store.dispatch(advance()); // nominations → nomination_results (AI nominates)
    const state = store.getState().game;

    expect(state.phase).toBe('nomination_results');
    expect(state.nomineeIds).toHaveLength(3);
    expect(state.nomineeIds).toContain('p5'); // auto-third appended
    expect(state.nominationContext).not.toBeNull();
    expect(state.nominationContext?.autoNomineeId).toBe('p5');
    expect(state.nominationContext?.hohNomineeIds).toHaveLength(2);
    expect(state.nominationContext?.publicSaveApplied).toBe(false);
  });

  it('formats AI public-mode nominee copy cleanly when a third nominee is auto-appended', () => {
    const store = makeStore({
      phase: 'nominations',
      lohId: 'p0',
      lastHohCompFinisherId: 'p5',
    });

    store.dispatch(advance());
    const state = store.getState().game;
    const nomineeNames = state.nomineeIds.map((id) => state.players.find((p) => p.id === id)?.name);

    expect(state.nomineeIds).toHaveLength(3);
    expect(nomineeNames.every(Boolean)).toBe(true);
    expect(state.tvFeed[0]?.text).toContain(
      `${nomineeNames.join(', ')} have been nominated for elimination`,
    );
    expect(state.tvFeed[0]?.text).not.toContain(
      `${nomineeNames.join(' and ')} have been nominated for eviction.`,
    );
  });

  it('does not add a 4th nominee in double eviction weeks', () => {
    const store = makeStore({
      phase: 'nominations',
      lohId: 'p0',
      lastHohCompFinisherId: 'p5',
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
    });

    store.dispatch(advance()); // nominations → nomination_results (DE: 3 nominees)
    const state = store.getState().game;

    expect(state.phase).toBe('nomination_results');
    // Hard cap: exactly 3, never 4, even though lastHohCompFinisherId is set
    expect(state.nomineeIds).toHaveLength(3);
    // No auto-third was added (nominationContext is null for DE weeks)
    expect(state.nominationContext).toBeNull();
  });

  it('still auto-appends a third nominee at final 4 when public mode is on', () => {
    const players = makePlayers(4);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nominations',
      lohId: 'p0',
      players,
      lastHohCompFinisherId: 'p3',
      publicModeEnabled: true,
    });

    store.dispatch(advance());
    const state = store.getState().game;

    expect(state.phase).toBe('nomination_results');
    expect(state.nomineeIds).toHaveLength(3);
    expect(state.nomineeIds).toContain('p3');
    expect(state.nominationContext?.autoNomineeId).toBe('p3');
  });

  it('rejects submission if forced auto-nominee is included in submitted IDs', () => {
    // Defensive: if the payload includes lastHohCompFinisherId, it is stripped first.
    // After stripping, only 1 ID remains — that is < expectedCount (2), so the
    // action is rejected (no-op) to prevent ending up with only 2 nominees.
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      lastHohCompFinisherId: 'p1',
      awaitingNominations: true,
    });

    store.dispatch(commitNominees(['p1', 'p2']));
    const state = store.getState().game;

    // Submission rejected: nomineeIds unchanged (empty) and awaitingNominations still true.
    expect(state.nomineeIds).toHaveLength(0);
    expect(state.awaitingNominations).toBe(true);
  });
});

describe('third nominee — human LOH normal week (commitNominees)', () => {
  it('auto-appends lastHohCompFinisherId after human submits 2 nominees', () => {
    const players = makePlayers(12, 0); // p0 is human+LOH
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      lastHohCompFinisherId: 'p5',
      players,
    });

    store.dispatch(commitNominees(['p1', 'p2']));
    const state = store.getState().game;

    expect(state.awaitingNominations).toBe(false);
    expect(state.nomineeIds).toHaveLength(3);
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toContain('p5'); // auto-third
    expect(state.nominationContext?.hohNomineeIds).toEqual(['p1', 'p2']);
    expect(state.nominationContext?.autoNomineeId).toBe('p5');
  });

  it('logs the auto-third nominee as game-nominated instead of attributing all three to the LOH', () => {
    const players = makePlayers(12, 0);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      lastHohCompFinisherId: 'p5',
      players,
    });

    store.dispatch(commitNominees(['p1', 'p2']));
    const state = store.getState().game;

    expect(state.tvFeed[0]?.text).toContain('Player 0 nominated Player 1 and Player 2');
    expect(state.tvFeed[0]?.text).toContain(
      'Player 5 was automatically nominated for finishing last in the LOH competition',
    );
    expect(state.tvFeed[0]?.text).not.toContain('Player 1, Player 2, Player 5 have been nominated for eviction by Player 0');
  });

  it('rejects submission if forced auto-nominee is included in human picks', () => {
    // Defensive: if the human somehow submits the forced auto-nominee as part of their 2 picks,
    // commitNominees strips it first. Remaining count is 1, which is < 2, so the action
    // is rejected (no-op). This prevents a 2-nominee result in normal public-mode weeks.
    const players = makePlayers(12, 0);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      lastHohCompFinisherId: 'p2', // same as one human pick
      players,
    });

    store.dispatch(commitNominees(['p1', 'p2'])); // p2 == auto-nominee (should be stripped)
    const state = store.getState().game;

    // After stripping p2 only 1 ID remains — < expectedCount (2) → rejected.
    expect(state.nomineeIds).toHaveLength(0);
    expect(state.awaitingNominations).toBe(true);
  });

  it('still auto-appends a third nominee at final 4 for a human LOH', () => {
    const players = makePlayers(4, 0);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      lastHohCompFinisherId: 'p3',
      publicModeEnabled: true,
      players,
    });

    store.dispatch(commitNominees(['p1', 'p2']));
    const state = store.getState().game;

    expect(state.awaitingNominations).toBe(false);
    expect(state.nomineeIds).toEqual(['p1', 'p2', 'p3']);
    expect(state.nominationContext).toEqual({
      hohNomineeIds: ['p1', 'p2'],
      autoNomineeId: 'p3',
      publicSaveApplied: false,
    });
  });

  it('commits 3 nominees for double eviction (human picks 3)', () => {
    const players = makePlayers(12, 0);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      lastHohCompFinisherId: 'p5',
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
      players,
    });

    store.dispatch(commitNominees(['p1', 'p2', 'p3'])); // human picks 3 in DE
    const state = store.getState().game;

    expect(state.awaitingNominations).toBe(false);
    expect(state.nomineeIds).toHaveLength(3);
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toContain('p3');
    expect(state.nomineeIds).not.toContain('p5'); // p5 NOT added in DE
  });
});

describe('pre_veto_public_save phase', () => {
  it('enters pre_veto_public_save and sets awaitingPublicSave in normal weeks', () => {
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p5'],
      awaitingNominations: false,
      lastHohCompFinisherId: 'p5',
    });

    store.dispatch(advance()); // nomination_results → pre_veto_public_save
    const state = store.getState().game;

    expect(state.phase).toBe('pre_veto_public_save');
    expect(state.awaitingPublicSave).toBe(true);
    expect(state.tvFeed[0]?.text).toBe("The final list of nominees today will be decided with the public's help.");
  });

  it('skips pre_veto_public_save in double eviction weeks (goes directly to pos_comp_announcement)', () => {
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p3'],
      awaitingNominations: false,
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
    });

    store.dispatch(advance()); // nomination_results → should skip public save
    const state = store.getState().game;

    expect(state.phase).toBe('pos_comp_announcement');
    expect(state.awaitingPublicSave).toBeFalsy();
    expect(state.tvFeed).toHaveLength(0);
  });

  it('skips pre_veto_public_save and still announces POS when public mode is off', () => {
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      publicModeEnabled: false,
      nomineeIds: ['p1', 'p2'],
      awaitingNominations: false,
    });

    store.dispatch(advance());
    const state = store.getState().game;

    expect(state.phase).toBe('pos_comp_announcement');
    expect(state.awaitingPublicSave).toBeFalsy();
    expect(state.tvFeed).toHaveLength(0);
  });

  it('skips pre_veto_public_save when the block is not exactly 3 nominees', () => {
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      awaitingNominations: false,
      publicModeEnabled: true,
    });

    store.dispatch(advance());
    const state = store.getState().game;

    expect(state.phase).toBe('pos_comp_announcement');
    expect(state.awaitingPublicSave).toBeFalsy();
    expect(state.tvFeed).toHaveLength(0);
  });

  it('commitPublicSave removes saved nominee, records publicSavedNomineeId, and advances phase', () => {
    const players = makePlayers(12);
    players[1].status = 'nominated';
    players[2].status = 'nominated';
    players[5].status = 'nominated';

    const store = makeStore({
      phase: 'pre_veto_public_save',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p5'],
      awaitingPublicSave: true,
      players,
    });

    store.dispatch(commitPublicSave({ savedId: 'p1' }));
    const state = store.getState().game;

    expect(state.phase).toBe('pos_comp_announcement');
    expect(state.awaitingPublicSave).toBe(false);
    expect(state.publicSavedNomineeId).toBe('p1');
    expect(state.nomineeIds).toHaveLength(2);
    expect(state.nomineeIds).not.toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toContain('p5');
    // Saved player reverts to active
    expect(state.players.find((p) => p.id === 'p1')?.status).toBe('active');
    // The result has already played in the Public Save reveal; committing it
    // updates gameplay only and does not repeat that reveal in the TV feed.
    expect(state.tvFeed).toHaveLength(0);
  });

  it('commitPublicSave is a no-op when phase is not pre_veto_public_save', () => {
    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      awaitingPublicSave: false,
    });

    store.dispatch(commitPublicSave('p1'));
    expect(store.getState().game.phase).toBe('nomination_results');
    expect(store.getState().game.nomineeIds).toHaveLength(2);
  });

  it('commitPublicSave is a no-op if savedId is not in nomineeIds', () => {
    const store = makeStore({
      phase: 'pre_veto_public_save',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p5'],
      awaitingPublicSave: true,
    });

    store.dispatch(commitPublicSave('p9')); // p9 is not a nominee
    const state = store.getState().game;

    expect(state.phase).toBe('pre_veto_public_save');
    expect(state.nomineeIds).toHaveLength(3); // unchanged
  });

  it('commitPublicSave is a no-op unless it reduces the block from 3 nominees to 2', () => {
    const players = makePlayers(12);
    players[1].status = 'nominated';
    players[2].status = 'nominated';

    const store = makeStore({
      phase: 'pre_veto_public_save',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      awaitingPublicSave: true,
      players,
    });

    store.dispatch(commitPublicSave('p1'));
    const state = store.getState().game;

    expect(state.phase).toBe('pre_veto_public_save');
    expect(state.awaitingPublicSave).toBe(true);
    expect(state.publicSavedNomineeId).toBeNull();
    expect(state.nomineeIds).toEqual(['p1', 'p2']);
    expect(state.players.find((p) => p.id === 'p1')?.status).toBe('nominated');
  });

  it('fastForwardToEviction falls through to advance when public save is not actionable', () => {
    const players = makePlayers(12);
    players[1].status = 'nominated';
    players[2].status = 'nominated';

    const store = makeStore({
      phase: 'pre_veto_public_save',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      awaitingPublicSave: true,
      publicModeEnabled: true,
      players,
    });

    store.dispatch(fastForwardToEviction() as never);
    const state = store.getState().game;

    expect(state.phase).not.toBe('pre_veto_public_save');
    expect(state.phase === 'eviction_results' || state.phase === 'jury').toBe(true);
  });
});

describe('LOH comp last-place tracking', () => {
  it('advance() on loh_results records a deterministic lastHohCompFinisherId', () => {
    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      prevHohId: null,
    });

    store.dispatch(advance()); // loh_comp → loh_results (picks LOH and last place)
    const state = store.getState().game;

    expect(state.phase).toBe('loh_results');
    expect(state.lohId).toBeTruthy();
    expect(state.lastHohCompFinisherId).toBeTruthy();
    // LOH and last place must be different players
    expect(state.lastHohCompFinisherId).not.toBe(state.lohId);
  });

  it('week_start resets lastHohCompFinisherId and publicSavedNomineeId', () => {
    const store = makeStore({
      phase: 'week_end',
      lohId: 'p0',
      lastHohCompFinisherId: 'p5',
      publicSavedNomineeId: 'p1',
      nominationContext: {
        hohNomineeIds: ['p1', 'p2'],
        autoNomineeId: 'p5',
        publicSaveApplied: true,
      },
    });

    store.dispatch(advance()); // week_end → week_start (new week)
    const state = store.getState().game;

    expect(state.phase).toBe('week_start');
    expect(state.lastHohCompFinisherId).toBeNull();
    expect(state.publicSavedNomineeId).toBeNull();
    expect(state.nominationContext).toBeNull();
    expect(state.awaitingPublicSave).toBe(false);
  });

  it('applyMinigameWinner without scores still sets lastHohCompFinisherId in loh_comp', () => {
    // Simulates the challenge-flow path (GameScreen calls applyMinigameWinner without scores).
    const players = makePlayers(12);
    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      publicModeEnabled: true,
      players,
    });

    store.dispatch(applyMinigameWinner({ winnerId: 'p1', participants: players.map((p) => p.id) }));
    const state = store.getState().game;

    expect(state.phase).toBe('loh_results');
    expect(state.lohId).toBe('p1');
    expect(state.lastHohCompFinisherId).not.toBeNull();
    expect(state.lastHohCompFinisherId).not.toBe('p1');
  });

  it('applyMinigameWinner with real scores picks the lowest scorer as lastHohCompFinisherId', () => {
    const players = makePlayers(6);
    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      publicModeEnabled: true,
      players,
    });

    // p0 wins; p4 has the lowest score → should be lastHohCompFinisherId
    const scores: Record<string, number> = {
      p0: 100, p1: 80, p2: 60, p3: 40, p4: 10, p5: 55,
    };
    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: players.map((p) => p.id),
      scores,
    }));
    const state = store.getState().game;

    expect(state.lastHohCompFinisherId).toBe('p4');
  });

  it('applyMinigameWinner with explicit lastPlaceId uses that player regardless of scores', () => {
    // Regression: feature thunks (holdTheWall, glassBridge, etc.) pass lastPlaceId
    // derived from elimination order. This should take priority over score-based logic.
    const players = makePlayers(6);
    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      publicModeEnabled: true,
      players,
    });

    // p3 has the lowest score, but p5 was explicitly first eliminated
    const scores: Record<string, number> = {
      p0: 100, p1: 80, p2: 60, p3: 10, p4: 40, p5: 30,
    };
    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: players.map((p) => p.id),
      scores,
      lastPlaceId: 'p5',
    }));
    const state = store.getState().game;

    // lastPlaceId must win over score-based derivation
    expect(state.lastHohCompFinisherId).toBe('p5');
  });

  it('applyMinigameWinner ignores lastPlaceId if it is the winner', () => {
    // Defensive: caller should not pass the winner as lastPlaceId, but if they do,
    // the system must fall back to score-based derivation.
    const players = makePlayers(4);
    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      publicModeEnabled: true,
      players,
    });

    const scores: Record<string, number> = { p0: 100, p1: 50, p2: 20, p3: 10 };
    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: players.map((p) => p.id),
      scores,
      lastPlaceId: 'p0', // invalid: winner cannot be last place
    }));
    const state = store.getState().game;

    // Should fall back to score-based → p3 (lowest score among non-winners)
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('applyMinigameWinner without lastPlaceId or scores still sets lastHohCompFinisherId ' +
     '(last-player-standing: matches scoreboard nominal case)', () => {
    // Without any score/elimination data, falls back to first non-winner in participants array.
    // This is acceptable for legacy paths where no data is available.
    const players = makePlayers(4);
    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      players,
    });

    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: ['p0', 'p1', 'p2', 'p3'],
    }));
    const state = store.getState().game;

    expect(state.lastHohCompFinisherId).not.toBeNull();
    expect(state.lastHohCompFinisherId).not.toBe('p0');
  });
});

describe('public mode endgame boundaries', () => {
  it('keeps the final 4 flow intact under public mode by reducing back to 2 nominees before veto', () => {
    const players = makePlayers(4);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nominations',
      lohId: 'p0',
      publicModeEnabled: true,
      lastHohCompFinisherId: 'p3',
      players,
    });

    store.dispatch(advance());
    expect(store.getState().game.nomineeIds).toEqual(expect.arrayContaining(['p3']));
    expect(store.getState().game.nomineeIds).toHaveLength(3);

    store.dispatch(advance());
    expect(store.getState().game.phase).toBe('pre_veto_public_save');
    expect(store.getState().game.awaitingPublicSave).toBe(true);

    store.dispatch(commitPublicSave('p3'));
    expect(store.getState().game.phase).toBe('pos_comp_announcement');
    expect(store.getState().game.nomineeIds).toHaveLength(2);

    store.dispatch(advance()); // pos_comp_announcement -> pos_comp
    store.dispatch(advance()); // pos_comp -> pos_results
    store.dispatch(advance()); // pos_results -> final4_eviction via Final 4 bypass

    const state = store.getState().game;
    expect(state.phase).toBe('final4_eviction');
    expect(state.nomineeIds).toHaveLength(2);
  });

  it('clears public-save nomination state when entering final 3', () => {
    const players = makePlayers(3);
    players[0].status = 'loh';
    players[1].status = 'nominated';
    players[2].status = 'active';

    const store = makeStore({
      phase: 'final3',
      week: 9,
      lohId: 'p0',
      nomineeIds: ['p1'],
      publicModeEnabled: true,
      lastHohCompFinisherId: 'p2',
      publicSavedNomineeId: 'p1',
      nominationContext: {
        hohNomineeIds: ['p1'],
        autoNomineeId: 'p2',
        publicSaveApplied: true,
      },
      players,
    });

    store.dispatch(advance());
    const state = store.getState().game;

    expect(state.phase).toBe('final3_comp1');
    expect(state.week).toBe(10);
    expect(state.nomineeIds).toEqual([]);
    expect(state.lastHohCompFinisherId).toBeNull();
    expect(state.publicSavedNomineeId).toBeNull();
    expect(state.nominationContext).toBeNull();
    expect(state.awaitingPublicSave).toBe(false);
  });
});

describe('resolvePublicSaveNominee', () => {
  const makeProfiles = (entries: Array<[string, number, number[]]>) =>
    Object.fromEntries(
      entries.map(([id, approval, seasonApprovals]) => [
        id,
        { ...makeProfile(approval, seasonApprovals), playerId: id },
      ]),
    );

  it('saves the nominee with the highest approval', () => {
    const profiles = makeProfiles([
      ['p1', 40, []],
      ['p2', 70, []],
      ['p3', 55, []],
    ]);

    const result = resolvePublicSaveNominee({ nomineeIds: ['p1', 'p2', 'p3'], profiles });
    expect(result.savedId).toBe('p2');
  });

  it('uses season average as tie-breaker when approval is equal', () => {
    const profiles = makeProfiles([
      ['p1', 60, [50, 55]],   // avg = 52.5
      ['p2', 60, [60, 65]],   // avg = 62.5 ← wins
      ['p3', 50, []],
    ]);

    const result = resolvePublicSaveNominee({ nomineeIds: ['p1', 'p2', 'p3'], profiles });
    expect(result.savedId).toBe('p2');
    expect(result.tieBreakUsed).toBe(true);
  });

  it('falls back to alphabetical id order for complete ties', () => {
    const profiles = makeProfiles([
      ['p1', 60, [60]],
      ['p2', 60, [60]],
    ]);

    const result = resolvePublicSaveNominee({ nomineeIds: ['p2', 'p1'], profiles });
    expect(result.savedId).toBe('p1'); // alphabetically first
  });

  it('handles missing profiles by placing them last', () => {
    const profiles = makeProfiles([['p1', 50, []]]);
    // p2 has no profile

    const result = resolvePublicSaveNominee({ nomineeIds: ['p2', 'p1'], profiles });
    expect(result.savedId).toBe('p1'); // p1 has profile, wins over profileless p2
  });

  it('returns single nominee immediately', () => {
    const result = resolvePublicSaveNominee({ nomineeIds: ['p1'], profiles: {} });
    expect(result.savedId).toBe('p1');
    expect(result.tieBreakUsed).toBe(false);
  });

  it('returns empty string for empty nominee list', () => {
    const result = resolvePublicSaveNominee({ nomineeIds: [], profiles: {} });
    expect(result.savedId).toBe('');
  });
});

describe('backward compatibility', () => {
  it('public mode off keeps original 2-nominee flow', () => {
    const store = makeStore({
      phase: 'nominations',
      lohId: 'p0',
      publicModeEnabled: false,
      lastHohCompFinisherId: 'p5',
    });

    store.dispatch(advance()); // nominations → nomination_results
    const state = store.getState().game;

    expect(state.phase).toBe('nomination_results');
    expect(state.nomineeIds).toHaveLength(2);
    expect(state.nominationContext).toBeNull();
  });

  it('normal week without lastHohCompFinisherId still produces 2 nominees in public mode', () => {
    // If lastHohCompFinisherId is null (e.g., first week, no LOH comp data), AI nominates 2
    const store = makeStore({
      phase: 'nominations',
      lohId: 'p0',
      publicModeEnabled: true,
      lastHohCompFinisherId: null,
    });

    store.dispatch(advance()); // nominations → nomination_results
    const state = store.getState().game;

    expect(state.phase).toBe('nomination_results');
    expect(state.nomineeIds).toHaveLength(2);
    expect(state.nominationContext).toBeNull();
  });

  it('advance() on pre_veto_public_save blocks when awaitingPublicSave is true', () => {
    const store = makeStore({
      phase: 'pre_veto_public_save',
      lohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p5'],
      awaitingPublicSave: true,
    });

    // Multiple advance() calls should be no-ops while awaitingPublicSave is true
    store.dispatch(advance());
    store.dispatch(advance());

    const state = store.getState().game;
    expect(state.phase).toBe('pre_veto_public_save');
    expect(state.awaitingPublicSave).toBe(true);
  });
});

// ── Forced auto-nominee UI and flow regression tests ──────────────────────────
// Validates the behavior introduced for the forced auto-nominee:
//  - UI label selection (scored vs survival)
//  - AI pool excludes the forced auto-nominee
//  - Defensive commitNominees strip
//  - Final nominee count is always 3 unique nominees in normal public-mode weeks

describe('forced auto-nominee: lastHohCompFinisherType', () => {
  it('applyMinigameWinner stores lastPlaceType as lastHohCompFinisherType', () => {
    const players = makePlayers(6);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      players,
    });

    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      lastPlaceId: 'p5',
      lastPlaceType: 'survival',
    }));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherId).toBe('p5');
    expect(state.lastHohCompFinisherType).toBe('survival');
  });

  it('applyMinigameWinner stores scored type correctly', () => {
    const players = makePlayers(6);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      players,
    });

    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'],
      lastPlaceId: 'p5',
      lastPlaceType: 'scored',
    }));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherType).toBe('scored');
  });

  it('applyMinigameWinner derives scored type from scores when lastPlaceType is omitted', () => {
    const players = makePlayers(4);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      players,
    });

    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: ['p0', 'p1', 'p2', 'p3'],
      scores: { p0: 100, p1: 80, p2: 60, p3: 40 },
      // lastPlaceType omitted — should derive 'scored' from hasScores
    }));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherType).toBe('scored');
    expect(state.lastHohCompFinisherId).toBe('p3');
  });

  it('applyMinigameWinner sets null type when neither lastPlaceType nor scores provided', () => {
    const players = makePlayers(4);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'loh_comp',
      lohId: null,
      players,
    });

    store.dispatch(applyMinigameWinner({
      winnerId: 'p0',
      participants: ['p0', 'p1', 'p2', 'p3'],
      // no scores, no lastPlaceType
    }));

    const state = store.getState().game;
    expect(state.lastHohCompFinisherType).toBeNull();
  });

  it('week_start resets lastHohCompFinisherType to null', () => {
    const store = makeStore({
      phase: 'week_end',
      lastHohCompFinisherId: 'p5',
      lastHohCompFinisherType: 'survival',
    });

    store.dispatch(advance()); // week_end → week_start
    const state = store.getState().game;

    expect(state.lastHohCompFinisherId).toBeNull();
    expect(state.lastHohCompFinisherType).toBeNull();
  });
});

describe('forced auto-nominee: AI nomination pool exclusion', () => {
  it('AI never picks the forced auto-nominee as one of its 2 manual picks in public mode', () => {
    // Run many seeds to ensure the AI pool always excludes the forced auto-nominee.
    // (Seed 42 is deterministic; we test multiple scenarios.)
    const testCases = [42, 1, 99, 777, 12345];

    testCases.forEach((seed) => {
      const store = makeStore({
        phase: 'nominations',
        seed,
        lohId: 'p0',
        publicModeEnabled: true,
        lastHohCompFinisherId: 'p5',
      });

      store.dispatch(advance());
      const state = store.getState().game;

      // 3 total nominees; p5 is the auto-appended one, not one of the 2 AI picks
      expect(state.nomineeIds).toHaveLength(3);
      expect(state.nomineeIds).toContain('p5');
      expect(state.nominationContext?.autoNomineeId).toBe('p5');
      expect(state.nominationContext?.hohNomineeIds).not.toContain('p5');
      expect(state.nominationContext?.hohNomineeIds).toHaveLength(2);
    });
  });

  it('AI pool exclusion does not affect double eviction weeks', () => {
    const store = makeStore({
      phase: 'nominations',
      lohId: 'p0',
      publicModeEnabled: true,
      lastHohCompFinisherId: 'p5',
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
    });

    store.dispatch(advance());
    const state = store.getState().game;

    // DE: exactly 3 nominees, no auto-nominee appended
    expect(state.nomineeIds).toHaveLength(3);
    expect(state.nominationContext).toBeNull();
  });
});

describe('forced auto-nominee: commitNominees defensive strip', () => {
  it('strips forced auto-nominee from submitted IDs before validating count (public mode)', () => {
    const players = makePlayers(12, 0);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      lastHohCompFinisherId: 'p3',
      publicModeEnabled: true,
      players,
    });

    // Submit 3 IDs, one of which is the forced auto-nominee.
    // After stripping p3, 2 valid IDs remain — accepted.
    store.dispatch(commitNominees(['p1', 'p2', 'p3']));
    const state = store.getState().game;

    // p1 + p2 as LOH picks, p3 as auto-nominee = 3 total
    expect(state.nomineeIds).toHaveLength(3);
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toContain('p3');
    expect(state.nominationContext?.hohNomineeIds).toEqual(['p1', 'p2']);
    expect(state.nominationContext?.autoNomineeId).toBe('p3');
  });

  it('does not strip forced nominee in double eviction (DE picks must all be valid)', () => {
    const players = makePlayers(12, 0);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      lastHohCompFinisherId: 'p3',
      publicModeEnabled: true,
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
      players,
    });

    // DE: picks 3, forced-nominee strip does not apply — all 3 accepted as-is
    store.dispatch(commitNominees(['p1', 'p2', 'p3']));
    const state = store.getState().game;

    expect(state.nomineeIds).toHaveLength(3);
    expect(state.nomineeIds).toContain('p3');
    expect(state.nominationContext).toBeNull(); // no auto-nominee context in DE
  });
});

describe('forced auto-nominee: 3 unique nominees guaranteed in normal public-mode weeks', () => {
  it('final nominees are always 3 unique players (AI path)', () => {
    const store = makeStore({
      phase: 'nominations',
      lohId: 'p0',
      publicModeEnabled: true,
      lastHohCompFinisherId: 'p5',
    });

    store.dispatch(advance());
    const state = store.getState().game;

    expect(state.nomineeIds).toHaveLength(3);
    expect(new Set(state.nomineeIds).size).toBe(3);
    expect(state.nomineeIds).toContain('p5');
  });

  it('final nominees are always 3 unique players (human path)', () => {
    const players = makePlayers(12, 0);
    players[0].status = 'loh';

    const store = makeStore({
      phase: 'nomination_results',
      lohId: 'p0',
      awaitingNominations: true,
      lastHohCompFinisherId: 'p5',
      publicModeEnabled: true,
      players,
    });

    store.dispatch(commitNominees(['p1', 'p2']));
    const state = store.getState().game;

    expect(state.nomineeIds).toHaveLength(3);
    expect(new Set(state.nomineeIds).size).toBe(3);
    expect(state.nomineeIds).toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toContain('p5');
  });
});
