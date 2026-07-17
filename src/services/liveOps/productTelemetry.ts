import type { RemoteOperations } from '../../remoteConfig/remoteConfigTypes';

const EVENT_BUFFER_KEY = 'bbmobilenew:product-events';
type EventProperties = Record<string, string | number | boolean | null | undefined>;
type ProductEvent = { name: string; occurredAt: string; sessionId: string; properties: EventProperties };

let telemetry: NonNullable<RemoteOperations['telemetry']> | undefined;
let sampled = false;
const sessionId = Math.random().toString(36).slice(2, 12);
const sessionSampleBucket = Array.from(sessionId).reduce((total, char) => total + char.charCodeAt(0), 0) % 100;

export function configureProductTelemetry(next: RemoteOperations['telemetry']): void {
  telemetry = next;
  sampled = Boolean(next?.enabled) && sessionSampleBucket < (next?.samplePercentage ?? 0);
}

function bufferEvent(event: ProductEvent): void {
  try {
    const current = JSON.parse(sessionStorage.getItem(EVENT_BUFFER_KEY) ?? '[]') as ProductEvent[];
    sessionStorage.setItem(EVENT_BUFFER_KEY, JSON.stringify([...current.slice(-99), event]));
  } catch {
    // Measurement must never block gameplay.
  }
}

export function trackProductEvent(name: string, properties: EventProperties = {}): void {
  if (!sampled) return;
  const event: ProductEvent = { name, occurredAt: new Date().toISOString(), sessionId, properties };
  bufferEvent(event);
  if (!telemetry?.endpointUrl) return;

  const body = JSON.stringify(event);
  if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(telemetry.endpointUrl, body)) return;
  void fetch(telemetry.endpointUrl, {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'application/json' },
  }).catch(() => undefined);
}

export function readBufferedProductEvents(): ProductEvent[] {
  try { return JSON.parse(sessionStorage.getItem(EVENT_BUFFER_KEY) ?? '[]') as ProductEvent[]; }
  catch { return []; }
}
