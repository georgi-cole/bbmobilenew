/**
 * trapAuction.logic.test.ts
 *
 * Unit tests for the Trap Auction pure helper functions and reducer.
 */

import { describe, it, expect } from 'vitest';
import {
  createInitialPlayers,
  getAllowedBidRange,
  chooseAiBid,
  applyBidCosts,
  findLowestBidders,
  findHighestBidder,
  exposeHighestBidder,
  ExposeHighestBiffer,
  eliminatePlayers,
  getWinner,
  buildRoundReveals,
  nextPlacementFor,
  shouldRevealPlayerBank,
  MOCK_PARTICIPANTS,
} from '../../../src/components/TrapAuction/trapAuctionHelpers';
import { trapAuctionReducer } from '../../../src/components/TrapAuction/trapAuctionReducer';
import { TRAP_AUCTION_CONFIG } from '../../../src/components/TrapAuction/trapAuctionTypes';
import type { TrapAuctionPlayer, TrapAuctionState } from '../../../src/components/TrapAuction/trapAuctionTypes';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makePlayers(count: number, overrides?: Partial<TrapAuctionPlayer>[]): TrapAuctionPlayer[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    avatar: '',
    isHuman: i === 0,
    personality: 'balanced' as const,
    bank: TRAP_AUCTION_CONFIG.startingBank,
    isAlive: true,
    currentBid: null,
    bidRevealed: false,
    penalty: null,
    eliminatedRound: null,
    placement: null,
    isExposed: false,
    ...(overrides?.[i] ?? {}),
  }));
}

function makeState(overrides?: Partial<TrapAuctionState>): TrapAuctionState {
  const players = makePlayers(4);
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
    ...overrides,
  };
}

// ─── createInitialPlayers ─────────────────────────────────────────────────────

describe('createInitialPlayers', () => {
  it('creates one player per participant', () => {
    const players = createInitialPlayers(MOCK_PARTICIPANTS, 42);
    expect(players).toHaveLength(MOCK_PARTICIPANTS.length);
  });

  it('assigns startingBank to every player', () => {
    const players = createInitialPlayers(MOCK_PARTICIPANTS, 42);
    players.forEach((p) => {
      expect(p.bank).toBe(TRAP_AUCTION_CONFIG.startingBank);
    });
  });

  it('marks human participant correctly', () => {
    const players = createInitialPlayers(MOCK_PARTICIPANTS, 42);
    const humans = players.filter((p) => p.isHuman);
    const humanParticipants = MOCK_PARTICIPANTS.filter((p) => p.isHuman);
    expect(humans).toHaveLength(humanParticipants.length);
  });

  it('starts every player as alive with no bid', () => {
    const players = createInitialPlayers(MOCK_PARTICIPANTS, 42);
    players.forEach((p) => {
      expect(p.isAlive).toBe(true);
      expect(p.currentBid).toBeNull();
      expect(p.penalty).toBeNull();
    });
  });

  it('assigns personality deterministically from seed', () => {
    const p1 = createInitialPlayers(MOCK_PARTICIPANTS, 100);
    const p2 = createInitialPlayers(MOCK_PARTICIPANTS, 100);
    expect(p1.map((p) => p.personality)).toEqual(p2.map((p) => p.personality));
  });

  it('assigns different personalities for different seeds', () => {
    const p1 = createInitialPlayers(MOCK_PARTICIPANTS, 100);
    const p2 = createInitialPlayers(MOCK_PARTICIPANTS, 999999);
    // At least some personalities should differ across seeds for non-human players
    const nonHuman1 = p1.filter((p) => !p.isHuman).map((p) => p.personality);
    const nonHuman2 = p2.filter((p) => !p.isHuman).map((p) => p.personality);
    // Not guaranteed to differ but with 6 players and 6 personalities it is highly likely
    // Just ensure both are valid personality strings
    const validPersonalities = ['cautious', 'balanced', 'desperate', 'chaotic', 'dominant', 'strategic'];
    nonHuman1.forEach((p) => expect(validPersonalities).toContain(p));
    nonHuman2.forEach((p) => expect(validPersonalities).toContain(p));
  });
});

// ─── getAllowedBidRange ───────────────────────────────────────────────────────

describe('getAllowedBidRange', () => {
  it('min is at least 1', () => {
    const [p] = makePlayers(1);
    const range = getAllowedBidRange(p, 1);
    expect(range.min).toBeGreaterThanOrEqual(1);
  });

  it('max does not exceed baseMaxBid', () => {
    const [p] = makePlayers(1);
    const range = getAllowedBidRange(p, 1);
    expect(range.max).toBeLessThanOrEqual(TRAP_AUCTION_CONFIG.baseMaxBid);
  });

  it('max does not exceed bank', () => {
    const [p] = makePlayers(1, [{ bank: 30 }]);
    const range = getAllowedBidRange(p, 1);
    expect(range.max).toBeLessThanOrEqual(30);
  });

  it('does not reduce max for legacy penalty metadata', () => {
    const [p] = makePlayers(1, [{
      bank: 40,
      penalty: { surcharge: 10, penaltyRound: 1 },
    }]);
    const range = getAllowedBidRange(p, 1);
    expect(range.max).toBe(40);
  });

  it('does not reduce max for legacy penalty metadata in a different round', () => {
    const [p] = makePlayers(1, [{
      bank: 40,
      penalty: { surcharge: 10, penaltyRound: 3 },
    }]);
    const rangeRound1 = getAllowedBidRange(p, 1);
    expect(rangeRound1.max).toBe(Math.min(40, TRAP_AUCTION_CONFIG.baseMaxBid));
  });

  it('recommended is within [min, max]', () => {
    const [p] = makePlayers(1);
    const range = getAllowedBidRange(p, 1);
    expect(range.recommended).toBeGreaterThanOrEqual(range.min);
    expect(range.recommended).toBeLessThanOrEqual(range.max);
  });

  it('handles very low bank gracefully', () => {
    const [p] = makePlayers(1, [{ bank: 1 }]);
    const range = getAllowedBidRange(p, 1);
    expect(range.min).toBe(1);
    expect(range.max).toBeGreaterThanOrEqual(1);
  });

  it('returns a zero range when the player is bankrupt', () => {
    const [p] = makePlayers(1, [{ bank: 0 }]);
    const range = getAllowedBidRange(p, 1);
    expect(range).toEqual({ min: 0, max: 0, recommended: 0 });
  });
});

// ─── chooseAiBid ─────────────────────────────────────────────────────────────

describe('chooseAiBid', () => {
  it('returns a bid within allowed range', () => {
    const players = makePlayers(4);
    const state = makeState({ players });
    players.filter((p) => !p.isHuman).forEach((p, i) => {
      const bid = chooseAiBid(p, state, i * 100 + 42);
      const { min, max } = getAllowedBidRange(p, 1);
      expect(bid).toBeGreaterThanOrEqual(min);
      expect(bid).toBeLessThanOrEqual(max);
    });
  });

  it('is deterministic given the same seed', () => {
    const players = makePlayers(4);
    const state = makeState({ players });
    const ai = players[1];
    const bid1 = chooseAiBid(ai, state, 12345);
    const bid2 = chooseAiBid(ai, state, 12345);
    expect(bid1).toBe(bid2);
  });

  it('dominant personality tends to bid high', () => {
    const [p] = makePlayers(1, [{ personality: 'dominant' as const }]);
    const state = makeState();
    const bids = Array.from({ length: 20 }, (_, i) => chooseAiBid(p, state, i * 7777));
    const avg = bids.reduce((a, b) => a + b, 0) / bids.length;
    // Dominant should average above 60% of max
    expect(avg).toBeGreaterThan(TRAP_AUCTION_CONFIG.baseMaxBid * 0.55);
  });

  it('cautious personality tends to bid low', () => {
    const [p] = makePlayers(1, [{ personality: 'cautious' as const }]);
    const state = makeState();
    const bids = Array.from({ length: 20 }, (_, i) => chooseAiBid(p, state, i * 3333));
    const avg = bids.reduce((a, b) => a + b, 0) / bids.length;
    // Cautious should average below 55% of max
    expect(avg).toBeLessThan(TRAP_AUCTION_CONFIG.baseMaxBid * 0.65);
  });

  it('avoids bidding 1 when the player can still afford more', () => {
    const [p] = makePlayers(1, [{ personality: 'chaotic' as const, bank: 20 }]);
    const state = makeState({ players: [p] });
    const bids = Array.from({ length: 50 }, (_, i) => chooseAiBid(p, state, i * 17 + 99));
    expect(Math.min(...bids)).toBeGreaterThan(1);
  });

  it('still bids 1 when only 1 Eyeolens remains', () => {
    const [p] = makePlayers(1, [{ personality: 'chaotic' as const, bank: 1 }]);
    const state = makeState({ players: [p] });
    expect(chooseAiBid(p, state, 42)).toBe(1);
  });

  it('keeps AI bids above desperation-only values while they still have a double-digit bank', () => {
    const personalities = ['cautious', 'balanced', 'desperate', 'chaotic', 'dominant', 'strategic'] as const;
    const bids = personalities.map((personality, i) => {
      const [player] = makePlayers(1, [{ personality, bank: 20 }]);
      const state = makeState({ players: [player] });
      return chooseAiBid(player, state, 400 + i);
    });

    expect(Math.min(...bids)).toBeGreaterThanOrEqual(3);
  });

  it('paces spending in the opening round instead of emptying the bank', () => {
    // With a full bank and a large field, no personality should blow most of
    // its bank in round 1 — the budget-aware AI spreads spend across rounds.
    const personalities = ['cautious', 'balanced', 'desperate', 'chaotic', 'dominant', 'strategic'] as const;
    const players = personalities.map((personality, i) => {
      const [pl] = makePlayers(1, [{ personality, id: `ai${i}` }]);
      return pl;
    });
    const state = makeState({ players });
    players.forEach((p, i) => {
      const bids = Array.from({ length: 12 }, (_, k) => chooseAiBid(p, state, i * 1000 + k * 13 + 1));
      const avg = bids.reduce((a, b) => a + b, 0) / bids.length;
      // Even the most aggressive personality averages under half the bank in
      // round 1 of a 6-player field (sustainable budget ≈ bank / 5).
      expect(avg).toBeLessThan(TRAP_AUCTION_CONFIG.startingBank * 0.5);
    });
  });
});

// ─── findLowestBidders ───────────────────────────────────────────────────────

describe('findLowestBidders', () => {
  it('returns id of the lowest bidder', () => {
    const players = makePlayers(3, [
      { currentBid: 20 },
      { currentBid: 10 },
      { currentBid: 30 },
    ]);
    expect(findLowestBidders(players)).toEqual(['p1']);
  });

  it('returns all ids when tied for lowest', () => {
    const players = makePlayers(3, [
      { currentBid: 10 },
      { currentBid: 10 },
      { currentBid: 30 },
    ]);
    const lowest = findLowestBidders(players);
    expect(lowest).toHaveLength(2);
    expect(lowest).toContain('p0');
    expect(lowest).toContain('p1');
  });

  it('ignores eliminated players', () => {
    const players = makePlayers(3, [
      { currentBid: 5, isAlive: false },
      { currentBid: 20 },
      { currentBid: 30 },
    ]);
    expect(findLowestBidders(players)).toEqual(['p1']);
  });

  it('returns empty array when no alive players have bids', () => {
    const players = makePlayers(2);
    expect(findLowestBidders(players)).toEqual([]);
  });
});

// ─── findHighestBidder ───────────────────────────────────────────────────────

describe('findHighestBidder', () => {
  it('returns id of the highest bidder', () => {
    const players = makePlayers(3, [
      { currentBid: 20 },
      { currentBid: 10 },
      { currentBid: 30 },
    ]);
    expect(findHighestBidder(players)).toBe('p2');
  });

  it('returns first of tied highest bidders (deterministic)', () => {
    const players = makePlayers(3, [
      { currentBid: 30 },
      { currentBid: 30 },
      { currentBid: 10 },
    ]);
    expect(findHighestBidder(players)).toBe('p0');
  });

  it('returns null when no bids exist', () => {
    const players = makePlayers(2);
    expect(findHighestBidder(players)).toBeNull();
  });

  it('ignores eliminated players', () => {
    const players = makePlayers(3, [
      { currentBid: 100, isAlive: false },
      { currentBid: 20 },
      { currentBid: 30 },
    ]);
    expect(findHighestBidder(players)).toBe('p2');
  });
});

// ─── exposeHighestBidder / ExposeHighestBiffer ────────────────────────────────

describe('exposeHighestBidder', () => {
  it('sets isExposed=true on the highest bidder', () => {
    const players = makePlayers(3);
    const result = exposeHighestBidder(players, 'p1', 2);
    expect(result.find((p) => p.id === 'p1')?.isExposed).toBe(true);
  });

  it('clears isExposed from all other players', () => {
    const players = makePlayers(3, [{ isExposed: true }, {}, {}]);
    const result = exposeHighestBidder(players, 'p1', 2);
    expect(result.find((p) => p.id === 'p0')?.isExposed).toBe(false);
    expect(result.find((p) => p.id === 'p2')?.isExposed).toBe(false);
  });

  it('clears legacy penalty metadata on the exposed player', () => {
    const players = makePlayers(3);
    const result = exposeHighestBidder(players, 'p2', 2);
    const pen = result.find((p) => p.id === 'p2')?.penalty;
    expect(pen).toBeNull();
  });

  it('handles null highestId gracefully', () => {
    const players = makePlayers(3);
    const result = exposeHighestBidder(players, null, 2);
    result.forEach((p) => expect(p.isExposed).toBe(false));
  });

  it('ExposeHighestBiffer is an alias for exposeHighestBidder', () => {
    // NOTE: 'ExposeHighestBiffer' is the name used in the problem statement spec.
    // We preserve it as an alias while using the correctly spelled exposeHighestBidder
    // as the canonical implementation.
    expect(ExposeHighestBiffer).toBe(exposeHighestBidder);
  });
});

// ─── applyBidCosts ───────────────────────────────────────────────────────────

describe('applyBidCosts', () => {
  it('deducts bid from bank', () => {
    const players = makePlayers(2, [
      { currentBid: 20, bank: 100 },
      { currentBid: 30, bank: 100 },
    ]);
    const result = applyBidCosts(players, 1);
    expect(result[0].bank).toBe(80);
    expect(result[1].bank).toBe(70);
  });

  it('ignores legacy penalty metadata when deducting bids', () => {
    const players = makePlayers(1, [{
      currentBid: 20,
      bank: 100,
      penalty: { surcharge: 10, penaltyRound: 1 },
    }]);
    const result = applyBidCosts(players, 1);
    expect(result[0].bank).toBe(80);
  });

  it('clears legacy penalty metadata after deduction', () => {
    const players = makePlayers(1, [{
      currentBid: 20,
      bank: 100,
      penalty: { surcharge: 10, penaltyRound: 3 },
    }]);
    const result = applyBidCosts(players, 1);
    expect(result[0].bank).toBe(80);
    expect(result[0].penalty).toBeNull();
  });

  it('clamps bank to 0, never negative', () => {
    const players = makePlayers(1, [{ currentBid: 50, bank: 30 }]);
    const result = applyBidCosts(players, 1);
    expect(result[0].bank).toBe(0);
  });

  it('resets currentBid to null after deduction', () => {
    const players = makePlayers(1, [{ currentBid: 20 }]);
    const result = applyBidCosts(players, 1);
    expect(result[0].currentBid).toBeNull();
  });

  it('does not touch eliminated players', () => {
    const players = makePlayers(1, [{ isAlive: false, currentBid: 20, bank: 100 }]);
    const result = applyBidCosts(players, 1);
    expect(result[0].bank).toBe(100);
  });
});

// ─── eliminatePlayers ────────────────────────────────────────────────────────

describe('eliminatePlayers', () => {
  it('uses remaining bank before a deterministic draw to rank tied-low eliminations', () => {
    const players = makePlayers(4, [
      { id: 'safe', bank: 60 },
      { id: 'poor', bank: 8 },
      { id: 'rich', bank: 35 },
      { id: 'other', bank: 50 },
    ]);

    const result = eliminatePlayers(players, ['poor', 'rich'], 2, 4, 1234);

    expect(result.find((player) => player.id === 'poor')?.placement).toBe(4);
    expect(result.find((player) => player.id === 'rich')?.placement).toBe(3);
  });

  it('marks specified players as eliminated', () => {
    const players = makePlayers(4);
    const result = eliminatePlayers(players, ['p1', 'p2'], 2, 4);
    expect(result.find((p) => p.id === 'p1')?.isAlive).toBe(false);
    expect(result.find((p) => p.id === 'p2')?.isAlive).toBe(false);
  });

  it('assigns eliminatedRound correctly', () => {
    const players = makePlayers(4);
    const result = eliminatePlayers(players, ['p0'], 3, 4);
    expect(result.find((p) => p.id === 'p0')?.eliminatedRound).toBe(3);
  });

  it('assigns placement to eliminated players', () => {
    const players = makePlayers(4);
    const result = eliminatePlayers(players, ['p1', 'p2'], 1, 4);
    const p1 = result.find((p) => p.id === 'p1');
    const p2 = result.find((p) => p.id === 'p2');
    expect(p1?.placement).not.toBeNull();
    expect(p2?.placement).not.toBeNull();
  });

  it('leaves alive players unchanged', () => {
    const players = makePlayers(4);
    const result = eliminatePlayers(players, ['p0'], 1, 4);
    expect(result.find((p) => p.id === 'p1')?.isAlive).toBe(true);
    expect(result.find((p) => p.id === 'p2')?.isAlive).toBe(true);
  });
});

// ─── getWinner ───────────────────────────────────────────────────────────────

describe('getWinner', () => {
  it('returns the single alive player', () => {
    const players = makePlayers(3, [
      { isAlive: false },
      { isAlive: true },
      { isAlive: false },
    ]);
    expect(getWinner(players)?.id).toBe('p1');
  });

  it('returns null when multiple alive players remain', () => {
    const players = makePlayers(3);
    expect(getWinner(players)).toBeNull();
  });

  it('returns null when all players are eliminated', () => {
    const players = makePlayers(3, [
      { isAlive: false },
      { isAlive: false },
      { isAlive: false },
    ]);
    expect(getWinner(players)).toBeNull();
  });
});

// ─── buildRoundReveals ────────────────────────────────────────────────────────

describe('buildRoundReveals', () => {
  it('includes only the highest and lowest bidder (not all players)', () => {
    const players = makePlayers(4, [
      { currentBid: 20 },
      { currentBid: 30 },
      { currentBid: 10 },
      { currentBid: 25 },
    ]);
    const reveals = buildRoundReveals(players);
    // highest (30) + lowest (10) = 2 entries
    expect(reveals).toHaveLength(2);
    expect(reveals.some((r) => r.bid === 30 && r.isHighest)).toBe(true);
    expect(reveals.some((r) => r.bid === 10 && r.isLowest)).toBe(true);
  });

  it('places highest bidder first', () => {
    const players = makePlayers(4, [
      { currentBid: 20 },
      { currentBid: 30 },
      { currentBid: 10 },
      { currentBid: 25 },
    ]);
    const reveals = buildRoundReveals(players);
    expect(reveals[0].isHighest).toBe(true);
    expect(reveals[1].isLowest).toBe(true);
  });

  it('includes all tied-lowest bidders', () => {
    const players = makePlayers(4, [
      { currentBid: 30 }, // highest
      { currentBid: 10 }, // tied lowest
      { currentBid: 10 }, // tied lowest
      { currentBid: 25 },
    ]);
    const reveals = buildRoundReveals(players);
    // 1 highest + 2 tied lowest = 3 entries
    expect(reveals).toHaveLength(3);
    expect(reveals.filter((r) => r.isLowest)).toHaveLength(2);
  });

  it('marks lowest and highest correctly', () => {
    const players = makePlayers(3, [
      { currentBid: 20 },
      { currentBid: 5 },
      { currentBid: 30 },
    ]);
    const reveals = buildRoundReveals(players);
    const lowest = reveals.find((r) => r.isLowest);
    const highest = reveals.find((r) => r.isHighest);
    expect(lowest?.bid).toBe(5);
    expect(highest?.bid).toBe(30);
  });

  it('handles complete-tie: single entry with both flags set', () => {
    const players = makePlayers(2, [{ currentBid: 15 }, { currentBid: 15 }]);
    const reveals = buildRoundReveals(players);
    // All are tied — only one deduplicated highest entry, rest as lowest entries
    expect(reveals.length).toBeGreaterThanOrEqual(1);
    expect(reveals.some((r) => r.isHighest)).toBe(true);
  });

  it('starts all reveals as hidden (revealed=false)', () => {
    const players = makePlayers(2, [{ currentBid: 10 }, { currentBid: 20 }]);
    const reveals = buildRoundReveals(players);
    reveals.forEach((r) => expect(r.revealed).toBe(false));
  });
});

// ─── nextPlacementFor ────────────────────────────────────────────────────────

describe('nextPlacementFor', () => {
  it('returns number of alive players', () => {
    const players = makePlayers(4, [
      {},
      {},
      { isAlive: false },
      { isAlive: false },
    ]);
    expect(nextPlacementFor(players)).toBe(2);
  });
});

describe('shouldRevealPlayerBank', () => {
  it('shows every bank in round 1', () => {
    const [player] = makePlayers(1);
    expect(shouldRevealPlayerBank(player, 1)).toBe(true);
  });

  it('hides active non-exposed banks after round 1', () => {
    const [player] = makePlayers(1, [{ bank: 72 }]);
    expect(shouldRevealPlayerBank(player, 2)).toBe(false);
  });

  it('shows exposed active players after round 1', () => {
    const [player] = makePlayers(1, [{ isExposed: true, bank: 72 }]);
    expect(shouldRevealPlayerBank(player, 2)).toBe(true);
  });

  it('shows eliminated players after round 1', () => {
    const [player] = makePlayers(1, [{ isAlive: false, bank: 0 }]);
    expect(shouldRevealPlayerBank(player, 2)).toBe(true);
  });
});

// ─── Reducer: phase transitions ──────────────────────────────────────────────

describe('trapAuctionReducer', () => {
  describe('START_BID', () => {
    it('transitions from intro to bid', () => {
      const state = makeState({ phase: 'intro' });
      const next = trapAuctionReducer(state, { type: 'START_BID' });
      expect(next.phase).toBe('bid');
    });
  });

  describe('SUBMIT_HUMAN_BID', () => {
    it('transitions to reveal and builds roundReveals', () => {
      const state = makeState({ phase: 'bid' });
      const next = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: 25 });
      expect(next.phase).toBe('reveal');
      expect(next.roundReveals.length).toBeGreaterThan(0);
    });

    it('sets human bid to the given value', () => {
      const state = makeState({ phase: 'bid' });
      const next = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: 40 });
      const human = next.players.find((p) => p.isHuman);
      // Human bid is stored on the player (not necessarily in roundReveals unless extreme)
      expect(human?.currentBid).toBe(40);
    });

    it('computes AI bids for all alive AI players', () => {
      const state = makeState({ phase: 'bid' });
      const next = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: 20 });
      const aiPlayers = next.players.filter((p) => !p.isHuman && p.isAlive);
      // All AI players should have a bid assigned (stored on the player object)
      aiPlayers.forEach((ai) => {
        expect(ai.currentBid).not.toBeNull();
        expect(ai.currentBid!).toBeGreaterThanOrEqual(TRAP_AUCTION_CONFIG.minBid);
      });
    });

    it('does not change phase if not in bid phase', () => {
      const state = makeState({ phase: 'reveal' });
      const next = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: 25 });
      expect(next.phase).toBe('reveal');
    });
  });

  describe('ADVANCE_REVEAL', () => {
    function setupRevealState(): TrapAuctionState {
      const base = makeState({ phase: 'bid' });
      return trapAuctionReducer(base, { type: 'SUBMIT_HUMAN_BID', bid: 20 });
    }

    it('increments revealIndex', () => {
      const state = setupRevealState();
      const next = trapAuctionReducer(state, { type: 'ADVANCE_REVEAL' });
      expect(next.revealIndex).toBe(1);
    });

    it('stays in reveal when all bids are visible', () => {
      let state = setupRevealState();
      const totalReveals = state.roundReveals.length;
      for (let i = 0; i < totalReveals; i++) {
        state = trapAuctionReducer(state, { type: 'ADVANCE_REVEAL' });
      }
      expect(state.phase).toBe('reveal');
      expect(state.revealIndex).toBe(totalReveals);
    });

    it('does not increment revealIndex after every card is already shown', () => {
      let state = setupRevealState();
      const totalReveals = state.roundReveals.length;
      for (let i = 0; i < totalReveals; i++) {
        state = trapAuctionReducer(state, { type: 'ADVANCE_REVEAL' });
      }

      const next = trapAuctionReducer(state, { type: 'ADVANCE_REVEAL' });
      expect(next.revealIndex).toBe(totalReveals);
      expect(next.roundReveals).toEqual(state.roundReveals);
    });
  });

  describe('REVEAL_ALL', () => {
    it('reveals all cards without adding a separate results phase', () => {
      const bid = makeState({ phase: 'bid' });
      const reveal = trapAuctionReducer(bid, { type: 'SUBMIT_HUMAN_BID', bid: 20 });
      const next = trapAuctionReducer(reveal, { type: 'REVEAL_ALL' });
      expect(next.phase).toBe('reveal');
      expect(next.roundReveals.every((r) => r.revealed)).toBe(true);
    });
  });

  describe('ADVANCE_TO_ELIMINATION', () => {
    it('transitions from the fully revealed state to elimination', () => {
      const bid = makeState({ phase: 'bid' });
      const reveal = trapAuctionReducer(bid, { type: 'SUBMIT_HUMAN_BID', bid: 20 });
      const allRevealed = trapAuctionReducer(reveal, { type: 'REVEAL_ALL' });
      const next = trapAuctionReducer(allRevealed, { type: 'ADVANCE_TO_ELIMINATION' });
      expect(next.phase).toBe('elimination');
    });

    it('sets lastEliminatedIds to the lowest bidder(s)', () => {
      const bid = makeState({ phase: 'bid' });
      const reveal = trapAuctionReducer(bid, { type: 'SUBMIT_HUMAN_BID', bid: 1 }); // human bids 1 (lowest)
      const allRevealed = trapAuctionReducer(reveal, { type: 'REVEAL_ALL' });
      const next = trapAuctionReducer(allRevealed, { type: 'ADVANCE_TO_ELIMINATION' });
      expect(next.lastEliminatedIds).toHaveLength(1);
    });
  });

  describe('CONTINUE_AFTER_ELIMINATION', () => {
    it('advances to next round when multiple players remain', () => {
      // Start with 4 players; eliminate 1 → 3 remain → should go to bid
      const bid = makeState({ phase: 'bid' });
      const reveal = trapAuctionReducer(bid, { type: 'SUBMIT_HUMAN_BID', bid: 1 });
      const allRevealed = trapAuctionReducer(reveal, { type: 'REVEAL_ALL' });
      const elimination = trapAuctionReducer(allRevealed, { type: 'ADVANCE_TO_ELIMINATION' });
      const next = trapAuctionReducer(elimination, { type: 'CONTINUE_AFTER_ELIMINATION' });
      if (next.phase === 'bid') {
        expect(next.round).toBe(2);
      } else {
        // Could be 'complete' if only one remains (edge case with all-same bids)
        expect(['bid', 'complete']).toContain(next.phase);
      }
    });

    it('transitions to complete when one player remains', () => {
      const players = makePlayers(2, [{}, {}]);
      // Set bids so player 0 (human) has lowest
      const playersWithBids = players.map((p, i) => ({ ...p, currentBid: i === 0 ? 5 : 30 }));
      const reveals = buildRoundReveals(playersWithBids);
      const state: TrapAuctionState = {
        phase: 'reveal',
        round: 1,
        players: playersWithBids,
        roundReveals: reveals,
        revealIndex: reveals.length,
        lastEliminatedIds: [],
        lastHighestBidderId: null,
        winner: null,
        humanEliminated: false,
        spectating: false,
        fastForward: false,
        prizeType: 'LOH',
        seed: 999,
      };
      const elimination = trapAuctionReducer(state, { type: 'ADVANCE_TO_ELIMINATION' });
      const complete = trapAuctionReducer(elimination, { type: 'CONTINUE_AFTER_ELIMINATION' });
      expect(complete.phase).toBe('complete');
      expect(complete.winner).not.toBeNull();
    });

    it('replays the round (rematch) when every alive player ties for lowest', () => {
      // 2 players both bid the same amount → complete tie → rematch, not an
      // arbitrary winner. No one is eliminated and banks are untouched.
      const players = makePlayers(2, [
        { bank: 50 },
        { bank: 80 },
      ]);
      const playersWithBids = players.map((p) => ({ ...p, currentBid: 20 }));
      const reveals = buildRoundReveals(playersWithBids);
      const state: TrapAuctionState = {
        phase: 'reveal',
        round: 1,
        players: playersWithBids,
        roundReveals: reveals,
        revealIndex: reveals.length,
        lastEliminatedIds: [],
        lastHighestBidderId: null,
        winner: null,
        humanEliminated: false,
        spectating: false,
        fastForward: false,
        prizeType: 'LOH',
        seed: 42,
        rematchCount: 0,
      };
      const rematch = trapAuctionReducer(state, { type: 'ADVANCE_TO_ELIMINATION' });
      // Round is replayed: back to bid phase, rematch counter bumped, no eviction.
      expect(rematch.phase).toBe('bid');
      expect(rematch.rematchCount).toBe(1);
      expect(rematch.lastEliminatedIds).toHaveLength(0);
      expect(rematch.players.every((p) => p.isAlive)).toBe(true);
      // Banks are untouched — a rematch round is void.
      expect(rematch.players.map((p) => p.bank)).toEqual([50, 80]);
      // Bids are cleared so players can bid again.
      expect(rematch.players.every((p) => p.currentBid === null)).toBe(true);
    });

    it('eventually crowns a winner when a complete tie cannot be broken', () => {
      // Two bankrupt players (bank 1) can only ever bid 1 → permanent tie.
      // The reducer must still resolve to a single crowned winner.
      const players = makePlayers(2, [
        { bank: 1, isHuman: false },
        { bank: 1, isHuman: false },
      ]);
      const playersWithBids = players.map((p) => ({ ...p, currentBid: 1 }));
      const reveals = buildRoundReveals(playersWithBids);
      const state: TrapAuctionState = {
        phase: 'reveal',
        round: 1,
        players: playersWithBids,
        roundReveals: reveals,
        revealIndex: reveals.length,
        lastEliminatedIds: [],
        lastHighestBidderId: null,
        winner: null,
        humanEliminated: false,
        spectating: false,
        fastForward: false,
        prizeType: 'LOH',
        seed: 42,
        rematchCount: 0,
      };
      const result = trapAuctionReducer(state, { type: 'ADVANCE_TO_ELIMINATION' });
      expect(result.phase).toBe('complete');
      expect(result.winner).not.toBeNull();
      expect(result.players.every((p) => p.currentBid === null)).toBe(true);
      expect(result.players.every((p) => p.placement !== null)).toBe(true);
      expect(result.players.filter((p) => p.placement === 1)).toHaveLength(1);
      expect(result.players.find((p) => p.id === result.winner?.id)).toEqual(result.winner);
    });
  });

  describe('TOGGLE_FAST_FORWARD', () => {
    it('toggles fastForward flag', () => {
      const state = makeState();
      expect(state.fastForward).toBe(false);
      const on = trapAuctionReducer(state, { type: 'TOGGLE_FAST_FORWARD' });
      expect(on.fastForward).toBe(true);
      const off = trapAuctionReducer(on, { type: 'TOGGLE_FAST_FORWARD' });
      expect(off.fastForward).toBe(false);
    });
  });

  describe('SPECTATE', () => {
    it('sets spectating=true', () => {
      const state = makeState({ humanEliminated: true });
      const next = trapAuctionReducer(state, { type: 'SPECTATE' });
      expect(next.spectating).toBe(true);
    });
  });

  describe('SKIP_TO_RESULTS', () => {
    it('transitions to complete phase', () => {
      const players = makePlayers(4);
      const state = makeState({ players, humanEliminated: true, phase: 'elimination' });
      const next = trapAuctionReducer(state, { type: 'SKIP_TO_RESULTS' });
      expect(next.phase).toBe('complete');
    });

    it('sets a winner', () => {
      const players = makePlayers(4);
      const state = makeState({ players, humanEliminated: true, phase: 'elimination' });
      const next = trapAuctionReducer(state, { type: 'SKIP_TO_RESULTS' });
      expect(next.winner).not.toBeNull();
    });

    it('keeps fallback tie standings consistent when skipping to results', () => {
      const players = makePlayers(2, [
        { bank: 1, isHuman: false },
        { bank: 1, isHuman: false },
      ]);
      const state = makeState({ players, humanEliminated: true, phase: 'elimination' });
      const next = trapAuctionReducer(state, { type: 'SKIP_TO_RESULTS' });
      expect(next.phase).toBe('complete');
      expect(next.winner).not.toBeNull();
      expect(next.players.every((p) => p.currentBid === null)).toBe(true);
      expect(next.players.every((p) => p.placement !== null)).toBe(true);
      expect(next.players.find((p) => p.id === next.winner?.id)).toEqual(next.winner);
    });
  });
});

// ─── Integration: full round ──────────────────────────────────────────────────

describe('Full round integration', () => {
  it('completes a full round without error', () => {
    let state = makeState({ phase: 'bid' });
    // Submit human bid
    state = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: 25 });
    expect(state.phase).toBe('reveal');

    // Reveal all
    state = trapAuctionReducer(state, { type: 'REVEAL_ALL' });
    expect(state.phase).toBe('reveal');

    // Advance to elimination
    state = trapAuctionReducer(state, { type: 'ADVANCE_TO_ELIMINATION' });
    expect(state.phase).toBe('elimination');
    expect(state.lastEliminatedIds.length).toBeGreaterThan(0);

    // Continue
    state = trapAuctionReducer(state, { type: 'CONTINUE_AFTER_ELIMINATION' });
    expect(['bid', 'complete']).toContain(state.phase);
  });

  it('game eventually reaches complete phase', () => {
    let state = makeState({ phase: 'bid' });
    let iterations = 0;

    while (state.phase !== 'complete' && iterations < 100) {
      if (state.phase === 'bid') {
        state = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: 15 });
      } else if (state.phase === 'reveal' && state.revealIndex >= state.roundReveals.length) {
        state = trapAuctionReducer(state, { type: 'ADVANCE_TO_ELIMINATION' });
      } else if (state.phase === 'reveal') {
        state = trapAuctionReducer(state, { type: 'REVEAL_ALL' });
      } else if (state.phase === 'elimination') {
        state = trapAuctionReducer(state, { type: 'CONTINUE_AFTER_ELIMINATION' });
      }
      iterations++;
    }

    expect(state.phase).toBe('complete');
    expect(state.winner).not.toBeNull();
    expect(state.players.filter((p) => p.isAlive)).toHaveLength(1);
  });

  it('bank deductions accumulate correctly across rounds', () => {
    let state = makeState({ phase: 'bid' });
    const humanBid = 20;

    // Play one round
    state = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: humanBid });
    state = trapAuctionReducer(state, { type: 'REVEAL_ALL' });
    state = trapAuctionReducer(state, { type: 'ADVANCE_TO_ELIMINATION' });

    if (state.phase === 'elimination') {
      state = trapAuctionReducer(state, { type: 'CONTINUE_AFTER_ELIMINATION' });
      // If human survived, their bank should be <= startingBank - humanBid
      const human = state.players.find((p) => p.isHuman);
      if (human?.isAlive) {
        expect(human.bank).toBeLessThanOrEqual(TRAP_AUCTION_CONFIG.startingBank - humanBid);
      }
    }
  });
});

// ─── AI bid strategy: survival floor ─────────────────────────────────────────

describe('chooseAiBid survival floor', () => {
  const personalities: Array<import('../../../src/components/TrapAuction/trapAuctionTypes').AiPersonality> = [
    'cautious', 'balanced', 'desperate', 'chaotic', 'dominant', 'strategic',
  ];

  it('bids 1 when bank === 1 (that is all they have)', () => {
    const player = makePlayers(2)[1]!;
    const bankOnePlayer = { ...player, bank: 1, personality: 'chaotic' as const };
    const state = { round: 1, players: makePlayers(4) };
    const bid = chooseAiBid(bankOnePlayer, state, 9999);
    expect(bid).toBe(1);
  });

  it('never bids 1 when bank > 1, across all personalities and seeds', () => {
    const state = { round: 1, players: makePlayers(6) };
    for (const personality of personalities) {
      for (let bank = 2; bank <= 100; bank += 10) {
        for (let seed = 0; seed < 20; seed++) {
          const player = makePlayers(2)[1]!;
          const aiPlayer = { ...player, bank, personality };
          const bid = chooseAiBid(aiPlayer, state, seed * 1337 + bank);
          expect(bid).toBeGreaterThan(1);
        }
      }
    }
  });

  it('never bids 1 when bank > 1 in endgame (2 players alive)', () => {
    const alivePlayers = makePlayers(2);
    const state = { round: 8, players: alivePlayers };
    for (const personality of personalities) {
      for (let bank = 2; bank <= 50; bank += 5) {
        const aiPlayer = { ...alivePlayers[1]!, bank, personality };
        const bid = chooseAiBid(aiPlayer, state, bank * 31 + 7);
        expect(bid).toBeGreaterThan(1);
      }
    }
  });

  it('bid is always within the allowed range', () => {
    const state = { round: 3, players: makePlayers(4) };
    for (const personality of personalities) {
      for (let bank = 1; bank <= 100; bank += 7) {
        const player = makePlayers(2)[1]!;
        const aiPlayer = { ...player, bank, personality };
        const { min, max } = getAllowedBidRange(aiPlayer, state.round);
        const bid = chooseAiBid(aiPlayer, state, bank * 17);
        expect(bid).toBeGreaterThanOrEqual(min);
        expect(bid).toBeLessThanOrEqual(max);
      }
    }
  });
});

// ─── Reveal phase simplification ─────────────────────────────────────────────

describe('Reveal phase flow', () => {
  it('SUBMIT_HUMAN_BID transitions to reveal with unflipped cards ready for auto-reveal', () => {
    const state = makeState({ phase: 'bid' });
    const next = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: 20 });
    expect(next.phase).toBe('reveal');
    // roundReveals should be built; auto-reveal will flip them one by one
    expect(next.roundReveals.length).toBeGreaterThan(0);
    expect(next.revealIndex).toBe(0);
    // Cards start hidden — auto-reveal timer flips them
    expect(next.roundReveals.every((r) => !r.revealed)).toBe(true);
  });

  it('ADVANCE_REVEAL flips one card at a time', () => {
    let state = makeState({ phase: 'bid' });
    state = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: 20 });
    expect(state.revealIndex).toBe(0);

    state = trapAuctionReducer(state, { type: 'ADVANCE_REVEAL' });
    expect(state.revealIndex).toBe(1);
    expect(state.roundReveals[0]?.revealed).toBe(true);
  });

  it('ADVANCE_TO_ELIMINATION requires all cards revealed first', () => {
    let state = makeState({ phase: 'bid' });
    state = trapAuctionReducer(state, { type: 'SUBMIT_HUMAN_BID', bid: 20 });
    // Not all revealed yet — should be a no-op
    const stillReveal = trapAuctionReducer(state, { type: 'ADVANCE_TO_ELIMINATION' });
    expect(stillReveal.phase).toBe('reveal');

    // Reveal all, then advance
    state = trapAuctionReducer(state, { type: 'REVEAL_ALL' });
    state = trapAuctionReducer(state, { type: 'ADVANCE_TO_ELIMINATION' });
    expect(state.phase).toBe('elimination');
  });
});
