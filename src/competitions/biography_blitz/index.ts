/**
 * Biography Blitz competition — integration entry point.
 *
 * This module re-exports the slice, thunks, question bank, and bio-question
 * generator so that the rest of the application can import from a single
 * stable path instead of referencing the internal feature directory directly.
 *
 * Usage example:
 *
 *   import {
 *     startBiographyBlitz,
 *     submitAnswer,
 *     markDisconnected,
 *     resolveBiographyBlitzOutcome,
 *   } from 'src/competitions/biography_blitz';
 *
 * The minigame is registered in src/minigames/registry.ts under the key
 * 'biographyBlitz' and is routed by MinigameHost when reactComponentKey
 * === 'BiographyBlitz'.
 *
 * Configuration flags (passed via startBiographyBlitz payload):
 *   testMode       — collapse animation delays to 0 (CI / unit tests)
 *   dynamicQuestions — question bank generated from live houseguest bios;
 *                      falls back to the static bank if omitted or empty.
 *
 * Running tests:
 *   npx vitest run tests/unit/biography-blitz/
 *   npx vitest run tests/integration/minigame.biographyBlitz.integration.test.ts
 */

// ── Slice actions & reducer ──────────────────────────────────────────────────
export {
  default as biographyBlitzReducer,
  startBiographyBlitz,
  submitAnswer,
  markDisconnected,
  autoFillAIAnswers,
  revealResults,
  confirmElimination,
  markBiographyBlitzOutcomeResolved,
  resetBiographyBlitz,
  buildAiSubmissions,
} from '../../features/biographyBlitz/biography_blitz_logic';

export type {
  BiographyBlitzState,
  BiographyBlitzCompetitionType,
  BiographyBlitzStatus,
  BiographyBlitzQuestion,
} from '../../features/biographyBlitz/biography_blitz_logic';

// ── Thunks ────────────────────────────────────────────────────────────────────
export { resolveBiographyBlitzOutcome } from '../../features/biographyBlitz/thunks';

// ── Question banks ────────────────────────────────────────────────────────────
export { BIOGRAPHY_BLITZ_QUESTIONS } from '../../features/biographyBlitz/biographyBlitzQuestions';
export type { BiographyBlitzAnswer } from '../../features/biographyBlitz/biographyBlitzQuestions';

// ── Dynamic question generator ────────────────────────────────────────────────
export { generateBioQuestions } from '../../features/biographyBlitz/bioQuestionGenerator';
