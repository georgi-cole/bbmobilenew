import { describe, expect, it } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { mulberry32 } from '../src/store/rng';

import {
  trapAuctionReducer,
  type TrapAuctionState,
} from '../src/components/TrapAuction/trapAuctionReducer';
import {
  TRAP_AUCTION_CONFIG,
  type TrapAuctionPlayer,
} from '../src/components/TrapAuction/trapAuctionTypes';
import {
  buildRoundReveals,
  chooseAiBid,
  computeAiBids,
  findHighestBidder,
  findLowestBidders,
  getAllowedBidRange,
  isCompleteTie,
  nextPlacementFor,
} from '../src/components/TrapAuction/trapAuctionHelpers';

import wildcardWesternReducer, {
  advanceCardReveal,
  advanceIntro,
  advancePairIntro,
  advanceResolution,
  answerTimeout,
  buzzTimeout,
  dealCardsAction,
  initWildcardWestern,
  openBuzzWindow,
  playerAnswer,
  playerBuzz,
  playerChooseNextPair,
  startWildcardFinal,
} from '../src/features/wildcardWestern/wildcardWesternSlice';
import {
  dealCards,
  getFirstPair,
  getNextQuestion,
  selectRandomPair,
} from '../src/features/wildcardWestern/helpers';
import { WILDCARD_QUESTIONS } from '../src/features/wildcardWestern/wildcardWesternQuestions';
import {
  getAiPersonality,
  precomputeAiDuelPlan,
  precomputeAiEliminationChoice,
  precomputeAiNextPair,
} from '../src/features/wildcardWestern/wildcardWesternAi';

import glassBridgeReducer, {
  advanceTurn,
  buildAiNumberChoices,
  buildGlassBridgeTimeLimitMs,
  buildPlacements,
  completeGame,
  expireTimer,
  finaliseOrderSelection,
  generateBridgeRows,
  initGlassBridge,
  recordNumberChoice,
  resolveStep,
  startPlaying,
  simulateAiTurn,
  type GlassBridgePlayerProgress,
} from '../src/features/glassBridge/glassBridgeSlice';

const T0 = 1_700_000_000_000;

function makeTrapPlayers(count: number, overrides?: Partial<TrapAuctionPlayer>[]): TrapAuctionPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    name: `Player ${index}`,
    avatar: '',
    isHuman: index === 0,
    personality: 'balanced' as const,
    bank: TRAP_AUCTION_CONFIG.startingBank,
    isAlive: true,
    currentBid: null,
    bidRevealed: false,
    penalty: null,
    eliminatedRound: null,
    placement: null,
    isExposed: false,
    ...(overrides?.[index] ?? {}),
  }));
}

function makeTrapState(overrides?: Partial<TrapAuctionState>): TrapAuctionState {
  const players = makeTrapPlayers(4);
  return {
    phase: 'bid',
    round: 1,
    players,
    roundReveals: [],
    revealIndex: 0,
    lastEliminatedIds: [],
    lastHighestBidderId: null,
    winner: null,
    humanEliminated: false,
    spectating: false,
    fastForward: false,
    prizeType: 'LOH',
    seed: 1234,
    rematchCount: 0,
    ...overrides,
  };
}

function makeGlassStore() {
  return configureStore({ reducer: { glassBridge: glassBridgeReducer } });
}

function makeWildcardStore() {
  return configureStore({ reducer: { wildcardWestern: wildcardWesternReducer } });
}

function makeGlassProgress(overrides: Partial<GlassBridgePlayerProgress>, id: string): GlassBridgePlayerProgress {
  return {
    playerId: id,
    furthestRowReached: 0,
    timeReachedFurthestRowMs: 0,
    eliminated: false,
    hintPenaltyMs: 0,
    ...overrides,
  };
}

describe('Trap Auction audit', () => {
  it('keeps AI bids within the allowed range and above the minimum floor when bank > 1', () => {
    const players = makeTrapPlayers(4);
    const state = makeTrapState({ players });
    const ai = players[1];
    const bid = chooseAiBid(ai, state, 99);
    const range = getAllowedBidRange(ai, state.round);

    expect(bid).toBeGreaterThanOrEqual(range.min);
    expect(bid).toBeLessThanOrEqual(range.max);
    expect(bid).toBeGreaterThan(1);
  });

  it('computes AI bids deterministically from the same round seed', () => {
    const players = makeTrapPlayers(4);
    const state = makeTrapState({ players });
    const first = computeAiBids(players, { round: state.round, players }, 4242);
    const second = computeAiBids(players, { round: state.round, players }, 4242);

    expect(first.map((p) => p.currentBid)).toEqual(second.map((p) => p.currentBid));
  });

  it('builds reveal order with the highest bidder first and all lowest bidders next', () => {
    const players = makeTrapPlayers(4, [
      { currentBid: 20 },
      { currentBid: 10 },
      { currentBid: 10 },
      { currentBid: 30 },
    ]);

    const reveals = buildRoundReveals(players);
    expect(reveals[0]?.playerId).toBe('p3');
    expect(reveals.filter((entry) => entry.isLowest).map((entry) => entry.playerId)).toEqual(['p1', 'p2']);
    expect(findHighestBidder(players)).toBe('p3');
    expect(findLowestBidders(players)).toEqual(['p1', 'p2']);
  });

  it('treats a complete tie as rematch-only and keeps placements stable when forced to resolve', () => {
    const players = makeTrapPlayers(2, [
      { bank: 1, isHuman: false, currentBid: 1 },
      { bank: 1, isHuman: false, currentBid: 1 },
    ]);

    expect(isCompleteTie(players)).toBe(true);
    expect(nextPlacementFor(players)).toBe(2);
  });

  it('runs the tie-rematch path to completion without leaving duplicate bids behind', () => {
    const state = makeTrapState({
      phase: 'reveal',
      players: makeTrapPlayers(2, [
        { bank: 1, isHuman: false, currentBid: 1 },
        { bank: 1, isHuman: false, currentBid: 1 },
      ]),
      roundReveals: buildRoundReveals(
        makeTrapPlayers(2, [
          { bank: 1, isHuman: false, currentBid: 1 },
          { bank: 1, isHuman: false, currentBid: 1 },
        ]),
      ),
      revealIndex: 2,
      seed: 77,
      rematchCount: 7,
    });

    const afterAdvance = trapAuctionReducer(state, { type: 'ADVANCE_TO_ELIMINATION' });
    expect(afterAdvance.phase).toBe('complete');
    expect(afterAdvance.players.every((p) => p.placement !== null)).toBe(true);
    expect(afterAdvance.players.every((p) => p.currentBid === null)).toBe(true);
  });
});

describe('Wildcard Western audit', () => {
  const players = ['alice', 'bob', 'carol', 'dave'];

  it('deals deterministic unique cards and selects the lowest/highest pair correctly', () => {
    const cardsA = dealCards(players, mulberry32(11));
    const cardsB = dealCards(players, mulberry32(11));

    expect(cardsA).toEqual(cardsB);
    expect(new Set(Object.values(cardsA)).size).toBe(players.length);

    const [low, high] = getFirstPair(cardsA, players);
    expect(cardsA[low]).toBeLessThanOrEqual(cardsA[high]);
    expect(players.every((id) => cardsA[id] >= cardsA[low] && cardsA[id] <= cardsA[high])).toBe(true);
  });

  it('advances question order deterministically and reshuffles when exhausted', () => {
    const order = WILDCARD_QUESTIONS.map((question) => question.id);
    const first = getNextQuestion(order, 0, 99, 1);
    const reshuffled = getNextQuestion(order, order.length, 99, 1);

    expect(first.question).toBeDefined();
    expect(first.newCursor).toBe(1);
    expect(reshuffled.newOrder).toHaveLength(WILDCARD_QUESTIONS.length);
    expect(reshuffled.newCursor).toBe(1);
  });

  it('keeps AI duel planning deterministic and internally consistent', () => {
    const question = WILDCARD_QUESTIONS[0];
    const personality = getAiPersonality('alice', 123);
    const plan = precomputeAiDuelPlan('alice', personality, question, 123, 4);

    expect(plan.willBuzz).toBeTypeOf('boolean');
    expect(plan.willAnswer).toBeTypeOf('boolean');
    if (plan.willBuzz) {
      expect(plan.willTimeout).toBe(!plan.willAnswer);
      expect(plan.chosenAnswerIndex).toBeGreaterThanOrEqual(0);
      expect(plan.chosenAnswerIndex).toBeLessThanOrEqual(2);
    } else {
      expect(plan.willAnswer).toBe(false);
      expect(plan.willTimeout).toBe(false);
      expect(plan.buzzDelayMs).toBe(0);
    }
  });

  it('selects a valid random pair and AI choices for elimination remain within the alive pool', () => {
    const aliveIds = ['alice', 'bob', 'carol', 'dave'];
    const pair = selectRandomPair(aliveIds, mulberry32(7));
    expect(pair[0]).not.toBe(pair[1]);
    expect(aliveIds).toContain(pair[0]);
    expect(aliveIds).toContain(pair[1]);

    const eliminationChoice = precomputeAiEliminationChoice('alice', aliveIds, 7, 2);
    expect(aliveIds).toContain(eliminationChoice);
    expect(eliminationChoice).not.toBe('alice');

    const nextPair = precomputeAiNextPair('alice', aliveIds, 7, 2);
    expect(nextPair[0]).not.toBe(nextPair[1]);
    expect(aliveIds).toContain(nextPair[0]);
    expect(aliveIds).toContain(nextPair[1]);
  });

  it('drives the league path through a live slice round without stalling', () => {
    const store = makeWildcardStore();
    store.dispatch(
      initWildcardWestern({
        participantIds: players,
        prizeType: 'LOH',
        seed: 55,
        humanPlayerId: 'alice',
      }),
    );
    store.dispatch(advanceIntro());
    store.dispatch(dealCardsAction());
    store.dispatch(advanceCardReveal());
    store.dispatch(advancePairIntro());
    store.dispatch(openBuzzWindow());

    const pair = store.getState().wildcardWestern.currentPair;
    expect(pair).not.toBeNull();
    store.dispatch(playerBuzz({ playerId: pair![0] }));
    store.dispatch(playerAnswer({ answerIndex: 0 }));
    store.dispatch(advanceResolution());

    const afterResolution = store.getState().wildcardWestern;
    expect(['pairIntro', 'leagueResults']).toContain(afterResolution.phase);
    expect(afterResolution.aliveIds).toHaveLength(4);
  });

  it('makes a final no-buzz duel cost one life without eliminating both finalists', () => {
    const store = makeWildcardStore();
    store.dispatch(
      initWildcardWestern({
        participantIds: ['alice', 'bob'],
        prizeType: 'LOH',
        seed: 88,
        humanPlayerId: 'alice',
      }),
    );
    store.dispatch(advanceIntro());
    store.dispatch(dealCardsAction());
    store.dispatch(advanceCardReveal());
    store.dispatch(advancePairIntro());
    store.dispatch(openBuzzWindow());
    store.dispatch(buzzTimeout());
    store.dispatch(advanceResolution());
    store.dispatch(startWildcardFinal());
    store.dispatch(playerChooseNextPair({ pair: ['alice', 'bob'] }));
    store.dispatch(advancePairIntro());
    store.dispatch(openBuzzWindow());
    store.dispatch(buzzTimeout());
    const afterTimeout = store.getState().wildcardWestern;
    expect(afterTimeout.phase).toBe('resolution');
    expect(afterTimeout.aliveIds).toHaveLength(2);
    expect(Object.values(afterTimeout.playerScores).sort()).toEqual([2, 3]);
  });

  it('handles answer timeout as a single-elimination result', () => {
    const store = makeWildcardStore();
    store.dispatch(
      initWildcardWestern({
        participantIds: players,
        prizeType: 'LOH',
        seed: 12,
        humanPlayerId: 'alice',
      }),
    );
    store.dispatch(advanceIntro());
    store.dispatch(dealCardsAction());
    store.dispatch(advanceCardReveal());
    store.dispatch(advancePairIntro());
    store.dispatch(openBuzzWindow());
    store.dispatch(playerBuzz({ playerId: store.getState().wildcardWestern.currentPair![0] }));
    store.dispatch(answerTimeout());

    const afterTimeout = store.getState().wildcardWestern;
    expect(afterTimeout.lastDuelOutcome).toBe('timeout');
    expect(afterTimeout.phase).toBe('resolution');
  });
});

describe('Glass Bridge audit', () => {
  it('builds the timer from player count and generates deterministic bridge rows', () => {
    expect(buildGlassBridgeTimeLimitMs(4)).toBe(64_000);

    const rowsA = generateBridgeRows(mulberry32(5), 6);
    const rowsB = generateBridgeRows(mulberry32(5), 6);
    expect(rowsA).toEqual(rowsB);
  });

  it('produces deterministic AI number choices and respects already chosen numbers', () => {
    const participantIds = ['alice', 'bob', 'carol', 'dave'];
    const first = buildAiNumberChoices(participantIds, 'alice', { alice: 3 }, mulberry32(9));
    const second = buildAiNumberChoices(participantIds, 'alice', { alice: 3 }, mulberry32(9));

    expect(first).toEqual(second);
    expect(Object.keys(first)).not.toContain('alice');
    expect(new Set(Object.values({ ...first, alice: 3 })).size).toBe(4);
  });

  it('keeps obvious-safe AI decisions and simulated turns internally consistent', () => {
    const rows = generateBridgeRows(mulberry32(14), 5);
    const decision = simulateAiTurn(rows, mulberry32(77));

    expect(decision.length).toBeGreaterThan(0);
    const last = decision[decision.length - 1];
    expect(['safe', 'break']).toContain(last.result);
    expect(decision[0]?.row).toBe(1);
  });

  it('orders finishers before non-finishers and keeps tie-breaks stable', () => {
    const progress: Record<string, GlassBridgePlayerProgress> = {
      a: makeGlassProgress({ finishTimeMs: 40_000, furthestRowReached: 16, hintPenaltyMs: 0 }, 'a'),
      b: makeGlassProgress({ finishTimeMs: 35_000, furthestRowReached: 16, hintPenaltyMs: 15_000 }, 'b'),
      c: makeGlassProgress({ furthestRowReached: 9, eliminated: true, timeReachedFurthestRowMs: 12_000 }, 'c'),
      d: makeGlassProgress({ furthestRowReached: 9, eliminated: true, timeReachedFurthestRowMs: 12_000 }, 'd'),
    };

    const placements = buildPlacements(progress, ['d', 'c', 'b', 'a']);
    expect(placements[0]).toBe('a');
    expect(placements[1]).toBe('b');
    expect(placements.slice(2)).toEqual(['d', 'c']);
  });

  it('drives a round from init through resolveStep without losing progress invariants', () => {
    const store = makeGlassStore();
    store.dispatch(
      initGlassBridge({
        participantIds: ['alice', 'bob', 'carol'],
        participants: [
          { id: 'alice', name: 'alice', isHuman: true },
          { id: 'bob', name: 'bob', isHuman: false },
          { id: 'carol', name: 'carol', isHuman: false },
        ],
        competitionType: 'LOH',
        seed: 21,
        rowsCount: 4,
        humanPlayerId: 'alice',
      }),
    );

    store.dispatch(recordNumberChoice({ playerId: 'alice', number: 1 }));
    store.dispatch(recordNumberChoice({ playerId: 'bob', number: 2 }));
    store.dispatch(recordNumberChoice({ playerId: 'carol', number: 3 }));
    store.dispatch(finaliseOrderSelection());
    store.dispatch(startPlaying({ now: T0 }));

    const gb = store.getState().glassBridge;
    const row = gb.rows[0];
    store.dispatch(resolveStep({ chosenSide: row.safeSide, now: T0 + 1000 }));

    const updated = store.getState().glassBridge;
    const activeId = updated.turnOrder[0];
    expect(updated.progress[activeId].furthestRowReached).toBe(1);
    expect(updated.progress[activeId].eliminated).toBe(false);
    expect(updated.rows[0].revealedSafeSide).toBe(row.safeSide);
  });

  it('completes the game when the timer expires or the final state is resolved', () => {
    const store = makeGlassStore();
    store.dispatch(
      initGlassBridge({
        participantIds: ['alice', 'bob'],
        competitionType: 'LOH',
        seed: 31,
        rowsCount: 3,
        humanPlayerId: 'alice',
      }),
    );
    store.dispatch(recordNumberChoice({ playerId: 'alice', number: 1 }));
    store.dispatch(recordNumberChoice({ playerId: 'bob', number: 2 }));
    store.dispatch(finaliseOrderSelection());
    store.dispatch(startPlaying({ now: T0 }));
    store.dispatch(expireTimer());
    store.dispatch(completeGame());

    const final = store.getState().glassBridge;
    expect(final.phase).toBe('complete');
    expect(final.placements).toHaveLength(2);
    expect(final.winnerId).not.toBeNull();
    expect(final.currentTurnIndex).toBeGreaterThanOrEqual(0);
  });

  it('keeps the state machine deterministic across repeated simulation runs', () => {
    function run(seed: number) {
      const store = makeGlassStore();
      store.dispatch(
        initGlassBridge({
          participantIds: ['alice', 'bob', 'carol', 'dave'],
          competitionType: 'LOH',
          seed,
          rowsCount: 5,
        }),
      );

      const choices = buildAiNumberChoices(['alice', 'bob', 'carol', 'dave'], null, {}, mulberry32(seed + 1));
      for (const [playerId, number] of Object.entries(choices)) {
        store.dispatch(recordNumberChoice({ playerId, number }));
      }
      store.dispatch(finaliseOrderSelection());
      store.dispatch(startPlaying({ now: T0 }));

      let current = store.getState().glassBridge;
      let guard = 0;
      while (current.phase === 'playing' && guard < 100) {
        guard++;
        const activeId = current.turnOrder[current.currentTurnIndex];
        if (!activeId) break;
        const progress = current.progress[activeId];
        if (!progress || progress.eliminated || progress.finishTimeMs !== undefined) {
          store.dispatch(advanceTurn());
          current = store.getState().glassBridge;
          continue;
        }
        const row = current.rows[current.currentPlayerRow - 1];
        store.dispatch(resolveStep({ chosenSide: row.safeSide, now: T0 + guard * 100 }));
        current = store.getState().glassBridge;
      }

      store.dispatch(completeGame());
      return store.getState().glassBridge;
    }

    const first = run(123);
    const second = run(123);

    expect(first.placements).toEqual(second.placements);
    expect(first.winnerId).toEqual(second.winnerId);
  });
});
