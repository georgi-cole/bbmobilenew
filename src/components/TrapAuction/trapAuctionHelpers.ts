/**
 * trapAuctionHelpers.ts
 *
 * Pure helper functions for the Trap Auction minigame.
 * All functions are deterministic given the same inputs (no side-effects).
 * Designed to be callable both from the React reducer and from AI pre-simulation.
 */

import type { MinigameParticipant } from '../MinigameHost/MinigameHost';
import {
  TRAP_AUCTION_CONFIG,
  type AiPersonality,
  type TrapAuctionPlayer,
  type BidRangeInfo,
  type RoundReveal,
  type TrapAuctionState,
} from './trapAuctionTypes';
import { mulberry32 } from '../../store/rng';

// ─── Seeded RNG ───────────────────────────────────────────────────────────────

/**
 * Derives a child seed by mixing a base seed with an integer salt using
 * the same Mulberry32 PRNG used across the codebase.
 */
function deriveSeed(base: number, salt: number): number {
  return (mulberry32((base ^ salt ^ 0xdeadbeef) >>> 0)() * 0x100000000) >>> 0;
}

// ─── Personality assignment ───────────────────────────────────────────────────

const AI_PERSONALITIES: AiPersonality[] = [
  'cautious',
  'balanced',
  'desperate',
  'chaotic',
  'dominant',
  'strategic',
];

/**
 * Assigns an AI personality deterministically from the player id + seed.
 * Human players always get 'balanced' (unused for bidding logic).
 */
function assignPersonality(id: string, seed: number, isHuman: boolean): AiPersonality {
  if (isHuman) return 'balanced';
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) >>> 0;
  }
  const rng = mulberry32(deriveSeed(seed, hash));
  return AI_PERSONALITIES[Math.floor(rng() * AI_PERSONALITIES.length)];
}

// ─── createInitialPlayers ─────────────────────────────────────────────────────

/**
 * Builds the initial player list from competition participants.
 * Each player starts with `startingBank` Eyeolens and no penalty.
 * Personalities are assigned deterministically from the seed.
 */
export function createInitialPlayers(
  participants: MinigameParticipant[],
  seed: number,
): TrapAuctionPlayer[] {
  return participants.map((p) => ({
    id: p.id,
    name: p.name,
    avatar: '',   // TODO: resolved from houseguest data via resolveAvatarCandidates in component
    isHuman: p.isHuman,
    personality: assignPersonality(p.id, seed, p.isHuman),
    bank: TRAP_AUCTION_CONFIG.startingBank,
    isAlive: true,
    currentBid: null,
    bidRevealed: false,
    penalty: null,
    eliminatedRound: null,
    placement: null,
    isExposed: false,
  }));
}

// ─── Mock players (for standalone / test use) ────────────────────────────────

export const MOCK_PARTICIPANTS: MinigameParticipant[] = [
  { id: 'player-human', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'aria',         name: 'Aria',    isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'kian',         name: 'Kian',    isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'zara',         name: 'Zara',    isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'miles',        name: 'Miles',   isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'nova',         name: 'Nova',    isHuman: false, precomputedScore: 0, previousPR: null },
];

// ─── getAllowedBidRange ────────────────────────────────────────────────────────

/**
 * Returns the allowed bid range for a player in the current round.
 *
 * - min is always at least 1 (can never bid 0).
 * - max is clamped to the player's bank minus any active surcharge,
 *   ensuring the player can always afford to pay both the bid and penalty.
 * - recommended is the midpoint of [min, max], biased slightly lower.
 */
export function getAllowedBidRange(
  player: TrapAuctionPlayer,
  round: number,
): BidRangeInfo {
  const surcharge =
    player.penalty && player.penalty.penaltyRound === round
      ? player.penalty.surcharge
      : 0;

  const min = TRAP_AUCTION_CONFIG.minBid;
  // Reserve enough bank to pay the surcharge; clamp to at least min
  const maxAfterPenalty = Math.max(min, player.bank - surcharge);
  const max = Math.min(TRAP_AUCTION_CONFIG.baseMaxBid, maxAfterPenalty);

  const recommended = Math.max(min, Math.floor((min + max) / 2));

  return { min, max, recommended };
}

// ─── chooseAiBid ─────────────────────────────────────────────────────────────

/**
 * Deterministically chooses a bid for an AI player.
 *
 * Strategy varies by personality:
 *  - cautious:   Low bids, avoids top slot; stays near floor + small buffer.
 *  - balanced:   Middle of the range, mild adjustment for round pressure.
 *  - desperate:  High bids, fear of elimination dominates; ignores penalty.
 *  - chaotic:    Full random within range — intentionally unpredictable.
 *  - dominant:   Near-maximum every round; embraces exposure.
 *  - strategic:  Reads round / alive count; bids higher as stakes rise.
 *
 * The bid is additionally clamped to [min, max] so it is always valid.
 *
 * @param player     - The AI player choosing their bid.
 * @param state      - Full game state (for context: round, alive count, etc.).
 * @param roundSeed  - Per-round deterministic seed for this player.
 */
export function chooseAiBid(
  player: TrapAuctionPlayer,
  state: Pick<TrapAuctionState, 'round' | 'players'>,
  roundSeed: number,
): number {
  const { min, max } = getAllowedBidRange(player, state.round);
  if (min >= max) return min;

  const rng = mulberry32(roundSeed >>> 0);
  const range = max - min;
  const aliveCount = state.players.filter((p) => p.isAlive).length;
  const bankFraction = player.bank / TRAP_AUCTION_CONFIG.startingBank;
  const hasPenalty = player.penalty?.penaltyRound === state.round;

  // Round pressure: later rounds are more dangerous (more to lose)
  const roundPressure = Math.min(1, state.round / 8);

  let raw: number;

  switch (player.personality) {
    case 'cautious': {
      // Bid near the low end; add a small safety buffer over min
      // Safety buffer grows slightly with round pressure but stays modest
      const buffer = Math.floor(range * (0.10 + roundPressure * 0.15));
      const jitter = Math.floor(rng() * Math.max(1, Math.floor(range * 0.15)));
      raw = min + buffer + jitter;
      // Cautious players actively avoid the top — cap at 65% of max
      raw = Math.min(raw, min + Math.floor(range * 0.65));
      break;
    }
    case 'balanced': {
      // Mid-range with mild pressure scaling
      const center = min + Math.floor(range * (0.4 + roundPressure * 0.2));
      const jitter = Math.floor((rng() * 2 - 1) * range * 0.12);
      raw = center + jitter;
      break;
    }
    case 'desperate': {
      // High bids; fear of being lowest outweighs penalty concern
      const base = min + Math.floor(range * (0.6 + roundPressure * 0.2));
      const jitter = Math.floor(rng() * range * 0.18);
      raw = base + jitter;
      // Desperate penalty override: they bid even higher when penalised
      if (hasPenalty) raw = Math.min(max, raw + Math.floor(range * 0.1));
      break;
    }
    case 'chaotic': {
      // Full random in range — sometimes shockingly low, sometimes high
      raw = min + Math.floor(rng() * (range + 1));
      break;
    }
    case 'dominant': {
      // Near-maximum; accepts exposure as a power signal
      const base = min + Math.floor(range * (0.75 + bankFraction * 0.1));
      const jitter = Math.floor(rng() * range * 0.12);
      raw = base + jitter;
      break;
    }
    case 'strategic': {
      // Adapts to field size: fewer alive → higher stakes → higher bid
      // Also reduces if bank is getting low
      const fieldPressure = aliveCount <= 3 ? 0.25 : aliveCount <= 5 ? 0.15 : 0;
      const bankPenalty = bankFraction < 0.3 ? -0.1 : 0;
      const center = min + Math.floor(range * (0.45 + roundPressure * 0.2 + fieldPressure + bankPenalty));
      const jitter = Math.floor((rng() * 2 - 1) * range * 0.10);
      raw = center + jitter;
      break;
    }
    default:
      raw = min + Math.floor(rng() * (range + 1));
  }

  return Math.max(min, Math.min(max, raw));
}

// ─── findLowestBidders ────────────────────────────────────────────────────────

/**
 * Returns the IDs of alive players who submitted the lowest bid this round.
 * If multiple players tie for lowest, all are returned.
 */
export function findLowestBidders(players: TrapAuctionPlayer[]): string[] {
  const alive = players.filter((p) => p.isAlive && p.currentBid !== null);
  if (alive.length === 0) return [];
  const minBid = Math.min(...alive.map((p) => p.currentBid as number));
  return alive.filter((p) => p.currentBid === minBid).map((p) => p.id);
}

// ─── findHighestBidder ───────────────────────────────────────────────────────

/**
 * Returns the ID of the alive player who submitted the highest bid this round.
 * Returns null if no alive players have submitted.
 * In a tie for highest, the first (by position in array) is chosen — deterministic.
 */
export function findHighestBidder(players: TrapAuctionPlayer[]): string | null {
  const alive = players.filter((p) => p.isAlive && p.currentBid !== null);
  if (alive.length === 0) return null;
  const maxBid = Math.max(...alive.map((p) => p.currentBid as number));
  const highestPlayers = alive.filter((p) => p.currentBid === maxBid);
  // In a tie for highest, return the first highest bidder (including the edge case of 1 player left)
  return highestPlayers[0]?.id ?? null;
}

// ─── exposeHighestBidder ─────────────────────────────────────────────────────

/**
 * Marks the highest bidder as exposed (isExposed = true) and assigns
 * their next-round penalty. Does not eliminate them.
 *
 * NOTE: The problem statement named this helper "ExposeHighestBiffer" —
 * we export both spellings for compatibility.
 */
export function exposeHighestBidder(
  players: TrapAuctionPlayer[],
  highestId: string | null,
  nextRound: number,
): TrapAuctionPlayer[] {
  return players.map((p) => {
    // Clear previous exposure from last round
    const cleared = { ...p, isExposed: false, penalty: p.penalty };
    if (p.id === highestId) {
      return {
        ...cleared,
        isExposed: true,
        penalty: {
          surcharge: TRAP_AUCTION_CONFIG.penaltyAmount,
          penaltyRound: nextRound,
        },
      };
    }
    // Clear penalty if it was for a past round (strictly earlier than the current round)
    if (cleared.penalty && cleared.penalty.penaltyRound < nextRound - 1) {
      return { ...cleared, penalty: null };
    }
    return cleared;
  });
}

/** Alias matching the problem statement's spelling request. */
export const ExposeHighestBiffer = exposeHighestBidder;

// ─── applyBidCosts ────────────────────────────────────────────────────────────

/**
 * Deducts each player's currentBid from their bank.
 * Also deducts any active surcharge penalty.
 * Clamps bank to 0 (cannot go negative).
 * Resets currentBid and bidRevealed for the next round.
 */
export function applyBidCosts(
  players: TrapAuctionPlayer[],
  round: number,
): TrapAuctionPlayer[] {
  return players.map((p) => {
    if (!p.isAlive || p.currentBid === null) return p;
    const bid = p.currentBid;
    const surcharge =
      p.penalty && p.penalty.penaltyRound === round ? p.penalty.surcharge : 0;
    const totalCost = bid + surcharge;
    return {
      ...p,
      bank: Math.max(0, p.bank - totalCost),
      currentBid: null,
      bidRevealed: false,
    };
  });
}

// ─── eliminatePlayers ────────────────────────────────────────────────────────

/**
 * Marks specified player IDs as eliminated, recording their round and placement.
 * Placement is assigned in reverse order: the first eliminated player in the
 * game gets placement N (total players), last eliminated gets placement 2,
 * and the winner gets placement 1.
 *
 * @param players         - Current player list.
 * @param ids             - IDs of players to eliminate this round.
 * @param round           - Current round number.
 * @param nextPlacement   - The placement value to assign (counts down from total).
 */
export function eliminatePlayers(
  players: TrapAuctionPlayer[],
  ids: string[],
  round: number,
  nextPlacement: number,
): TrapAuctionPlayer[] {
  let placementCounter = nextPlacement;
  return players.map((p) => {
    if (ids.includes(p.id) && p.isAlive) {
      const pl = placementCounter;
      placementCounter--;
      return {
        ...p,
        isAlive: false,
        eliminatedRound: round,
        placement: pl,
      };
    }
    return p;
  });
}

// ─── getWinner ───────────────────────────────────────────────────────────────

/**
 * Returns the single surviving player, or null if more than one is alive.
 */
export function getWinner(players: TrapAuctionPlayer[]): TrapAuctionPlayer | null {
  const alive = players.filter((p) => p.isAlive);
  return alive.length === 1 ? alive[0] : null;
}

// ─── buildRoundReveals ────────────────────────────────────────────────────────

/**
 * Builds the reveal sequence for the current round.
 *
 * Only the highest bidder (exposed) and all lowest bidder(s) (eliminated) are
 * included. All other players' bids remain hidden — only the key outcomes are
 * shown to the audience.
 *
 * Order: highest first (dramatic tension), then lowest (elimination verdict).
 * When highest and lowest are the same player (complete-tie edge case) they
 * appear once with both `isHighest` and `isLowest` set to `true`.
 */
export function buildRoundReveals(players: TrapAuctionPlayer[]): RoundReveal[] {
  const alive = players.filter((p) => p.isAlive && p.currentBid !== null);
  if (alive.length === 0) return [];

  const bids = alive.map((p) => p.currentBid as number);
  const minBid = Math.min(...bids);
  const maxBid = Math.max(...bids);

  // First player with the max bid is the exposed one (deterministic tiebreaker)
  const highestPlayer = alive.find((p) => p.currentBid === maxBid) ?? null;
  // All players tied for the minimum are eliminated
  const lowestPlayers = alive.filter((p) => p.currentBid === minBid);

  const highestEntry: RoundReveal | null = highestPlayer
    ? {
        playerId: highestPlayer.id,
        bid: maxBid,
        revealed: false,
        isLowest: maxBid === minBid,
        isHighest: true,
      }
    : null;

  // Lowest entries — deduplicated against the highest entry
  const lowestEntries: RoundReveal[] = lowestPlayers
    .filter((p) => p.id !== highestPlayer?.id)
    .map((p) => ({
      playerId: p.id,
      bid: p.currentBid as number,
      revealed: false,
      isLowest: true,
      isHighest: false,
    }));

  return [...(highestEntry ? [highestEntry] : []), ...lowestEntries];
}

// ─── computeAiBids ────────────────────────────────────────────────────────────

/**
 * Computes and applies AI bids to the player list for the current round.
 * Human bid is expected to already be set (currentBid !== null).
 *
 * @param players    - Current player list (human bid already submitted).
 * @param state      - Game state snapshot for context.
 * @param roundSeed  - Deterministic seed for this round's AI decisions.
 */
export function computeAiBids(
  players: TrapAuctionPlayer[],
  state: Pick<TrapAuctionState, 'round' | 'players'>,
  roundSeed: number,
): TrapAuctionPlayer[] {
  return players.map((p, idx) => {
    if (!p.isAlive || p.isHuman || p.currentBid !== null) return p;
    const playerSeed = deriveSeed(roundSeed, idx);
    const bid = chooseAiBid(p, state, playerSeed);
    return { ...p, currentBid: bid };
  });
}

// ─── nextPlacementFor ────────────────────────────────────────────────────────

/**
 * Returns the placement number that the next eliminated batch should receive.
 * (Equals the number of currently alive players.)
 */
export function nextPlacementFor(players: TrapAuctionPlayer[]): number {
  return players.filter((p) => p.isAlive).length;
}
