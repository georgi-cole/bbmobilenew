export const NUMBER_TRIVIA_TOTAL_ROUNDS = 5;
export const NUMBER_TRIVIA_MAX_ATTEMPTS = 6;

export interface TriviaRoundPerformance {
  guessed: boolean;
  attempts: number;
  timeMs: number;
  closestDistance?: number;
  skipped?: boolean;
}

export interface TriviaStanding {
  participantId: string;
  participantName: string;
  isHuman: boolean;
  cumulativeScore: number;
  lastRoundScore: number;
  lastRoundAttempts: number;
  lastRoundTimeMs: number;
  lastRoundGuessed: boolean;
  eliminatedRound: number | null;
}

export function computeNumberTriviaRoundScore(performance: TriviaRoundPerformance): number {
  const attempts = Math.max(1, performance.attempts);
  if (performance.guessed) {
    const solvedBonus = 1000;
    const timeBonus = Math.max(0, 700 - Math.round(performance.timeMs / 20));
    const attemptBonus = Math.max(0, 180 - (attempts - 1) * 28);
    return solvedBonus + timeBonus + attemptBonus;
  }

  const closestDistance = Math.max(0, performance.closestDistance ?? Number.POSITIVE_INFINITY);
  const proximityBonus = Number.isFinite(closestDistance)
    ? Math.max(0, 140 - Math.min(140, closestDistance * 8))
    : 0;
  const attemptBonus = performance.skipped ? 0 : Math.max(0, 36 - (attempts - 1) * 6);
  return proximityBonus + attemptBonus;
}

export function getNumberTriviaEliminationCount(roundNumber: number, activeCount: number): number {
  if (roundNumber >= NUMBER_TRIVIA_TOTAL_ROUNDS || activeCount <= 2) return 0;
  if (roundNumber === 4) {
    return Math.min(activeCount - 2, Math.floor(activeCount / 2));
  }
  return Math.min(activeCount - 2, 1);
}

export function compareTriviaStandings(a: TriviaStanding, b: TriviaStanding): number {
  if (b.cumulativeScore !== a.cumulativeScore) return b.cumulativeScore - a.cumulativeScore;
  if (b.lastRoundScore !== a.lastRoundScore) return b.lastRoundScore - a.lastRoundScore;
  if (a.lastRoundGuessed !== b.lastRoundGuessed) return a.lastRoundGuessed ? -1 : 1;
  if (a.lastRoundTimeMs !== b.lastRoundTimeMs) return a.lastRoundTimeMs - b.lastRoundTimeMs;
  if (a.lastRoundAttempts !== b.lastRoundAttempts) return a.lastRoundAttempts - b.lastRoundAttempts;
  return a.participantName.localeCompare(b.participantName);
}

export function formatTriviaTimeMs(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs <= 0) return '—';
  return `${(timeMs / 1000).toFixed(1)}s`;
}

export function getTriviaHint(guess: number, answer: number): string {
  const diff = Math.abs(guess - answer);
  const percentOff = (diff / Math.max(Math.abs(answer), 1)) * 100;

  if (guess === answer) {
    return 'Correct!';
  }
  if (diff === 1) {
    return guess < answer ? '↑ Almost! Go higher by 1' : '↓ Almost! Go lower by 1';
  }
  if (diff <= 5) {
    return guess < answer ? '↑ Close! Go higher' : '↓ Close! Go lower';
  }
  if (percentOff <= 10) {
    return guess < answer ? '↑ Higher!' : '↓ Lower!';
  }
  if (percentOff <= 25) {
    return guess < answer ? '↑↑ Much higher!' : '↓↓ Much lower!';
  }
  if (percentOff <= 50) {
    return guess < answer ? '↑↑↑ Way higher!' : '↓↓↓ Way lower!';
  }
  return guess < answer ? '⬆ Significantly higher!' : '⬇ Significantly lower!';
}
