/**
 * Client wrapper for the Big Brother AI responder endpoint.
 *
 * Resolution order:
 *  1. VITE_BB_AI_ENDPOINT or REACT_APP_BB_AI_ENDPOINT env var (full URL).
 *  2. Relative URL /api/ai/bigbrother — works in dev via the Vite proxy to localhost:4000.
 *
 * If no explicit endpoint is configured, or if the remote fetch fails (network
 * error, timeout, non-OK status, or malformed JSON), the offline fallback in
 * bigBrotherFallback.ts is used and a console.warn is emitted with the error
 * details to aid debugging.
 */

import { generateOfflineBigBrotherReply } from './bigBrotherFallback';

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Resolve the remote endpoint from env vars.
 * Returns null when neither env var is set, signalling offline-only mode.
 */
function resolveEndpoint(): string | null {
  // Vite projects expose VITE_* on import.meta.env
  const vite = import.meta.env.VITE_BB_AI_ENDPOINT as string | undefined;
  if (vite) return vite;

  // CRA / other bundlers may expose REACT_APP_* on import.meta.env too
  const cra = import.meta.env.REACT_APP_BB_AI_ENDPOINT as string | undefined;
  if (cra) return cra;

  return null;
}

const ENDPOINT = resolveEndpoint();

export interface BigBrotherPayload {
  diaryText: string;
  playerName?: string;
  phase?: string;
  seed?: number;
}

export interface BigBrotherResponse {
  text: string;
  reason: string;
}

export async function generateBigBrotherReply(
  payload: BigBrotherPayload,
): Promise<BigBrotherResponse> {
  // No endpoint configured → use offline fallback immediately
  if (!ENDPOINT) {
    return generateOfflineBigBrotherReply(payload);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Big Brother server responded with status ${res.status}.`);
    }

    let json: BigBrotherResponse;
    try {
      json = (await res.json()) as BigBrotherResponse;
    } catch {
      throw new Error('Big Brother server returned an unexpected response.');
    }

    if (typeof json?.text !== 'string') {
      throw new Error('Big Brother server response missing "text" field.');
    }

    return json;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      `[BigBrother] Remote endpoint unreachable or returned an error — using offline fallback. Reason: ${detail}`,
    );
    const fallback = await generateOfflineBigBrotherReply(payload);
    return { ...fallback, reason: 'fallback_offline' };
  } finally {
    clearTimeout(timer);
  }
}
