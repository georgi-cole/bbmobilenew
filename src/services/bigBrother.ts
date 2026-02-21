/**
 * Client wrapper for the Big Brother AI responder endpoint.
 *
 * In development the Vite dev server proxies /api to http://localhost:4000,
 * so relative URLs work out of the box.
 */

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
  const res = await fetch('/api/ai/bigbrother', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Big Brother server error: ${res.status}`);
  }

  return res.json() as Promise<BigBrotherResponse>;
}
