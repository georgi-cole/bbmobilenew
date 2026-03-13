/**
 * Redux slice for the "Blackjack Tournament" last-player-standing competition.
 *
 * State machine:
 *
 *   idle
 *    └─ initBlackjackTournament ──────────────────────────────→ spin
 *         └─ resolveSpinner ────────────────────────────────→ pick_opponent
 *              └─ pickOpponent ─────────────────────────────→ duel
 *                   └─ (hit/stand until both players done)
 *                   └─ resolveDuel ──────────────────────→ duel_result
 *                        └─ advanceFromDuelResult ──→ pick_opponent  (≥2 remaining)
 *                                                  └─→ complete      (1 remaining)
 *
 * Rules:
 *  - A spinner randomly selects the first controlling player.
 *  - The controlling player picks any non-eliminated opponent.
 *  - Both players receive two cards and alternately hit or stand.
 *  - Closest to 21 without going over wins. Bust (>21) = loss.
 *  - Both bust → seeded coin flip. Exact tie → seeded coin flip.
 *  - Loser is eliminated; winner stays in control and picks next opponent.
 *  - Last player remaining wins the competition.
 *
 * Tiebreaker & both-bust resolution:
 *  - Deterministic seeded coin flip derived from (masterSeed, duelIndex,
 *    controllerId, opponentId) — so different matchups produce independent
 *    flip results even within the same duel index.
 *  - Documented here to avoid ambiguity: the coin flip is the canonical rule.
 *
 * Seeded RNG:
 *  - All random values use mulberry32 from src/store/rng.ts.
 *  - Card deals use a sequential counter (duel.rngCallCount) derived from the
 *    duel-specific seed (seed XOR duelIndex * DUEL_SEED_MULT).
 *  - AI hit/stand decisions use a separate key (seed, duelIndex, playerId,
 *    decisionIndex) to avoid entanglement with card draw order.
 *  - Tiebreakers use rngAt(flipSeed, TIEBREAK_RNG_OFFSET) where flipSeed
 *    incorporates (masterSeed, duelIndex, controllerId, opponentId) so that
 *    different matchups produce independent flip results.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32 } from '../../store/rng';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlackjackTournamentCompetitionType = 'HOH' | 'POV';

export type BlackjackTournamentPhase =
  | 'idle'
  | 'spin'
  | 'pick_opponent'
  | 'duel'
  | 'duel_result'
  | 'complete';

export type DuelTurn = 'controller' | 'opponent' | 'finished';

export interface BlackjackDuelState {
  controllerId: string;
  opponentId: string;
  /** Card values: 1=Ace, 2–9=pip value, 10–13=10/J/Q/K (all count as 10). */
  controllerCards: number[];
  opponentCards: number[];
  controllerStood: boolean;
  opponentStood: boolean;
  controllerBust: boolean;
  opponentBust: boolean;
  /** Whose turn it is to act next (or 'finished' when both are done). */
  duelTurn: DuelTurn;
  /** Running count of RNG calls consumed by card deals for this duel. */
  rngCallCount: number;
}

export interface BlackjackTournamentState {
  competitionType: BlackjackTournamentCompetitionType;
  phase: BlackjackTournamentPhase;

  allPlayerIds: string[];
  remainingPlayerIds: string[];
  eliminatedPlayerIds: string[];

  humanPlayerId: string | null;
  /** True once the human has been eliminated (spectator mode). */
  isSpectating: boolean;

  /** Player who currently holds tournament control. */
  controllingPlayerId: string | null;
  /** Opponent selected for the current duel. */
  selectedOpponentId: string | null;

  currentDuel: BlackjackDuelState | null;
  /** Winner of the most recently completed duel (set in duel_result phase). */
  duelWinnerId: string | null;
  /** Loser of the most recently completed duel. */
  duelLoserId: string | null;
  /** Running count of completed duels. Used to derive per-duel RNG seeds. */
  duelIndex: number;

  /** Set when phase === 'complete'. */
  winnerId: string | null;

  seed: number;
  /** Guard: outcome thunk only fires once. */
  outcomeResolved: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Multiplier used to derive per-duel seed from the master seed. */
const DUEL_SEED_MULT = 0x9e3779b9;
/** XOR offset used to separate card-deal RNG from tiebreaker RNG. */
const TIEBREAK_RNG_OFFSET = 64;
/** XOR offset separating AI-decision RNG from card-deal RNG. */
const AI_DECISION_RNG_MASK = 0xdeadbeef;

/** AI stands on this total or higher (standard soft-17 rule). */
export const AI_STAND_THRESHOLD = 17;
/** AI always hits on this total or lower (cannot bust). */
export const AI_HIT_ALWAYS_BELOW = 12;
/** Probability the AI hits when total is in [AI_HIT_ALWAYS_BELOW+1, AI_STAND_THRESHOLD-1]. */
export const AI_HIT_PROBABILITY = 0.65;

// ─── Pure RNG helpers ─────────────────────────────────────────────────────────

/** Advance a seeded RNG by `count` steps and return the next value. */
function rngAt(seed: number, count: number): number {
  const rng = mulberry32(seed >>> 0);
  for (let i = 0; i < count; i++) rng();
  return rng();
}

/** Derive the card-deal seed for duel number `duelIndex`. */
function duelCardSeed(masterSeed: number, duelIndex: number): number {
  return ((masterSeed >>> 0) ^ (((duelIndex + 1) * DUEL_SEED_MULT) >>> 0)) >>> 0;
}

/** Draw card N (0-indexed by rngCallCount) from a given duel. */
function dealDuelCard(masterSeed: number, duelIndex: number, callCount: number): number {
  return Math.floor(rngAt(duelCardSeed(masterSeed, duelIndex), callCount) * 13) + 1;
}

/** FNV-1a 32-bit hash for stable string → uint32. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

// ─── Card helpers (exported for tests) ───────────────────────────────────────

/**
 * Compute a blackjack hand total with optimal ace handling.
 * Aces count as 11, reduced to 1 if the hand would bust.
 */
export function computeTotal(cards: number[]): number {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c === 1) {
      total += 11;
      aces++;
    } else if (c >= 10) {
      total += 10;
    } else {
      total += c;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

/** Human-readable rank string for a card value (1–13). */
export function cardRank(card: number): string {
  const RANKS: Record<number, string> = {
    1: 'A',
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
    10: '10', 11: 'J', 12: 'Q', 13: 'K',
  };
  return RANKS[card] ?? String(card);
}

/** Suit symbol for display (assigned by card index mod 4, purely cosmetic). */
export function cardSuit(cardIndex: number): string {
  return ['♠', '♥', '♦', '♣'][cardIndex % 4];
}

// ─── Duel resolution (exported for tests) ────────────────────────────────────

/**
 * Determine the winner of a blackjack duel.
 *
 * Resolution order:
 *  1. Both bust → seeded coin flip.
 *  2. One bust  → non-busted player wins.
 *  3. Different totals → higher total wins.
 *  4. Equal totals → seeded coin flip.
 *
 * The coin flip seed incorporates controllerId and opponentId (via FNV-1a
 * hashes) so that different matchups produce independent results even within
 * the same duel index.
 */
export function resolveDuelOutcome(
  controllerCards: number[],
  opponentCards: number[],
  masterSeed: number,
  duelIndex: number,
  controllerId = '',
  opponentId = '',
): 'controller' | 'opponent' {
  const cTotal = computeTotal(controllerCards);
  const oTotal = computeTotal(opponentCards);
  const cBust = cTotal > 21;
  const oBust = oTotal > 21;

  if (!cBust && !oBust) {
    if (cTotal !== oTotal) return cTotal > oTotal ? 'controller' : 'opponent';
    // Exact tie → coin flip
  } else if (!cBust) {
    return 'controller';
  } else if (!oBust) {
    return 'opponent';
  }
  // Both bust OR exact tie → coin flip keyed on (masterSeed, duelIndex,
  // controllerId, opponentId) for matchup-independent determinism.
  const flipSeed =
    (duelCardSeed(masterSeed, duelIndex) ^
      fnv1a32(controllerId) ^
      (fnv1a32(opponentId) * 0x9e3779b9)) >>>
    0;
  const flipVal = rngAt(flipSeed, TIEBREAK_RNG_OFFSET);
  return flipVal < 0.5 ? 'controller' : 'opponent';
}

// ─── AI helpers (exported for tests) ─────────────────────────────────────────

/**
 * Determine whether an AI player should hit, given:
 * - Their current hand total.
 * - A deterministic RNG value derived from (seed, duelIndex, playerId, decisionIndex).
 *
 * Uses the standard soft-17 heuristic with a probabilistic zone between
 * AI_HIT_ALWAYS_BELOW and AI_STAND_THRESHOLD.
 */
export function aiShouldHit(total: number, rngValue: number): boolean {
  if (total >= AI_STAND_THRESHOLD) return false;
  if (total <= AI_HIT_ALWAYS_BELOW) return true;
  return rngValue < AI_HIT_PROBABILITY;
}

/**
 * Get the AI decision RNG value for a specific player and decision index.
 * Keyed separately from card deals so hit/stand decisions are independent
 * of the number of cards drawn by the other player.
 */
export function aiDecisionRng(
  masterSeed: number,
  duelIndex: number,
  playerId: string,
  decisionIndex: number,
): number {
  const idHash = fnv1a32(playerId);
  const s =
    ((masterSeed >>> 0) ^
      (((duelIndex + 1) * DUEL_SEED_MULT) >>> 0) ^
      idHash ^
      (((decisionIndex + 1) * AI_DECISION_RNG_MASK) >>> 0)) >>>
    0;
  return mulberry32(s)();
}

/**
 * AI selects an opponent from the remaining player pool.
 * Uses uniform random selection with a keyed seed to keep it deterministic
 * and independent of duel card state.
 */
export function aiPickOpponent(
  masterSeed: number,
  duelIndex: number,
  controllingPlayerId: string,
  remainingPlayerIds: string[],
): string | null {
  const candidates = remainingPlayerIds.filter((id) => id !== controllingPlayerId);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const idHash = fnv1a32(controllingPlayerId);
  const s = ((masterSeed >>> 0) ^ (((duelIndex + 1) * DUEL_SEED_MULT) >>> 0) ^ idHash ^ 0xcafebabe) >>> 0;
  const rng = mulberry32(s);
  return candidates[Math.floor(rng() * candidates.length)];
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: BlackjackTournamentState = {
  competitionType: 'HOH',
  phase: 'idle',

  allPlayerIds: [],
  remainingPlayerIds: [],
  eliminatedPlayerIds: [],

  humanPlayerId: null,
  isSpectating: false,

  controllingPlayerId: null,
  selectedOpponentId: null,

  currentDuel: null,
  duelWinnerId: null,
  duelLoserId: null,
  duelIndex: 0,

  winnerId: null,

  seed: 0,
  outcomeResolved: false,
};

// ─── Slice ────────────────────────────────────────────────────────────────────

const blackjackTournamentSlice = createSlice({
  name: 'blackjackTournament',
  initialState,
  reducers: {
    /**
     * Initialise the tournament from the caller's participant list.
     * Transitions to 'spin' immediately (or 'complete' if ≤1 player).
     */
    initBlackjackTournament(
      state,
      action: PayloadAction<{
        participantIds: string[];
        competitionType: BlackjackTournamentCompetitionType;
        seed: number;
        humanPlayerId: string | null;
      }>,
    ) {
      const { participantIds, competitionType, seed, humanPlayerId } = action.payload;
      state.competitionType = competitionType;
      state.allPlayerIds = [...participantIds];
      state.remainingPlayerIds = [...participantIds];
      state.eliminatedPlayerIds = [];
      state.humanPlayerId = humanPlayerId;
      state.isSpectating = false;
      state.controllingPlayerId = null;
      state.selectedOpponentId = null;
      state.currentDuel = null;
      state.duelWinnerId = null;
      state.duelLoserId = null;
      state.duelIndex = 0;
      state.winnerId = null;
      state.seed = seed;
      state.outcomeResolved = false;

      if (participantIds.length <= 1) {
        state.winnerId = participantIds[0] ?? null;
        state.phase = 'complete';
      } else {
        state.phase = 'spin';
      }
    },

    /**
     * Resolve the spinner animation: pick a random controller from remaining
     * players and advance to pick_opponent.
     * If only one opponent is available, auto-populate selectedOpponentId so
     * the UI can fast-path directly into the duel.
     */
    resolveSpinner(state) {
      if (state.phase !== 'spin') return;
      const idx = Math.floor(rngAt(state.seed, 0) * state.remainingPlayerIds.length);
      state.controllingPlayerId = state.remainingPlayerIds[idx] ?? state.remainingPlayerIds[0];

      const opponents = state.remainingPlayerIds.filter((id) => id !== state.controllingPlayerId);
      state.selectedOpponentId = opponents.length === 1 ? opponents[0] : null;
      state.phase = 'pick_opponent';
    },

    /**
     * Controller picks an opponent.
     * Validates the pick (must be in remainingPlayerIds, must not be self),
     * initialises the duel with 2 starting cards each, and advances to 'duel'.
     */
    pickOpponent(state, action: PayloadAction<{ opponentId: string }>) {
      if (state.phase !== 'pick_opponent') return;
      if (!state.controllingPlayerId) return;
      const { opponentId } = action.payload;
      if (!state.remainingPlayerIds.includes(opponentId)) return;
      if (opponentId === state.controllingPlayerId) return;

      state.selectedOpponentId = opponentId;

      // Deal 2 cards to each player (sequential draws from the duel RNG).
      let rngCount = 0;
      const c1 = dealDuelCard(state.seed, state.duelIndex, rngCount++);
      const c2 = dealDuelCard(state.seed, state.duelIndex, rngCount++);
      const o1 = dealDuelCard(state.seed, state.duelIndex, rngCount++);
      const o2 = dealDuelCard(state.seed, state.duelIndex, rngCount++);

      const controllerCards = [c1, c2];
      const opponentCards = [o1, o2];
      const controllerBust = computeTotal(controllerCards) > 21;
      const opponentBust = computeTotal(opponentCards) > 21;

      // Determine starting turn (controller goes first; if already busted skip to opponent).
      const duelTurn: DuelTurn = controllerBust
        ? opponentBust
          ? 'finished'
          : 'opponent'
        : 'controller';

      state.currentDuel = {
        controllerId: state.controllingPlayerId,
        opponentId,
        controllerCards,
        opponentCards,
        controllerStood: false,
        opponentStood: false,
        controllerBust,
        opponentBust,
        duelTurn,
        rngCallCount: rngCount,
      };
      state.phase = 'duel';
    },

    /**
     * Active player takes a card (hit).
     * Advances the duel turn when the player busts.
     */
    hitCurrentPlayer(state) {
      if (state.phase !== 'duel' || !state.currentDuel) return;
      const duel = state.currentDuel;
      if (duel.duelTurn === 'finished') return;

      const card = dealDuelCard(state.seed, state.duelIndex, duel.rngCallCount);
      duel.rngCallCount++;

      if (duel.duelTurn === 'controller') {
        duel.controllerCards.push(card);
        if (computeTotal(duel.controllerCards) > 21) {
          duel.controllerBust = true;
          duel.duelTurn = duel.opponentStood || duel.opponentBust ? 'finished' : 'opponent';
        }
      } else {
        duel.opponentCards.push(card);
        if (computeTotal(duel.opponentCards) > 21) {
          duel.opponentBust = true;
          duel.duelTurn = duel.controllerStood || duel.controllerBust ? 'finished' : 'controller';
        }
      }
    },

    /**
     * Active player stands (takes no more cards).
     * Switches turn to the other player or marks the duel as finished.
     */
    standCurrentPlayer(state) {
      if (state.phase !== 'duel' || !state.currentDuel) return;
      const duel = state.currentDuel;
      if (duel.duelTurn === 'finished') return;

      if (duel.duelTurn === 'controller') {
        duel.controllerStood = true;
        duel.duelTurn = duel.opponentStood || duel.opponentBust ? 'finished' : 'opponent';
      } else {
        duel.opponentStood = true;
        duel.duelTurn = duel.controllerStood || duel.controllerBust ? 'finished' : 'controller';
      }
    },

    /**
     * Resolve the duel once duelTurn === 'finished'.
     * Sets duelWinnerId/duelLoserId and transitions to 'duel_result'.
     */
    resolveDuel(state) {
      if (state.phase !== 'duel' || !state.currentDuel) return;
      if (state.currentDuel.duelTurn !== 'finished') return;

      const duel = state.currentDuel;
      const winnerSide = resolveDuelOutcome(
        duel.controllerCards,
        duel.opponentCards,
        state.seed,
        state.duelIndex,
        duel.controllerId,
        duel.opponentId,
      );

      state.duelWinnerId = winnerSide === 'controller' ? duel.controllerId : duel.opponentId;
      state.duelLoserId = winnerSide === 'controller' ? duel.opponentId : duel.controllerId;
      state.phase = 'duel_result';
    },

    /**
     * Eliminate the loser, update remainingPlayerIds, and transition:
     *  - ≥2 remaining → pick_opponent (winner stays in control)
     *  - 1 remaining  → complete
     */
    advanceFromDuelResult(state) {
      if (state.phase !== 'duel_result' || !state.duelLoserId) return;

      const loser = state.duelLoserId;
      state.remainingPlayerIds = state.remainingPlayerIds.filter((id) => id !== loser);
      state.eliminatedPlayerIds.push(loser);

      if (state.humanPlayerId === loser) {
        state.isSpectating = true;
      }

      state.controllingPlayerId = state.duelWinnerId;
      state.selectedOpponentId = null;
      state.currentDuel = null;
      state.duelIndex++;

      if (state.remainingPlayerIds.length <= 1) {
        state.winnerId = state.remainingPlayerIds[0] ?? null;
        state.phase = 'complete';
      } else {
        const opponents = state.remainingPlayerIds.filter(
          (id) => id !== state.controllingPlayerId,
        );
        // Auto-populate when only one opponent remains.
        state.selectedOpponentId = opponents.length === 1 ? opponents[0] : null;
        state.phase = 'pick_opponent';
      }
    },

    markBlackjackTournamentOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    resetBlackjackTournament() {
      return initialState;
    },
  },
});

export const {
  initBlackjackTournament,
  resolveSpinner,
  pickOpponent,
  hitCurrentPlayer,
  standCurrentPlayer,
  resolveDuel,
  advanceFromDuelResult,
  markBlackjackTournamentOutcomeResolved,
  resetBlackjackTournament,
} = blackjackTournamentSlice.actions;

export default blackjackTournamentSlice.reducer;
