import { TOTAL_PAIRS } from '../../features/houseOfCards/houseOfCardsSlice';
import { mulberry32 } from '../../store/rng';

export interface HouseOfCardsBoardCard {
  index: number;
  symbol: string;
  isFlipped: boolean;
  isMatched: boolean;
  isMismatch: boolean;
}

/** Base symbol pool used to build the House of Cards board. */
export const HOUSE_OF_CARDS_SYMBOLS = ['🌙', '⚡', '🎭', '🔮', '🃏', '♠️', '♥️', '♦️', '🌟', '💎'];

/** Duration of streak-triggered Peek reveal (ms). */
export const PEEK_DURATION_MS = 1000;

/** Peek is auto-triggered after this many consecutive correct pairs. */
export const PEEK_STREAK_TRIGGER = 2;

export function buildHouseOfCardsBoard(seed: number): HouseOfCardsBoardCard[] {
  if (HOUSE_OF_CARDS_SYMBOLS.length < TOTAL_PAIRS) {
    throw new Error(
      `HouseOfCardsComp: HOUSE_OF_CARDS_SYMBOLS has ${HOUSE_OF_CARDS_SYMBOLS.length} symbols, but TOTAL_PAIRS is ${TOTAL_PAIRS}.`,
    );
  }

  const rng = mulberry32(seed ^ 0xdeadbeef);
  const baseSymbols = HOUSE_OF_CARDS_SYMBOLS.slice(0, TOTAL_PAIRS);
  const symbols = [...baseSymbols, ...baseSymbols];

  for (let i = symbols.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
  }

  return symbols.map((symbol, index) => ({
    index,
    symbol,
    isFlipped: false,
    isMatched: false,
    isMismatch: false,
  }));
}
