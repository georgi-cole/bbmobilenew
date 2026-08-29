/**
 * Redux slice for the "Blackjack Tournament" last-player-standing competition.
 *
 * State machine:
 *
 *   idle
 *    └─ initBlackjackTournament ──────────────────────────────→ spin
 *         └─ resolveSpinner ────────────────────────────────→ pick_opponent
 *              └─ selectPair ───────────────────────────────→ duel
 *                   └─ (hit/stand until both players done)
 *                   └─ resolveDuel ──────────────────────→ duel_result
 *                        └─ advanceFromDuelResult ──→ duel       (tie — rematch same pair)
 *                                                 └─→ pick_opponent  (≥2 remaining)
 *                                                 └─→ complete      (1 remaining)
 *
 * Rules:
 *  - A spinner randomly selects the first controlling player.
 *  - The controlling player picks ANY two non-eliminated players (fighterA and
 *    fighterB). The controller may include themselves or pick two others.
 *  - Both fighters receive two cards and alternately hit or stand.
 *  - Closest to 21 without going over wins. Bust (>21) = loss.
 *  - Exact tie (equal totals) or both-bust → TIE: rematch same pair.
 *  - After a decisive duel, the loser loses one life; the winner becomes next controller.
 *  - Winning never adds a life. A player is eliminated only when a loss takes them to zero.
 *  - Last player remaining wins the competition.
 *
 * Tie / rematch:
 *  - resolveDuelOutcome now returns 'fighterA' | 'fighterB' | 'tie'.
 *  - On tie, advanceFromDuelResult re-deals cards for the same pair and
 *    transitions back to 'duel'. No elimination occurs.
 *  - A defensive rematch cap (REMATCH_CAP = 100) prevents infinite loops:
 *    if reached a deterministic seeded coin flip resolves the match.
 *
 * Seeded RNG:
 *  - All random values use mulberry32 from src/store/rng.ts.
 *  - Card deals use a sequential counter (duel.rngCallCount) derived from the
 *    duel-specific seed (masterSeed XOR (duelIndex + 1) * DUEL_SEED_MULT XOR (rematchRound + 1) * REMATCH_SEED_MULT).
 *  - AI hit/stand decisions use a separate key (seed, duelIndex, playerId,
 *    decisionIndex) to avoid entanglement with card draw order.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { mulberry32 } from '../../store/rng'

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlackjackTournamentCompetitionType = 'LOH' | 'POS'

export type BlackjackTournamentPhase =
  | 'idle'
  | 'league_results'
  | 'spin'
  | 'pick_opponent'
  | 'duel'
  | 'duel_result'
  | 'complete'

export type DuelTurn = 'fighterA' | 'fighterB' | 'finished'

export interface BlackjackDuelState {
  fighterAId: string
  fighterBId: string
  /** Card values: 1=Ace, 2–9=pip value, 10–13=10/J/Q/K (all count as 10). */
  fighterACards: number[]
  fighterBCards: number[]
  fighterAStood: boolean
  fighterBStood: boolean
  fighterABust: boolean
  fighterBBust: boolean
  /** Whose turn it is to act next (or 'finished' when both are done). */
  duelTurn: DuelTurn
  /** Running count of RNG calls consumed by card deals for this duel. */
  rngCallCount: number
}

export interface BlackjackTournamentState {
  competitionType: BlackjackTournamentCompetitionType
  phase: BlackjackTournamentPhase
  stage: 'league' | 'final'

  allPlayerIds: string[]
  remainingPlayerIds: string[]
  eliminatedPlayerIds: string[]
  /** League points during stage one; lives during the final stage. */
  playerScores: Record<string, number>
  /** Frozen league totals used by the ranking reveal. */
  leagueScores: Record<string, number>
  leagueRankings: string[]
  leagueOpponentIds: string[]
  leagueOpponentIndex: number
  /** Finalists in league ranking order, including every tie at the top-three cutoff. */
  finalistIds: string[] | null

  humanPlayerId: string | null
  /** True once the human has been eliminated (spectator mode). */
  isSpectating: boolean

  /** Player who currently holds tournament control (picks the fighters). */
  controllingPlayerId: string | null
  /** First selected fighter for the upcoming or current duel. */
  fighterAId: string | null
  /** Second selected fighter for the upcoming or current duel. */
  fighterBId: string | null

  currentDuel: BlackjackDuelState | null
  /** Winner of the most recently completed duel (set in duel_result phase). */
  duelWinnerId: string | null
  /** Loser of the most recently completed duel. */
  duelLoserId: string | null
  /** Set when the duel loser has reached 0 and is actually eliminated. */
  duelEliminatedId: string | null
  /** True when the last duel ended in a tie — rematch required. */
  isDuelTie: boolean
  /** Running count of rematches for the current duel pair (resets on new pair). */
  rematchCount: number
  /** Running count of completed decisive duels. Used to derive per-duel RNG seeds. */
  duelIndex: number

  /** Set when phase === 'complete'. */
  winnerId: string | null

  seed: number
  /** Guard: outcome thunk only fires once. */
  outcomeResolved: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Multiplier used to derive per-duel seed from the master seed. */
const DUEL_SEED_MULT = 0x9e3779b9
/** Multiplier used to vary rematch seeds so re-dealt cards differ from the tie round. */
const REMATCH_SEED_MULT = 0xbabecafe
/** XOR offset separating AI-decision RNG from card-deal RNG. */
const AI_DECISION_RNG_MASK = 0xdeadbeef
/** XOR offset used for rematch-cap coin flip. */
const REMATCH_CAP_RNG_OFFSET = 128
/** Maximum number of rematches before forcing a deterministic fallback winner. */
export const REMATCH_CAP = 100
export const STARTING_PLAYER_SCORE = 3

/** AI stands on this total or higher (standard soft-17 rule). */
export const AI_STAND_THRESHOLD = 17
/** AI always hits on this total or lower (cannot bust). */
export const AI_HIT_ALWAYS_BELOW = 12
/** Probability the AI hits when total is in [AI_HIT_ALWAYS_BELOW+1, AI_STAND_THRESHOLD-1]. */
export const AI_HIT_PROBABILITY = 0.65

// ─── Pure RNG helpers ─────────────────────────────────────────────────────────

/** Advance a seeded RNG by `count` steps and return the next value. */
function rngAt(seed: number, count: number): number {
  const rng = mulberry32(seed >>> 0)
  for (let i = 0; i < count; i++) rng()
  return rng()
}

/** Derive the card-deal seed for duel number `duelIndex` and `rematchRound`. */
function duelCardSeed(masterSeed: number, duelIndex: number, rematchRound = 0): number {
  return (
    ((masterSeed >>> 0) ^
      (((duelIndex + 1) * DUEL_SEED_MULT) >>> 0) ^
      (((rematchRound + 1) * REMATCH_SEED_MULT) >>> 0)) >>>
    0
  )
}

/** Draw card N (0-indexed by rngCallCount) from a given duel. */
function dealDuelCard(
  masterSeed: number,
  duelIndex: number,
  callCount: number,
  rematchRound = 0
): number {
  return Math.floor(rngAt(duelCardSeed(masterSeed, duelIndex, rematchRound), callCount) * 13) + 1
}

/** FNV-1a 32-bit hash for stable string → uint32. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

// ─── Card helpers (exported for tests) ───────────────────────────────────────

/**
 * Compute a blackjack hand total with optimal ace handling.
 * Aces count as 11, reduced to 1 if the hand would bust.
 */
export function computeTotal(cards: number[]): number {
  let total = 0
  let aces = 0
  for (const c of cards) {
    if (c === 1) {
      total += 11
      aces++
    } else if (c >= 10) {
      total += 10
    } else {
      total += c
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return total
}

/** Human-readable rank string for a card value (1–13). */
export function cardRank(card: number): string {
  const RANKS: Record<number, string> = {
    1: 'A',
    2: '2',
    3: '3',
    4: '4',
    5: '5',
    6: '6',
    7: '7',
    8: '8',
    9: '9',
    10: '10',
    11: 'J',
    12: 'Q',
    13: 'K',
  }
  return RANKS[card] ?? String(card)
}

/**
 * Compute the spinner winner index (0-based) from the master seed and player
 * count. Exported so the UI can pre-compute the winning slot and animate
 * toward it, keeping the visual result in sync with the Redux state.
 *
 * This uses the same formula as `resolveSpinner` in the reducer, so the
 * component can snap the animation to the correct slot before dispatching.
 */
export function computeSpinnerWinnerIndex(seed: number, numPlayers: number): number {
  if (numPlayers <= 0) return 0
  return Math.floor(rngAt(seed, 0) * numPlayers)
}

/** Suit symbol for display (assigned by card index mod 4, purely cosmetic). */
export function cardSuit(cardIndex: number): string {
  return ['♠', '♥', '♦', '♣'][cardIndex % 4]
}

// ─── Duel resolution (exported for tests) ────────────────────────────────────

/**
 * Determine the winner of a blackjack duel.
 *
 * Resolution order:
 *  1. Both bust → tie (rematch).
 *  2. One bust  → non-busted player wins.
 *  3. Different totals → higher total wins.
 *  4. Equal totals → tie (rematch).
 *
 * Returning 'tie' signals to the orchestration layer that a rematch is required.
 * A deterministic fallback winner is applied only when the REMATCH_CAP is reached.
 */
export function resolveDuelOutcome(
  fighterACards: number[],
  fighterBCards: number[]
): 'fighterA' | 'fighterB' | 'tie' {
  const aTotal = computeTotal(fighterACards)
  const bTotal = computeTotal(fighterBCards)
  const aBust = aTotal > 21
  const bBust = bTotal > 21

  if (aBust && bBust) return 'tie' // Both bust → rematch
  if (aBust) return 'fighterB'
  if (bBust) return 'fighterA'
  if (aTotal > bTotal) return 'fighterA'
  if (bTotal > aTotal) return 'fighterB'
  return 'tie' // Equal totals → rematch
}

/**
 * Deterministic fallback winner used when the rematch cap is reached.
 * Seeded coin flip keyed on (masterSeed, duelIndex, fighterAId, fighterBId, rematchCount).
 */
function rematchCapWinner(
  masterSeed: number,
  duelIndex: number,
  fighterAId: string,
  fighterBId: string,
  rematchCount: number
): 'fighterA' | 'fighterB' {
  const flipSeed =
    (duelCardSeed(masterSeed, duelIndex, rematchCount) ^
      fnv1a32(fighterAId) ^
      (fnv1a32(fighterBId) * 0x9e3779b9)) >>>
    0
  const flipVal = rngAt(flipSeed, REMATCH_CAP_RNG_OFFSET)
  return flipVal < 0.5 ? 'fighterA' : 'fighterB'
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
  if (total >= AI_STAND_THRESHOLD) return false
  if (total <= AI_HIT_ALWAYS_BELOW) return true
  return rngValue < AI_HIT_PROBABILITY
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
  decisionIndex: number
): number {
  const idHash = fnv1a32(playerId)
  const s =
    ((masterSeed >>> 0) ^
      (((duelIndex + 1) * DUEL_SEED_MULT) >>> 0) ^
      idHash ^
      (((decisionIndex + 1) * AI_DECISION_RNG_MASK) >>> 0)) >>>
    0
  return mulberry32(s)()
}

/**
 * AI picks two fighters for the controlling player.
 * When possible, the controller sends two opponents into the duel instead of
 * risking themselves. If only one opponent remains, the controller must duel
 * that player directly.
 * Returns null when no valid pair can be formed.
 */
export function aiPickFighters(
  masterSeed: number,
  duelIndex: number,
  controllingPlayerId: string,
  remainingPlayerIds: string[]
): { fighterAId: string; fighterBId: string } | null {
  const opponents = remainingPlayerIds.filter((id) => id !== controllingPlayerId)
  if (opponents.length === 0) return null
  if (opponents.length === 1) {
    return { fighterAId: controllingPlayerId, fighterBId: opponents[0] }
  }
  const idHash = fnv1a32(controllingPlayerId)
  const s =
    ((masterSeed >>> 0) ^ (((duelIndex + 1) * DUEL_SEED_MULT) >>> 0) ^ idHash ^ 0xcafebabe) >>> 0
  const rng = mulberry32(s)
  const fighterAIndex = Math.floor(rng() * opponents.length)
  const fighterAId = opponents[fighterAIndex]
  const remainingOpponents = opponents.filter((_, idx) => idx !== fighterAIndex)
  const fighterBId = remainingOpponents[Math.floor(rng() * remainingOpponents.length)]
  return { fighterAId, fighterBId }
}

/** Deterministically resolve the AI-only half of the opening round robin. */
export function simulateAiLeagueScores(
  playerIds: string[],
  humanPlayerId: string | null,
  seed: number
): Record<string, number> {
  const scores = Object.fromEntries(playerIds.map((id) => [id, 0]))
  const aiIds = playerIds.filter((id) => id !== humanPlayerId)
  for (let i = 0; i < aiIds.length; i++) {
    for (let j = i + 1; j < aiIds.length; j++) {
      const a = aiIds[i]
      const b = aiIds[j]
      const rng = mulberry32((seed ^ fnv1a32(`league:${a}:${b}`)) >>> 0)
      const winner = rng() < 0.5 ? a : b
      const loser = winner === a ? b : a
      scores[winner] += 1
      scores[loser] -= 1
    }
  }
  return scores
}

export function rankLeaguePlayers(
  playerIds: string[],
  scores: Record<string, number>,
  seed: number
): string[] {
  return [...playerIds].sort(
    (a, b) =>
      (scores[b] ?? 0) - (scores[a] ?? 0) ||
      (fnv1a32(`${seed}:${a}`) >>> 0) - (fnv1a32(`${seed}:${b}`) >>> 0)
  )
}

/** Select the top three scores without using an invisible tiebreaker at the cutoff. */
export function selectLeagueFinalists(
  leagueRankings: string[],
  scores: Record<string, number>,
  guaranteedPlaces = 3
): string[] {
  if (leagueRankings.length <= guaranteedPlaces) return [...leagueRankings]
  const cutoffId = leagueRankings[guaranteedPlaces - 1]
  const cutoffScore = scores[cutoffId] ?? 0
  return leagueRankings.filter((id) => (scores[id] ?? 0) >= cutoffScore)
}

function shuffleLeagueOpponents(ids: string[], seed: number): string[] {
  const result = [...ids]
  const rng = mulberry32((seed ^ 0x1ea6e001) >>> 0)
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: BlackjackTournamentState = {
  competitionType: 'LOH',
  phase: 'idle',
  stage: 'league',

  allPlayerIds: [],
  remainingPlayerIds: [],
  eliminatedPlayerIds: [],
  playerScores: {},
  leagueScores: {},
  leagueRankings: [],
  leagueOpponentIds: [],
  leagueOpponentIndex: 0,
  finalistIds: null,

  humanPlayerId: null,
  isSpectating: false,

  controllingPlayerId: null,
  fighterAId: null,
  fighterBId: null,

  currentDuel: null,
  duelWinnerId: null,
  duelLoserId: null,
  duelEliminatedId: null,
  isDuelTie: false,
  rematchCount: 0,
  duelIndex: 0,

  winnerId: null,

  seed: 0,
  outcomeResolved: false,
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Auto-populate fighterAId/fighterBId when only two players remain so
 * the UI can fast-path directly into the duel without manual selection.
 */
function autoSetFighters(state: BlackjackTournamentState): void {
  const controller = state.controllingPlayerId
  const others = state.remainingPlayerIds.filter((id) => id !== controller)
  if (others.length === 1 && controller) {
    state.fighterAId = controller
    state.fighterBId = others[0]
  } else {
    state.fighterAId = null
    state.fighterBId = null
  }
}

/**
 * Deal a fresh set of starting cards for fighterA and fighterB and
 * initialise (or reset) the currentDuel state.
 */
function dealDuelCards(
  state: BlackjackTournamentState,
  fighterAId: string,
  fighterBId: string
): void {
  const rematch = state.rematchCount
  let rngCount = 0
  const a1 = dealDuelCard(state.seed, state.duelIndex, rngCount++, rematch)
  const a2 = dealDuelCard(state.seed, state.duelIndex, rngCount++, rematch)
  const b1 = dealDuelCard(state.seed, state.duelIndex, rngCount++, rematch)
  const b2 = dealDuelCard(state.seed, state.duelIndex, rngCount++, rematch)

  const fighterACards = [a1, a2]
  const fighterBCards = [b1, b2]
  const fighterABust = computeTotal(fighterACards) > 21
  const fighterBBust = computeTotal(fighterBCards) > 21

  // Fighter A goes first; skip to B or finish if already bust.
  const duelTurn: DuelTurn = fighterABust ? (fighterBBust ? 'finished' : 'fighterB') : 'fighterA'

  state.currentDuel = {
    fighterAId,
    fighterBId,
    fighterACards,
    fighterBCards,
    fighterAStood: false,
    fighterBStood: false,
    fighterABust,
    fighterBBust,
    duelTurn,
    rngCallCount: rngCount,
  }
}

function finishLeague(state: BlackjackTournamentState): void {
  state.leagueScores = { ...state.playerScores }
  state.leagueRankings = rankLeaguePlayers(state.allPlayerIds, state.leagueScores, state.seed)
  const finalists = selectLeagueFinalists(state.leagueRankings, state.leagueScores)
  state.finalistIds = finalists
  state.remainingPlayerIds = finalists
  const finalistSet = new Set(finalists)
  state.eliminatedPlayerIds = state.leagueRankings.filter((id) => !finalistSet.has(id))
  state.fighterAId = null
  state.fighterBId = null
  state.currentDuel = null
  state.duelWinnerId = null
  state.duelLoserId = null
  state.duelEliminatedId = null
  state.phase = 'league_results'
}

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
        participantIds: string[]
        competitionType: BlackjackTournamentCompetitionType
        seed: number
        humanPlayerId: string | null
      }>
    ) {
      const { participantIds, competitionType, seed, humanPlayerId } = action.payload
      state.competitionType = competitionType
      state.stage = 'league'
      state.allPlayerIds = [...participantIds]
      state.remainingPlayerIds = [...participantIds]
      state.eliminatedPlayerIds = []
      state.playerScores = simulateAiLeagueScores(participantIds, humanPlayerId, seed)
      state.leagueScores = { ...state.playerScores }
      state.leagueRankings = []
      state.leagueOpponentIds =
        humanPlayerId && participantIds.includes(humanPlayerId)
          ? shuffleLeagueOpponents(
              participantIds.filter((id) => id !== humanPlayerId),
              seed
            )
          : []
      state.leagueOpponentIndex = 0
      state.finalistIds = null
      state.humanPlayerId = humanPlayerId
      state.isSpectating = false
      state.controllingPlayerId = null
      state.fighterAId = null
      state.fighterBId = null
      state.currentDuel = null
      state.duelWinnerId = null
      state.duelLoserId = null
      state.duelEliminatedId = null
      state.isDuelTie = false
      state.rematchCount = 0
      state.duelIndex = 0
      state.winnerId = null
      state.seed = seed
      state.outcomeResolved = false

      if (participantIds.length <= 1) {
        state.winnerId = participantIds[0] ?? null
        state.phase = 'complete'
      } else {
        const firstOpponent = state.leagueOpponentIds[0]
        if (humanPlayerId && firstOpponent) {
          state.fighterAId = humanPlayerId
          state.fighterBId = firstOpponent
          dealDuelCards(state, humanPlayerId, firstOpponent)
          state.phase = 'duel'
        } else {
          finishLeague(state)
        }
      }
    },

    startFinalStage(state) {
      if (state.phase !== 'league_results' || !state.finalistIds?.length) return
      state.stage = 'final'
      state.remainingPlayerIds = [...state.finalistIds]
      for (const id of state.finalistIds) state.playerScores[id] = STARTING_PLAYER_SCORE
      state.isSpectating = Boolean(
        state.humanPlayerId && !state.remainingPlayerIds.includes(state.humanPlayerId)
      )
      state.controllingPlayerId = null
      state.fighterAId = null
      state.fighterBId = null
      state.currentDuel = null
      state.duelWinnerId = null
      state.duelLoserId = null
      state.duelEliminatedId = null
      state.rematchCount = 0
      state.duelIndex = 0
      if (state.remainingPlayerIds.length <= 1) {
        state.winnerId = state.remainingPlayerIds[0] ?? null
        state.phase = 'complete'
      } else {
        state.phase = 'spin'
      }
    },

    /**
     * Resolve the spinner animation: pick a random controller from remaining
     * players and advance to pick_opponent.
     * When only 2 players remain, auto-populate fighterAId/fighterBId so the
     * UI can fast-path directly into the duel.
     */
    resolveSpinner(state) {
      if (state.phase !== 'spin') return
      const idx = Math.floor(rngAt(state.seed, 0) * state.remainingPlayerIds.length)
      state.controllingPlayerId = state.remainingPlayerIds[idx] ?? state.remainingPlayerIds[0]
      state.rematchCount = 0
      autoSetFighters(state)
      state.phase = 'pick_opponent'
    },

    /**
     * Controller selects two fighters for the duel.
     * Validates the pair (both must be in remainingPlayerIds, must be distinct),
     * initialises the duel with 2 starting cards each, and advances to 'duel'.
     * The controller is NOT required to be one of the fighters.
     */
    selectPair(state, action: PayloadAction<{ fighterAId: string; fighterBId: string }>) {
      if (state.phase !== 'pick_opponent') return
      if (!state.controllingPlayerId) return
      const { fighterAId, fighterBId } = action.payload
      if (!state.remainingPlayerIds.includes(fighterAId)) return
      if (!state.remainingPlayerIds.includes(fighterBId)) return
      if (fighterAId === fighterBId) return

      state.fighterAId = fighterAId
      state.fighterBId = fighterBId
      state.rematchCount = 0
      dealDuelCards(state, fighterAId, fighterBId)
      state.phase = 'duel'
    },

    /**
     * Active fighter takes a card (hit).
     * Advances the duel turn when the fighter busts.
     */
    hitCurrentPlayer(state) {
      if (state.phase !== 'duel' || !state.currentDuel) return
      const duel = state.currentDuel
      if (duel.duelTurn === 'finished') return

      const card = dealDuelCard(state.seed, state.duelIndex, duel.rngCallCount, state.rematchCount)
      duel.rngCallCount++

      if (duel.duelTurn === 'fighterA') {
        duel.fighterACards.push(card)
        if (computeTotal(duel.fighterACards) > 21) {
          duel.fighterABust = true
          duel.duelTurn = duel.fighterBStood || duel.fighterBBust ? 'finished' : 'fighterB'
        }
      } else {
        duel.fighterBCards.push(card)
        if (computeTotal(duel.fighterBCards) > 21) {
          duel.fighterBBust = true
          duel.duelTurn = duel.fighterAStood || duel.fighterABust ? 'finished' : 'fighterA'
        }
      }
    },

    /**
     * Active fighter stands (takes no more cards).
     * Switches turn to the other fighter or marks the duel as finished.
     */
    standCurrentPlayer(state) {
      if (state.phase !== 'duel' || !state.currentDuel) return
      const duel = state.currentDuel
      if (duel.duelTurn === 'finished') return

      if (duel.duelTurn === 'fighterA') {
        duel.fighterAStood = true
        duel.duelTurn = duel.fighterBStood || duel.fighterBBust ? 'finished' : 'fighterB'
      } else {
        duel.fighterBStood = true
        duel.duelTurn = duel.fighterAStood || duel.fighterABust ? 'finished' : 'fighterA'
      }
    },

    /**
     * Resolve the duel once duelTurn === 'finished'.
     * - Decisive result: sets duelWinnerId/duelLoserId and transitions to 'duel_result'.
     * - Tie (equal totals or both bust): sets isDuelTie=true and transitions to
     *   'duel_result' so the UI can display a "Tie — Rematch!" beat before rematching.
     */
    resolveDuel(state) {
      if (state.phase !== 'duel' || !state.currentDuel) return
      if (state.currentDuel.duelTurn !== 'finished') return

      const duel = state.currentDuel
      const outcome = resolveDuelOutcome(duel.fighterACards, duel.fighterBCards)

      if (outcome === 'tie') {
        // Apply rematch-cap fallback if we've exceeded the limit.
        if (state.rematchCount >= REMATCH_CAP) {
          const fallback = rematchCapWinner(
            state.seed,
            state.duelIndex,
            duel.fighterAId,
            duel.fighterBId,
            state.rematchCount
          )
          state.duelWinnerId = fallback === 'fighterA' ? duel.fighterAId : duel.fighterBId
          state.duelLoserId = fallback === 'fighterA' ? duel.fighterBId : duel.fighterAId
          state.duelEliminatedId =
            state.stage === 'final' &&
            (state.playerScores[state.duelLoserId] ?? STARTING_PLAYER_SCORE) <= 1
              ? state.duelLoserId
              : null
          state.isDuelTie = false
        } else {
          state.duelWinnerId = null
          state.duelLoserId = null
          state.duelEliminatedId = null
          state.isDuelTie = true
        }
      } else {
        state.duelWinnerId = outcome === 'fighterA' ? duel.fighterAId : duel.fighterBId
        state.duelLoserId = outcome === 'fighterA' ? duel.fighterBId : duel.fighterAId
        state.duelEliminatedId =
          state.stage === 'final' &&
          (state.playerScores[state.duelLoserId] ?? STARTING_PLAYER_SCORE) <= 1
            ? state.duelLoserId
            : null
        state.isDuelTie = false
      }
      state.phase = 'duel_result'
    },

    /**
     * Advance after the duel result is shown.
     *
     * Tie path:
     *  - Increment rematchCount.
     *  - Re-deal cards for the same fighter pair.
     *  - Transition back to 'duel'.
     *  - No elimination.
     *
     * Decisive path:
     *  - Eliminate loser, update remainingPlayerIds.
     *  - Set winner as new controllingPlayerId.
     *  - Increment duelIndex.
     *  - Transition to 'pick_opponent' (≥2 remain) or 'complete' (1 remains).
     */
    advanceFromDuelResult(state) {
      if (state.phase !== 'duel_result') return

      if (state.isDuelTie) {
        // Rematch: re-deal cards for the same pair.
        state.rematchCount++
        const aId = state.fighterAId!
        const bId = state.fighterBId!
        dealDuelCards(state, aId, bId)
        state.isDuelTie = false
        state.duelWinnerId = null
        state.duelLoserId = null
        state.duelEliminatedId = null
        state.phase = 'duel'
        return
      }

      if (!state.duelWinnerId || !state.duelLoserId) return

      const winner = state.duelWinnerId
      const loser = state.duelLoserId

      if (state.stage === 'league') {
        state.playerScores[winner] = (state.playerScores[winner] ?? 0) + 1
        state.playerScores[loser] = (state.playerScores[loser] ?? 0) - 1
        state.leagueScores = { ...state.playerScores }
        state.leagueOpponentIndex += 1
        state.duelIndex++
        state.rematchCount = 0
        state.duelWinnerId = null
        state.duelLoserId = null
        state.duelEliminatedId = null

        const nextOpponent = state.leagueOpponentIds[state.leagueOpponentIndex]
        if (state.humanPlayerId && nextOpponent) {
          state.fighterAId = state.humanPlayerId
          state.fighterBId = nextOpponent
          dealDuelCards(state, state.humanPlayerId, nextOpponent)
          state.phase = 'duel'
        } else {
          finishLeague(state)
        }
        return
      }

      const nextLoserScore = Math.max(0, (state.playerScores[loser] ?? STARTING_PLAYER_SCORE) - 1)
      state.playerScores[loser] = nextLoserScore

      if (nextLoserScore <= 0) {
        state.remainingPlayerIds = state.remainingPlayerIds.filter((id) => id !== loser)
        if (!state.eliminatedPlayerIds.includes(loser)) {
          state.eliminatedPlayerIds.push(loser)
        }
        state.duelEliminatedId = loser

        if (state.humanPlayerId === loser) {
          state.isSpectating = true
        }
      } else {
        state.duelEliminatedId = null
      }

      state.controllingPlayerId = winner
      state.fighterAId = null
      state.fighterBId = null
      state.currentDuel = null
      state.rematchCount = 0
      state.duelIndex++

      if (state.remainingPlayerIds.length <= 1) {
        state.winnerId = state.remainingPlayerIds[0] ?? null
        state.phase = 'complete'
      } else {
        autoSetFighters(state)
        state.phase = 'pick_opponent'
      }
    },

    skipBlackjackTournamentToEnd(state) {
      if (!state.isSpectating || state.remainingPlayerIds.length === 0) return
      const ranked = [...state.remainingPlayerIds].sort((a, b) => {
        const scoreDiff = (state.playerScores[b] ?? 0) - (state.playerScores[a] ?? 0)
        if (scoreDiff !== 0) return scoreDiff
        return a.localeCompare(b)
      })
      const winner = ranked[0]
      ranked.slice(1).forEach((id) => {
        if (!state.eliminatedPlayerIds.includes(id)) state.eliminatedPlayerIds.push(id)
        state.playerScores[id] = 0
      })
      state.remainingPlayerIds = [winner]
      state.winnerId = winner
      state.controllingPlayerId = winner
      state.currentDuel = null
      state.fighterAId = null
      state.fighterBId = null
      state.phase = 'complete'
    },

    markBlackjackTournamentOutcomeResolved(state) {
      state.outcomeResolved = true
    },

    resetBlackjackTournament() {
      return initialState
    },
  },
})

export const {
  initBlackjackTournament,
  startFinalStage,
  resolveSpinner,
  selectPair,
  hitCurrentPlayer,
  standCurrentPlayer,
  resolveDuel,
  advanceFromDuelResult,
  skipBlackjackTournamentToEnd,
  markBlackjackTournamentOutcomeResolved,
  resetBlackjackTournament,
} = blackjackTournamentSlice.actions

export default blackjackTournamentSlice.reducer
