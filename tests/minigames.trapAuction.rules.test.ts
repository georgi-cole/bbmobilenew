import { describe, expect, it } from 'vitest';

import {
  applyBidCosts,
  buildRoundReveals,
  clearBidsForRematch,
  computeAiBids,
  createInitialPlayers,
  eliminatePlayers,
  findHighestBidder,
  findLowestBidders,
  getAllowedBidRange,
  isCompleteTie,
  isUnbreakableTie,
  nextPlacementFor,
  resolveTieWinner,
} from '../src/components/TrapAuction/trapAuctionHelpers';
import { MOCK_PARTICIPANTS, TRAP_AUCTION_CONFIG } from '../src/components/TrapAuction/trapAuctionTypes';

describe('Trap Auction rules', () => {
  it('assigns stable players and allowed bid ranges', () => {
    const players = createInitialPlayers(MOCK_PARTICIPANTS.slice(0, 3), 42);
    expect(players).toHaveLength(3);
    expect(players.every((player) => player.bank === TRAP_AUCTION_CONFIG.startingBank)).toBe(true);
    expect(players[0].personality).toBe('balanced');

    expect(getAllowedBidRange(players[1], 1)).toEqual({
      min: 1,
      max: 100,
      recommended: 50,
    });
    expect(getAllowedBidRange({ ...players[1], bank: 0 }, 1)).toEqual({
      min: 0,
      max: 0,
      recommended: 0,
    });
  });

  it('computes AI bids inside the legal range and preserves human bids', () => {
    const roster = createInitialPlayers(MOCK_PARTICIPANTS.slice(0, 4), 99).map((player, index) =>
      index === 0 ? { ...player, currentBid: 12 } : { ...player, currentBid: null },
    );

    const withBids = computeAiBids(roster, { round: 3, players: roster }, 12345);
    expect(withBids[0].currentBid).toBe(12);

    for (const player of withBids.slice(1)) {
      const range = getAllowedBidRange(player, 3);
      expect(player.currentBid).not.toBeNull();
      expect(player.currentBid ?? 0).toBeGreaterThanOrEqual(range.min);
      expect(player.currentBid ?? 0).toBeLessThanOrEqual(range.max);
    }

    expect(computeAiBids(roster, { round: 3, players: roster }, 12345)).toEqual(withBids);
  });

  it('identifies highest and lowest bidders and reveal order', () => {
    const players = createInitialPlayers(MOCK_PARTICIPANTS.slice(0, 4), 11).map((player, index) => ({
      ...player,
      currentBid: [10, 30, 20, 10][index],
    }));

    expect(findLowestBidders(players).sort()).toEqual([players[0].id, players[3].id].sort());
    expect(findHighestBidder(players)).toBe(players[1].id);

    const reveals = buildRoundReveals(players);
    expect(reveals[0].playerId).toBe(players[1].id);
    expect(reveals[0].isHighest).toBe(true);
    expect(reveals.slice(1).every((entry) => entry.isLowest)).toBe(true);

    const tieReveals = buildRoundReveals(players.map((player) => ({ ...player, currentBid: 5 })));
    expect(tieReveals).toHaveLength(1);
    expect(tieReveals[0].isHighest).toBe(true);
    expect(tieReveals[0].isLowest).toBe(true);
  });

  it('applies round outcomes and tie safeguards deterministically', () => {
    const players = createInitialPlayers(MOCK_PARTICIPANTS.slice(0, 4), 11).map((player, index) => ({
      ...player,
      currentBid: [10, 30, 20, 10][index],
    }));

    const afterCosts = applyBidCosts(players, 1);
    expect(afterCosts[0].bank).toBe(TRAP_AUCTION_CONFIG.startingBank - 10);
    expect(afterCosts[1].currentBid).toBeNull();
    expect(nextPlacementFor(afterCosts)).toBe(4);

    const eliminated = eliminatePlayers(afterCosts, [players[0].id, players[3].id], 2, nextPlacementFor(afterCosts));
    expect(eliminated.filter((player) => !player.isAlive).map((player) => player.placement)).toEqual([4, 3]);

    expect(isCompleteTie(players.map((player) => ({ ...player, currentBid: 5 })))).toBe(true);
    expect(isUnbreakableTie(players.map((player) => ({ ...player, bank: 0, currentBid: 1 })))).toBe(true);

    const tiedBanks = afterCosts.map((player) => ({ ...player, bank: 50 }));
    const winner = resolveTieWinner(tiedBanks, 9);
    expect(winner).toBeTruthy();
    expect(tiedBanks.map((player) => player.id)).toContain(winner?.id);
    expect(resolveTieWinner(tiedBanks, 9)?.id).toBe(winner?.id);

    const rematch = clearBidsForRematch(
      players.map((player) => ({
        ...player,
        isExposed: true,
        currentBid: 12,
        bidRevealed: true,
      })),
    );
    expect(rematch.every((player) => !player.isExposed && player.currentBid === null && player.bidRevealed === false)).toBe(true);
  });
});
