/**
 * battleBackCompetition — deterministic best-of-3 minigame simulator for the
 * Jury Return / Battle Back twist.
 *
 * Given a list of candidate IDs and a seeded RNG value, simulates a best-of-3
 * competition where each round is won by a randomly chosen candidate (seeded,
 * so the same seed always produces the same result).  The first candidate to
 * win 2 rounds is the overall winner.
 *
 * Used by GameScreen (via SpectatorView) for the competition spectator display and by
 * unit tests to verify determinism.
 */

import { mulberry32 } from '../../store/rng';

// ── Minigame catalogue ────────────────────────────────────────────────────────

const MINIGAME_POOL: Array<{ name: string; icon: string }> = [
  { name: 'Hold the Wall',  icon: '🧱' },
  { name: 'Trivia Blitz',   icon: '❓' },
  { name: 'Maze Run',       icon: '🌀' },
  { name: 'Memory Match',   icon: '🃏' },
  { name: 'Balance Beam',   icon: '⚖️' },
  { name: 'Knock-Out',      icon: '🥊' },
  { name: "Don't go over", icon: '🎯' },
];

// ── Public types ──────────────────────────────────────────────────────────────

/** Result of a single competition round. */
export interface CompetitionRound {
  /** Human-readable minigame name. */
  name: string;
  /** Emoji icon representing the minigame type. */
  icon: string;
  /** ID of the candidate who won this round. */
  winnerId: string;
}

/** Full result of a best-of-3 competition between all juror candidates. */
export interface CompetitionResult {
  /** The three rounds played (may be 2 rounds if someone clinches early). */
  rounds: CompetitionRound[];
  /** Total rounds won keyed by candidate ID. */
  roundWins: Record<string, number>;
  /** The overall competition winner. */
  winnerId: string;
}

// ── Core simulation ───────────────────────────────────────────────────────────

/**
 * Simulate a best-of-3 Battle Back competition.
 *
 * - Each of the 3 rounds is won by one candidate drawn via seeded RNG.
 * - The first candidate to win 2 rounds is declared the overall winner.
 * - If no candidate reaches 2 wins in 3 rounds (can only happen if the
 *   result is 1-1-1 across 3 different candidates), the candidate with the
 *   most rounds wins; ties are broken by a final seeded pick.
 *
 * @param candidateIds  IDs of jurors eligible to compete.
 * @param seed          Seeded RNG value; same seed ⟹ same result (deterministic).
 */
export function simulateBattleBackCompetition(
  candidateIds: string[],
  seed: number,
): CompetitionResult {
  if (candidateIds.length === 0) {
    throw new Error('[battleBackCompetition] candidateIds must not be empty');
  }
  if (candidateIds.length === 1) {
    return {
      rounds: [],
      roundWins: { [candidateIds[0]]: 0 },
      winnerId: candidateIds[0],
    };
  }

  // Use a distinct seed offset so this simulation doesn't share state with
  // the vote simulator or other RNG users in the same game session.
  const rng = mulberry32((seed ^ 0xbb_bac7) >>> 0);

  // Pick 3 random minigames (without replacement) from the pool.
  const pool = [...MINIGAME_POOL];
  const selectedGames: Array<{ name: string; icon: string }> = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    selectedGames.push(...pool.splice(idx, 1));
  }

  const roundWins: Record<string, number> = Object.fromEntries(
    candidateIds.map((id) => [id, 0]),
  );
  const rounds: CompetitionRound[] = [];

  // Play up to 3 rounds; stop early if someone clinches 2 wins.
  for (let r = 0; r < 3; r++) {
    const roundWinnerId = candidateIds[Math.floor(rng() * candidateIds.length)];
    roundWins[roundWinnerId]++;
    rounds.push({
      name: selectedGames[r].name,
      icon: selectedGames[r].icon,
      winnerId: roundWinnerId,
    });

    // Best-of-3: majority = 2 wins → done.
    if (roundWins[roundWinnerId] >= 2) {
      break;
    }
  }

  // Find the overall winner (highest round wins; seeded tie-break).
  const maxWins = Math.max(...Object.values(roundWins));
  const leaders = candidateIds.filter((id) => roundWins[id] === maxWins);
  const winnerId = leaders.length === 1
    ? leaders[0]
    : leaders[Math.floor(rng() * leaders.length)];

  return { rounds, roundWins, winnerId };
}
