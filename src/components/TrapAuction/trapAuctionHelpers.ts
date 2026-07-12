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

function hashPlayerId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** Stable continuous traits keep two AIs with the same broad personality distinct. */
function getIndividualBidStyle(playerId: string) {
  const rng = mulberry32(hashPlayerId(playerId) ^ 0x9e3779b9);
  return {
    riskBias: (rng() - 0.5) * 0.5,
    volatility: 0.7 + rng() * 0.6,
  };
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
 * Each player starts with `startingBank` Eyeolens.
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
 * - min is 1 while the player can afford the minimum bid (bank >= minBid),
 *   otherwise 0 for bankrupt edge cases.
 * - max is clamped to the player's current bank.
 * - recommended is the midpoint of [min, max], biased slightly lower.
 */
export function getAllowedBidRange(
  player: TrapAuctionPlayer,
  _round: number,
): BidRangeInfo {
  if (player.bank < TRAP_AUCTION_CONFIG.minBid) {
    return { min: 0, max: 0, recommended: 0 };
  }

  const min = TRAP_AUCTION_CONFIG.minBid;
  // The early return above handles bankrupt players, so any player reaching
  // this path can afford at least the minimum bid.
  const max = Math.min(TRAP_AUCTION_CONFIG.baseMaxBid, player.bank);

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
 *  - desperate:  High bids, fear of elimination dominates.
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
  const aliveCount = state.players.filter((p) => p.isAlive).length;
  const bankFraction = player.bank / TRAP_AUCTION_CONFIG.startingBank;
  // Round pressure: later rounds are more dangerous (more to lose)
  const roundPressure = Math.min(1, state.round / 8);

  // ── Budget-aware sizing ───────────────────────────────────────────────────
  // The core smartness fix: bids are sized relative to a *sustainable* per-round
  // budget rather than the full remaining bank. Roughly one player is eliminated
  // each round, so a player should plan to survive ~(aliveCount - 1) more rounds.
  // Spending bank / roundsLeft each round keeps a player solvent to the endgame
  // instead of blowing most of their bank in the opening round.
  const roundsLeft = Math.max(1, aliveCount - 1);
  const sustainable = Math.max(1, player.bank / roundsLeft);

  // ── Survival floor ────────────────────────────────────────────────────────
  // AI bids 1 ONLY when bank === 1 (that is literally all they have left).
  // When bank > 1, the floor scales up with alive count, bank, and round
  // pressure to avoid trivially suicidal bids while leaving personality
  // room above it.
  function endgameFloor(count: number): number {
    if (count <= 3) return 6;
    if (count <= 5) return 4;
    return 3;
  }

  const survivalFloor: number = player.bank === 1
    ? 1
    : Math.min(
        max,
        Math.max(
          2,                         // hard minimum when bank > 1
          endgameFloor(aliveCount),  // late-game lift
          // Only the endgame needs a bank-relative floor. Applying an 8% floor
          // to a full 16-player opening forced most strategies to exactly 8.
          aliveCount <= 3 ? Math.floor(player.bank * 0.12) : 0,
          Math.floor(2 + roundPressure * 4),  // round pressure: up to +4 by round 8
        ),
      );

  // Each personality picks a multiple of the sustainable per-round budget.
  // Cautious spends well under budget; dominant/desperate overspend (but bounded)
  // so they no longer empty their bank in a single round.
  let multiplier: number;

  switch (player.personality) {
    case 'cautious': {
      // Spends roughly half of the sustainable budget; rarely the top bidder.
      multiplier = 0.35 + rng() * 0.30;
      break;
    }
    case 'balanced': {
      // Centred on the sustainable budget, scaling slightly with round pressure.
      multiplier = 0.75 + roundPressure * 0.15 + rng() * 0.35;
      break;
    }
    case 'desperate': {
      // Overbids out of fear, but capped so it cannot bankrupt itself instantly.
      multiplier = 1.2 + roundPressure * 0.25 + rng() * 0.4;
      break;
    }
    case 'chaotic': {
      // Wildly variable around the budget — sometimes stingy, sometimes reckless.
      multiplier = 0.3 + rng() * 1.5;
      break;
    }
    case 'dominant': {
      // Consistently spends well above budget to project power.
      multiplier = 1.6 + bankFraction * 0.2 + rng() * 0.4;
      break;
    }
    case 'strategic': {
      // Reads the field: fewer rivals → higher stakes → spend more of the budget.
      // Pulls back when the bank is getting dangerously low.
      const fieldPressure = aliveCount <= 3 ? 0.5 : aliveCount <= 5 ? 0.25 : 0;
      const bankPenalty = bankFraction < 0.3 ? -0.2 : 0;
      multiplier = 0.85 + roundPressure * 0.2 + fieldPressure + bankPenalty + rng() * 0.25;
      break;
    }
    default:
      multiplier = 0.5 + rng();
  }

  const individualStyle = getIndividualBidStyle(player.id);
  const individualNoise = (rng() - 0.5) * 0.22 * individualStyle.volatility;
  const individualizedMultiplier = multiplier + individualStyle.riskBias + individualNoise;
  const raw = Math.round(sustainable * Math.max(0, individualizedMultiplier));

  const clamped = Math.max(min, Math.min(max, raw));
  return Math.max(min, Math.min(max, Math.max(survivalFloor, clamped)));
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
 * Marks the highest bidder as exposed (isExposed = true).
 * Does not eliminate them.
 *
 * NOTE: The problem statement named this helper "ExposeHighestBiffer" —
 * we export both spellings for compatibility.
 */
export function exposeHighestBidder(
  players: TrapAuctionPlayer[],
  highestId: string | null,
  _nextRound: number,
): TrapAuctionPlayer[] {
  return players.map((p) => ({
    ...p,
    isExposed: p.id === highestId,
    penalty: null,
  }));
}

/** Alias matching the problem statement's spelling request. */
export const ExposeHighestBiffer = exposeHighestBidder;

// ─── applyBidCosts ────────────────────────────────────────────────────────────

/**
 * Deducts each player's currentBid from their bank.
 * Clamps bank to 0 (cannot go negative).
 * Resets currentBid and bidRevealed for the next round.
 */
export function applyBidCosts(
  players: TrapAuctionPlayer[],
  _round: number,
): TrapAuctionPlayer[] {
  return players.map((p) => {
    if (!p.isAlive || p.currentBid === null) return p;
    const bid = p.currentBid;
    return {
      ...p,
      bank: Math.max(0, p.bank - bid),
      currentBid: null,
      bidRevealed: false,
      penalty: null,
    };
  });
}

export function shouldRevealPlayerBank(
  player: TrapAuctionPlayer,
  round: number,
): boolean {
  return round <= 1 || !player.isAlive || player.isExposed;
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
  tieBreakSeed = round,
): TrapAuctionPlayer[] {
  const hashTieBreaker = (playerId: string): number => {
    let hash = (tieBreakSeed ^ 0x811c9dc5) >>> 0;
    for (let i = 0; i < playerId.length; i++) {
      hash ^= playerId.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash;
  };
  const tiedPlayers = players
    .filter((player) => ids.includes(player.id) && player.isAlive)
    // Less money after paying the tied bid ranks worse. Exact bank ties use a
    // deterministic draw so roster order never silently decides last place.
    .sort((a, b) => a.bank - b.bank || hashTieBreaker(a.id) - hashTieBreaker(b.id));
  const placementById = new Map<string, number>();
  tiedPlayers.forEach((player, index) => {
    placementById.set(player.id, nextPlacement - index);
  });

  return players.map((p) => {
    const placement = placementById.get(p.id);
    if (placement !== undefined) {
      return {
        ...p,
        isAlive: false,
        eliminatedRound: round,
        placement,
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

// ─── isCompleteTie ────────────────────────────────────────────────────────────

/**
 * Returns true when *every* alive player submitted the same (lowest) bid, so
 * eliminating the lowest bidder(s) would wipe out the entire remaining field.
 * In that situation the round must be replayed (a "rematch") rather than
 * crowning an arbitrary winner.
 */
export function isCompleteTie(players: TrapAuctionPlayer[]): boolean {
  const alive = players.filter((p) => p.isAlive && p.currentBid !== null);
  if (alive.length < 2) return false;
  const lowest = findLowestBidders(players);
  return lowest.length >= alive.length;
}

/**
 * Returns true when no rematch could ever break a complete tie because every
 * alive player is bankrupt (cannot bid above the floor), so the tie is
 * permanent. Used as a safety valve to guarantee the game terminates.
 */
export function isUnbreakableTie(players: TrapAuctionPlayer[]): boolean {
  const alive = players.filter((p) => p.isAlive);
  if (alive.length < 2) return false;
  return alive.every((p) => p.bank < TRAP_AUCTION_CONFIG.minBid + 1);
}

/**
 * Deterministically crowns a winner from the alive field when a tie cannot be
 * resolved by replaying the round (safety fallback only). Prefers the player
 * with the largest remaining bank; ties on bank are broken by a seeded RNG.
 */
export function resolveTieWinner(
  players: TrapAuctionPlayer[],
  seed: number,
): TrapAuctionPlayer | null {
  const alive = players.filter((p) => p.isAlive);
  if (alive.length === 0) return null;
  const maxBank = Math.max(...alive.map((p) => p.bank));
  const topBank = alive.filter((p) => p.bank === maxBank);
  if (topBank.length === 1) return topBank[0];
  const rng = mulberry32(seed >>> 0);
  return topBank[Math.floor(rng() * topBank.length)] ?? topBank[0];
}

/**
 * Clears the current round's bids for all alive players so the round can be
 * replayed. Banks are untouched — a rematch round is "void" and costs nothing.
 */
export function clearBidsForRematch(players: TrapAuctionPlayer[]): TrapAuctionPlayer[] {
  return players.map((p) =>
    p.isAlive
      ? { ...p, currentBid: null, bidRevealed: false, isExposed: false }
      : p,
  );
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
    // Player identity participates in the seed so roster order is not the AI's
    // hidden strategy and two contestants never share the same random stream.
    const playerSeed = deriveSeed(roundSeed, idx ^ hashPlayerId(p.id));
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
