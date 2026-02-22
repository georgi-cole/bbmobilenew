/**
 * Client wrapper for the Big Brother AI responder endpoint.
 *
 * The endpoint is resolved in this order:
 *  1. VITE_BB_AI_ENDPOINT env var (full URL, e.g. http://localhost:4000/api/ai/bigbrother)
 *  2. Relative URL /api/ai/bigbrother – works in dev via the Vite proxy to localhost:4000
 */

const FETCH_TIMEOUT_MS = 15_000;

const ENDPOINT: string =
  // Vite exposes VITE_* vars on import.meta.env; fall back to relative proxy path
  (import.meta.env.VITE_BB_AI_ENDPOINT as string | undefined) ??
  '/api/ai/bigbrother';

export interface BigBrotherPayload {
  diaryText: string;
  playerName?: string;
  phase?: string;
  seed?: number;
}

export interface BigBrotherResponse {
  text: string;
  reason: 'llm' | 'fallback' | 'input_moderation' | 'output_moderation';
}

export async function generateBigBrotherReply(
  payload: BigBrotherPayload,
): Promise<BigBrotherResponse> {
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
    return json;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Big Brother did not respond in time. Is the server running?');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
