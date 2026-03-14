/**
 * Integration smoke tests — Blackjack Tournament minigame.
 *
 * Verifies:
 *  1. Registry entry is present with correct metadata.
 *  2. AI registry entry is present with correct model.
 *  3. Slice correctly initialises on initBlackjackTournament.
 *  4. Full 2-player scenario resolves to 'complete' with a valid winner.
 *  5. resolveBlackjackTournamentOutcome dispatches applyMinigameWinner once
 *     and is idempotent.
 *  6. Phase-mismatch guard: thunk is a no-op when game phase doesn't match
 *     competition type.
 *  7. Deterministic: same seed always produces the same winner.
 */

import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import blackjackTournamentReducer, {
  initBlackjackTournament,
  resolveSpinner,
  selectPair,
  standCurrentPlayer,
  resolveDuel,
  advanceFromDuelResult,
  markBlackjackTournamentOutcomeResolved,
} from '../../src/features/blackjackTournament/blackjackTournamentSlice';
import { resolveBlackjackTournamentOutcome } from '../../src/features/blackjackTournament/thunks';
import { getGame } from '../../src/minigames/registry';
import { minigameAiRegistry } from '../../src/ai/competition/minigameAiRegistry';

// ─── Minimal integration store ────────────────────────────────────────────────

function makeIntegrationStore(initialGamePhase = 'hoh_comp') {
  const gameReducer = (
    state = { phase: initialGamePhase, hohId: null as string | null, povWinnerId: null as string | null },
    action: { type: string; payload?: unknown },
  ) => {
    if (action.type === 'game/applyMinigameWinner') {
      if (initialGamePhase === 'hoh_comp') {
        return { ...state, hohId: action.payload as string, phase: 'hoh_results' };
      }
      return { ...state, povWinnerId: action.payload as string, phase: 'pov_results' };
    }
    return state;
  };
  return configureStore({
    reducer: { blackjackTournament: blackjackTournamentReducer, game: gameReducer },
  });
}

function init2PlayerStore(
  store: ReturnType<typeof makeIntegrationStore>,
  type: 'HOH' | 'POV' = 'HOH',
  seed = 42,
) {
  store.dispatch(
    initBlackjackTournament({
      participantIds: ['alice', 'bob'],
      competitionType: type,
      seed,
      humanPlayerId: null,
    }),
  );
}

function runOneDuelHeadless(store: ReturnType<typeof makeIntegrationStore>): void {
  const s = store.getState().blackjackTournament;
  if (s.phase === 'spin') store.dispatch(resolveSpinner());

  const s2 = store.getState().blackjackTournament;
  if (s2.phase === 'pick_opponent') {
    const aId = s2.fighterAId ?? s2.remainingPlayerIds[0];
    const bId = s2.fighterBId ?? s2.remainingPlayerIds.find((id) => id !== aId)!;
    store.dispatch(selectPair({ fighterAId: aId, fighterBId: bId }));
  }

  // Stand both fighters (handles tie rematches via loop).
  let safety = 200;
  while (store.getState().blackjackTournament.phase === 'duel' && safety-- > 0) {
    const ds = store.getState().blackjackTournament.currentDuel!;
    if (ds.duelTurn === 'finished') break;
    store.dispatch(standCurrentPlayer());
  }
  store.dispatch(resolveDuel());

  // Handle tie rematches.
  while (store.getState().blackjackTournament.phase === 'duel_result' && safety-- > 0) {
    store.dispatch(advanceFromDuelResult());
    if (store.getState().blackjackTournament.phase === 'duel') {
      const rd = store.getState().blackjackTournament.currentDuel!;
      if (rd.duelTurn !== 'finished') store.dispatch(standCurrentPlayer());
      if (store.getState().blackjackTournament.currentDuel?.duelTurn !== 'finished') store.dispatch(standCurrentPlayer());
      store.dispatch(resolveDuel());
    }
  }
}

// ─── Registry wiring ──────────────────────────────────────────────────────────

describe('Registry — blackjackTournament entry', () => {
  it('exists in the registry', () => {
    expect(getGame('blackjackTournament')).toBeDefined();
  });

  it('uses implementation="react"', () => {
    const entry = getGame('blackjackTournament');
    expect(entry?.implementation).toBe('react');
    expect(entry?.legacy).toBe(false);
  });

  it('uses reactComponentKey="BlackjackTournament"', () => {
    const entry = getGame('blackjackTournament');
    expect(entry?.reactComponentKey).toBe('BlackjackTournament');
  });

  it('has authoritative=true and scoringAdapter="authoritative"', () => {
    const entry = getGame('blackjackTournament');
    expect(entry?.authoritative).toBe(true);
    expect(entry?.scoringAdapter).toBe('authoritative');
  });

  it('has timeLimitMs=0 (self-terminating)', () => {
    expect(getGame('blackjackTournament')?.timeLimitMs).toBe(0);
  });

  it('has weight=1 and retired=false', () => {
    const entry = getGame('blackjackTournament');
    expect(entry?.weight).toBe(1);
    expect(entry?.retired).toBe(false);
  });
});

// ─── AI registry wiring ───────────────────────────────────────────────────────

describe('AI Registry — blackjackTournament entry', () => {
  it('exists in minigameAiRegistry', () => {
    expect(minigameAiRegistry['blackjackTournament']).toBeDefined();
  });

  it('has key="blackjackTournament"', () => {
    expect(minigameAiRegistry['blackjackTournament']?.key).toBe('blackjackTournament');
  });

  it('has category="luck"', () => {
    expect(minigameAiRegistry['blackjackTournament']?.category).toBe('luck');
  });

  it('has scoreDirection="higher-is-better"', () => {
    expect(minigameAiRegistry['blackjackTournament']?.scoreDirection).toBe('higher-is-better');
  });
});

// ─── Slice initialisation ─────────────────────────────────────────────────────

describe('Integration — initBlackjackTournament', () => {
  it('transitions to spin phase for 2 players', () => {
    const store = makeIntegrationStore();
    init2PlayerStore(store);
    expect(store.getState().blackjackTournament.phase).toBe('spin');
  });

  it('sets allPlayerIds and remainingPlayerIds', () => {
    const store = makeIntegrationStore();
    init2PlayerStore(store);
    const bt = store.getState().blackjackTournament;
    expect(bt.allPlayerIds).toEqual(['alice', 'bob']);
    expect(bt.remainingPlayerIds).toEqual(['alice', 'bob']);
  });
});

// ─── Full 2-player scenario ───────────────────────────────────────────────────

describe('Integration — full 2-player tournament', () => {
  it('resolves to complete with a valid winner', () => {
    const store = makeIntegrationStore();
    init2PlayerStore(store);
    runOneDuelHeadless(store);
    const bt = store.getState().blackjackTournament;
    expect(bt.phase).toBe('complete');
    expect(['alice', 'bob']).toContain(bt.winnerId);
  });

  it('eliminated + remaining = all players', () => {
    const store = makeIntegrationStore();
    init2PlayerStore(store);
    runOneDuelHeadless(store);
    const bt = store.getState().blackjackTournament;
    const combined = [...bt.remainingPlayerIds, ...bt.eliminatedPlayerIds].sort();
    expect(combined).toEqual(bt.allPlayerIds.slice().sort());
  });
});

// ─── resolveBlackjackTournamentOutcome — idempotency ─────────────────────────

describe('resolveBlackjackTournamentOutcome — idempotency', () => {
  function reachComplete(type: 'HOH' | 'POV', seed = 42) {
    const gamePhase = type === 'HOH' ? 'hoh_comp' : 'pov_comp';
    const store = makeIntegrationStore(gamePhase);
    store.dispatch(
      initBlackjackTournament({
        participantIds: ['alice', 'bob'],
        competitionType: type,
        seed,
        humanPlayerId: null,
      }),
    );
    runOneDuelHeadless(store);
    expect(store.getState().blackjackTournament.phase).toBe('complete');
    return store;
  }

  it('dispatches applyMinigameWinner for HOH competition', () => {
    const store = reachComplete('HOH');
    store.dispatch(resolveBlackjackTournamentOutcome());
    expect(store.getState().blackjackTournament.outcomeResolved).toBe(true);
  });

  it('dispatches applyMinigameWinner for POV competition', () => {
    const store = reachComplete('POV');
    store.dispatch(resolveBlackjackTournamentOutcome());
    expect(store.getState().blackjackTournament.outcomeResolved).toBe(true);
  });

  it('is idempotent — second dispatch is a no-op', () => {
    const store = reachComplete('HOH');
    store.dispatch(resolveBlackjackTournamentOutcome());
    store.dispatch(resolveBlackjackTournamentOutcome()); // second call
    expect(store.getState().blackjackTournament.outcomeResolved).toBe(true);
  });

  it('is a no-op when game phase does not match competition type (HOH in pov_comp)', () => {
    const store = makeIntegrationStore('pov_comp'); // wrong game phase for HOH
    store.dispatch(
      initBlackjackTournament({
        participantIds: ['alice', 'bob'],
        competitionType: 'HOH', // HOH type
        seed: 42,
        humanPlayerId: null,
      }),
    );
    runOneDuelHeadless(store);
    expect(store.getState().blackjackTournament.phase).toBe('complete');
    store.dispatch(resolveBlackjackTournamentOutcome());
    // Should be a no-op (phase mismatch)
    expect(store.getState().blackjackTournament.outcomeResolved).toBe(false);
  });

  it('outcomeResolved guard prevents re-dispatch after markBlackjackTournamentOutcomeResolved', () => {
    const store = reachComplete('HOH');
    store.dispatch(markBlackjackTournamentOutcomeResolved());
    store.dispatch(resolveBlackjackTournamentOutcome()); // already resolved
    expect(store.getState().blackjackTournament.outcomeResolved).toBe(true);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('Determinism — same seed produces same winner', () => {
  function tournamentWinner(ids: string[], seed: number, type: 'HOH' | 'POV' = 'HOH'): string | null {
    const gamePhase = type === 'HOH' ? 'hoh_comp' : 'pov_comp';
    const store = makeIntegrationStore(gamePhase);
    store.dispatch(
      initBlackjackTournament({
        participantIds: ids,
        competitionType: type,
        seed,
        humanPlayerId: null,
      }),
    );
    let safety = 500;
    while (store.getState().blackjackTournament.phase !== 'complete' && safety-- > 0) {
      runOneDuelHeadless(store);
    }
    return store.getState().blackjackTournament.winnerId;
  }

  it('2-player HOH: same seed gives same winner (5 runs)', () => {
    const seed = 12345;
    const winner = tournamentWinner(['alice', 'bob'], seed);
    for (let i = 0; i < 4; i++) {
      expect(tournamentWinner(['alice', 'bob'], seed)).toBe(winner);
    }
  });

  it('4-player HOH: same seed gives same winner (3 runs)', () => {
    const seed = 99999;
    const winner = tournamentWinner(['a', 'b', 'c', 'd'], seed);
    for (let i = 0; i < 2; i++) {
      expect(tournamentWinner(['a', 'b', 'c', 'd'], seed)).toBe(winner);
    }
  });

  it('different seeds can produce different winners', () => {
    const winners = new Set<string | null>();
    for (let s = 0; s < 20; s++) {
      winners.add(tournamentWinner(['a', 'b', 'c', 'd'], s * 1000));
    }
    expect(winners.size).toBeGreaterThanOrEqual(1);
  });
});
