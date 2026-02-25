/**
 * bigBrotherFallback.ts — Offline Big Brother responder
 * ======================================================
 *
 * This module is a thin wrapper around the improved engine in src/bb/engine.ts.
 * See that file for tuning instructions (phrases, patterns, templates, lexicon).
 *
 * To tune replies, templates, or intents edit src/bb/engine.ts directly.
 */

import { bigBrotherReply } from '../bb/engine';
import type { BBContext, SentimentResult as _SentimentResult, IntentId } from '../bb/engine';

// ─── Re-exports for backward compatibility ────────────────────────────────────

export { detectIntent, scoreSentiment } from '../bb/engine';
export type { SentimentResult } from '../bb/engine';
export type { IntentId as Intent } from '../bb/engine';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FallbackRequest {
  diaryText: string;
  playerName?: string;
  phase?: string;
  seed?: number;
  /** Optional per-player context for context-aware reply selection. */
  context?: BBContext;
}

export interface FallbackResponse {
  text: string;
  /** Intent id used to select the reply (e.g. "grief_family"). */
  reason: string;
  /** Same as reason — explicit intent field for consumers that want it. */
  intent?: IntentId;
  /** Sentiment of the input text. */
  sentiment?: _SentimentResult;
}

// ─── Core generator ───────────────────────────────────────────────────────────

/**
 * Generate a deterministic, offline Big Brother reply.
 *
 * Delegates to the improved engine in src/bb/engine.ts.
 *
 * @param req FallbackRequest
 * @returns   Promise<FallbackResponse> — resolves immediately (no I/O)
 */
export async function generateOfflineBigBrotherReply(
  req: FallbackRequest,
): Promise<FallbackResponse> {
  const { diaryText, playerName, seed, context } = req;
  const reply = bigBrotherReply(diaryText, {
    ...context,
    playerName: playerName !== undefined ? playerName : context?.playerName,
    seed: seed !== undefined ? seed : context?.seed,
  });
  return {
    text: reply.text,
    reason: reply.intent,
    intent: reply.intent,
    sentiment: reply.sentiment,
  };
}
