/**
 * Redux slice for the "Closest Without Going Over" (CWGO) competition.
 *
 * State machine flow:
 *   idle → mass_input → mass_reveal → (repeat while >2 alive)
 *        → duel_input → duel_reveal → (repeat until 1 alive) → complete
 *
 * The final always starts with exactly two players. choose_duel remains only as
 * a defensive/legacy state for persisted games created by older builds.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { mulberry32 } from '../../store/rng'
import { CWGO_QUESTIONS } from './cwgoQuestions'
import type { CwgoQuestion } from './cwgoQuestions'
import {
  generateAIQuestionGuess,
  generateAIResponseTimeMs,
  aiSkillForPlayer,
  computeWinnerClosestWithoutGoingOver,
  computeMassElimination,
  computeSortedResultsForReveal,
} from './cwgoHelpers'
import type { CwgoGuessEntry, CwgoResult } from './cwgoHelpers'

// ─── Question-order helpers ───────────────────────────────────────────────────

/**
 * Generate a deterministic full-permutation shuffle of all question indices.
 * Uses Fisher-Yates with a seeded RNG so the same seed always yields the same
 * order, but different seeds yield different orders.
 */
function generateQuestionOrder(seed: number): number[] {
  const order = Array.from({ length: CWGO_QUESTIONS.length }, (_, i) => i)
  const rng = mulberry32((seed ^ 0x6c62272e) >>> 0)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const swapVal = order[i]
    order[i] = order[j]
    order[j] = swapVal
  }
  return order
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CwgoStatus =
  | 'idle'
  | 'mass_input'
  | 'mass_reveal'
  | 'choose_duel'
  | 'duel_input'
  | 'duel_reveal'
  | 'complete'

export type CwgoPrizeType = 'LOH' | 'POS'

export interface CwgoState {
  status: CwgoStatus
  stage: 'qualifier' | 'final'
  prizeType: CwgoPrizeType
  seed: number
  /** Remaining lives in the final. Empty during qualifying rounds. */
  playerScores: Record<string, number>
  /** IDs of players still competing. */
  aliveIds: string[]
  /** Current question index into CWGO_QUESTIONS. */
  questionIdx: number
  /**
   * Shuffled permutation of all question indices for this competition.
   * Generated deterministically from the seed at competition start.
   * Used so that question order varies per challenge invocation.
   */
  questionOrder: number[]
  /** Guesses submitted for the current round (keyed by playerId). */
  guesses: Record<string, number>
  /** Submission time from question display, keyed by playerId. */
  responseTimesMs: Record<string, number>
  /** Sorted results for the current reveal phase. */
  revealResults: CwgoResult[]
  /** IDs eliminated in the latest round. */
  lastEliminated: string[]
  /**
   * Cumulative elimination order across all rounds and duels.
   * Index 0 = first player eliminated (worst finisher).
   * Used to set lastHohCompFinisherId accurately for the third-nominee rule.
   */
  eliminationOrder: string[]
  /** Round counter (used for seeding RNG per-round). */
  round: number
  /** IDs of the two players currently dueling. */
  duelPair: [string, string] | null
  /** ID of the winner of the latest duel. */
  duelWinnerId: string | null
  /** ID of the current leader (winner of the last mass round or duel). */
  leaderId: string | null
  /**
   * True once resolveCompetitionOutcome has successfully dispatched the winner.
   * Guards against double-dispatch (idempotency).
   */
  outcomeResolved: boolean
}

// ─── Initial State ────────────────────────────────────────────────────────────

const initialState: CwgoState = {
  status: 'idle',
  stage: 'qualifier',
  prizeType: 'LOH',
  seed: 0,
  playerScores: {},
  aliveIds: [],
  questionIdx: 0,
  questionOrder: [],
  guesses: {},
  responseTimesMs: {},
  revealResults: [],
  lastEliminated: [],
  eliminationOrder: [],
  round: 0,
  duelPair: null,
  duelWinnerId: null,
  leaderId: null,
  outcomeResolved: false,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick a question index from the pre-generated questionOrder.
 * Falls back to the XOR-based deterministic pick if questionOrder is empty.
 */
function pickQuestionFromOrder(questionOrder: number[], round: number): number {
  if (questionOrder.length > 0) {
    return questionOrder[round % questionOrder.length]
  }
  // Legacy fallback (should not happen with a properly initialised state)
  const rng = mulberry32((round * 0x9e3779b9) >>> 0)
  return Math.floor(rng() * CWGO_QUESTIONS.length)
}

/** Auto-fill AI guesses for all non-human aliveIds using seeded RNG. */
function fillAIGuesses(
  guesses: Record<string, number>,
  responseTimesMs: Record<string, number>,
  aliveIds: string[],
  humanIds: Set<string>,
  question: CwgoQuestion,
  seed: number,
  round: number
): { guesses: Record<string, number>; responseTimesMs: Record<string, number> } {
  const updated = { ...guesses }
  const updatedTimes = { ...responseTimesMs }
  let aiSeed = (seed ^ (round * 0x5851f42d)) >>> 0
  for (const id of aliveIds) {
    if (!humanIds.has(id) && updated[id] === undefined) {
      // The contestant's knowledge trait is stable. Question difficulty now
      // changes recall probability/uncertainty instead of replacing the person
      // with a newly sampled weak or strong AI every round.
      const aiSkill = aiSkillForPlayer(id)
      aiSeed = (mulberry32(aiSeed)() * 0x100000000) >>> 0
      const guess = generateAIQuestionGuess(question, aiSkill, aiSeed)
      updated[id] = guess
      updatedTimes[id] = generateAIResponseTimeMs(question.difficulty, seed, id, round, {
        answerMode: question.answerMode,
        knewAnswer: question.answerMode !== 'estimate' && guess === question.answer,
        aiSkill,
      })
      // Advance seed for next AI player
      aiSeed = (mulberry32(aiSeed)() * 0x100000000) >>> 0
    }
  }
  return { guesses: updated, responseTimesMs: updatedTimes }
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const cwgoSlice = createSlice({
  name: 'cwgo',
  initialState,
  reducers: {
    /** Start a new CWGO competition with the given players and prize type. */
    startCwgoCompetition(
      state,
      action: PayloadAction<{
        participantIds: string[]
        prizeType: CwgoPrizeType
        seed: number
      }>
    ) {
      const { participantIds, prizeType, seed } = action.payload
      // Defensive: if seed is zero or missing, generate one from Date.now() to
      // avoid every challenge with an unset seed producing the same question.
      const safeSeed =
        seed && seed !== 0 ? seed : (mulberry32(Date.now() >>> 0)() * 0x100000000) >>> 0
      const questionOrder = generateQuestionOrder(safeSeed)
      state.status = 'mass_input'
      state.stage = 'qualifier'
      state.prizeType = prizeType
      state.seed = safeSeed
      state.playerScores = {}
      state.aliveIds = [...participantIds]
      state.round = 0
      state.questionOrder = questionOrder
      state.guesses = {}
      state.responseTimesMs = {}
      state.revealResults = []
      state.lastEliminated = []
      state.eliminationOrder = []
      state.duelPair = null
      state.duelWinnerId = null
      state.leaderId = null
      state.outcomeResolved = false
      state.questionIdx = pickQuestionFromOrder(questionOrder, 0)
      if (participantIds.length <= 1) {
        state.status = 'complete'
      } else if (participantIds.length === 2) {
        state.stage = 'final'
        participantIds.forEach((id) => {
          state.playerScores[id] = 3
        })
        state.leaderId = participantIds[0] ?? null
        state.duelPair = [participantIds[0], participantIds[1]]
        state.status = 'duel_input'
      }
      console.log('[cwgo] startCwgoCompetition', {
        safeSeed,
        prizeType,
        participants: participantIds.length,
      })
    },

    /**
     * Set guesses for one or more players.
     * Typically called by the human player submitting their guess,
     * or by AI fill logic.
     */
    setGuesses(state, action: PayloadAction<Record<string, number>>) {
      const validEntries = Object.entries(action.payload).filter(
        ([, value]) => Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
      )
      state.guesses = { ...state.guesses, ...Object.fromEntries(validEntries) }
    },

    setResponseTimes(state, action: PayloadAction<Record<string, number>>) {
      const validEntries = Object.entries(action.payload).filter(
        ([, value]) => Number.isFinite(value) && value >= 0
      )
      state.responseTimesMs = { ...state.responseTimesMs, ...Object.fromEntries(validEntries) }
    },

    /**
     * Auto-fill AI guesses for all non-human alive players using seeded RNG.
     * humanIds is the set of player IDs that are human-controlled.
     */
    autoFillAIGuesses(state, action: PayloadAction<{ humanIds: string[] }>) {
      const { humanIds } = action.payload
      const question = CWGO_QUESTIONS[state.questionIdx]
      if (!question) return
      const humanSet = new Set(humanIds)
      const filled = fillAIGuesses(
        state.guesses,
        state.responseTimesMs,
        state.aliveIds,
        humanSet,
        question,
        state.seed,
        state.round
      )
      state.guesses = filled.guesses
      state.responseTimesMs = filled.responseTimesMs
    },

    /**
     * Transition from mass_input → mass_reveal.
     * Computes sorted results for display.
     */
    revealMassResults(state) {
      if (state.status !== 'mass_input') return
      const question = CWGO_QUESTIONS[state.questionIdx]
      if (!question) return

      const entries: CwgoGuessEntry[] = state.aliveIds.map((id) => ({
        playerId: id,
        guess: state.guesses[id] ?? Number.MAX_SAFE_INTEGER,
      }))

      state.revealResults = computeSortedResultsForReveal(
        entries,
        question.answer,
        state.responseTimesMs,
        state.seed ^ state.round
      )
      // Track the mass-round winner for legacy/persisted choose-duel states.
      const massWinnerId = computeWinnerClosestWithoutGoingOver(
        entries,
        question.answer,
        state.responseTimesMs,
        state.seed ^ state.round
      )
      if (massWinnerId) state.leaderId = massWinnerId
      const elimination = computeMassElimination(
        entries,
        question.answer,
        state.aliveIds,
        state.responseTimesMs,
        state.seed ^ state.round
      )
      state.lastEliminated = elimination.eliminated
      state.status = 'mass_reveal'
    },

    /**
     * Confirm the mass elimination — moves eliminated players out of aliveIds.
     * Qualifiers continue until exactly two players remain, then the final duel starts.
     */
    confirmMassElimination(state) {
      if (state.status !== 'mass_reveal') return
      const question = CWGO_QUESTIONS[state.questionIdx]
      if (!question) return

      const entries: CwgoGuessEntry[] = state.aliveIds.map((id) => ({
        playerId: id,
        // Missing answers are defensive automatic losses, never free zero guesses.
        guess: state.guesses[id] ?? Number.MAX_SAFE_INTEGER,
      }))

      const { eliminated, surviving, redraw } = computeMassElimination(
        entries,
        question.answer,
        state.aliveIds,
        state.responseTimesMs,
        state.seed ^ state.round
      )

      state.lastEliminated = eliminated
      state.eliminationOrder.push(...eliminated)
      state.aliveIds = surviving
      state.guesses = {}
      state.responseTimesMs = {}
      state.round += 1
      state.questionIdx = pickQuestionFromOrder(state.questionOrder, state.round)

      if (redraw || surviving.length > 2) {
        state.status = 'mass_input'
      } else if (surviving.length <= 1) {
        // Defensive only: computeMassElimination preserves two finalists when a
        // qualifier begins with 3+ players.
        state.status = 'complete'
      } else {
        state.stage = 'final'
        surviving.forEach((id) => {
          state.playerScores[id] = 3
        })
        state.duelWinnerId = null
        state.duelPair = [surviving[0], surviving[1]]
        state.status = 'duel_input'
      }
    },

    /**
     * Set the duel pair (called only by legacy/persisted 3-player final states).
     * Transitions from choose_duel → duel_input.
     */
    chooseDuelPair(state, action: PayloadAction<[string, string]>) {
      if (state.status !== 'choose_duel') return
      const [first, second] = action.payload
      if (first === second || !state.aliveIds.includes(first) || !state.aliveIds.includes(second))
        return
      if (state.aliveIds.length > 2 && (first === state.leaderId || second === state.leaderId))
        return
      state.duelPair = action.payload
      state.duelWinnerId = null
      state.questionIdx = pickQuestionFromOrder(state.questionOrder, state.round)
      // Clear any previous guesses and move into duel input phase
      state.guesses = {}
      state.responseTimesMs = {}
      state.status = 'duel_input'
    },

    /**
     * Transition from duel_input → duel_reveal.
     * Computes sorted results for the duel pair.
     */
    revealDuelResults(state) {
      if (state.status !== 'duel_input') return
      if (!state.duelPair) return
      const question = CWGO_QUESTIONS[state.questionIdx]
      if (!question) return

      const entries: CwgoGuessEntry[] = state.duelPair.map((id) => ({
        playerId: id,
        guess: state.guesses[id] ?? Number.MAX_SAFE_INTEGER,
      }))

      state.revealResults = computeSortedResultsForReveal(
        entries,
        question.answer,
        state.responseTimesMs,
        state.seed ^ state.round
      )
      const winnerId = computeWinnerClosestWithoutGoingOver(
        entries,
        question.answer,
        state.responseTimesMs,
        state.seed ^ state.round
      )
      state.duelWinnerId = winnerId
      if (winnerId) state.leaderId = winnerId
      state.status = 'duel_reveal'
    },

    /**
     * Confirm duel result. The loser drops one life; the same two finalists move
     * directly to the next question until one reaches zero lives.
     */
    confirmDuelElimination(state) {
      if (state.status !== 'duel_reveal') return
      if (!state.duelPair) return

      // Both duelists went over: keep the pair and replay on a fresh question.
      if (!state.duelWinnerId) {
        state.guesses = {}
        state.responseTimesMs = {}
        state.round += 1
        state.questionIdx = pickQuestionFromOrder(state.questionOrder, state.round)
        state.status = 'duel_input'
        return
      }

      const loser = state.duelPair.find((id) => id !== state.duelWinnerId)
      if (loser) {
        const nextLives = Math.max(0, (state.playerScores[loser] ?? 3) - 1)
        state.playerScores[loser] = nextLives
        if (nextLives === 0) {
          state.aliveIds = state.aliveIds.filter((id) => id !== loser)
          state.lastEliminated = [loser]
          state.eliminationOrder.push(loser)
        } else {
          state.lastEliminated = []
        }
      }

      state.leaderId = state.duelWinnerId
      state.duelPair = null
      state.duelWinnerId = null
      state.guesses = {}
      state.responseTimesMs = {}
      state.round += 1

      if (state.aliveIds.length <= 1) {
        state.status = 'complete'
      } else {
        state.questionIdx = pickQuestionFromOrder(state.questionOrder, state.round)
        if (state.aliveIds.length === 2) {
          state.duelPair = [state.aliveIds[0], state.aliveIds[1]]
          state.status = 'duel_input'
        } else {
          // Defensive fallback for a persisted legacy 3-player final.
          state.status = 'choose_duel'
        }
      }
    },

    /** Reset to idle (e.g. when navigating away). */
    resetCwgo() {
      return initialState
    },

    /**
     * Mark the competition outcome as resolved so resolveCompetitionOutcome
     * cannot fire a second time (idempotency guard).
     */
    markCwgoOutcomeResolved(state) {
      state.outcomeResolved = true
    },
  },
})

export const {
  startCwgoCompetition,
  setGuesses,
  setResponseTimes,
  autoFillAIGuesses,
  revealMassResults,
  confirmMassElimination,
  chooseDuelPair,
  revealDuelResults,
  confirmDuelElimination,
  resetCwgo,
  markCwgoOutcomeResolved,
} = cwgoSlice.actions

export default cwgoSlice.reducer
