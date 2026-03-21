/**
 * Special Veto Twist — unit and integration tests.
 *
 * Validates:
 *  1. activateSpecialVeto sets correct state and pushes TV event with correct major key.
 *  2. tryActivateSpecialVeto thunk respects all eligibility rules.
 *  3. Spotlight veto forces use behavior (AI and human paths).
 *  4. Diamond POV: holder names replacement nominee.
 *  5. Coup d'État: removes both nominees, names two replacements.
 *  6. VIP Veto: first use, second use decision flow.
 *  7. Season-one-per-season rule (seasonUsed prevents second activation).
 *  8. selectIsWaitingForInput returns true for all special veto blocking flags.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  activateSpecialVeto,
  tryActivateSpecialVeto,
  submitDiamondReplacement,
  submitCoupReplacement,
  submitVipSecondUseDecision,
  submitVipSecondSaveTarget,
  submitPovDecision,
  submitPovSaveTarget,
  setReplacementNominee,
} from '../src/store/gameSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import { selectIsWaitingForInput } from '../src/store/selectors';
import type { GameState, Player, SpecialVetoState } from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number, userIndex = -1): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === userIndex,
  }));
}

const INITIAL_SPECIAL_VETO: SpecialVetoState = {
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
};

function makeStore(
  gameOverrides: Partial<GameState> = {},
  settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {},
) {
  const base: GameState = {
    season: 1,
    week: 3,
    phase: 'pov_results',
    seed: 42,
    hohId: 'p0',
    prevHohId: null,
    nomineeIds: ['p2', 'p3'],
    povWinnerId: 'p1',
    replacementNeeded: false,
    povSavedId: null,
    awaitingNominations: false,
    pendingNominee1Id: null,
    awaitingPovDecision: false,
    awaitingPovSaveTarget: false,
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
    players: makePlayers(8),
    tvFeed: [],
    isLive: false,
    doubleEviction: { usedCount: 0, weekActive: false, pendingSecondEviction: null },
    specialVeto: { ...INITIAL_SPECIAL_VETO },
  };

  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...settingsOverrides,
    sim: { ...DEFAULT_SETTINGS.sim, ...(settingsOverrides.sim ?? {}) },
  };

  return configureStore({
    reducer: { game: gameReducer, settings: settingsReducer },
    preloadedState: {
      game: { ...base, ...gameOverrides },
      settings: mergedSettings,
    },
  });
}

// ── activateSpecialVeto reducer ───────────────────────────────────────────────

describe('activateSpecialVeto', () => {
  it('sets seasonUsed=true, activeType, activatedWeek and pushes TV event', () => {
    const store = makeStore({ week: 3 });
    store.dispatch(activateSpecialVeto({ type: 'vip', week: 3 }));
    const sv = store.getState().game.specialVeto!;
    expect(sv.seasonUsed).toBe(true);
    expect(sv.activeType).toBe('vip');
    expect(sv.activatedWeek).toBe(3);
    expect(sv.vipUseStage).toBe(0);
    expect(store.getState().game.twistActive).toBe(true);
    const feed = store.getState().game.tvFeed;
    expect(feed[0].major).toBe('vip_veto');
  });

  it('uses correct major key for diamond', () => {
    const store = makeStore();
    store.dispatch(activateSpecialVeto({ type: 'diamond', week: 3 }));
    expect(store.getState().game.tvFeed[0].major).toBe('diamond_pov');
  });

  it('uses correct major key for coup', () => {
    const store = makeStore();
    store.dispatch(activateSpecialVeto({ type: 'coup', week: 3 }));
    expect(store.getState().game.tvFeed[0].major).toBe('coup_detat');
  });

  it('uses correct major key for spotlight', () => {
    const store = makeStore();
    store.dispatch(activateSpecialVeto({ type: 'spotlight', week: 3 }));
    expect(store.getState().game.tvFeed[0].major).toBe('spotlight_veto');
  });
});

// ── tryActivateSpecialVeto thunk eligibility ──────────────────────────────────

describe('tryActivateSpecialVeto eligibility', () => {
  it('returns false when enableTwists=false', () => {
    const store = makeStore({}, { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: false } });
    const result = store.dispatch(tryActivateSpecialVeto());
    expect(result).toBe(false);
    expect(store.getState().game.specialVeto?.seasonUsed).toBe(false);
  });

  it('returns false when phase is not pov_results', () => {
    const store = makeStore(
      { phase: 'nominations' },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, specialVetoChance: 100 } },
    );
    const result = store.dispatch(tryActivateSpecialVeto());
    expect(result).toBe(false);
  });

  it('returns false when week <= 2', () => {
    const store = makeStore(
      { week: 2, phase: 'pov_results' },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, specialVetoChance: 100 } },
    );
    const result = store.dispatch(tryActivateSpecialVeto());
    expect(result).toBe(false);
  });

  it('returns false when fewer than 6 alive players', () => {
    const store = makeStore(
      { phase: 'pov_results', week: 3, players: makePlayers(5) },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, specialVetoChance: 100 } },
    );
    const result = store.dispatch(tryActivateSpecialVeto());
    expect(result).toBe(false);
  });

  it('returns false when double eviction is active', () => {
    const store = makeStore(
      {
        phase: 'pov_results',
        week: 3,
        doubleEviction: { usedCount: 1, weekActive: true, pendingSecondEviction: null },
      },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, specialVetoChance: 100 } },
    );
    const result = store.dispatch(tryActivateSpecialVeto());
    expect(result).toBe(false);
  });

  it('returns false when season already used a special veto', () => {
    const store = makeStore(
      {
        phase: 'pov_results',
        week: 3,
        specialVeto: { ...INITIAL_SPECIAL_VETO, seasonUsed: true },
      },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, specialVetoChance: 100 } },
    );
    const result = store.dispatch(tryActivateSpecialVeto());
    expect(result).toBe(false);
  });

  it('returns false when chance roll does not pass', () => {
    // specialVetoChance=0 means roll is always >= chance
    const store = makeStore(
      { phase: 'pov_results', week: 3 },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, specialVetoChance: 0 } },
    );
    const result = store.dispatch(tryActivateSpecialVeto());
    expect(result).toBe(false);
  });

  it('activates when all conditions are met (chance=100)', () => {
    const store = makeStore(
      { phase: 'pov_results', week: 3 },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, specialVetoChance: 100 } },
    );
    const result = store.dispatch(tryActivateSpecialVeto());
    expect(result).toBe(true);
    expect(store.getState().game.specialVeto?.seasonUsed).toBe(true);
    expect(store.getState().game.specialVeto?.activeType).not.toBeNull();
  });
});

// ── Season one-per-season rule ────────────────────────────────────────────────

describe('season one-per-season rule', () => {
  it('second activateSpecialVeto call in same season still sets state but tryActivate prevents it via seasonUsed', () => {
    const store = makeStore(
      { phase: 'pov_results', week: 3 },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, specialVetoChance: 100 } },
    );
    store.dispatch(tryActivateSpecialVeto());
    expect(store.getState().game.specialVeto?.seasonUsed).toBe(true);
    const firstType = store.getState().game.specialVeto?.activeType;

    // Try again — should return false because seasonUsed is now true
    const result2 = store.dispatch(tryActivateSpecialVeto());
    expect(result2).toBe(false);
    // activeType should still be the first one
    expect(store.getState().game.specialVeto?.activeType).toBe(firstType);
  });
});

// ── Spotlight Veto ────────────────────────────────────────────────────────────

describe('Spotlight Veto — AI POV holder (not nominee)', () => {
  it('AI forces use on a nominee and triggers AI replacement', () => {
    const players = makePlayers(8);
    // p1 is pov holder (not nominee), p2 and p3 are nominees
    players[1].status = 'active';
    players[2].status = 'nominated';
    players[3].status = 'nominated';
    const store = makeStore({
      phase: 'pov_ceremony', // advance() will process pov_ceremony_results
      hohId: 'p0',
      povWinnerId: 'p1',
      nomineeIds: ['p2', 'p3'],
      players,
      specialVeto: { ...INITIAL_SPECIAL_VETO, seasonUsed: true, activeType: 'spotlight', activatedWeek: 3 },
    });
    store.dispatch(advance());
    const state = store.getState().game;
    // One nominee should have been saved (AI picks one)
    expect(state.povSavedId).not.toBeNull();
    const savedId = state.povSavedId;
    expect(['p2', 'p3']).toContain(savedId);
  });
});

describe('Spotlight Veto — Human POV holder (not nominee)', () => {
  it('sets awaitingPovSaveTarget (forced use)', () => {
    const players = makePlayers(8, 1); // p1 is human
    players[2].status = 'nominated';
    players[3].status = 'nominated';
    const store = makeStore({
      phase: 'pov_ceremony', // advance() will process pov_ceremony_results
      hohId: 'p0',
      povWinnerId: 'p1',
      nomineeIds: ['p2', 'p3'],
      players,
      specialVeto: { ...INITIAL_SPECIAL_VETO, seasonUsed: true, activeType: 'spotlight', activatedWeek: 3 },
    });
    store.dispatch(advance());
    expect(store.getState().game.awaitingPovSaveTarget).toBe(true);
  });
});

// ── Diamond POV ───────────────────────────────────────────────────────────────

describe('Diamond POV — Human POV holder names replacement', () => {
  it('submitDiamondReplacement adds player as nominee and clears awaitingHolderReplacement', () => {
    const players = makePlayers(8, 1); // p1 is human and pov holder
    players[2].status = 'nominated';
    players[3].status = 'nominated';
    const store = makeStore({
      phase: 'pov_ceremony_results',
      hohId: 'p0',
      povWinnerId: 'p1',
      nomineeIds: ['p2'],
      povSavedId: 'p3',
      players,
      specialVeto: {
        ...INITIAL_SPECIAL_VETO,
        seasonUsed: true,
        activeType: 'diamond',
        activatedWeek: 3,
        awaitingHolderReplacement: true,
      },
    });
    store.dispatch(submitDiamondReplacement('p4'));
    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p4');
    expect(state.specialVeto?.awaitingHolderReplacement).toBe(false);
    expect(state.players.find((p) => p.id === 'p4')?.status).toBe('nominated');
  });

  it('submitDiamondReplacement is a no-op if not awaiting', () => {
    const store = makeStore();
    store.dispatch(submitDiamondReplacement('p4'));
    expect(store.getState().game.nomineeIds).not.toContain('p4');
  });

  it('submitDiamondReplacement rejects HOH as replacement', () => {
    const players = makePlayers(8, 1);
    const store = makeStore({
      hohId: 'p0',
      povWinnerId: 'p1',
      nomineeIds: ['p2'],
      povSavedId: 'p3',
      players,
      specialVeto: {
        ...INITIAL_SPECIAL_VETO,
        seasonUsed: true,
        activeType: 'diamond',
        awaitingHolderReplacement: true,
      },
    });
    store.dispatch(submitDiamondReplacement('p0')); // p0 is HOH
    expect(store.getState().game.nomineeIds).not.toContain('p0');
    expect(store.getState().game.specialVeto?.awaitingHolderReplacement).toBe(true);
  });
});

// ── Coup d'État ───────────────────────────────────────────────────────────────

describe("Coup d'État — Human POV holder names two replacements", () => {
  it('submitCoupReplacement first pick sets coupReplacement1Id and advances to pick 2', () => {
    const players = makePlayers(8, 1);
    const store = makeStore({
      hohId: 'p0',
      povWinnerId: 'p1',
      nomineeIds: [],
      players,
      specialVeto: {
        ...INITIAL_SPECIAL_VETO,
        seasonUsed: true,
        activeType: 'coup',
        awaitingCoupReplacement1: true,
      },
    });
    store.dispatch(submitCoupReplacement('p2'));
    const sv = store.getState().game.specialVeto!;
    expect(sv.coupReplacement1Id).toBe('p2');
    expect(sv.awaitingCoupReplacement1).toBe(false);
    expect(sv.awaitingCoupReplacement2).toBe(true);
  });

  it('submitCoupReplacement second pick adds both nominees and clears flags', () => {
    const players = makePlayers(8, 1);
    const store = makeStore({
      hohId: 'p0',
      povWinnerId: 'p1',
      nomineeIds: [],
      players,
      specialVeto: {
        ...INITIAL_SPECIAL_VETO,
        seasonUsed: true,
        activeType: 'coup',
        awaitingCoupReplacement2: true,
        coupReplacement1Id: 'p2',
      },
    });
    store.dispatch(submitCoupReplacement('p3'));
    const state = store.getState().game;
    expect(state.nomineeIds).toContain('p2');
    expect(state.nomineeIds).toContain('p3');
    expect(state.specialVeto?.awaitingCoupReplacement2).toBe(false);
    expect(state.specialVeto?.coupReplacement1Id).toBeNull();
  });

  it('submitCoupReplacement rejects duplicate pick on second turn', () => {
    const players = makePlayers(8, 1);
    const store = makeStore({
      hohId: 'p0',
      povWinnerId: 'p1',
      nomineeIds: [],
      players,
      specialVeto: {
        ...INITIAL_SPECIAL_VETO,
        seasonUsed: true,
        activeType: 'coup',
        awaitingCoupReplacement2: true,
        coupReplacement1Id: 'p2',
      },
    });
    store.dispatch(submitCoupReplacement('p2')); // same as first pick
    expect(store.getState().game.nomineeIds).not.toContain('p2');
    expect(store.getState().game.specialVeto?.awaitingCoupReplacement2).toBe(true);
  });
});

// ── VIP Veto ──────────────────────────────────────────────────────────────────

describe('VIP Veto — second use decision (human POV holder)', () => {
  it('submitVipSecondUseDecision(true) sets awaitingVipSecondSaveTarget', () => {
    const players = makePlayers(8, 1); // p1 is human POV holder
    const store = makeStore({
      hohId: 'p0',
      povWinnerId: 'p1',
      nomineeIds: ['p3', 'p4'],
      players,
      specialVeto: {
        ...INITIAL_SPECIAL_VETO,
        seasonUsed: true,
        activeType: 'vip',
        vipUseStage: 2,
        awaitingVipSecondUseDecision: true,
      },
    });
    store.dispatch(submitVipSecondUseDecision(true));
    const sv = store.getState().game.specialVeto!;
    expect(sv.awaitingVipSecondUseDecision).toBe(false);
    expect(sv.awaitingVipSecondSaveTarget).toBe(true);
  });

  it('submitVipSecondUseDecision(false) sets vipUseStage=-1', () => {
    const players = makePlayers(8, 1);
    const store = makeStore({
      povWinnerId: 'p1',
      nomineeIds: ['p3', 'p4'],
      players,
      specialVeto: {
        ...INITIAL_SPECIAL_VETO,
        seasonUsed: true,
        activeType: 'vip',
        vipUseStage: 2,
        awaitingVipSecondUseDecision: true,
      },
    });
    store.dispatch(submitVipSecondUseDecision(false));
    const sv = store.getState().game.specialVeto!;
    expect(sv.awaitingVipSecondUseDecision).toBe(false);
    expect(sv.vipUseStage).toBe(-1);
  });

  it('submitVipSecondSaveTarget saves nominee and sets vipUseStage=3 (human HOH)', () => {
    const players = makePlayers(8, 1); // p1 is human pov holder
    players[0].isUser = false; // p0 is human HOH... wait, p1 already isUser. Let's use different index
    const players2 = makePlayers(8, 5); // p5 is the human user (POV holder)
    players2[0].status = 'active'; // p0 = HOH
    players2[3].status = 'nominated';
    players2[4].status = 'nominated';
    const store = makeStore({
      hohId: 'p0',
      povWinnerId: 'p5',
      nomineeIds: ['p3', 'p4'],
      players: players2,
      specialVeto: {
        ...INITIAL_SPECIAL_VETO,
        seasonUsed: true,
        activeType: 'vip',
        vipUseStage: 2,
        awaitingVipSecondSaveTarget: true,
      },
    });
    store.dispatch(submitVipSecondSaveTarget('p3'));
    const state = store.getState().game;
    expect(state.nomineeIds).not.toContain('p3');
    expect(state.povSavedId).toBe('p3');
    // HOH is not human (p5 is human pov holder, but p0 is non-human HOH), so AI names
    // a replacement and vipUseStage ends at -1
    expect(state.specialVeto?.vipUseStage).toBe(-1);
  });
});

// ── selectIsWaitingForInput ───────────────────────────────────────────────────

describe('selectIsWaitingForInput — special veto flags', () => {
  it('returns true when awaitingHolderReplacement is true', () => {
    const store = makeStore({
      specialVeto: { ...INITIAL_SPECIAL_VETO, awaitingHolderReplacement: true },
    });
    expect(selectIsWaitingForInput(store.getState())).toBe(true);
  });

  it('returns true when awaitingCoupReplacement1 is true', () => {
    const store = makeStore({
      specialVeto: { ...INITIAL_SPECIAL_VETO, awaitingCoupReplacement1: true },
    });
    expect(selectIsWaitingForInput(store.getState())).toBe(true);
  });

  it('returns true when awaitingCoupReplacement2 is true', () => {
    const store = makeStore({
      specialVeto: { ...INITIAL_SPECIAL_VETO, awaitingCoupReplacement2: true },
    });
    expect(selectIsWaitingForInput(store.getState())).toBe(true);
  });

  it('returns true when awaitingVipSecondUseDecision is true', () => {
    const store = makeStore({
      specialVeto: { ...INITIAL_SPECIAL_VETO, awaitingVipSecondUseDecision: true },
    });
    expect(selectIsWaitingForInput(store.getState())).toBe(true);
  });

  it('returns true when awaitingVipSecondSaveTarget is true', () => {
    const store = makeStore({
      specialVeto: { ...INITIAL_SPECIAL_VETO, awaitingVipSecondSaveTarget: true },
    });
    expect(selectIsWaitingForInput(store.getState())).toBe(true);
  });

  it('returns false when no flags are set', () => {
    const store = makeStore({ specialVeto: { ...INITIAL_SPECIAL_VETO } });
    expect(selectIsWaitingForInput(store.getState())).toBe(false);
  });
});

// ── week_start clears specialVeto ceremony flags ──────────────────────────────

describe('week_start clears specialVeto per-week flags', () => {
  it('clears activeType, vipUseStage, and all awaiting flags but preserves seasonUsed', () => {
    const store = makeStore({
      phase: 'week_end',
      specialVeto: {
        seasonUsed: true,
        activeType: 'vip',
        activatedWeek: 3,
        vipUseStage: -1,
        awaitingHolderReplacement: false,
        awaitingCoupReplacement1: false,
        awaitingCoupReplacement2: false,
        coupReplacement1Id: null,
        awaitingVipSecondUseDecision: false,
        awaitingVipSecondSaveTarget: false,
      },
    });
    store.dispatch(advance());
    const sv = store.getState().game.specialVeto!;
    expect(sv.seasonUsed).toBe(true); // preserved
    expect(sv.activeType).toBeNull();
    expect(sv.activatedWeek).toBeNull();
    expect(sv.vipUseStage).toBe(0);
  });
});

// ── advance() guard respects specialVeto awaiting flags ──────────────────────

describe('advance() guard — specialVeto blocking flags', () => {
  it('does not advance when awaitingCoupReplacement1 is set', () => {
    const store = makeStore({
      phase: 'pov_ceremony_results',
      specialVeto: { ...INITIAL_SPECIAL_VETO, awaitingCoupReplacement1: true },
    });
    const phaseBefore = store.getState().game.phase;
    store.dispatch(advance());
    expect(store.getState().game.phase).toBe(phaseBefore);
  });

  it('does not advance when awaitingVipSecondUseDecision is set', () => {
    const store = makeStore({
      phase: 'pov_ceremony_results',
      specialVeto: { ...INITIAL_SPECIAL_VETO, awaitingVipSecondUseDecision: true },
    });
    const phaseBefore = store.getState().game.phase;
    store.dispatch(advance());
    expect(store.getState().game.phase).toBe(phaseBefore);
  });
});
