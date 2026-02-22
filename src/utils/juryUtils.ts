/**
 * Jury utility functions for the Finale / Final Jury Voting sequence.
 *
 * All functions are pure (no side-effects) to keep them easily testable.
 */

import { mulberry32 } from '../store/rng';

// ─── Jury composition ────────────────────────────────────────────────────────

/**
 * Returns the number of "pre-jury" evictions (players evicted before jury).
 * Formula: totalPlayers - 2 (finalists) - jurySize.
 * e.g. 12 total, 7 jury → 3 pre-jury evictions.
 */
export function nonJuryEvictionCount(totalPlayers: number, jurySize: number): number {
  return Math.max(0, totalPlayers - 2 - jurySize);
}

/**
 * Given the 0-based index of a player's eviction (how many players were
 * already evicted/jury when they left), decide whether they become a juror.
 */
export function shouldBeJuror(evictionIndex: number, totalPlayers: number, jurySize: number): boolean {
  return evictionIndex >= nonJuryEvictionCount(totalPlayers, jurySize);
}

/**
 * If there is an even number of jurors, promote the next eligible pre-jury
 * evictee to break the potential tie (ensures odd jury count).
 *
 * @param jurorIds       Current jury member IDs (ordered: most-recent last).
 * @param preJuryIds     Pre-jury evictee IDs (ordered: most-recent last).
 * @returns              Possibly extended juror list with one extra member.
 */
export function ensureOddJurors(jurorIds: string[], preJuryIds: string[]): string[] {
  if (jurorIds.length % 2 === 1) return jurorIds;
  // Pick the most recently evicted pre-juror not already in the jury
  // (prevents duplicates when jury-return mechanic already promoted them).
  const extra = [...preJuryIds].reverse().find((id) => !jurorIds.includes(id));
  return extra ? [...jurorIds, extra] : jurorIds;
}

/**
 * Jury-return mechanic: pick the pre-jury evictee who "won their way back"
 * (highest score proxy = last evicted pre-juror, per bbmobile spec).
 * Returns the player ID to promote to jury, or null if none eligible.
 */
export function juryReturnCandidate(preJuryIds: string[]): string | null {
  return preJuryIds.length > 0 ? preJuryIds[preJuryIds.length - 1] : null;
}

// ─── Voting ──────────────────────────────────────────────────────────────────

/**
 * Count votes per finalist.
 * @param votes  Record mapping jurorId → finalistId.
 * @returns      Record mapping finalistId → vote count.
 */
export function tallyVotes(votes: Record<string, string>): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const finalistId of Object.values(votes)) {
    tally[finalistId] = (tally[finalistId] ?? 0) + 1;
  }
  return tally;
}

/**
 * Determine the winner from tallied votes.
 * On a tie, falls back to seeded RNG.
 * When `americasVoteEnabled` is true the UI labels the tiebreak as "America's Vote",
 * but the underlying resolution is identical (seeded RNG).
 *
 * @param tally              Vote counts per finalist.
 * @param finalistIds        Exactly 2 finalist IDs.
 * @param seed               RNG seed for deterministic tiebreak.
 * @returns                  Winner ID.
 */
export function determineWinner(
  tally: Record<string, number>,
  finalistIds: string[],
  seed: number,
): string {
  if (finalistIds.length < 2) return finalistIds[0] ?? '';
  const [a, b] = finalistIds;
  const aVotes = tally[a] ?? 0;
  const bVotes = tally[b] ?? 0;

  if (aVotes !== bVotes) return aVotes > bVotes ? a : b;

  // Tie: use seeded RNG (deterministic; UI may label this "America's Vote").
  const rng = mulberry32(seed);
  return rng() < 0.5 ? a : b;
}

// ─── AI juror voting ─────────────────────────────────────────────────────────

/** Simple hash of a string to a 32-bit integer (for per-juror RNG derivation). */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Deterministically pick a vote for an AI juror.
 * XORs the juror's ID hash with the game seed so each juror produces a
 * consistent but distinct result for a given seed.
 *
 * @param jurorId      The voting juror's player ID.
 * @param finalistIds  Exactly 2 finalist IDs.
 * @param seed         Game RNG seed.
 * @returns            The finalist ID the juror votes for.
 */
export function aiJurorVote(jurorId: string, finalistIds: string[], seed: number): string {
  if (finalistIds.length === 0) return '';
  const rng = mulberry32((seed ^ hashStr(jurorId)) >>> 0);
  return finalistIds[Math.floor(rng() * finalistIds.length)];
}

// ─── Phrase pools ─────────────────────────────────────────────────────────────

/** Phrases used when a juror's envelope is revealed. */
export const JURY_LOCKED_LINES: string[] = [
  'My vote goes to…',
  'I\'m voting for…',
  'This season, I\'m casting my jury vote for…',
  'After careful consideration, my vote is for…',
  'The person I\'m voting to win Big Brother is…',
  'I\'m awarding my jury vote to…',
];

/** Plea templates used when POV holder asks nominees for their pleas at Final 4. */
export const NOMINEE_PLEA_TEMPLATES: string[] = [
  "Please keep me in this game — I haven't finished what I came here to do. 🙏",
  "I've been loyal from day one and I promise to have your back in the Final 3. Please keep me.",
  "You know you can trust me more than anyone else on that block. I'm begging you to let me stay. 🙏",
  "I've fought too hard to go home now. Give me the chance to prove I deserve to be here.",
  "Everything I've done in this game has been for us. Please don't send me home now.",
];

/** Banter templates per finalist — fill in {finalist} with the name. */
export const JURY_BANTER_TEMPLATES = {
  positive: [
    'You played the game from day one.',
    'You earned every single vote in this house.',
    'Your game was flawless — well done.',
    'You dominated socially and competitively.',
    'Nobody saw you coming, and that\'s a great game.',
  ],
  critical: [
    'You let others do the heavy lifting.',
    'You were lucky to be in the right alliances.',
    'Your jury management could have been better.',
    'You coasted to the end rather than competing.',
    'Close, but not quite the winner I envisioned.',
  ],
};

/** Pick a random phrase from a pool using a deterministic RNG. */
export function pickPhrase(pool: string[], seed: number, idx: number): string {
  const rng = mulberry32((seed ^ idx) >>> 0);
  return pool[Math.floor(rng() * pool.length)];
}
