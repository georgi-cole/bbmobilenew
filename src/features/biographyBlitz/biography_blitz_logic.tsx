/**
 * Redux slice for the "Biography Blitz" trivia competition.
 *
 * State machine:
 *   idle → question → reveal → question  (repeat until one contestant remains)
 *                   → complete           (single contestant left)
 *
 * Each round a question is presented to all active contestants.  Contestants
 * who answer incorrectly are eliminated.  If every remaining contestant
 * answers incorrectly in the same round, no one is eliminated that round
 * (the question is voided and the next one plays), preserving at least one
 * surviving contestant.
 *
 * AI answers are generated deterministically from the seeded RNG so results
 * are reproducible across rerenders and reruns.
 *
 * Hot Streak: a contestant who wins 2 consecutive rounds gains a one-round
 * informational bonus (one impossible answer is flagged for their UI only).
 * The streak is cleared if the streak owner is eliminated or when the bonus
 * is consumed at the start of the next round.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32, seededPickN } from '../../store/rng';
import { BIOGRAPHY_BLITZ_QUESTIONS } from './biographyBlitzQuestions';
import type { BiographyBlitzQuestion } from './biographyBlitzQuestions';

// Re-export for consumers so they don't need a direct dependency on the questions file.
export type { BiographyBlitzQuestion };

// ─── Types ────────────────────────────────────────────────────────────────────

export type BiographyBlitzCompetitionType = 'HOH' | 'POV';

export type BiographyBlitzStatus =
  | 'idle'
  | 'question'
  | 'reveal'
  | 'choose_elimination'
  | 'complete';

/**
 * State object for Biography Blitz as required by the competition architecture.
 */
export interface BiographyBlitzState {
  /** Whether this is a Head-of-Household or Power-of-Veto competition. */
  competitionType: BiographyBlitzCompetitionType;
  /** IDs of contestants still in the game. */
  activeContestants: string[];
  /** IDs of contestants who have been eliminated, in elimination order. */
  eliminatedContestants: string[];
  /** ID of the current question, or null when idle/complete. */
  currentQuestionId: string | null;
  /** ID of the correct answer for the current question, or null before reveal. */
  correctAnswerId: string | null;
  /** Map of contestant ID → submitted answer ID for the current round. */
  submissions: Record<string, string>;
  /** Current phase of the state machine. */
  status: BiographyBlitzStatus;
  /**
   * Deterministic order of question indices (Fisher-Yates shuffled at start).
   * Round N uses questionOrder[round % questionOrder.length].
   */
  questionOrder: number[];
  /** Current round number (0-indexed, increments after each reveal). */
  round: number;
  /** Seed used to initialise the RNG — stored for deterministic replay. */
  seed: number;
  /**
   * Guard against dispatching applyMinigameWinner more than once.
   * Mirrors the outcomeResolved pattern used by holdTheWallSlice and
   * cwgoCompetitionSlice.
   */
  outcomeResolved: boolean;
  /** ID of the final surviving contestant once status reaches 'complete'. */
  winnerId: string | null;

  // ── Hot Streak ──────────────────────────────────────────────────────────────
  /**
   * ID of the contestant currently on a Hot Streak (2+ consecutive wins).
   * Null when no streak is active.
   */
  hotStreakOwner: string | null;
  /**
   * Tracks consecutive wins per contestant. Reset to 0 when a contestant
   * answers incorrectly; incremented by 1 each time they answer correctly.
   * Entries for eliminated contestants are removed.
   */
  consecutiveWinsMap: Record<string, number>;
  /**
   * An answer ID that is provably wrong for the current question — surfaced
   * to the hotStreakOwner's UI as a one-round bonus hint. Never the correct
   * answer. Null when no streak bonus is active.
   */
  hotStreakBonusWrongAnswerId: string | null;

  // ── Configuration ───────────────────────────────────────────────────────────
  /**
   * When true, animation delays are collapsed to 0 so tests and CI can run
   * without waiting for timers.  Components should read this flag and skip
   * or reduce all setTimeout-based animations.
   */
  testMode: boolean;
  /**
   * Optional question bank injected at start-time.  When non-empty these
   * questions take precedence over the static BIOGRAPHY_BLITZ_QUESTIONS bank.
   * Typically populated by the component from live houseguest bio data.
   */
  dynamicQuestions: BiographyBlitzQuestion[];

  // ── Elimination choice ───────────────────────────────────────────────────────
  /**
   * IDs of contestants who answered correctly in the current/most-recent round.
   * Set during revealResults; cleared at the start of the next question.
   */
  roundWinnerIds: string[];
  /**
   * IDs of active contestants who can be chosen for elimination in the
   * choose_elimination phase (active contestants minus round winners).
   * Set during revealResults; cleared at the start of the next question.
   */
  eliminationCandidates: string[];
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: BiographyBlitzState = {
  competitionType: 'HOH',
  activeContestants: [],
  eliminatedContestants: [],
  currentQuestionId: null,
  correctAnswerId: null,
  submissions: {},
  status: 'idle',
  questionOrder: [],
  round: 0,
  seed: 0,
  outcomeResolved: false,
  winnerId: null,
  hotStreakOwner: null,
  consecutiveWinsMap: {},
  hotStreakBonusWrongAnswerId: null,
  testMode: false,
  dynamicQuestions: [],
  roundWinnerIds: [],
  eliminationCandidates: [],
};

// ─── Seed constants ───────────────────────────────────────────────────────────

/**
 * Prime constant used to vary per-round seeds during Fisher-Yates shuffle.
 * Mirrors the golden-ratio constant used elsewhere in the codebase.
 */
const ROUND_SEED_MULTIPLIER = 0x9e3779b9;

/**
 * Additional seed constant used for the Hot Streak bonus hint pick.
 * A distinct value from ROUND_SEED_MULTIPLIER ensures the bonus RNG
 * sequence is independent of the AI-answer RNG sequence.
 */
const STREAK_BONUS_SEED_MULTIPLIER = 0xdeadbeef;

/**
 * Fisher-Yates shuffle of [0 … length-1] using the given RNG.
 */
function shuffleIndices(rng: () => number, length: number): number[] {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Compute the question index for a given round from the pre-shuffled order.
 */
function questionIdxForRound(questionOrder: number[], round: number): number {
  return questionOrder[round % questionOrder.length];
}

/**
 * Return the active question bank: dynamic questions if any were injected,
 * otherwise the static fallback bank.
 */
function getQuestionBank(state: BiographyBlitzState): BiographyBlitzQuestion[] {
  return state.dynamicQuestions.length > 0
    ? state.dynamicQuestions
    : BIOGRAPHY_BLITZ_QUESTIONS;
}

/**
 * Lookup a question from the active bank by ID.
 */
function findQuestion(
  state: BiographyBlitzState,
  id: string,
): BiographyBlitzQuestion | undefined {
  return getQuestionBank(state).find((q) => q.id === id);
}

/**
 * Build deterministic AI submissions for the current question.
 *
 * Each contestant is assigned a personal accuracy rating derived from a
 * stable hash of the contestant ID XOR the competition seed and round.
 * Using a hash of the ID (rather than the loop index) ensures the result
 * is independent of the order in which AI IDs are passed in.
 *
 * @param seed          Competition seed.
 * @param round         Current round number (0-indexed).
 * @param aiIds         IDs of AI contestants who haven't yet submitted.
 * @param allAnswerIds  All answer IDs for the current question.
 * @param correctId     ID of the correct answer.
 * @returns Map of contestantId → answerId.
 */

/** FNV-1a 32-bit hash — fast, stable string → uint32 mapping. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

export function buildAiSubmissions(
  seed: number,
  round: number,
  aiIds: string[],
  allAnswerIds: string[],
  correctId: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  const wrongIds = allAnswerIds.filter((id) => id !== correctId);

  for (const aiId of aiIds) {
    // Unique per-contestant seed: mix competition seed, round, and a stable
    // hash of the contestant ID so order of aiIds does not affect results.
    const idHash = fnv1a32(aiId);
    const contestantSeed = ((seed ^ (round * ROUND_SEED_MULTIPLIER) ^ idHash) >>> 0);
    const rng = mulberry32(contestantSeed);
    // Accuracy band: 45 % – 85 % (harder questions are not modeled here; the
    // question bank itself is the difficulty source).
    const accuracy = 0.45 + rng() * 0.40;
    const answersCorrectly = rng() < accuracy;
    if (answersCorrectly || wrongIds.length === 0) {
      result[aiId] = correctId;
    } else {
      result[aiId] = seededPickN(rng, wrongIds, 1)[0];
    }
  }
  return result;
}

/**
 * Pick a wrong answer ID to surface as the Hot Streak bonus hint.
 * Deterministically selects a wrong answer using a seed derived from the
 * competition seed and round so results are reproducible.
 */
function pickBonusWrongAnswer(
  seed: number,
  round: number,
  correctId: string,
  allAnswerIds: string[],
): string | null {
  const wrongIds = allAnswerIds.filter((id) => id !== correctId);
  if (wrongIds.length === 0) return null;
  const rng = mulberry32(((seed ^ (round * STREAK_BONUS_SEED_MULTIPLIER)) >>> 0));
  return seededPickN(rng, wrongIds, 1)[0];
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const biographyBlitzSlice = createSlice({
  name: 'biographyBlitz',
  initialState,
  reducers: {
    /**
     * Initialise (or re-initialise) the competition.
     * Shuffles the question order deterministically, sets the first question,
     * and transitions from idle → question.
     */
    startBiographyBlitz(
      state,
      action: PayloadAction<{
        participantIds: string[];
        competitionType: BiographyBlitzCompetitionType;
        seed: number;
        /** When true, animation delays collapse to 0 for CI/test runs. */
        testMode?: boolean;
        /**
         * Optional question bank generated from live houseguest bio data.
         * When provided, overrides the static BIOGRAPHY_BLITZ_QUESTIONS bank.
         */
        dynamicQuestions?: BiographyBlitzQuestion[];
      }>,
    ) {
      const {
        participantIds,
        competitionType,
        seed,
        testMode = false,
        dynamicQuestions = [],
      } = action.payload;

      // Use injected bank if provided, otherwise fall back to static bank.
      const bank =
        dynamicQuestions.length > 0 ? dynamicQuestions : BIOGRAPHY_BLITZ_QUESTIONS;

      const rng = mulberry32(seed);
      const order = shuffleIndices(rng, bank.length);
      const firstQuestion = bank[order[0]];

      state.competitionType = competitionType;
      state.activeContestants = [...participantIds];
      state.eliminatedContestants = [];
      state.currentQuestionId = firstQuestion.id;
      state.correctAnswerId = null; // revealed only in reveal phase
      state.submissions = {};
      state.status = 'question';
      state.questionOrder = order;
      state.round = 0;
      state.seed = seed;
      state.outcomeResolved = false;
      state.winnerId = null;
      state.hotStreakOwner = null;
      state.consecutiveWinsMap = {};
      state.hotStreakBonusWrongAnswerId = null;
      state.testMode = testMode;
      state.dynamicQuestions = dynamicQuestions;
      state.roundWinnerIds = [];
      state.eliminationCandidates = [];
    },

    /**
     * Record a contestant's answer for the current round.
     * Safe to call multiple times for the same contestant (last write wins).
     * No-op if status is not 'question' or the contestant is not active.
     */
    submitAnswer(
      state,
      action: PayloadAction<{ contestantId: string; answerId: string }>,
    ) {
      if (state.status !== 'question') return;
      const { contestantId, answerId } = action.payload;
      if (!state.activeContestants.includes(contestantId)) return;
      state.submissions[contestantId] = answerId;
    },

    /**
     * Mark a contestant as disconnected for the current round.
     * Their submission is recorded as the empty string which will never
     * match a valid answer ID, treating them as having answered incorrectly.
     * No-op if status is not 'question' or the contestant is not active.
     */
    markDisconnected(state, action: PayloadAction<string>) {
      if (state.status !== 'question') return;
      const id = action.payload;
      if (!state.activeContestants.includes(id)) return;
      // Use empty string as sentinel — no valid answer has an empty id.
      state.submissions[id] = '';
    },

    /**
     * Auto-fill submissions for AI contestants who have not yet submitted.
     * Uses deterministic seeded RNG so results are reproducible.
     *
     * @param humanId ID of the human player (excluded from AI auto-fill).
     */
    autoFillAIAnswers(state, action: PayloadAction<string | null>) {
      if (state.status !== 'question') return;
      if (!state.currentQuestionId) return;

      const humanId = action.payload;
      const question = findQuestion(state, state.currentQuestionId);
      if (!question) return;

      const aiIds = state.activeContestants.filter(
        (id) => id !== humanId && !(id in state.submissions),
      );
      const allAnswerIds = question.answers.map((a) => a.id);
      const aiSubmissions = buildAiSubmissions(
        state.seed,
        state.round,
        aiIds,
        allAnswerIds,
        question.correctAnswerId,
      );
      Object.assign(state.submissions, aiSubmissions);
    },

    /**
     * Reveal the correct answer and compute round winners and elimination
     * candidates.
     *
     * Round winners: contestants who submitted the correct answer.
     * Elimination candidates: all active contestants who are NOT round winners.
     *
     * Edge-case: if every active contestant answered incorrectly the round is
     * voided — eliminationCandidates is empty (no one can be eliminated).
     * This ensures the competition always produces a winner.
     *
     * Transitions: question → reveal
     */
    revealResults(state) {
      if (state.status !== 'question') return;
      if (!state.currentQuestionId) return;

      const question = findQuestion(state, state.currentQuestionId);
      if (!question) return;

      const correct = question.correctAnswerId;
      const winners = state.activeContestants.filter(
        (id) => state.submissions[id] === correct,
      );
      const candidates = state.activeContestants.filter(
        (id) => state.submissions[id] !== correct,
      );

      state.correctAnswerId = correct;
      state.roundWinnerIds = winners;
      // Void round: no candidates (everyone was wrong) → keep candidates empty
      state.eliminationCandidates = winners.length > 0 ? candidates : [];
      state.status = 'reveal';
    },

    /**
     * Advance from the reveal phase after the reveal animation completes.
     *
     * If there are elimination candidates (round was not voided): transitions
     * to choose_elimination so the round winner can pick one target.
     *
     * Void round (no one answered correctly → eliminationCandidates is empty):
     * advances directly to the next question without any elimination.
     *
     * Transitions: reveal → choose_elimination  (non-void round)
     *              reveal → question             (void round)
     */
    confirmElimination(state) {
      if (state.status !== 'reveal') return;

      const voidRound = state.eliminationCandidates.length === 0;

      if (voidRound) {
        // Void round: advance directly to next question, hot streak unchanged.
        const nextRound = state.round + 1;
        const bank = getQuestionBank(state);
        const nextIdx = questionIdxForRound(state.questionOrder, nextRound);
        const nextQuestion = bank[nextIdx];

        state.round = nextRound;
        state.currentQuestionId = nextQuestion.id;
        state.correctAnswerId = null;
        state.submissions = {};
        state.roundWinnerIds = [];
        state.eliminationCandidates = [];
        state.status = 'question';
        return;
      }

      // Non-void: go to choose_elimination so winner can pick a target.
      state.status = 'choose_elimination';
    },

    /**
     * The round winner picks one elimination target.
     *
     * The target must be in eliminationCandidates (active but answered
     * incorrectly this round).  No-op if the target is not a valid candidate
     * or if the status is not choose_elimination.
     *
     * Hot Streak tracking (applied here after the choice is confirmed):
     *  - Round winners (correct answer) increment their consecutiveWins.
     *  - The eliminated contestant is removed from the streak map.
     *  - Remaining contestants who answered wrong reset to 0.
     *
     * Transitions: choose_elimination → question  (>1 active after elimination)
     *              choose_elimination → complete   (1 active after elimination)
     */
    pickElimination(state, action: PayloadAction<{ targetId: string }>) {
      if (state.status !== 'choose_elimination') return;

      const { targetId } = action.payload;
      if (!state.eliminationCandidates.includes(targetId)) return;

      // Eliminate the chosen target.
      state.eliminatedContestants.push(targetId);
      delete state.consecutiveWinsMap[targetId];
      if (state.hotStreakOwner === targetId) {
        state.hotStreakOwner = null;
        state.hotStreakBonusWrongAnswerId = null;
      }
      state.activeContestants = state.activeContestants.filter((id) => id !== targetId);

      // Update hot streak for all remaining active contestants.
      // Winners increment; non-winners (answered wrong but survived) reset to 0.
      for (const id of state.activeContestants) {
        if (state.roundWinnerIds.includes(id)) {
          state.consecutiveWinsMap[id] = (state.consecutiveWinsMap[id] ?? 0) + 1;
        } else {
          state.consecutiveWinsMap[id] = 0;
        }
      }

      // Single survivor → complete.
      if (state.activeContestants.length === 1) {
        state.status = 'complete';
        state.winnerId = state.activeContestants[0];
        state.currentQuestionId = null;
        state.correctAnswerId = null;
        state.hotStreakBonusWrongAnswerId = null;
        state.roundWinnerIds = [];
        state.eliminationCandidates = [];
        return;
      }

      // More than one survivor → next question.
      const nextRound = state.round + 1;
      const bank = getQuestionBank(state);
      const nextIdx = questionIdxForRound(state.questionOrder, nextRound);
      const nextQuestion = bank[nextIdx];

      // Determine hot streak owner for the upcoming round.
      let newStreakOwner: string | null = null;
      let bonusWrongId: string | null = null;

      for (const id of state.activeContestants) {
        if ((state.consecutiveWinsMap[id] ?? 0) >= 2) {
          newStreakOwner = id;
          const allAnswerIds = nextQuestion.answers.map((a) => a.id);
          bonusWrongId = pickBonusWrongAnswer(
            state.seed,
            nextRound,
            nextQuestion.correctAnswerId,
            allAnswerIds,
          );
          break;
        }
      }

      state.hotStreakOwner = newStreakOwner;
      state.hotStreakBonusWrongAnswerId = bonusWrongId;

      state.round = nextRound;
      state.currentQuestionId = nextQuestion.id;
      state.correctAnswerId = null;
      state.submissions = {};
      state.roundWinnerIds = [];
      state.eliminationCandidates = [];
      state.status = 'question';
    },

    /** Idempotency guard: prevent the outcome thunk from firing twice. */
    markBiographyBlitzOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /** Reset to idle (e.g. when navigating away). */
    resetBiographyBlitz() {
      return initialState;
    },
  },
});

export const {
  startBiographyBlitz,
  submitAnswer,
  markDisconnected,
  autoFillAIAnswers,
  revealResults,
  confirmElimination,
  pickElimination,
  markBiographyBlitzOutcomeResolved,
  resetBiographyBlitz,
} = biographyBlitzSlice.actions;

export default biographyBlitzSlice.reducer;
