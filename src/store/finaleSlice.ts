/**
 * finaleSlice – Redux state for the Final Jury voting sequence.
 *
 * Lifecycle:
 *   startFinale()  → overlay appears, jurors listed
 *   revealNextJuror() / castVote() → votes accumulate one by one
 *   finalizeFinale() → winner computed, player state updated via callback
 */

import { createSlice, createSelector, type PayloadAction } from '@reduxjs/toolkit'
import type { RootState, AppDispatch } from './store'
import { mulberry32, seededPickN } from './rng'
import { resolvePublicJuryVote } from '../publicOpinion/PublicFinalVoteService'
import type { PlayerPublicProfile } from '../publicOpinion/types'
import type { RealityDomainState } from '../social/reality'
import {
  aiJurorVote,
  tallyVotes,
  resolvePublicVoteParity,
  juryReturnCandidate,
  pickPhrase,
  JURY_LOCKED_LINES,
  PUBLIC_JURY_VOTE_LINES,
  realityJurorScorecard,
} from '../utils/juryUtils'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Sentinel juror ID representing the public vote. */
export const PUBLIC_JUROR_ID = '__public__'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JurorReveal {
  jurorId: string
  /** Finalist ID this juror voted for. */
  finalistId: string
  /** Display phrase shown in the bubble, e.g. "I'm voting for…" */
  phrase: string
}

export interface FinaleState {
  /** Whether the finale overlay is active. */
  isActive: boolean
  /** IDs of the 2 players competing as finalists. */
  finalistIds: string[]
  /** Original (unshuffled) effective jury IDs — preserved for rerolling. */
  jurorIds: string[]
  /** Ordered list of juror IDs (shuffle-ordered for reveal). */
  revealOrder: string[]
  /**
   * Map of jurorId → voted finalistId.
   * Pre-computed for all AI jurors; human juror slot stays empty until voted.
   */
  votes: Record<string, string>
  /** How many jurors have been "revealed" to the audience so far. */
  revealedCount: number
  /** Juror waiting for human input (ID), or null. */
  awaitingHumanJurorId: string | null
  /** ID of the declared winner after all votes are tallied, or null. */
  winnerId: string | null
  /** ID of the runner-up, or null. */
  runnerUpId: string | null
  /** Whether the jury-return mechanic fired and who came back. */
  returnedJurorId: string | null
  /** Whether the finale has fully completed (winner declared). */
  isComplete: boolean
  /**
   * Guard: prevents startFinale from running more than once per game.
   * Reset only on resetGame (via extraReducers wiring in store).
   */
  hasStarted: boolean
  /** Whether the public juror (__public__) is included in this finale. */
  publicJurorEnabled: boolean
  /** The finalist ID that the public voted for, or null. */
  publicVotedFor: string | null
  /** Explicit public ballot weight used by both resolver and reveal UI. */
  publicVoteWeight: 1 | 2
  /** Compact, history-derived scores used to keep jury rerolls grounded in the season. */
  juryScorecards: Record<string, Record<string, number>>
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: FinaleState = {
  isActive: false,
  finalistIds: [],
  jurorIds: [],
  revealOrder: [],
  votes: {},
  revealedCount: 0,
  awaitingHumanJurorId: null,
  winnerId: null,
  runnerUpId: null,
  returnedJurorId: null,
  isComplete: false,
  hasStarted: false,
  publicJurorEnabled: false,
  publicVotedFor: null,
  publicVoteWeight: 1,
  juryScorecards: {},
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const finaleSlice = createSlice({
  name: 'finale',
  initialState,
  reducers: {
    /**
     * Initialise the finale.
     * Computes AI votes, reveal order, and optional jury-return.
     */
    startFinale(
      state,
      action: PayloadAction<{
        finalistIds: string[]
        /** Jury member IDs (status === 'jury'). */
        jurorIds: string[]
        /** Pre-jury evictee IDs (status === 'evicted'), most-recent last. */
        preJuryIds: string[]
        /** Human player IDs (to show voting UI instead of auto-vote). */
        humanPlayerIds: string[]
        seed: number
        cfg?: {
          enableJuryReturn?: boolean
          americasVoteEnabled?: boolean
        }
        /** Optional public approval profiles to enable the public juror vote. */
        publicApprovalProfiles?: Record<string, PlayerPublicProfile>
        /** Reality history used to ground AI juror decisions in the actual season. */
        reality?: RealityDomainState
      }>
    ) {
      if (state.hasStarted) return // idempotency guard

      const {
        finalistIds,
        jurorIds,
        preJuryIds,
        humanPlayerIds,
        seed,
        cfg,
        publicApprovalProfiles,
        reality,
      } = action.payload

      // ── Resolve public ballot before composing the Tribunal ──────────────
      let publicJurorEnabled = false
      let publicVotedFor: string | null = null
      if (publicApprovalProfiles) {
        const publicVoteResult = resolvePublicJuryVote({
          finalistIds,
          profiles: publicApprovalProfiles,
        })
        if (publicVoteResult.winnerId) {
          publicJurorEnabled = true
          publicVotedFor = publicVoteResult.winnerId
        }
      }

      // ── Jury-return mechanic ──────────────────────────────────────────────
      let effectiveJurorIds = [...jurorIds]
      let returnedJurorId: string | null = null
      if (cfg?.enableJuryReturn) {
        const returnee = juryReturnCandidate(preJuryIds)
        if (returnee) {
          effectiveJurorIds = [...effectiveJurorIds, returnee]
          returnedJurorId = returnee
        }
      }

      // Prefer eight eligible regular members + one public vote. If no eligible
      // pre-Tribunal player remains, the public ballot is visibly worth two.
      const parity = resolvePublicVoteParity(effectiveJurorIds, preJuryIds, publicJurorEnabled)
      effectiveJurorIds = parity.jurorIds
      const publicVoteWeight = parity.publicVoteWeight

      // ── Shuffle jury for reveal order ─────────────────────────────────────
      const rng = mulberry32(seed)
      const shuffled = seededPickN(rng, effectiveJurorIds, effectiveJurorIds.length)

      // ── Pre-compute AI votes ──────────────────────────────────────────────
      const votes: Record<string, string> = {}
      const juryScorecards: Record<string, Record<string, number>> = {}
      for (const jId of effectiveJurorIds) {
        if (humanPlayerIds.includes(jId)) continue // human votes when input arrives
        const scorecard = realityJurorScorecard(jId, finalistIds, reality)
        if (scorecard) juryScorecards[jId] = scorecard
        votes[jId] = aiJurorVote(jId, finalistIds, seed, reality, scorecard)
      }

      // ── Public juror vote ─────────────────────────────────────────────────
      if (publicJurorEnabled && publicVotedFor) {
        votes[PUBLIC_JUROR_ID] = publicVotedFor
        shuffled.push(PUBLIC_JUROR_ID)
        // Include PUBLIC_JUROR_ID in jurorIds so rerollJurySeed preserves it.
        effectiveJurorIds = [...effectiveJurorIds, PUBLIC_JUROR_ID]
      }

      state.isActive = true
      state.hasStarted = true
      state.finalistIds = finalistIds
      state.jurorIds = effectiveJurorIds
      state.revealOrder = shuffled
      state.votes = votes
      state.revealedCount = 0
      state.awaitingHumanJurorId = null
      state.winnerId = null
      state.runnerUpId = null
      state.returnedJurorId = returnedJurorId
      state.isComplete = false
      state.publicJurorEnabled = publicJurorEnabled
      state.publicVotedFor = publicVotedFor
      state.publicVoteWeight = publicVoteWeight
      state.juryScorecards = juryScorecards
    },

    /**
     * Advance the reveal counter by one step.
     * If the next juror is human, set awaitingHumanJurorId.
     * No-op if all jurors are already revealed.
     */
    revealNextJuror(state, action: PayloadAction<{ humanPlayerIds: string[] }>) {
      if (state.revealedCount >= state.revealOrder.length) return
      const nextJurorId = state.revealOrder[state.revealedCount]

      if (action.payload.humanPlayerIds.includes(nextJurorId) && !state.votes[nextJurorId]) {
        state.awaitingHumanJurorId = nextJurorId
      } else {
        state.revealedCount += 1
        state.awaitingHumanJurorId = null
      }
    },

    /**
     * Cast (or force) a vote for a juror.
     * Clears awaitingHumanJurorId and advances the reveal counter.
     */
    castVote(state, action: PayloadAction<{ jurorId: string; finalistId: string }>) {
      const { jurorId, finalistId } = action.payload
      if (!state.finalistIds.includes(finalistId)) return // guard: must vote for a finalist
      state.votes[jurorId] = finalistId
      if (state.awaitingHumanJurorId === jurorId) {
        state.awaitingHumanJurorId = null
        state.revealedCount += 1
      }
    },

    /**
     * Compute final tally and declare the winner.
     * Updates revealedCount to maximum (reveals any still-hidden jurors).
     * No-op if winner already declared.
     */
    finalizeFinale(state, _action: PayloadAction<{ seed: number }>) {
      if (state.isComplete) return

      // Reveal any outstanding jurors
      state.revealedCount = state.revealOrder.length
      state.awaitingHumanJurorId = null

      const tally = tallyVotes(
        state.votes,
        state.publicJurorEnabled ? { [PUBLIC_JUROR_ID]: state.publicVoteWeight ?? 1 } : {}
      )
      const [a, b] = state.finalistIds
      const aVotes = a ? (tally[a] ?? 0) : 0
      const bVotes = b ? (tally[b] ?? 0) : 0

      // An odd persisted vote weight makes a tie impossible. Do not silently
      // select a winner if a malformed/legacy snapshot violates that invariant.
      if (!a || !b || aVotes === bVotes) {
        state.isComplete = false
        return
      }

      const winnerId = aVotes > bVotes ? a : b
      const runnerUpId = state.finalistIds.find((id) => id !== winnerId) ?? null

      state.winnerId = winnerId
      state.runnerUpId = runnerUpId
      state.isComplete = true
    },

    /**
     * Debug: force a specific juror's vote to a specific finalist.
     * Works even if the juror has already voted (override).
     */
    forceJurorVote(state, action: PayloadAction<{ jurorId: string; finalistId: string }>) {
      const { jurorId, finalistId } = action.payload
      if (!state.finalistIds.includes(finalistId)) return
      state.votes[jurorId] = finalistId
    },

    /**
     * Debug: re-roll the reveal order and AI votes using a new seed.
     * Only effective before finalizing.
     * The public juror (PUBLIC_JUROR_ID) is preserved in jurorIds and always
     * placed last in the reveal order; its vote is not re-computed here since
     * it depends on public-opinion state that lives outside this slice.
     */
    rerollJurySeed(state, action: PayloadAction<{ seed: number; humanPlayerIds: string[] }>) {
      if (state.isComplete) return
      const { seed, humanPlayerIds } = action.payload

      // Separate public juror (if present) from regular jurors for shuffle
      const regularJurors = state.jurorIds.filter((id) => id !== PUBLIC_JUROR_ID)
      const rng = mulberry32(seed)
      const shuffled = seededPickN(rng, regularJurors, regularJurors.length)
      // Re-append public juror last if it was enabled
      if (state.publicJurorEnabled) {
        shuffled.push(PUBLIC_JUROR_ID)
      }
      state.revealOrder = shuffled

      for (const jId of state.revealOrder) {
        if (jId === PUBLIC_JUROR_ID) continue // public vote unchanged
        if (humanPlayerIds.includes(jId)) continue
        state.votes[jId] = aiJurorVote(
          jId,
          state.finalistIds,
          seed,
          undefined,
          state.juryScorecards[jId]
        )
      }
      state.revealedCount = 0
      state.winnerId = null
      state.runnerUpId = null
      state.isComplete = false
    },

    /** Close / hide the overlay (after winner is confirmed). */
    dismissFinale(state) {
      state.isActive = false
    },

    /**
     * Full reset – for explicit manual resets (e.g., tests or dev tooling).
     * Game resets are handled automatically via extraReducers below.
     */
    resetFinale() {
      return { ...initialState }
    },

    /**
     * Restore a previously saved finale state (manual save/resume).
     * Replaces the entire finale slice with the snapshot.
     */
    hydrateFinale(_state, action: PayloadAction<FinaleState>) {
      return {
        ...action.payload,
        publicVoteWeight: action.payload.publicVoteWeight ?? 1,
        juryScorecards: action.payload.juryScorecards ?? {},
      }
    },
  },
  extraReducers: (builder) => {
    // Automatically reset finale state whenever the game is fully reset.
    builder.addMatcher(
      (action) => action.type === 'game/resetGame',
      () => ({ ...initialState })
    )
  },
})

export const {
  startFinale,
  revealNextJuror,
  castVote,
  finalizeFinale,
  forceJurorVote,
  rerollJurySeed,
  dismissFinale,
  resetFinale,
  hydrateFinale,
} = finaleSlice.actions

export default finaleSlice.reducer

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectFinale = (state: RootState) => state.finale

export const selectFinaleTimings = createSelector(
  (state: RootState) => state.game.cfg,
  (cfg) => {
    const jurySize = cfg?.jurySize ?? 7
    const tJuryFinale = cfg?.tJuryFinale ?? 42_000
    const tVoteReveal = cfg?.tVoteReveal ?? Math.round(tJuryFinale / jurySize)
    return { tJuryFinale, tVoteReveal }
  }
)

// ─── Thunks ──────────────────────────────────────────────────────────────────

/**
 * Reveal the next juror and — if pacing is enabled — auto-advance after delay.
 * Finalizes the vote after the last reveal.
 */
export const revealNextJurorThunk =
  (humanPlayerIds: string[]) => (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(revealNextJuror({ humanPlayerIds }))

    const finale = getState().finale
    if (finale.awaitingHumanJurorId) return // waiting for human input

    if (finale.revealedCount >= finale.revealOrder.length && !finale.isComplete) {
      const { seed } = getState().game
      dispatch(finalizeFinale({ seed }))
    }
  }

/**
 * Skip-all: reveal every remaining juror at once, auto-casting AI fallback
 * votes for any human jurors that haven't voted yet, then finalize.
 *
 * This avoids race conditions from a synchronous loop of revealNextJurorThunk
 * calls, and correctly handles human jurors by pre-filling AI votes.
 */
export const skipAllJurorsThunk =
  (humanPlayerIds: string[], seed: number) =>
  (dispatch: AppDispatch, getState: () => RootState) => {
    const state = getState().finale

    if (state.revealOrder.length === 0 && !state.isComplete) {
      dispatch(finalizeFinale({ seed }))
      return
    }

    // Pre-fill AI fallback votes for any unvoted human jurors
    for (const jurorId of state.revealOrder) {
      if (humanPlayerIds.includes(jurorId) && !state.votes[jurorId]) {
        dispatch(
          castVote({
            jurorId,
            finalistId: aiJurorVote(
              jurorId,
              state.finalistIds,
              seed,
              getState().social.reality,
              state.juryScorecards[jurorId]
            ),
          })
        )
      }
    }

    // Now all jurors have votes — reveal them all synchronously
    let current = getState().finale
    const remaining = current.revealOrder.length - current.revealedCount
    for (let i = 0; i < remaining; i++) {
      dispatch(revealNextJuror({ humanPlayerIds }))
    }

    current = getState().finale
    if (!current.isComplete) {
      dispatch(finalizeFinale({ seed }))
    }
  }

/**
 * Build the JurorReveal[] list for revealed jurors (used by the UI).
 * Includes the phrase bubble text for each revealed juror.
 */
export const selectRevealedJurors = createSelector(
  selectFinale,
  (state: RootState) => state.game.seed,
  (finale, seed): JurorReveal[] => {
    return finale.revealOrder.slice(0, finale.revealedCount).map((jurorId, idx) => {
      const finalistId = finale.votes[jurorId] ?? ''
      const phrase =
        jurorId === PUBLIC_JUROR_ID
          ? pickPhrase(PUBLIC_JURY_VOTE_LINES, seed, idx)
          : pickPhrase(JURY_LOCKED_LINES, seed, idx)
      return { jurorId, finalistId, phrase }
    })
  }
)
