/**
 * Third nominee + pre-veto public save — unit tests.
 *
 * Validates:
 *  1. Normal week: AI HOH nominates 2, auto-third (lastHohCompFinisherId) appended → 3 total.
 *  2. Normal week: if auto-nominee is already in HOH's picks, no duplicate added.
 *  3. Double eviction: HOH nominates 3, no 4th auto-nominee added.
 *  4. Double eviction: pre_veto_public_save phase is skipped entirely.
 *  5. Normal week: advance() enters pre_veto_public_save and sets awaitingPublicSave.
 *  6. commitPublicSave resolves the phase: removes nominee, records publicSavedNomineeId,
 *     advances to pov_comp_announcement.
 *  7. After commitPublicSave, nomineeIds has exactly 2 entries.
 *  8. Human HOH (commitNominees) appends auto-third in normal weeks.
 *  9. Human HOH (commitNominees) skips auto-third if already selected.
 * 10. advance() on hoh_results records lastHohCompFinisherId.
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
    hohId: 'p0',
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

describe('third nominee — AI HOH normal week', () => {
  it('appends lastHohCompFinisherId as 3rd nominee when AI nominates 2', () => {
    const store = makeStore({
      phase: 'nominations',
      hohId: 'p0',
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

  it('does not add a 4th nominee in double eviction weeks', () => {
    const store = makeStore({
      phase: 'nominations',
      hohId: 'p0',
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
    players[0].status = 'hoh';

    const store = makeStore({
      phase: 'nominations',
      hohId: 'p0',
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

  it('does not duplicate if lastHohCompFinisherId is already in HOH nominees', () => {
    // We set lastHohCompFinisherId = 'p1' and submit nominees ['p1', 'p2'].
    // The commitNominees guard should not append a third nominee when the
    // would-be auto-nominee (p1) is already in the HOH's nominees.
    const store = makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
      lastHohCompFinisherId: 'p1',
      awaitingNominations: true,
    });

    store.dispatch(commitNominees(['p1', 'p2']));
    const state = store.getState().game;

    expect(state.nomineeIds).toHaveLength(2);
    expect(state.nomineeIds.filter((id) => id === 'p1')).toHaveLength(1);
    expect(state.nominationContext).toEqual({
      hohNomineeIds: ['p1', 'p2'],
      autoNomineeId: null,
      publicSaveApplied: false,
    });
  });
});

describe('third nominee — human HOH normal week (commitNominees)', () => {
  it('auto-appends lastHohCompFinisherId after human submits 2 nominees', () => {
    const players = makePlayers(12, 0); // p0 is human+HOH
    players[0].status = 'hoh';

    const store = makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
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

  it('does not duplicate auto-nominee if human already picked them', () => {
    const players = makePlayers(12, 0);
    players[0].status = 'hoh';

    const store = makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
      awaitingNominations: true,
      lastHohCompFinisherId: 'p2', // same as one human pick
      players,
    });

    store.dispatch(commitNominees(['p1', 'p2'])); // p2 == auto-nominee
    const state = store.getState().game;

    expect(state.nomineeIds).toHaveLength(2); // no duplicate added
    expect(state.nomineeIds.filter((id) => id === 'p2')).toHaveLength(1);
    expect(state.nominationContext).toEqual({
      hohNomineeIds: ['p1', 'p2'],
      autoNomineeId: null,
      publicSaveApplied: false,
    });
  });

  it('still auto-appends a third nominee at final 4 for a human HOH', () => {
    const players = makePlayers(4, 0);
    players[0].status = 'hoh';

    const store = makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
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
    players[0].status = 'hoh';

    const store = makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
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
      hohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p5'],
      awaitingNominations: false,
      lastHohCompFinisherId: 'p5',
    });

    store.dispatch(advance()); // nomination_results → pre_veto_public_save
    const state = store.getState().game;

    expect(state.phase).toBe('pre_veto_public_save');
    expect(state.awaitingPublicSave).toBe(true);
  });

  it('skips pre_veto_public_save in double eviction weeks (goes directly to pov_comp_announcement)', () => {
    const store = makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p3'],
      awaitingNominations: false,
      doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
    });

    store.dispatch(advance()); // nomination_results → should skip public save
    const state = store.getState().game;

    expect(state.phase).toBe('pov_comp_announcement');
    expect(state.awaitingPublicSave).toBeFalsy();
    expect(state.tvFeed[0]?.text).toContain('It is time for the Power of Veto competition');
  });

  it('skips pre_veto_public_save and still announces POV when public mode is off', () => {
    const store = makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
      publicModeEnabled: false,
      nomineeIds: ['p1', 'p2'],
      awaitingNominations: false,
    });

    store.dispatch(advance());
    const state = store.getState().game;

    expect(state.phase).toBe('pov_comp_announcement');
    expect(state.awaitingPublicSave).toBeFalsy();
    expect(state.tvFeed[0]?.text).toContain('It is time for the Power of Veto competition');
  });

  it('skips pre_veto_public_save when the block is not exactly 3 nominees', () => {
    const store = makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
      nomineeIds: ['p1', 'p2'],
      awaitingNominations: false,
      publicModeEnabled: true,
    });

    store.dispatch(advance());
    const state = store.getState().game;

    expect(state.phase).toBe('pov_comp_announcement');
    expect(state.awaitingPublicSave).toBeFalsy();
    expect(state.tvFeed[0]?.text).toContain('It is time for the Power of Veto competition');
  });

  it('commitPublicSave removes saved nominee, records publicSavedNomineeId, and advances phase', () => {
    const players = makePlayers(12);
    players[1].status = 'nominated';
    players[2].status = 'nominated';
    players[5].status = 'nominated';

    const store = makeStore({
      phase: 'pre_veto_public_save',
      hohId: 'p0',
      nomineeIds: ['p1', 'p2', 'p5'],
      awaitingPublicSave: true,
      players,
    });

    store.dispatch(commitPublicSave('p1'));
    const state = store.getState().game;

    expect(state.phase).toBe('pov_comp_announcement');
    expect(state.awaitingPublicSave).toBe(false);
    expect(state.publicSavedNomineeId).toBe('p1');
    expect(state.nomineeIds).toHaveLength(2);
    expect(state.nomineeIds).not.toContain('p1');
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toContain('p5');
    // Saved player reverts to active
    expect(state.players.find((p) => p.id === 'p1')?.status).toBe('active');
    expect(state.tvFeed.some((event) => event.text.includes('has been saved by the public'))).toBe(true);
    expect(state.tvFeed[0]?.text).toContain('It is time for the Power of Veto competition');
  });

  it('commitPublicSave is a no-op when phase is not pre_veto_public_save', () => {
    const store = makeStore({
      phase: 'nomination_results',
      hohId: 'p0',
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
      hohId: 'p0',
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
      hohId: 'p0',
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
      hohId: 'p0',
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

describe('HOH comp last-place tracking', () => {
  it('advance() on hoh_results records a deterministic lastHohCompFinisherId', () => {
    const store = makeStore({
      phase: 'hoh_comp',
      hohId: null,
      prevHohId: null,
    });

    store.dispatch(advance()); // hoh_comp → hoh_results (picks HOH and last place)
    const state = store.getState().game;

    expect(state.phase).toBe('hoh_results');
    expect(state.hohId).toBeTruthy();
    expect(state.lastHohCompFinisherId).toBeTruthy();
    // HOH and last place must be different players
    expect(state.lastHohCompFinisherId).not.toBe(state.hohId);
  });

  it('week_start resets lastHohCompFinisherId and publicSavedNomineeId', () => {
    const store = makeStore({
      phase: 'week_end',
      hohId: 'p0',
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
});

describe('public mode endgame boundaries', () => {
  it('keeps the final 4 flow intact under public mode by reducing back to 2 nominees before veto', () => {
    const players = makePlayers(4);
    players[0].status = 'hoh';

    const store = makeStore({
      phase: 'nominations',
      hohId: 'p0',
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
    expect(store.getState().game.phase).toBe('pov_comp_announcement');
    expect(store.getState().game.nomineeIds).toHaveLength(2);

    store.dispatch(advance()); // pov_comp_announcement -> pov_comp
    store.dispatch(advance()); // pov_comp -> pov_results
    store.dispatch(advance()); // pov_results -> final4_eviction via Final 4 bypass

    const state = store.getState().game;
    expect(state.phase).toBe('final4_eviction');
    expect(state.nomineeIds).toHaveLength(2);
  });

  it('clears public-save nomination state when entering final 3', () => {
    const players = makePlayers(3);
    players[0].status = 'hoh';
    players[1].status = 'nominated';
    players[2].status = 'active';

    const store = makeStore({
      phase: 'final3',
      week: 9,
      hohId: 'p0',
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
      hohId: 'p0',
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
    // If lastHohCompFinisherId is null (e.g., first week, no HOH comp data), AI nominates 2
    const store = makeStore({
      phase: 'nominations',
      hohId: 'p0',
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
      hohId: 'p0',
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
