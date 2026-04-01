/**
 * trapAuctionReducer.ts
 *
 * Pure React useReducer-compatible reducer for the Trap Auction minigame.
 *
 * Phase transitions:
 *  intro → bid → reveal → elimination → (bid | complete)
 *
 * Designed to be used with:
 *   const [state, dispatch] = useReducer(trapAuctionReducer, initialState);
 */

import type { TrapAuctionState } from './trapAuctionTypes';
import {
  computeAiBids,
  buildRoundReveals,
  findLowestBidders,
  findHighestBidder,
  exposeHighestBidder,
  applyBidCosts,
  eliminatePlayers,
  getWinner,
  nextPlacementFor,
} from './trapAuctionHelpers';
import { mulberry32 } from '../../store/rng';

// ─── Actions ──────────────────────────────────────────────────────────────────

export type TrapAuctionAction =
  /** Human (or spectator auto-advance) starts the first bid phase. */
  | { type: 'START_BID' }
  /** Human player submits their bid amount. Triggers AI bid computation. */
  | { type: 'SUBMIT_HUMAN_BID'; bid: number }
  /**
   * Reveal the next bid in the staged reveal sequence.
   * When all bids are revealed, transitions to 'resolve'.
   */
  | { type: 'ADVANCE_REVEAL' }
  /** Skip remaining hidden bids and reveal all at once. */
  | { type: 'REVEAL_ALL' }
  /** Human (or spectator) acknowledges the resolve screen and sees who was eliminated. */
  | { type: 'ADVANCE_TO_ELIMINATION' }
  /** Human (or spectator) acknowledges the elimination screen; starts next round or ends game. */
  | { type: 'CONTINUE_AFTER_ELIMINATION' }
  /** Human was eliminated and chooses to watch as a spectator. */
  | { type: 'SPECTATE' }
  /** Human was eliminated and chooses to skip to results. */
  | { type: 'SKIP_TO_RESULTS' }
  /** Toggle fast-forward mode for reveal/AI phases. */
  | { type: 'TOGGLE_FAST_FORWARD' };

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function trapAuctionReducer(
  state: TrapAuctionState,
  action: TrapAuctionAction,
): TrapAuctionState {
  switch (action.type) {

    // ── intro → bid ───────────────────────────────────────────────────────────
    case 'START_BID': {
      return { ...state, phase: 'bid' };
    }

    // ── bid: human submits bid → compute AI bids → build reveal sequence ─────
    case 'SUBMIT_HUMAN_BID': {
      if (state.phase !== 'bid') return state;

      // Apply human bid
      const withHumanBid = state.players.map((p) =>
        p.isHuman && p.isAlive ? { ...p, currentBid: action.bid } : p,
      );

      // Derive a deterministic per-round seed
      const roundSeed = (mulberry32((state.seed ^ (state.round * 0x9e3779b9)) >>> 0)() * 0x100000000) >>> 0;

      // Compute AI bids
      const withAllBids = computeAiBids(withHumanBid, { round: state.round, players: withHumanBid }, roundSeed);

      // Build reveal sequence
      const roundReveals = buildRoundReveals(withAllBids);

      return {
        ...state,
        players: withAllBids,
        roundReveals,
        revealIndex: 0,
        phase: 'reveal',
      };
    }

    // ── reveal: flip next card ────────────────────────────────────────────────
    case 'ADVANCE_REVEAL': {
      if (state.phase !== 'reveal') return state;
      if (state.revealIndex >= state.roundReveals.length) return state;

      const nextIndex = state.revealIndex + 1;

      // Mark the just-revealed bid in roundReveals
      const updatedReveals = state.roundReveals.map((r, i) =>
        i < nextIndex ? { ...r, revealed: true } : r,
      );

      // Also update bidRevealed on the player
      const revealedId = state.roundReveals[state.revealIndex]?.playerId;
      const updatedPlayers = state.players.map((p) =>
        p.id === revealedId ? { ...p, bidRevealed: true } : p,
      );

      const allRevealed = nextIndex >= state.roundReveals.length;

       if (allRevealed) {
         return {
           ...state,
           players: updatedPlayers,
           roundReveals: updatedReveals,
           revealIndex: nextIndex,
         };
       }

      return {
        ...state,
        players: updatedPlayers,
        roundReveals: updatedReveals,
        revealIndex: nextIndex,
      };
    }

    // ── reveal: reveal all at once (fast-forward) ─────────────────────────────
    case 'REVEAL_ALL': {
      if (state.phase !== 'reveal') return state;

      const allReveals = state.roundReveals.map((r) => ({ ...r, revealed: true }));
      const revealedIds = new Set(allReveals.map((r) => r.playerId));
      const updatedPlayers = state.players.map((p) =>
        revealedIds.has(p.id) ? { ...p, bidRevealed: true } : p,
      );

      return {
        ...state,
        players: updatedPlayers,
        roundReveals: allReveals,
        revealIndex: allReveals.length,
      };
    }

    // ── reveal/resolve: compute lowest/highest, apply exposure, set up elimination ─
    case 'ADVANCE_TO_ELIMINATION': {
      const readyFromReveal =
        state.phase === 'reveal' && state.revealIndex >= state.roundReveals.length;
      if (state.phase !== 'resolve' && !readyFromReveal) return state;

      const lowestIds = findLowestBidders(state.players);
      const highestId = findHighestBidder(state.players);

      // Apply exposure for the next round
      const withExposure = exposeHighestBidder(state.players, highestId, state.round + 1);

      // Deduct bid costs
      const afterCosts = applyBidCosts(withExposure, state.round);

      // Eliminate lowest bidders
      const placement = nextPlacementFor(afterCosts);
      const afterElimination = eliminatePlayers(afterCosts, lowestIds, state.round, placement);

      const humanEliminated = lowestIds.some((id) =>
        state.players.find((p) => p.id === id)?.isHuman,
      );

      return {
        ...state,
        players: afterElimination,
        lastEliminatedIds: lowestIds,
        lastHighestBidderId: highestId,
        humanEliminated: state.humanEliminated || humanEliminated,
        phase: 'elimination',
      };
    }

    // ── elimination: acknowledge → next round or complete ────────────────────
    case 'CONTINUE_AFTER_ELIMINATION': {
      if (state.phase !== 'elimination') return state;

      const alive = state.players.filter((p) => p.isAlive);

      // Edge case: all remaining players tied for lowest bid and were all eliminated.
      // Pick the player with the most remaining bank as a tiebreaker winner.
      if (alive.length === 0) {
        const lastEliminated = state.players
          .filter((p) => state.lastEliminatedIds.includes(p.id))
          .sort((a, b) => b.bank - a.bank);
        const tiebreakerWinner = lastEliminated[0] ?? null;
        if (tiebreakerWinner) {
          const withWinner = state.players.map((p) =>
            p.id === tiebreakerWinner.id ? { ...p, placement: 1, isAlive: true } : p,
          );
          return {
            ...state,
            players: withWinner,
            winner: { ...tiebreakerWinner, placement: 1, isAlive: true },
            phase: 'complete',
          };
        }
        return { ...state, phase: 'complete' };
      }

      const winner = getWinner(state.players);
      if (winner) {
        // Assign placement 1 to winner
        const withWinner = state.players.map((p) =>
          p.id === winner.id ? { ...p, placement: 1 } : p,
        );
        return {
          ...state,
          players: withWinner,
          winner: { ...winner, placement: 1 },
          phase: 'complete',
        };
      }

      // Continue with next round
      return {
        ...state,
        round: state.round + 1,
        roundReveals: [],
        revealIndex: 0,
        lastEliminatedIds: [],
        lastHighestBidderId: null,
        phase: 'bid',
      };
    }

    // ── human eliminated: watch as spectator ─────────────────────────────────
    case 'SPECTATE': {
      return { ...state, spectating: true };
    }

    // ── human eliminated: skip to results ────────────────────────────────────
    case 'SKIP_TO_RESULTS': {
      // Simulate remaining rounds to completion
      const finalState = simulateToCompletion(state);
      return { ...finalState, spectating: false };
    }

    // ── toggle fast-forward ───────────────────────────────────────────────────
    case 'TOGGLE_FAST_FORWARD': {
      return { ...state, fastForward: !state.fastForward };
    }

    default:
      return state;
  }
}

// ─── simulateToCompletion ────────────────────────────────────────────────────

/**
 * Fast-forwards the game state to completion by simulating all remaining rounds.
 * Used when the human player skips to results.
 * All bids are computed deterministically from the seed.
 */
function simulateToCompletion(state: TrapAuctionState): TrapAuctionState {
  let s = { ...state, phase: 'bid' as const };

  let maxIterations = 50; // safety cap
  while (maxIterations-- > 0) {
    const winner = getWinner(s.players);
    if (winner) {
      const withWinner = s.players.map((p) =>
        p.id === winner.id ? { ...p, placement: 1 } : p,
      );
      return {
        ...s,
        players: withWinner,
        winner: { ...winner, placement: 1 },
        phase: 'complete',
      };
    }

    // Simulate all bids for this round
    const roundSeed = (mulberry32((s.seed ^ (s.round * 0x9e3779b9)) >>> 0)() * 0x100000000) >>> 0;

    // Use the same AI bid computation as in real rounds to preserve determinism
    const withBids = computeAiBids(s.players, { round: s.round, players: s.players }, roundSeed);

    const lowestIds = findLowestBidders(withBids);
    const highestId = findHighestBidder(withBids);
    const withExposure = exposeHighestBidder(withBids, highestId, s.round + 1);
    const afterCosts = applyBidCosts(withExposure, s.round);
    const placement = nextPlacementFor(afterCosts);
    const afterElimination = eliminatePlayers(afterCosts, lowestIds, s.round, placement);

    s = {
      ...s,
      players: afterElimination,
      round: s.round + 1,
      lastEliminatedIds: lowestIds,
      lastHighestBidderId: highestId,
      roundReveals: [],
      revealIndex: 0,
    };
  }

  return { ...s, phase: 'complete' };
}
