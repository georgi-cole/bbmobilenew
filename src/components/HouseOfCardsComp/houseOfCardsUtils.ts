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
export const HOUSE_OF_CARDS_SYMBOLS = ['🌙', '⚡', '🎭', '🔮', '🃏', '♠️', '♥️', '♦️', '🌟', '💎', '👑', '🔥'];

/** Duration of streak-triggered Peek reveal (ms). */
export const PEEK_DURATION_MS = 1000;

/** Peek is auto-triggered after this many consecutive correct pairs. */
export const PEEK_STREAK_TRIGGER = 2;

export function chooseHouseOfCardsFinalWinner(
  finalists: [string, string],
  finalPoints: Record<string, number>,
  preliminaryScores: Record<string, number>,
): string {
  const [first, second] = finalists;
  const firstPoints = finalPoints[first] ?? 0;
  const secondPoints = finalPoints[second] ?? 0;
  if (firstPoints !== secondPoints) return firstPoints > secondPoints ? first : second;
  return (preliminaryScores[first] ?? 0) >= (preliminaryScores[second] ?? 0) ? first : second;
}

export function buildHouseOfCardsBoard(seed: number, pairCount: number = TOTAL_PAIRS): HouseOfCardsBoardCard[] {
  if (HOUSE_OF_CARDS_SYMBOLS.length < pairCount) {
    throw new Error(
      `HouseOfCardsComp: HOUSE_OF_CARDS_SYMBOLS has ${HOUSE_OF_CARDS_SYMBOLS.length} symbols, but ${pairCount} pairs were requested.`,
    );
  }

  const rng = mulberry32(seed ^ 0xdeadbeef);
  const baseSymbols = HOUSE_OF_CARDS_SYMBOLS.slice(0, pairCount);
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
