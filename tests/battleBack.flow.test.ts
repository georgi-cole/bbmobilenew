/**
 * Battle Back / Jury Return twist — unit and flow tests.
 *
 * Validates:
 *  1. activateBattleBack sets the correct initial state.
 *  2. completeBattleBack changes the winner's status to 'active' and marks used.
 *  3. dismissBattleBack marks the twist as used without setting a winner.
 *  4. advance() is blocked while battleBack.active is true.
 *  5. tryActivateBattleBack thunk — eligibility checks and probability roll.
 *  6. After completeBattleBack, advance() is unblocked.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import gameReducer, {
  advance,
  activateBattleBack,
  completeBattleBack,
  dismissBattleBack,
  tryActivateBattleBack,
  openBattleBackCompetition,
} from '../src/store/gameSlice';
import settingsReducer, { DEFAULT_SETTINGS } from '../src/store/settingsSlice';
import type { GameState, Player, TvEvent } from '../src/types';
import { simulateBattleBackCompetition } from '../src/features/twists/battleBackCompetition';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makePlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '🧑',
    status: 'active' as const,
    isUser: i === 0,
  }));
}

function makeStore(
  gameOverrides: Partial<GameState> = {},
  settingsOverrides: Partial<typeof DEFAULT_SETTINGS> = {},
) {
  const base: GameState = {
    season: 1,
    week: 4,
    phase: 'eviction_results',
    seed: 42,
    hohId: 'p0',
    prevHohId: null,
    nomineeIds: ['p1'],
    povWinnerId: null,
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
    f3Part1WinnerId: null,
    f3Part2WinnerId: null,
    voteResults: null,
    evictionSplashId: null,
    players: makePlayers(10),
    tvFeed: [],
    isLive: false,
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('activateBattleBack', () => {
  it('sets active=true, competitionActive=false, and stores candidates', () => {
    const store = makeStore();
    store.dispatch(activateBattleBack({ candidates: ['p1', 'p2', 'p3'], week: 4 }));
    const bb = store.getState().game.battleBack;
    expect(bb).toBeDefined();
    expect(bb!.active).toBe(true);
    expect(bb!.competitionActive).toBe(false);
    expect(bb!.used).toBe(false);
    expect(bb!.candidates).toEqual(['p1', 'p2', 'p3']);
    expect(bb!.weekDecided).toBe(4);
    expect(bb!.winnerId).toBeNull();
  });

  it('pushes a twist TV event with major:battle_back', () => {
    const store = makeStore();
    store.dispatch(activateBattleBack({ candidates: ['p1'], week: 4 }));
    const events = store.getState().game.tvFeed;
    const battleBackEvent = events.find((e) => e.type === 'twist' && /Battle Back/i.test(e.text));
    expect(battleBackEvent).toBeDefined();
    expect((battleBackEvent as TvEvent)?.major).toBe('battle_back');
  });
});

describe('openBattleBackCompetition', () => {
  it('sets competitionActive=true when battleBack is active', () => {
    const store = makeStore();
    store.dispatch(activateBattleBack({ candidates: ['p1'], week: 4 }));
    expect(store.getState().game.battleBack!.competitionActive).toBe(false);
    store.dispatch(openBattleBackCompetition());
    expect(store.getState().game.battleBack!.competitionActive).toBe(true);
  });

  it('is a no-op when battleBack is not active', () => {
    const store = makeStore();
    store.dispatch(openBattleBackCompetition());
    expect(store.getState().game.battleBack?.competitionActive).toBeUndefined();
  });
});

describe('completeBattleBack', () => {
  it('changes winner status from jury to active', () => {
    const players = makePlayers(10);
    // Make p1 a juror
    players[1].status = 'jury';
    const store = makeStore({ players });
    store.dispatch(activateBattleBack({ candidates: ['p1'], week: 4 }));
    store.dispatch(completeBattleBack('p1'));

    const p1 = store.getState().game.players.find((p) => p.id === 'p1');
    expect(p1?.status).toBe('active');
  });

  it('marks used=true and stores winnerId', () => {
    const players = makePlayers(10);
    players[1].status = 'jury';
    players[2].status = 'jury';
    const store = makeStore({ players });
    store.dispatch(activateBattleBack({ candidates: ['p1', 'p2'], week: 4 }));
    store.dispatch(completeBattleBack('p1'));
    const bb = store.getState().game.battleBack;
    expect(bb!.used).toBe(true);
    expect(bb!.active).toBe(false);
    expect(bb!.winnerId).toBe('p1');
  });

  it('is a no-op when the winner is not a juror', () => {
    // p1 is 'active' (not jury) — validation should reject
    const store = makeStore();
    store.dispatch(activateBattleBack({ candidates: ['p1'], week: 4 }));
    store.dispatch(completeBattleBack('p1'));
    const bb = store.getState().game.battleBack;
    expect(bb!.used).toBe(false);  // validation rejected — twist still pending
    expect(bb!.active).toBe(true);
  });

  it('is a no-op when winnerId is not in candidates', () => {
    const players = makePlayers(10);
    players[2].status = 'jury';
    const store = makeStore({ players });
    store.dispatch(activateBattleBack({ candidates: ['p1'], week: 4 })); // p2 not in candidates
    store.dispatch(completeBattleBack('p2'));
    const bb = store.getState().game.battleBack;
    expect(bb!.used).toBe(false);
    expect(bb!.active).toBe(true);
  });

  it('pushes a twist TV event announcing the return', () => {
    const players = makePlayers(10);
    players[1].status = 'jury';
    const store = makeStore({ players });
    store.dispatch(activateBattleBack({ candidates: ['p1'], week: 4 }));
    store.dispatch(completeBattleBack('p1'));
    const events = store.getState().game.tvFeed;
    expect(events.some((e) => e.type === 'twist' && /returns/i.test(e.text))).toBe(true);
  });
});

describe('dismissBattleBack', () => {
  it('marks used=true and active=false without a winner', () => {
    const store = makeStore();
    store.dispatch(activateBattleBack({ candidates: ['p1'], week: 4 }));
    store.dispatch(dismissBattleBack());
    const bb = store.getState().game.battleBack;
    expect(bb!.used).toBe(true);
    expect(bb!.active).toBe(false);
    expect(bb!.winnerId).toBeNull();
  });
});

describe('advance() blocked while battleBack.active', () => {
  it('does not change phase when battleBack is active', () => {
    const store = makeStore({ phase: 'week_end' });
    store.dispatch(activateBattleBack({ candidates: ['p1'], week: 4 }));
    // Now battleBack.active = true → advance() should be a no-op
    const phaseBefore = store.getState().game.phase;
    store.dispatch(advance());
    expect(store.getState().game.phase).toBe(phaseBefore);
  });

  it('unblocks advance() after completeBattleBack', () => {
    const players = makePlayers(3);
    players[1].status = 'jury';
    players[2].status = 'jury';
    const store = makeStore({
      phase: 'week_end',
      players,
    });
    store.dispatch(activateBattleBack({ candidates: ['p1'], week: 4 }));
    store.dispatch(completeBattleBack('p1'));
    // battleBack.active is now false → advance() should run
    store.dispatch(advance());
    // week_end with 2 alive (p0 active + p1 back active = 2... but actually
    // p0=active, p1=active, p2=jury → alive=2 → should transition to jury phase
    expect(store.getState().game.phase).toBe('jury');
  });
});

describe('tryActivateBattleBack thunk', () => {
  it('does not activate when enableTwists is false', () => {
    const players = makePlayers(10);
    // Set 3 jurors and 6 active to satisfy eligibility
    players[7].status = 'jury';
    players[8].status = 'jury';
    players[9].status = 'jury';
    const store = makeStore(
      { players, phase: 'eviction_results' },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: false, battleBackChance: 100 } },
    );
    const activated = store.dispatch(tryActivateBattleBack() as Parameters<typeof store.dispatch>[0]);
    expect(activated).toBe(false);
    expect(store.getState().game.battleBack?.active).toBeFalsy();
  });

  it('does not activate when too few jurors (< 3)', () => {
    const players = makePlayers(10);
    // Only 2 jurors
    players[8].status = 'jury';
    players[9].status = 'jury';
    const store = makeStore(
      { players, phase: 'eviction_results' },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, battleBackChance: 100 } },
    );
    const activated = store.dispatch(tryActivateBattleBack() as Parameters<typeof store.dispatch>[0]);
    expect(activated).toBe(false);
  });

  it('does not activate when too few active players (< 5)', () => {
    const players = makePlayers(8);
    // 3 jurors, only 4 active left (8 - 3 - 1 evicted = 4)
    players[0].status = 'evicted';
    players[5].status = 'jury';
    players[6].status = 'jury';
    players[7].status = 'jury';
    const store = makeStore(
      { players, phase: 'eviction_results' },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, battleBackChance: 100 } },
    );
    const activated = store.dispatch(tryActivateBattleBack() as Parameters<typeof store.dispatch>[0]);
    expect(activated).toBe(false);
  });

  it('does not activate when twist already used', () => {
    const players = makePlayers(12);
    players[9].status = 'jury';
    players[10].status = 'jury';
    players[11].status = 'jury';
    const store = makeStore(
      {
        players,
        phase: 'eviction_results',
        battleBack: { used: true, active: false, weekDecided: null, winnerId: null, candidates: [], eliminated: [], votes: {} },
      },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, battleBackChance: 100 } },
    );
    const activated = store.dispatch(tryActivateBattleBack() as Parameters<typeof store.dispatch>[0]);
    expect(activated).toBe(false);
  });

  it('activates when all conditions are met and chance is 100', () => {
    const players = makePlayers(12);
    players[9].status = 'jury';
    players[10].status = 'jury';
    players[11].status = 'jury';
    const store = makeStore(
      { players, phase: 'eviction_results', seed: 1234 },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, battleBackChance: 100 } },
    );
    const activated = store.dispatch(tryActivateBattleBack() as Parameters<typeof store.dispatch>[0]);
    expect(activated).toBe(true);
    expect(store.getState().game.battleBack?.active).toBe(true);
    expect(store.getState().game.battleBack?.candidates).toHaveLength(3);
  });

  it('does not activate when chance is 0', () => {
    const players = makePlayers(12);
    players[9].status = 'jury';
    players[10].status = 'jury';
    players[11].status = 'jury';
    const store = makeStore(
      { players, phase: 'eviction_results', seed: 5678 },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, battleBackChance: 0 } },
    );
    const activated = store.dispatch(tryActivateBattleBack() as Parameters<typeof store.dispatch>[0]);
    expect(activated).toBe(false);
  });

  it('does not activate when phase is not eviction_results', () => {
    const players = makePlayers(12);
    players[9].status = 'jury';
    players[10].status = 'jury';
    players[11].status = 'jury';
    const store = makeStore(
      { players, phase: 'week_end' },
      { sim: { ...DEFAULT_SETTINGS.sim, enableTwists: true, battleBackChance: 100 } },
    );
    const activated = store.dispatch(tryActivateBattleBack() as Parameters<typeof store.dispatch>[0]);
    expect(activated).toBe(false);
  });
});

// ── battleBackCompetition ────────────────────────────────────────────────────

describe('simulateBattleBackCompetition', () => {
  it('returns a winner from the candidate list', () => {
    const candidates = ['p1', 'p2', 'p3', 'p4'];
    const result = simulateBattleBackCompetition(candidates, 42);
    expect(candidates).toContain(result.winnerId);
  });

  it('is deterministic — same seed always same winner', () => {
    const candidates = ['p1', 'p2', 'p3'];
    const r1 = simulateBattleBackCompetition(candidates, 99);
    const r2 = simulateBattleBackCompetition(candidates, 99);
    expect(r1.winnerId).toBe(r2.winnerId);
    expect(r1.rounds).toEqual(r2.rounds);
  });

  it('differs with different seeds', () => {
    const candidates = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const winners = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => simulateBattleBackCompetition(candidates, s).winnerId),
    );
    // Different seeds should produce at least 2 different winners across 8 runs.
    expect(winners.size).toBeGreaterThan(1);
  });

  it('returns at most 3 rounds', () => {
    const candidates = ['p1', 'p2', 'p3'];
    const result = simulateBattleBackCompetition(candidates, 7);
    expect(result.rounds.length).toBeLessThanOrEqual(3);
  });

  it('winner has the most round wins', () => {
    const candidates = ['p1', 'p2', 'p3'];
    const result = simulateBattleBackCompetition(candidates, 12);
    const winnerWins = result.roundWins[result.winnerId];
    Object.values(result.roundWins).forEach((w) => {
      expect(winnerWins).toBeGreaterThanOrEqual(w);
    });
  });

  it('handles a single candidate (no rounds played)', () => {
    const result = simulateBattleBackCompetition(['p1'], 42);
    expect(result.winnerId).toBe('p1');
    expect(result.rounds).toHaveLength(0);
  });
});
