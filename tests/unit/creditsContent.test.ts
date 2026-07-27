import { afterEach, describe, expect, it, vi } from 'vitest';
import { CINEMATIC_CREDITS } from '../../src/cinematic/config/cinematicConfig';
import {
  loadCreditsContent,
  parseCreditsContent,
  resolveCreditsContentUrl,
} from '../../src/cinematic/credits/creditsContent';

const VALID_DOCUMENT = {
  version: 1,
  cards: [
    {
      id: 'producer',
      fromSecond: 0,
      toSecond: 4,
      lines: [
        { text: 'Producer', style: 'label' },
        { text: 'New Producer', style: 'name', gapBefore: true },
      ],
    },
  ],
};

afterEach(() => {
  delete (window as Window & { __BIG_EYE_CREDITS_URL__?: string }).__BIG_EYE_CREDITS_URL__;
  document.querySelector('meta[name="big-eye-credits-url"]')?.remove();
});

describe('runtime credits content', () => {
  it('accepts a valid editable timeline', () => {
    const parsed = parseCreditsContent(VALID_DOCUMENT);
    expect(parsed).toHaveLength(1);
    expect(parsed?.[0]?.lines[1]?.text).toBe('New Producer');
  });

  it('rejects overlapping, duplicate, or out-of-range cards as a whole', () => {
    expect(parseCreditsContent({
      version: 1,
      cards: [
        ...VALID_DOCUMENT.cards,
        { ...VALID_DOCUMENT.cards[0], id: 'overlap', fromSecond: 3, toSecond: 6 },
      ],
    })).toBeNull();

    expect(parseCreditsContent({
      version: 1,
      cards: [{ ...VALID_DOCUMENT.cards[0], toSecond: 80 }],
    })).toBeNull();
  });

  it('uses runtime and meta URL overrides before the bundled document', () => {
    const meta = document.createElement('meta');
    meta.name = 'big-eye-credits-url';
    meta.content = 'https://config.example/meta-credits.json';
    document.head.append(meta);
    expect(resolveCreditsContentUrl()).toBe('https://config.example/meta-credits.json');

    (window as Window & { __BIG_EYE_CREDITS_URL__?: string }).__BIG_EYE_CREDITS_URL__ =
      'https://config.example/runtime-credits.json';
    expect(resolveCreditsContentUrl()).toBe('https://config.example/runtime-credits.json');
  });

  it('returns validated remote cards and falls back safely on invalid content', async () => {
    const validFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(VALID_DOCUMENT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const valid = await loadCreditsContent({
      fetchImpl: validFetch,
      url: '/credits-valid.json',
    });
    expect(valid.source).toBe('runtime');
    expect(valid.cards[0]?.id).toBe('producer');

    const invalidFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ version: 1, cards: [] }), { status: 200 }),
    );
    const invalid = await loadCreditsContent({
      fetchImpl: invalidFetch,
      url: '/credits-invalid.json',
    });
    expect(invalid.source).toBe('fallback');
    expect(invalid.cards).toBe(CINEMATIC_CREDITS);
  });
});
