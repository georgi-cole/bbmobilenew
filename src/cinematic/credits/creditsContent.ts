import {
  CINEMATIC_CONFIG,
  CINEMATIC_CREDITS,
  type CreditCard,
  type CreditTextStyle,
} from '../config/cinematicConfig';

export interface CreditsContentDocument {
  version: 1;
  cards: readonly CreditCard[];
}

export interface CreditsContentLoadResult {
  cards: readonly CreditCard[];
  source: 'runtime' | 'fallback';
  url: string;
  reason?: string;
}

interface CreditsRuntimeWindow extends Window {
  __BIG_EYE_CREDITS_URL__?: string;
}

interface LoadCreditsContentOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  url?: string;
}

const CREDIT_STYLES = new Set<CreditTextStyle>([
  'title',
  'label',
  'name',
  'music-title',
  'body',
  'italic',
  'small',
  'legal',
  'closing-title',
  'closing-subtitle',
]);

const MAX_LINE_LENGTH = 240;
const MAX_CARD_COUNT = 40;
const MAX_LINES_PER_CARD = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeLine(value: unknown): CreditCard['lines'][number] | null {
  if (!isRecord(value)) return null;
  const text = typeof value.text === 'string' ? value.text.trim() : '';
  const style = value.style;
  if (!text || text.length > MAX_LINE_LENGTH || typeof style !== 'string') return null;
  if (!CREDIT_STYLES.has(style as CreditTextStyle)) return null;

  return {
    text,
    style: style as CreditTextStyle,
    ...(value.gapBefore === true ? { gapBefore: true } : {}),
  };
}

/**
 * Validates and normalizes server-managed credit copy before it enters the
 * frame renderer. Invalid or overlapping timelines are rejected as a whole so
 * a partial configuration can never leave the cinematic with blank cards.
 */
export function parseCreditsContent(value: unknown): readonly CreditCard[] | null {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.cards)) return null;
  if (value.cards.length === 0 || value.cards.length > MAX_CARD_COUNT) return null;

  const durationSeconds = CINEMATIC_CONFIG.durationInFrames / CINEMATIC_CONFIG.fps;
  const ids = new Set<string>();
  let previousEnd = 0;
  const cards: CreditCard[] = [];

  for (const rawCard of value.cards) {
    if (!isRecord(rawCard)) return null;

    const id = typeof rawCard.id === 'string' ? rawCard.id.trim() : '';
    const fromSecond = rawCard.fromSecond;
    const toSecond = rawCard.toSecond;
    const rawLines = rawCard.lines;

    if (!id || ids.has(id)) return null;
    if (!isFiniteNonNegative(fromSecond) || !isFiniteNonNegative(toSecond)) return null;
    if (toSecond <= fromSecond || toSecond > durationSeconds || fromSecond < previousEnd) return null;
    if (!Array.isArray(rawLines) || rawLines.length === 0 || rawLines.length > MAX_LINES_PER_CARD) return null;

    const lines = rawLines.map(normalizeLine);
    if (lines.some((line) => line === null)) return null;

    ids.add(id);
    previousEnd = toSecond;
    cards.push({
      id,
      fromSecond,
      toSecond,
      lines: lines as CreditCard['lines'],
    });
  }

  return cards;
}

export function resolveCreditsContentUrl(): string {
  if (typeof document === 'undefined') return 'config/credits.json';

  const runtimeUrl = (window as CreditsRuntimeWindow).__BIG_EYE_CREDITS_URL__?.trim();
  if (runtimeUrl) return runtimeUrl;

  const metaUrl = document
    .querySelector<HTMLMetaElement>('meta[name="big-eye-credits-url"]')
    ?.content.trim();
  if (metaUrl) return metaUrl;

  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}config/credits.json`;
}

export async function loadCreditsContent({
  signal,
  fetchImpl = globalThis.fetch,
  url = resolveCreditsContentUrl(),
}: LoadCreditsContentOptions = {}): Promise<CreditsContentLoadResult> {
  if (typeof fetchImpl !== 'function') {
    return {
      cards: CINEMATIC_CREDITS,
      source: 'fallback',
      url,
      reason: 'Fetch API unavailable',
    };
  }

  try {
    const response = await fetchImpl(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    });
    if (!response.ok) {
      return {
        cards: CINEMATIC_CREDITS,
        source: 'fallback',
        url,
        reason: `HTTP ${response.status}`,
      };
    }

    const parsed = parseCreditsContent(await response.json());
    if (!parsed) {
      return {
        cards: CINEMATIC_CREDITS,
        source: 'fallback',
        url,
        reason: 'Invalid credits content document',
      };
    }

    return { cards: parsed, source: 'runtime', url };
  } catch (error) {
    return {
      cards: CINEMATIC_CREDITS,
      source: 'fallback',
      url,
      reason: error instanceof Error ? error.message : 'Credits content request failed',
    };
  }
}
