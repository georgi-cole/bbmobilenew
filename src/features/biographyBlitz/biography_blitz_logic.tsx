/**
 * Redux slice for the "Biography Blitz" last-player-standing competition.
 *
 * State machine:
 *
 *   idle
 *    └─ initBiographyBlitz ──────────────────────→ question
 *         └─ resolveRound ─────────────────────→ reveal
 *              ├─ advanceFromReveal (void/no winner) ─→ round_transition
 *              └─ advanceFromReveal (has winner) ─────→ elimination
 *                   └─ pickEliminationTarget ──→ round_transition  (≥2 active)
 *                                             └─→ complete         (1 active)
 *         └─ startNextRound ────────────────────→ question
 *
 * Rules:
 *  - All active contestants answer simultaneously.
 *  - Fastest correct answer wins the round.
 *  - Round winner eliminates exactly ONE other contestant.
 *  - Wrong / no answer does NOT eliminate.
 *  - Void round: nobody correct → no elimination, next question.
 *  - Human eliminated → isSpectating = true, AI continues automatically.
 *  - One survivor remaining → competition winner.
 */
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { mulberry32, seededPickN } from '../../store/rng';
import { generateBioQuestions } from './bioQuestionGenerator';
import HOUSEGUESTS from '../../data/houseguests';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BiographyBlitzCompetitionType = 'HOH' | 'POV';

export type BiographyBlitzPhase =
  | 'idle'
  | 'question'
  | 'reveal'
  | 'elimination'
  | 'round_transition'
  | 'complete';

export interface BiographyBlitzQuestion {
  id: string;
  /** The biography-based question prompt. */
  prompt: string;
  /** ID of the correct answer — this is a contestant ID. */
  correctAnswerId: string;
}

export interface BiographyBlitzSubmission {
  contestantId: string;
  selectedAnswerId: string;
  /** Unix-ms timestamp when the submission was recorded. */
  submittedAt: number;
}

export interface BiographyBlitzState {
  competitionType: BiographyBlitzCompetitionType;

  phase: BiographyBlitzPhase;
  round: number;

  contestantIds: string[];
  activeContestantIds: string[];
  eliminatedContestantIds: string[];

  humanContestantId: string | null;

  currentQuestion: BiographyBlitzQuestion | null;
  currentQuestionId: string | null;
  correctAnswerId: string | null;

  /** Pool of question templates generated from contestant bios. */
  questionPool: BiographyBlitzQuestion[];
  /** IDs of questions already used (to avoid repetition). */
  usedQuestionIds: string[];

  submissions: Record<string, BiographyBlitzSubmission>;

  /** Contestant who answered correctly the fastest this round. */
  roundWinnerId: string | null;
  /** Contestant chosen for elimination by the round winner. */
  eliminationTargetId: string | null;
  /** Final competition winner (set when phase === "complete"). */
  competitionWinnerId: string | null;

  /** Unix-ms when the current question phase started. */
  questionStartedAt: number | null;
  /** Unix-ms of the hidden answer deadline (questionStartedAt + 12 000). */
  hiddenDeadlineAt: number | null;

  consecutiveRoundWins: Record<string, number>;
  hotStreakContestantId: string | null;

  /** True once the human contestant has been eliminated. */
  isSpectating: boolean;

  /** Guard: outcome thunk only fires once. */
  outcomeResolved: boolean;
  seed: number;
  testMode: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hidden answer deadline after question starts (milliseconds). */
export const HIDDEN_DEADLINE_MS = 12_000;

const ROUND_SEED_MULT = 0x9e3779b9;

const DEBUG = import.meta.env?.DEV ?? true;

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: BiographyBlitzState = {
  competitionType: 'HOH',
  phase: 'idle',
  round: 0,

  contestantIds: [],
  activeContestantIds: [],
  eliminatedContestantIds: [],

  humanContestantId: null,

  currentQuestion: null,
  currentQuestionId: null,
  correctAnswerId: null,

  questionPool: [],
  usedQuestionIds: [],

  submissions: {},

  roundWinnerId: null,
  eliminationTargetId: null,
  competitionWinnerId: null,

  questionStartedAt: null,
  hiddenDeadlineAt: null,

  consecutiveRoundWins: {},
  hotStreakContestantId: null,

  isSpectating: false,

  outcomeResolved: false,
  seed: 0,
  testMode: false,
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash — stable string → uint32. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h;
}

/**
 * Build deterministic AI submissions for the current round.
 * Each AI contestant gets a personal accuracy rate derived from a hash of
 * their ID so results are independent of list order.
 *
 * Accuracy: 45 %–85 %.  Timing: 700–4 000 ms after question start.
 *
 * @param allActiveIds  Full set of active contestant IDs (used as the
 *                      answer-choice pool so AI can "guess" any active
 *                      contestant, not just other AIs).
 */
export function buildAiSubmissions(
  seed: number,
  round: number,
  aiIds: string[],
  correctId: string,
  questionStartedAt: number,
  allActiveIds?: string[],
): Record<string, BiographyBlitzSubmission> {
  const result: Record<string, BiographyBlitzSubmission> = {};
  // Use the full active set as answer candidates; fall back to aiIds for
  // backwards-compat when callers don't yet pass allActiveIds.
  const answerChoices = allActiveIds && allActiveIds.length > 0 ? allActiveIds : aiIds;

  for (const aiId of aiIds) {
    const idHash = fnv1a32(aiId);
    const cSeed = ((seed ^ (round * ROUND_SEED_MULT) ^ idHash) >>> 0);
    const rng = mulberry32(cSeed);
    const accuracy = 0.45 + rng() * 0.40;
    const answersCorrectly = rng() < accuracy;
    // Timing: 700–4000 ms delay
    const delayMs = 700 + rng() * 3300;
    const submittedAt = questionStartedAt + delayMs;
    const wrongCandidates = answerChoices.filter(id => id !== correctId);
    const selectedAnswerId = answersCorrectly
      ? correctId
      : (wrongCandidates.length > 0 ? seededPickN(rng, wrongCandidates, 1)[0] : correctId);
    result[aiId] = { contestantId: aiId, selectedAnswerId, submittedAt };
  }
  return result;
}

/**
 * Resolve the round winner: the contestant who submitted the correct answer
 * with the smallest submittedAt timestamp.
 * Returns null if nobody answered correctly.
 */
export function resolveBiographyBlitzRound(
  submissions: Record<string, BiographyBlitzSubmission>,
  correctAnswerId: string,
  activeContestantIds: string[],
): string | null {
  let winner: string | null = null;
  let winnerTime = Infinity;

  for (const id of activeContestantIds) {
    const sub = submissions[id];
    if (!sub) continue;
    if (sub.selectedAnswerId !== correctAnswerId) continue;
    if (sub.submittedAt < winnerTime) {
      winner = id;
      winnerTime = sub.submittedAt;
    }
  }
  return winner;
}

/**
 * Resolve the human contestant ID from participants list.
 * Returns the ID of the participant with isHuman === true that is also in
 * contestantIds.
 *
 * Null / undefined `isHumanId` means there is no human player in this
 * session (e.g. AI-only or spectator context) — returns null silently.
 * Only logs an error when a non-null candidate ID is provided but cannot
 * be found in participantIds (genuine resolution failure).
 */
export function resolveBiographyBlitzHumanContestantId(
  participantIds: string[],
  isHumanId?: string | null,
): string | null {
  // No human player in this session — not an error.
  if (isHumanId == null) return null;

  if (participantIds.includes(isHumanId)) {
    if (DEBUG) {
      console.log('[BiographyBlitz] Resolved human contestant id', {
        humanContestantId: isHumanId,
        participantIds,
      });
    }
    return isHumanId;
  }

  // Non-null candidate not found — genuine resolution failure.
  console.error(
    '[BiographyBlitz] resolveBiographyBlitzHumanContestantId: candidate id not found in participants',
    { isHumanId, participantIds },
  );
  return null;
}

/**
 * Check whether a contestant can submit an answer.
 */
export function canBiographyBlitzContestantAnswer(
  state: BiographyBlitzState,
  contestantId: string,
  now: number,
): boolean {
  if (state.phase !== 'question') return false;
  if (!state.activeContestantIds.includes(contestantId)) return false;
  if (contestantId in state.submissions) return false;
  if (state.hiddenDeadlineAt !== null && now >= state.hiddenDeadlineAt) return false;
  return true;
}

/**
 * Choose an elimination target for AI contestants.
 * Picks randomly among valid targets (active, not winner, not already eliminated).
 * No bias toward or against the human contestant.
 */
export function chooseBiographyBlitzEliminationTarget(
  activeContestantIds: string[],
  roundWinnerId: string,
  seed: number,
  round: number,
): string | null {
  const validTargets = activeContestantIds.filter(id => id !== roundWinnerId);
  if (validTargets.length === 0) return null;
  const rng = mulberry32(((seed ^ (round * ROUND_SEED_MULT)) >>> 0));
  const chosen = seededPickN(rng, validTargets, 1)[0];
  if (DEBUG) {
    console.log('[BiographyBlitz] AI elimination choice', {
      roundWinnerId,
      validTargets,
      chosen,
    });
  }
  return chosen ?? null;
}

/**
 * Pick the next question from the pool, preferring unused ones whose
 * correctAnswerId is still active.  Falls back to regenerating from current
 * active contestants if the pool is exhausted.
 */
function pickNextQuestion(
  pool: BiographyBlitzQuestion[],
  usedIds: string[],
  activeIds: string[],
  seed: number,
  round: number,
): BiographyBlitzQuestion | null {
  // Prefer unused questions with valid (active) correct answers.
  const available = pool.filter(
    q => activeIds.includes(q.correctAnswerId) && !usedIds.includes(q.id),
  );

  if (available.length > 0) {
    const rng = mulberry32(((seed ^ ((round + 1) * ROUND_SEED_MULT)) >>> 0));
    const idx = Math.floor(rng() * available.length);
    return available[idx];
  }

  // Pool exhausted or all correct answers eliminated — regenerate from current active contestants.
  const fresh = generateBioQuestions(activeIds).map(q => ({
    id: q.id,
    prompt: q.prompt,
    correctAnswerId: q.correctAnswerId,
  }));
  const freshAvailable = fresh.filter(q => !usedIds.includes(q.id));
  if (freshAvailable.length > 0) {
    const rng = mulberry32(((seed ^ ((round + 17) * ROUND_SEED_MULT)) >>> 0));
    const idx = Math.floor(rng() * freshAvailable.length);
    return freshAvailable[idx];
  }

  // Last resort: pick any question from pool even if used.
  const anyActive = pool.filter(q => activeIds.includes(q.correctAnswerId));
  if (anyActive.length > 0) {
    const rng = mulberry32(((seed ^ ((round + 31) * ROUND_SEED_MULT)) >>> 0));
    const idx = Math.floor(rng() * anyActive.length);
    return anyActive[idx];
  }

  return null;
}

// ─── Slice ────────────────────────────────────────────────────────────────────

const biographyBlitzSlice = createSlice({
  name: 'biographyBlitz',
  initialState,
  reducers: {
    /**
     * Initialise (or re-initialise) the competition.
     * Generates the question pool from contestant bio data, picks the first
     * question, and transitions idle → question.
     */
    initBiographyBlitz(
      state,
      action: PayloadAction<{
        participantIds: string[];
        competitionType: BiographyBlitzCompetitionType;
        seed: number;
        humanContestantId: string | null;
        testMode?: boolean;
        now?: number;
      }>,
    ) {
      const {
        participantIds,
        competitionType,
        seed,
        humanContestantId,
        testMode = false,
        now = Date.now(),
      } = action.payload;

      // Build question pool from bio data.
      const generatedQuestions = generateBioQuestions(participantIds);
      const pool: BiographyBlitzQuestion[] = generatedQuestions.map(q => ({
        id: q.id,
        prompt: q.prompt,
        correctAnswerId: q.correctAnswerId,
      }));

      if (DEBUG) {
        console.log('[BiographyBlitz] initBiographyBlitz', {
          participantIds,
          humanContestantId,
          questionPoolSize: pool.length,
          competitionType,
          seed,
        });
      }

      const firstQuestion = pickNextQuestion(pool, [], participantIds, seed, 0);

      // If no question could be generated (e.g. all participants have sparse
      // bios), skip to complete immediately so the game doesn't get stuck.
      if (!firstQuestion) {
        console.error(
          '[BiographyBlitz] initBiographyBlitz: no questions available; resolving to complete with no winner.',
          { participantIds },
        );
        state.competitionType = competitionType;
        state.phase = 'complete';
        state.round = 0;
        state.contestantIds = [...participantIds];
        state.activeContestantIds = [...participantIds];
        state.eliminatedContestantIds = [];
        state.humanContestantId = humanContestantId;
        state.currentQuestion = null;
        state.currentQuestionId = null;
        state.correctAnswerId = null;
        state.questionPool = pool;
        state.usedQuestionIds = [];
        state.submissions = {};
        state.roundWinnerId = null;
        state.eliminationTargetId = null;
        // Designate the first participant as fallback winner so the outcome
        // thunk can always resolve (avoids null-winner stall).
        state.competitionWinnerId = participantIds[0] ?? null;
        state.questionStartedAt = null;
        state.hiddenDeadlineAt = null;
        state.consecutiveRoundWins = {};
        state.hotStreakContestantId = null;
        state.isSpectating = false;
        state.outcomeResolved = false;
        state.seed = seed;
        state.testMode = testMode;
        return;
      }

      state.competitionType = competitionType;
      state.phase = 'question';
      state.round = 0;

      state.contestantIds = [...participantIds];
      state.activeContestantIds = [...participantIds];
      state.eliminatedContestantIds = [];

      state.humanContestantId = humanContestantId;

      state.currentQuestion = firstQuestion;
      state.currentQuestionId = firstQuestion?.id ?? null;
      state.correctAnswerId = null;

      state.questionPool = pool;
      state.usedQuestionIds = firstQuestion ? [firstQuestion.id] : [];

      state.submissions = {};
      state.roundWinnerId = null;
      state.eliminationTargetId = null;
      state.competitionWinnerId = null;

      state.questionStartedAt = now;
      state.hiddenDeadlineAt = now + (testMode ? 0 : HIDDEN_DEADLINE_MS);

      state.consecutiveRoundWins = {};
      state.hotStreakContestantId = null;

      state.isSpectating = false;
      state.outcomeResolved = false;
      state.seed = seed;
      state.testMode = testMode;
    },

    /**
     * Record a contestant's answer for the current round.
     * First submission wins; double-submit is silently ignored.
     * No-op if phase is not 'question', contestant is not active, or the
     * hidden answer deadline has already passed.
     */
    submitBiographyBlitzAnswer(
      state,
      action: PayloadAction<{
        contestantId: string;
        answerId: string;
        now?: number;
      }>,
    ) {
      if (state.phase !== 'question') return;
      const { contestantId, answerId, now = Date.now() } = action.payload;
      if (!state.activeContestantIds.includes(contestantId)) return;
      if (contestantId in state.submissions) return; // double-submit guard
      // Enforce hidden deadline: late submissions are silently discarded.
      if (state.hiddenDeadlineAt !== null && now >= state.hiddenDeadlineAt) return;

      state.submissions[contestantId] = {
        contestantId,
        selectedAnswerId: answerId,
        submittedAt: now,
      };

      if (DEBUG) {
        console.log('[BiographyBlitz] submitBiographyBlitzAnswer', {
          contestantId,
          answerId,
          submittedAt: now,
        });
      }
    },

    /**
     * Resolve the round: find the fastest correct submission.
     * Transitions question → reveal.
     * No-op if phase is not 'question'.
     */
    resolveRound(state) {
      if (state.phase !== 'question') return;
      if (!state.currentQuestion) return;

      const correct = state.currentQuestion.correctAnswerId;
      const winner = resolveBiographyBlitzRound(
        state.submissions,
        correct,
        state.activeContestantIds,
      );

      state.correctAnswerId = correct;
      state.roundWinnerId = winner;
      state.phase = 'reveal';

      if (DEBUG) {
        console.log('[BiographyBlitz] resolveRound', {
          round: state.round,
          correctAnswerId: correct,
          roundWinnerId: winner,
          submissions: Object.fromEntries(
            Object.entries(state.submissions).map(([k, v]) => [k, v.selectedAnswerId]),
          ),
        });
      }
    },

    /**
     * Advance from the reveal phase.
     * - Has winner → elimination
     * - No winner (void round) → round_transition
     * Transitions reveal → elimination | round_transition.
     */
    advanceFromReveal(state) {
      if (state.phase !== 'reveal') return;
      state.phase = state.roundWinnerId ? 'elimination' : 'round_transition';
      if (DEBUG) {
        console.log('[BiographyBlitz] advanceFromReveal', {
          roundWinnerId: state.roundWinnerId,
          nextPhase: state.phase,
        });
      }
    },

    /**
     * The round winner picks one elimination target.
     * Valid target: active, not the round winner.
     * No-op if phase is not 'elimination' or target is invalid.
     *
     * Transitions:
     *   elimination → round_transition  (≥2 active after elimination)
     *   elimination → complete          (1 active after elimination)
     */
    pickEliminationTarget(
      state,
      action: PayloadAction<{ targetId: string }>,
    ) {
      if (state.phase !== 'elimination') return;

      const { targetId } = action.payload;
      // Validate: must be active and not the winner.
      if (!state.activeContestantIds.includes(targetId)) return;
      if (targetId === state.roundWinnerId) {
        if (DEBUG) {
          console.warn('[BiographyBlitz] pickEliminationTarget: invalid self-target, ignoring', {
            targetId,
            roundWinnerId: state.roundWinnerId,
          });
        }
        return;
      }

      // Apply elimination.
      state.eliminatedContestantIds.push(targetId);
      state.eliminationTargetId = targetId;
      state.activeContestantIds = state.activeContestantIds.filter(id => id !== targetId);
      delete state.consecutiveRoundWins[targetId];

      if (DEBUG) {
        console.log('[BiographyBlitz] pickEliminationTarget', {
          targetId,
          remainingActive: state.activeContestantIds,
        });
      }

      // Spectating: human was eliminated.
      if (targetId === state.humanContestantId) {
        state.isSpectating = true;
        console.log('[BiographyBlitz] Human eliminated — entering spectator mode');
      }

      // Update hot streak for winner.
      if (state.roundWinnerId) {
        state.consecutiveRoundWins[state.roundWinnerId] =
          (state.consecutiveRoundWins[state.roundWinnerId] ?? 0) + 1;
        // Reset streaks for non-winners.
        for (const id of state.activeContestantIds) {
          if (id !== state.roundWinnerId) {
            state.consecutiveRoundWins[id] = 0;
          }
        }
        // Hot streak: 2+ consecutive wins.
        const wins = state.consecutiveRoundWins[state.roundWinnerId] ?? 0;
        state.hotStreakContestantId = wins >= 2 ? state.roundWinnerId : null;
      }

      // Check for final survivor.
      if (state.activeContestantIds.length === 1) {
        state.competitionWinnerId = state.activeContestantIds[0];
        state.phase = 'complete';
        console.log('[BiographyBlitz] Final winner determined', {
          competitionWinnerId: state.competitionWinnerId,
        });
        return;
      }

      state.phase = 'round_transition';
    },

    /**
     * Advance from round_transition → question.
     * Generates the next question for the current active contestants.
     * Increments round counter.
     */
    startNextRound(
      state,
      action: PayloadAction<{ now?: number } | undefined>,
    ) {
      if (state.phase !== 'round_transition') return;

      const now = action.payload?.now ?? Date.now();
      const nextRound = state.round + 1;

      const nextQuestion = pickNextQuestion(
        state.questionPool,
        state.usedQuestionIds,
        state.activeContestantIds,
        state.seed,
        nextRound,
      );

      state.round = nextRound;
      state.currentQuestion = nextQuestion;
      state.currentQuestionId = nextQuestion?.id ?? null;
      state.correctAnswerId = null;
      state.submissions = {};
      state.roundWinnerId = null;
      state.eliminationTargetId = null;

      if (nextQuestion) {
        state.usedQuestionIds = [...state.usedQuestionIds, nextQuestion.id];
      }

      state.questionStartedAt = now;
      state.hiddenDeadlineAt = now + (state.testMode ? 0 : HIDDEN_DEADLINE_MS);

      state.phase = 'question';

      if (DEBUG) {
        console.log('[BiographyBlitz] startNextRound', {
          round: nextRound,
          question: nextQuestion?.prompt ?? '(none)',
          activeContestantIds: state.activeContestantIds,
        });
      }
    },

    /** Idempotency guard: prevent the outcome thunk from firing twice. */
    markBiographyBlitzOutcomeResolved(state) {
      state.outcomeResolved = true;
    },

    /**
     * Fast-forward the game to `complete` without animating further rounds.
     * Used by the spectator skip button so that resolveBiographyBlitzOutcome()
     * can still fire correctly.
     *
     * Chooses the winner as the highest-win-streak active contestant
     * (seeded random tiebreak) so the result is still deterministic.
     * No-op if phase is already 'complete'.
     */
    skipToComplete(state) {
      if (state.phase === 'complete') return;
      if (state.activeContestantIds.length === 0) return;

      // Pick winner: contestant with most consecutive wins; seeded tiebreak.
      let winner = state.activeContestantIds[0];
      let maxWins = state.consecutiveRoundWins[winner] ?? 0;
      for (const id of state.activeContestantIds) {
        const wins = state.consecutiveRoundWins[id] ?? 0;
        if (wins > maxWins) {
          maxWins = wins;
          winner = id;
        }
      }

      // Eliminate everyone else.
      const losers = state.activeContestantIds.filter(id => id !== winner);
      state.eliminatedContestantIds = [...state.eliminatedContestantIds, ...losers];
      state.activeContestantIds = [winner];
      state.competitionWinnerId = winner;
      state.phase = 'complete';

      console.log('[BiographyBlitz] skipToComplete', {
        competitionWinnerId: winner,
        skippedRounds: losers.length,
      });
    },

    /** Reset to idle (e.g. when navigating away). */
    resetBiographyBlitz() {
      return initialState;
    },
  },
});

export const {
  initBiographyBlitz,
  submitBiographyBlitzAnswer,
  resolveRound,
  advanceFromReveal,
  pickEliminationTarget,
  startNextRound,
  markBiographyBlitzOutcomeResolved,
  skipToComplete,
  resetBiographyBlitz,
} = biographyBlitzSlice.actions;

export default biographyBlitzSlice.reducer;

// ─── HOUSEGUESTS name lookup helper (used by UI) ──────────────────────────────

export function getContestantName(id: string): string {
  return HOUSEGUESTS.find(h => h.id === id)?.name ?? id;
}
