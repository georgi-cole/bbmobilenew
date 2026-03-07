/**
 * Hint ladder utilities for Famous Figures.
 *
 * Hint ladder (0-based index):
 *   0  →  dataset hints[0]  — big content clue
 *   1  →  dataset hints[1]  — another big content clue
 *   2  →  generated          — "First name starts with 'X'"
 *   3  →  generated          — "Last name starts with 'Y'" (mononym fallback)
 *   4  →  generated          — "Either 'Decoy A' or 'Decoy B'" — a decoy pair
 *                               sharing the same initials as the figure; NEVER
 *                               reveals the canonical answer bluntly.
 */
import type { FigureRow } from './model';

// ─── Suffix stripping ─────────────────────────────────────────────────────────

/**
 * Common generational/honorific suffixes that should not be treated as the
 * last name (e.g. "Martin Luther King Jr" → last = "King").
 */
const KNOWN_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'vi']);

/**
 * Parses a canonical name into first / last components.
 * Handles mononyms (e.g. "Cleopatra"), regnal names (e.g. "Louis XIV"),
 * and names with generational suffixes (e.g. "Martin Luther King Jr").
 */
function parseNameParts(canonicalName: string): {
  first: string;
  last: string;
  isMononym: boolean;
} {
  const raw = canonicalName.trim().split(/\s+/);

  // Drop a trailing suffix so we don't mistake "Jr" / "III" for the last name.
  const lastToken = raw[raw.length - 1] ?? '';
  const parts =
    raw.length > 1 && KNOWN_SUFFIXES.has(lastToken.toLowerCase().replace(/\.$/, ''))
      ? raw.slice(0, -1)
      : raw;

  if (parts.length === 1) {
    return { first: parts[0], last: '', isMononym: true };
  }
  return { first: parts[0], last: parts[parts.length - 1], isMononym: false };
}

// ─── Decoy name tables (for hint 5) ──────────────────────────────────────────

/**
 * Common first names indexed by their first letter, used to generate decoy names
 * for hint 5. These names are plausible but are NOT the canonical figure name.
 */
const DECOY_FIRST_NAMES: Record<string, string[]> = {
  A: ['Abraham', 'Alfred', 'Arnold', 'Arthur'],
  B: ['Barnabas', 'Benedict', 'Boris', 'Brendan'],
  C: ['Cedric', 'Charles', 'Claude', 'Conrad'],
  D: ['Donald', 'Douglas', 'Duncan', 'Dwight'],
  E: ['Edgar', 'Edmund', 'Edwin', 'Elliot'],
  F: ['Ferdinand', 'Francis', 'Franklin', 'Frederick'],
  G: ['Geoffrey', 'George', 'Gerard', 'Gilbert'],
  H: ['Harold', 'Harvey', 'Herbert', 'Horatio'],
  I: ['Ignatius', 'Irving', 'Isidore', 'Israel'],
  J: ['Jerome', 'Jonathan', 'Julian', 'Justus'],
  K: ['Kenneth', 'Kingston', 'Kurt', 'Kaspar'],
  L: ['Lawrence', 'Leonard', 'Leopold', 'Lloyd'],
  M: ['Malcolm', 'Marshall', 'Maurice', 'Morton'],
  N: ['Nathan', 'Neil', 'Nigel', 'Norman'],
  O: ['Oliver', 'Orson', 'Oswald', 'Otto'],
  P: ['Patrick', 'Percy', 'Philip', 'Ptolemy'],
  Q: ['Quentin', 'Quinn', 'Quintus', 'Quillan'],
  R: ['Ralph', 'Raymond', 'Roland', 'Rupert'],
  S: ['Sebastian', 'Silas', 'Simon', 'Solomon'],
  T: ['Theodore', 'Thomas', 'Timothy', 'Trevor'],
  U: ['Ulrich', 'Ulysses', 'Umberto', 'Urban'],
  V: ['Valerian', 'Victor', 'Vincent', 'Virgil'],
  W: ['Walter', 'Warren', 'Wilhelm', 'Winston'],
  X: ['Xavier', 'Xenophon', 'Ximenes', 'Xander'],
  Y: ['Yale', 'Yusuf', 'Yoran', 'Yannick'],
  Z: ['Zachary', 'Zebediah', 'Zephyr', 'Zoran'],
};

/**
 * Common last names indexed by their first letter, used to generate decoy names
 * for hint 5.
 */
const DECOY_LAST_NAMES: Record<string, string[]> = {
  A: ['Alderton', 'Archer', 'Atkins', 'Avery'],
  B: ['Baldwin', 'Birch', 'Blake', 'Bolton'],
  C: ['Caldwell', 'Chester', 'Colton', 'Curtis'],
  D: ['Dawson', 'Denton', 'Dixon', 'Drake'],
  E: ['Easton', 'Elliot', 'Emerson', 'Evans'],
  F: ['Fairfax', 'Fleming', 'Forbes', 'Forsythe'],
  G: ['Garner', 'Gibson', 'Gordon', 'Grant'],
  H: ['Hammond', 'Harding', 'Harrington', 'Hayes'],
  I: ['Ingram', 'Irvine', 'Ivey', 'Irwin'],
  J: ['Jameson', 'Jenkins', 'Jordan', 'Joyce'],
  K: ['Kane', 'Kent', 'Kerr', 'Knight'],
  L: ['Lambert', 'Lawson', 'Logan', 'Lucas'],
  M: ['Manning', 'Marsh', 'Maxwell', 'Morgan'],
  N: ['Nash', 'Nelson', 'Norris', 'Norton'],
  O: ['Ogden', 'Osborn', 'Oswald', 'Owen'],
  P: ['Palmer', 'Parker', 'Payne', 'Preston'],
  Q: ['Quinn', 'Quigley', 'Quinton', 'Quist'],
  R: ['Ramsey', 'Reed', 'Ross', 'Russell'],
  S: ['Sawyer', 'Shaw', 'Sterling', 'Stuart'],
  T: ['Taylor', 'Thornton', 'Townsend', 'Travis'],
  U: ['Underwood', 'Upton', 'Urwin', 'Usher'],
  V: ['Vance', 'Vaughn', 'Vernon', 'Vickers'],
  W: ['Walker', 'Ward', 'Warren', 'Webb'],
  X: ['Xenos', 'Xavier', 'Xander', 'Xiong'],
  Y: ['York', 'Yates', 'Young', 'Yuen'],
  Z: ['Zimmerman', 'Zane', 'Zanetti', 'Zucker'],
};

/**
 * Single-name (mononym) decoys indexed by first letter, used when the figure
 * is known by only one name (e.g. Cleopatra, Mozart).
 */
const DECOY_MONONYMS: Record<string, string[]> = {
  A: ['Archimedes', 'Apollonia', 'Arcadius', 'Arsinoe'],
  B: ['Berenice', 'Boadicea', 'Brunhilda', 'Balthazar'],
  C: ['Callista', 'Cassandra', 'Claudette', 'Corsica'],
  D: ['Donatella', 'Dorothea', 'Drusilla', 'Demetria'],
  E: ['Electra', 'Eleonora', 'Evangelina', 'Eurydice'],
  F: ['Flavia', 'Florentina', 'Frederica', 'Fulvia'],
  G: ['Galatia', 'Galatea', 'Genoveva', 'Gordiana'],
  H: ['Heloise', 'Hermione', 'Hippolyta', 'Honoria'],
  I: ['Iphigenia', 'Isadora', 'Iolanthe', 'Isolde'],
  J: ['Jocasta', 'Justinia', 'Juliana', 'Jezebel'],
  K: ['Kassandra', 'Kalliope', 'Kythereia', 'Krystallina'],
  L: ['Lavinia', 'Leonidas', 'Ligeia', 'Lysistrata'],
  M: ['Mathilda', 'Millicent', 'Miranda', 'Melitta'],
  N: ['Nerissa', 'Nicomedes', 'Narcissa', 'Nefertiti'],
  O: ['Octavia', 'Ophelia', 'Olympia', 'Orsola'],
  P: ['Persephone', 'Philomena', 'Portia', 'Phaedra'],
  Q: ['Quintilla', 'Quirinius', 'Quirina', 'Quriace'],
  R: ['Rosalind', 'Rhodesia', 'Romanica', 'Ravenna'],
  S: ['Servilia', 'Sophronia', 'Silvana', 'Selenia'],
  T: ['Theodora', 'Theocritus', 'Thyatira', 'Tryphena'],
  U: ['Ulrica', 'Urraca', 'Ursula', 'Unukalhai'],
  V: ['Valentina', 'Varinia', 'Veradis', 'Viridiana'],
  W: ['Wilhelmina', 'Wulfhild', 'Walburga', 'Winfrith'],
  X: ['Xanthippe', 'Xanthe', 'Xenoclea', 'Ximena'],
  Y: ['Yolanda', 'Yrsa', 'Yolande', 'Yseult'],
  Z: ['Zenobia', 'Zephyrina', 'Zelophehad', 'Zoroaster'],
};

// ─── Hash helper ──────────────────────────────────────────────────────────────

/** DJB2-style hash — stable string → uint32. */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// ─── Decoy pair generation ────────────────────────────────────────────────────

/**
 * Pick two distinct elements from `arr` using `hash` as the RNG seed.
 * Falls back to [arr[0], arr[0]] if the array has only one element.
 */
function pickTwo<T>(arr: T[], hash: number): [T, T] {
  if (arr.length === 0) throw new Error('pickTwo: empty array');
  if (arr.length === 1) return [arr[0], arr[0]];
  const i1 = hash % arr.length;
  const i2raw = ((hash >>> 7) + 1) % arr.length;
  const i2 = i2raw === i1 ? (i2raw + 1) % arr.length : i2raw;
  return [arr[i1], arr[i2]];
}

/**
 * Build a deterministic decoy pair for hint 5.
 *
 * Both decoys share the same first (and last, for two-part names) initial as
 * the figure, but are clearly NOT the canonical name. Neither decoy is ever
 * the real answer.
 */
function buildDecoyPair(
  canonicalName: string,
  first: string,
  last: string,
  isMononym: boolean,
): [string, string] {
  const hash = djb2(canonicalName);

  if (isMononym) {
    const initial = (first[0] ?? 'A').toUpperCase();
    const allCandidates = DECOY_MONONYMS[initial] ?? DECOY_MONONYMS['A'];
    const pool = allCandidates.filter((n) => n.toLowerCase() !== first.toLowerCase());
    // If filtering removes all candidates (edge case), fall back to unfiltered pool.
    const effective = pool.length > 0 ? pool : allCandidates;
    return pickTwo(effective, hash);
  }

  const fi = (first[0] ?? 'A').toUpperCase();
  const li = (last[0] ?? 'A').toUpperCase();

  const allFirst = DECOY_FIRST_NAMES[fi] ?? DECOY_FIRST_NAMES['A'];
  const allLast = DECOY_LAST_NAMES[li] ?? DECOY_LAST_NAMES['A'];

  // Filter out candidates that match the figure's own name parts. If filtering
  // would empty the pool (extreme edge case), use the unfiltered pool so the
  // decoys still share the correct initial.
  const firstPool = allFirst.filter((n) => n.toLowerCase() !== first.toLowerCase());
  const lastPool = allLast.filter((n) => n.toLowerCase() !== last.toLowerCase());

  const [f1, f2] = pickTwo(firstPool.length > 0 ? firstPool : allFirst, hash);
  const [l1, l2] = pickTwo(lastPool.length > 0 ? lastPool : allLast, hash);

  const decoy1 = `${f1} ${l1}`;
  const decoy2 = `${f2} ${l2}`;

  // Guarantee the two decoys are distinct
  if (decoy1 === decoy2 && firstPool.length >= 2) {
    return [decoy1, `${f2} ${l1}`];
  }
  return [decoy1, decoy2];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the display text for the hint at `hintIndex` (0-based).
 *
 * Indices 0 and 1 return the dataset hints directly.
 * Indices 2–4 are generated from the figure's canonical name.
 */
export function getHintText(figure: FigureRow, hintIndex: number): string {
  if (hintIndex < 0 || hintIndex > 4) {
    throw new RangeError(`getHintText: hintIndex must be 0–4, got ${hintIndex}`);
  }

  if (hintIndex === 0) return figure.hints[0];
  if (hintIndex === 1) return figure.hints[1];

  const { first, last, isMononym } = parseNameParts(figure.canonicalName);
  const firstInitial = (first[0] ?? '?').toUpperCase();

  if (hintIndex === 2) {
    return isMononym
      ? `Name starts with '${firstInitial}'`
      : `First name starts with '${firstInitial}'`;
  }

  if (hintIndex === 3) {
    if (isMononym) {
      return `Name has ${first.length} letters`;
    }
    const lastInitial = (last[0] ?? '?').toUpperCase();
    return `Last name starts with '${lastInitial}'`;
  }

  // hintIndex === 4  (Hint 5)
  // Present two decoy names that share the figure's initials but are NOT the
  // canonical answer. The player uses prior hints to recall the actual figure.
  const [decoy1, decoy2] = buildDecoyPair(figure.canonicalName, first, last, isMononym);
  return `Either "${decoy1}" or "${decoy2}"`;
}
