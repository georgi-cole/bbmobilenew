/**
 * Biography Blitz competition — integration entry point.
 *
 * Re-exports the slice, thunks, question bank, and bio-question generator
 * so the rest of the application can import from a single stable path.
 *
 * The minigame is registered in src/minigames/registry.ts under the key
 * 'biographyBlitz' and is routed by MinigameHost when reactComponentKey
 * === 'BiographyBlitz'.
 */

// ── Slice actions & reducer ──────────────────────────────────────────────────
export {
  default as biographyBlitzReducer,
  initBiographyBlitz,
  submitBiographyBlitzAnswer,
  resolveRound,
  advanceFromReveal,
  pickEliminationTarget,
  startNextRound,
  markBiographyBlitzOutcomeResolved,
  resetBiographyBlitz,
  buildAiSubmissions,
  resolveBiographyBlitzRound,
  resolveBiographyBlitzHumanContestantId,
  canBiographyBlitzContestantAnswer,
  chooseBiographyBlitzEliminationTarget,
  getContestantName,
  HIDDEN_DEADLINE_MS,
} from '../../features/biographyBlitz/biography_blitz_logic';

export type {
  BiographyBlitzState,
  BiographyBlitzCompetitionType,
  BiographyBlitzPhase,
  BiographyBlitzQuestion,
  BiographyBlitzSubmission,
} from '../../features/biographyBlitz/biography_blitz_logic';

// ── Thunks ────────────────────────────────────────────────────────────────────
export { resolveBiographyBlitzOutcome } from '../../features/biographyBlitz/thunks';

// ── Dynamic question generator ────────────────────────────────────────────────
export { generateBioQuestions } from '../../features/biographyBlitz/bioQuestionGenerator';
