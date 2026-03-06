// API service helper for challenge submissions. Adapt to your app's fetch/axios wrapper.

type EndurancePayload = {
  challengeId: string;
  elapsed_seconds: number;
  metadata?: Record<string, unknown>;
};

export async function submitEnduranceResult(payload: EndurancePayload): Promise<unknown> {
  const res = await fetch('/api/challenges/endurance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Submit failed ${res.status}: ${text}`);
  }
  return res.json();
}
