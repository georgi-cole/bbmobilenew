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
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32, seededPickN } from '../../store/rng';
import { BIOGRAPHY_BLITZ_QUESTIONS } from './biographyBlitzQuestions';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BiographyBlitzCompetitionType = 'HOH' | 'POV';

export type BiographyBlitzStatus = 'idle' | 'question' | 'reveal' | 'complete';

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
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
 * Build deterministic AI submissions for the current question.
 *
 * each contestant is assigned a personal accuracy rating derived from the
 * seed XOR their stringified index in the participant list.  A second RNG
 * draw determines whether they answer correctly; if not, a random wrong answer
 * is chosen.
 *
 * @param seed          Competition seed.
 * @param round         Current round number (0-indexed).
 * @param aiIds         IDs of AI contestants who haven't yet submitted.
 * @param allAnswerIds  All answer IDs for the current question.
 * @param correctId     ID of the correct answer.
 * @returns Map of contestantId → answerId.
 */
export function buildAiSubmissions(
  seed: number,
  round: number,
  aiIds: string[],
  allAnswerIds: string[],
  correctId: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  const wrongIds = allAnswerIds.filter((id) => id !== correctId);

  for (let i = 0; i < aiIds.length; i++) {
    const aiId = aiIds[i];
    // Unique per-contestant seed: mix competition seed, round, and contestant index.
    const contestantSeed = ((seed ^ (round * 0x9e3779b9 + i * 0x517cc1b)) >>> 0);
    const rng = mulberry32(contestantSeed);
    // Accuracy band: 45 % – 85 % (harder questions are not modelled here; the
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
      }>,
    ) {
      const { participantIds, competitionType, seed } = action.payload;
      const rng = mulberry32(seed);
      const order = shuffleIndices(rng, BIOGRAPHY_BLITZ_QUESTIONS.length);
      const firstQuestion = BIOGRAPHY_BLITZ_QUESTIONS[order[0]];

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
     * Auto-fill submissions for AI contestants who have not yet submitted.
     * Uses deterministic seeded RNG so results are reproducible.
     *
     * @param humanId ID of the human player (excluded from AI auto-fill).
     */
    autoFillAIAnswers(state, action: PayloadAction<string | null>) {
      if (state.status !== 'question') return;
      if (!state.currentQuestionId) return;

      const humanId = action.payload;
      const question = BIOGRAPHY_BLITZ_QUESTIONS.find(
        (q) => q.id === state.currentQuestionId,
      );
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
     * Reveal the correct answer and eliminate contestants who answered
     * incorrectly.
     *
     * Edge-case: if every active contestant answered incorrectly the round is
     * voided — no one is eliminated.  This ensures the competition always
     * produces a winner rather than eliminating everyone simultaneously.
     *
     * Transitions: question → reveal
     */
    revealResults(state) {
      if (state.status !== 'question') return;
      if (!state.currentQuestionId) return;

      const question = BIOGRAPHY_BLITZ_QUESTIONS.find(
        (q) => q.id === state.currentQuestionId,
      );
      if (!question) return;

      state.correctAnswerId = question.correctAnswerId;
      state.status = 'reveal';
    },

    /**
     * Confirm eliminations after the reveal animation, then advance to the
     * next round or declare the competition complete.
     *
     * Transitions: reveal → question  (if more than one contestant survives)
     *              reveal → complete   (if exactly one contestant survives)
     */
    confirmElimination(state) {
      if (state.status !== 'reveal') return;
      if (!state.correctAnswerId) return;

      const correct = state.correctAnswerId;
      const eliminated = state.activeContestants.filter(
        (id) => state.submissions[id] !== correct,
      );
      const survivors = state.activeContestants.filter(
        (id) => state.submissions[id] === correct,
      );

      // Void round: no-one answered correctly — keep everyone alive.
      const voidRound = survivors.length === 0;

      if (!voidRound) {
        for (const id of eliminated) {
          state.eliminatedContestants.push(id);
        }
        state.activeContestants = survivors;
      }

      // Single survivor (or void + single active after void) → complete.
      if (state.activeContestants.length === 1) {
        state.status = 'complete';
        state.winnerId = state.activeContestants[0];
        state.currentQuestionId = null;
        state.correctAnswerId = null;
        return;
      }

      // More than one survivor → next question.
      const nextRound = state.round + 1;
      const nextIdx = questionIdxForRound(state.questionOrder, nextRound);
      const nextQuestion = BIOGRAPHY_BLITZ_QUESTIONS[nextIdx];

      state.round = nextRound;
      state.currentQuestionId = nextQuestion.id;
      state.correctAnswerId = null;
      state.submissions = {};
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
  autoFillAIAnswers,
  revealResults,
  confirmElimination,
  markBiographyBlitzOutcomeResolved,
  resetBiographyBlitz,
} = biographyBlitzSlice.actions;

export default biographyBlitzSlice.reducer;
