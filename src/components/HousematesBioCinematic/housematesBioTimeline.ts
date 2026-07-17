import { HOUSEMATES_BIO_CARDS, type HousematesBioCard } from './housematesBioData';

export const HOUSEMATES_INTRO_MS = 3_800;
export const HOUSEMATE_CARD_MS = 5_100;
export const HOUSEMATES_OUTRO_MS = 6_400;
export const HOUSEMATES_CREDIT_MS = 4_700;
export const HOUSEMATES_LOGO_MS = 4_300;
export const HOUSEMATES_BIO_DURATION_MS =
  HOUSEMATES_INTRO_MS +
  HOUSEMATES_BIO_CARDS.length * HOUSEMATE_CARD_MS +
  HOUSEMATES_OUTRO_MS +
  HOUSEMATES_CREDIT_MS +
  HOUSEMATES_LOGO_MS;

export type HousematesBioScene =
  | { kind: 'intro'; key: 'intro' }
  | { kind: 'housemate'; key: string; card: HousematesBioCard; index: number }
  | { kind: 'outro'; key: 'outro' }
  | { kind: 'credit'; key: 'credit' }
  | { kind: 'logo'; key: 'logo' };

export function getHousematesBioScene(elapsedMs: number): HousematesBioScene {
  if (elapsedMs < HOUSEMATES_INTRO_MS) {
    return { kind: 'intro', key: 'intro' };
  }

  const cardsElapsed = elapsedMs - HOUSEMATES_INTRO_MS;
  const cardsDuration = HOUSEMATES_BIO_CARDS.length * HOUSEMATE_CARD_MS;
  if (cardsElapsed < cardsDuration) {
    const index = Math.min(
      HOUSEMATES_BIO_CARDS.length - 1,
      Math.max(0, Math.floor(cardsElapsed / HOUSEMATE_CARD_MS)),
    );
    const card = HOUSEMATES_BIO_CARDS[index];
    return { kind: 'housemate', key: `housemate-${card.id}`, card, index };
  }

  const endingElapsed = cardsElapsed - cardsDuration;
  if (endingElapsed < HOUSEMATES_OUTRO_MS) return { kind: 'outro', key: 'outro' };
  if (endingElapsed < HOUSEMATES_OUTRO_MS + HOUSEMATES_CREDIT_MS) {
    return { kind: 'credit', key: 'credit' };
  }
  return { kind: 'logo', key: 'logo' };
}
