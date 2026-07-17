import { describe, expect, it } from 'vitest';
import {
  getHousematesBioScene,
  HOUSEMATE_CARD_MS,
  HOUSEMATES_BIO_DURATION_MS,
  HOUSEMATES_CREDIT_MS,
  HOUSEMATES_INTRO_MS,
  HOUSEMATES_OUTRO_MS,
} from '../housematesBioTimeline';
import { HOUSEMATES_BIO_CARDS, MYSTERY_WILDCARD_BIOS } from '../housematesBioData';

describe('Housemates biography cinematic', () => {
  it('presents the complete canonical roster alphabetically with unique prize plans', () => {
    expect(HOUSEMATES_BIO_CARDS).toHaveLength(22);
    expect(HOUSEMATES_BIO_CARDS.map((card) => card.name)).toEqual(
      [...HOUSEMATES_BIO_CARDS.map((card) => card.name)].sort((a, b) => a.localeCompare(b)),
    );
    expect(new Set(HOUSEMATES_BIO_CARDS.map((card) => card.prizePlan)).size).toBe(22);

    for (const card of HOUSEMATES_BIO_CARDS) {
      expect(card.introduction).toContain(card.name);
      expect(card.introduction).toContain(card.profession);
      expect(card.prizePlan.length).toBeGreaterThan(45);
      expect(card.portraitFile).toMatch(/\.(png|webp)$/);
    }
  });

  it('holds every housemate on screen for 5.1 seconds', () => {
    expect(HOUSEMATE_CARD_MS).toBe(5_100);
    expect(HOUSEMATES_BIO_DURATION_MS).toBe(131_400);
  });

  it('keeps the five mystery housemates in a separate unlockable wildcard collection', () => {
    expect(MYSTERY_WILDCARD_BIOS.map((card) => card.name)).toEqual([
      'Lia',
      'Ali',
      'Noa',
      'Pax',
      'Rey',
    ]);
    expect(MYSTERY_WILDCARD_BIOS.every((card) => card.unlock.kind.length > 0)).toBe(true);
    expect(new Set(MYSTERY_WILDCARD_BIOS.map((card) => card.prizePlan)).size).toBe(5);

    const canonicalIds = new Set(HOUSEMATES_BIO_CARDS.map((card) => card.id));
    expect(MYSTERY_WILDCARD_BIOS.every((card) => !canonicalIds.has(card.id))).toBe(true);
  });

  it('moves from intro through every card, the message, credit, and logo', () => {
    expect(getHousematesBioScene(0).kind).toBe('intro');

    const first = getHousematesBioScene(HOUSEMATES_INTRO_MS);
    expect(first.kind).toBe('housemate');
    if (first.kind === 'housemate') expect(first.card.name).toBe('Aria');

    const finalCardTime =
      HOUSEMATES_INTRO_MS + (HOUSEMATES_BIO_CARDS.length - 1) * HOUSEMATE_CARD_MS;
    const finalCard = getHousematesBioScene(finalCardTime);
    expect(finalCard.kind).toBe('housemate');
    if (finalCard.kind === 'housemate') expect(finalCard.card.name).toBe('Zed');

    const cardsEnd = HOUSEMATES_INTRO_MS + HOUSEMATES_BIO_CARDS.length * HOUSEMATE_CARD_MS;
    expect(getHousematesBioScene(cardsEnd).kind).toBe('outro');
    expect(getHousematesBioScene(cardsEnd + HOUSEMATES_OUTRO_MS).kind).toBe('credit');
    expect(
      getHousematesBioScene(cardsEnd + HOUSEMATES_OUTRO_MS + HOUSEMATES_CREDIT_MS).kind,
    ).toBe('logo');
  });
});
