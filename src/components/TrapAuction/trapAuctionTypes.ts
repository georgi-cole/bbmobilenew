/**
 * trapAuctionTypes.ts
 *
 * TypeScript types for the Trap Auction minigame.
 *
 * Game summary:
 *  - Active players secretly bid Eyeolens each round to buy safety.
 *  - The lowest bidder(s) are eliminated.
 *  - The highest bidder is exposed (name + amount revealed).
 *  - All players pay their bid from their bank each round.
 *  - Last alive player wins.
 */

// ─── Configuration ────────────────────────────────────────────────────────────

export const TRAP_AUCTION_CONFIG = {
  /** Starting bank for every player. */
  startingBank: 100,
  /** Default maximum bid when unconstrained by bank. */
  baseMaxBid: 100,
  /** Milliseconds between each card flip during the reveal phase. */
  revealStepMs: 700,
  /** Fast-forward reveal step. */
  fastRevealStepMs: 180,
  /** Hold time (ms) on the elimination card before proceeding. */
  eliminationPauseMs: 1800,
  /** Minimum bid a player must make each round. */
  minBid: 1,
} as const;

// ─── Personalities ────────────────────────────────────────────────────────────

export type AiPersonality =
  | 'cautious'   // Bids conservatively, avoids the top
  | 'balanced'   // Mid-range bids, adapts to round and bank
  | 'desperate'  // High bids driven by fear
  | 'chaotic'    // Wildcard; large variance, unpredictable
  | 'dominant'   // Always bids high to project power
  | 'strategic'; // Reads the field; adjusts based on surviving players and rounds

/** Human-readable description per personality for the personality map. */
export const PERSONALITY_DESCRIPTIONS: Record<AiPersonality, string> = {
  cautious:
    'Plays it safe. Avoids the highest slot at all costs. Watches their bank carefully.',
  balanced:
    'Adapts to each round. Neither reckless nor overly timid — reads the middle ground.',
  desperate:
    'Fear drives every decision. Tends to overbid to secure safety.',
  chaotic:
    'Completely unpredictable. Could go low or high — even they do not know.',
  dominant:
    'Commands the room with big bids. Seeks to control and intimidate.',
  strategic:
    'Cold and calculated. Adjusts bid based on round number, remaining players, and stakes.',
};

/** Short one-word or two-word label for UI badges. */
export const PERSONALITY_LABELS: Record<AiPersonality, string> = {
  cautious: 'Cautious',
  balanced: 'Balanced',
  desperate: 'Desperate',
  chaotic: 'Chaotic',
  dominant: 'Dominant',
  strategic: 'Strategic',
};

export const PERSONALITY_ICONS: Record<AiPersonality, string> = {
  cautious: '🐢',
  balanced: '⚖️',
  desperate: '😰',
  chaotic: '🎲',
  dominant: '👑',
  strategic: '🧠',
};

// ─── Exposure metadata ────────────────────────────────────────────────────────

/**
 * Legacy metadata retained on the player shape for compatibility.
 */
export interface PlayerPenalty {
  /** Legacy value retained for compatibility; no longer applied in gameplay. */
  surcharge: number;
  /** Legacy round marker retained for compatibility. */
  penaltyRound: number;
}

// ─── Player ───────────────────────────────────────────────────────────────────

export interface TrapAuctionPlayer {
  id: string;
  name: string;
  /** Raw avatar string; resolved to a URL via resolveAvatarCandidates. */
  avatar: string;
  isHuman: boolean;
  personality: AiPersonality;
  /** Eyeolens remaining in this player's bank. */
  bank: number;
  /** Whether this player is still in the game. */
  isAlive: boolean;
  /** Current round bid (null = not yet submitted). */
  currentBid: number | null;
  /** Whether this player's bid has been flipped / revealed. */
  bidRevealed: boolean;
  /** Legacy field retained for compatibility; current rules do not apply penalties. */
  penalty: PlayerPenalty | null;
  /** Round on which this player was eliminated (null = still alive). */
  eliminatedRound: number | null;
  /** Final placement (1 = winner, 2 = second eliminated, etc.). */
  placement: number | null;
  /** True during reveal phase if this player was the highest bidder this round. */
  isExposed: boolean;
}

// ─── Bid Range ────────────────────────────────────────────────────────────────

export interface BidRangeInfo {
  /** Minimum allowed bid this round (at least 1). */
  min: number;
  /** Maximum allowed bid — clamped to the player's current bank. */
  max: number;
  /** Suggested starting value for the UI slider. */
  recommended: number;
}

// ─── Round Reveal ─────────────────────────────────────────────────────────────

export interface RoundReveal {
  playerId: string;
  bid: number;
  /** Whether this bid has been flipped yet. */
  revealed: boolean;
  isLowest: boolean;
  isHighest: boolean;
}

// ─── Game Phase ───────────────────────────────────────────────────────────────

export type GamePhase =
  | 'intro'        // Opening screen with rules recap
  | 'bid'          // Human picks a bid; AI waits
  | 'reveal'       // Bids flipped one by one (or all at once in FF mode)
  | 'elimination'  // Cinematic: eliminated player fades out before auto-advance
  | 'complete';    // Game over, winner declared

export type TrapAuctionPrizeType = 'LOH' | 'POS';

// ─── Game State ───────────────────────────────────────────────────────────────

export interface TrapAuctionState {
  phase: GamePhase;
  round: number;
  players: TrapAuctionPlayer[];
  /** Ordered reveal sequence for the current round. */
  roundReveals: RoundReveal[];
  /** How many bids have been revealed (drives staged flip animation). */
  revealIndex: number;
  /** IDs of players eliminated this round. */
  lastEliminatedIds: string[];
  /** ID of the player who bid highest this round. */
  lastHighestBidderId: string | null;
  /** The surviving winner (set when phase = 'complete'). */
  winner: TrapAuctionPlayer | null;
  /** True if the human player has been eliminated. */
  humanEliminated: boolean;
  /** True if the human chose to continue as spectator after elimination. */
  spectating: boolean;
  /** Fast-forward toggle — collapses reveal delays. */
  fastForward: boolean;
  prizeType: TrapAuctionPrizeType;
  seed: number;
  /**
   * Number of times the current round has been replayed because every alive
   * player tied for the lowest bid. Reset to 0 once a round resolves normally.
   * Optional for backward compatibility with persisted/legacy states.
   */
  rematchCount?: number;
}
