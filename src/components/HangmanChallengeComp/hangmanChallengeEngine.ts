import { mulberry32 } from '../../store/rng';

export type MysteryBoxCategory = 'positive' | 'tradeoff' | 'cripple';
export type WordDifficulty = 1 | 2 | 3 | 4 | 5;

export interface WordEntry {
  text: string;
  category: string;
  difficulty: WordDifficulty;
  cluePool: string[];
}

export interface MysteryBoxDefinition {
  id: string;
  label: string;
  description: string;
  category: MysteryBoxCategory;
}

export interface ScoreLineItem {
  label: string;
  value: number;
}

export interface RoundScoreBreakdown {
  baseScore: number;
  errorPenalty: number;
  timePenalty: number;
  mysteryAdjustments: ScoreLineItem[];
  bonuses: ScoreLineItem[];
  finalRoundScore: number;
}

export interface CalculateRoundScoreParams {
  solved: boolean;
  errors: number;
  elapsedSeconds: number;
  timePenaltyPoints: number;
  boxesOpened: number;
  perfectEligible: boolean;
  revealedRatio: number;
  mysteryAdjustments: ScoreLineItem[];
  bonusTokenPoints: number;
}

const WORD_BANK: WordEntry[] = [
  { text: 'shock', category: 'event', difficulty: 1, cluePool: ['A sudden event shift', 'Often follows an unexpected reveal'] },
  { text: 'block', category: 'ranking', difficulty: 1, cluePool: ['Connected to danger', 'A place nobody wants to land'] },
  { text: 'judges', category: 'authority', difficulty: 1, cluePool: ['A title linked to authority', 'Often part of judgment or ranking'] },
  { text: 'verdict', category: 'authority', difficulty: 1, cluePool: ['A title linked to authority', 'Usually follows review or judgment'] },
  { text: 'warning', category: 'safety', difficulty: 1, cluePool: ['Connected to safety', 'Signals rising danger'] },
  { text: 'target', category: 'strategy', difficulty: 1, cluePool: ['A strategic focus', 'Usually appears before action'] },
  { text: 'pressure', category: 'tension', difficulty: 1, cluePool: ['Connected to stress and urgency', 'Built by mistakes and delay'] },
  { text: 'alliance', category: 'social', difficulty: 1, cluePool: ['A social strategy term', 'Built on trust that may not last'] },
  { text: 'betrayal', category: 'social', difficulty: 2, cluePool: ['Usually appears after conflict', 'A social fracture'] },
  { text: 'campaign', category: 'strategy', difficulty: 2, cluePool: ['Often linked to persuasion', 'A social strategy move'] },
  { text: 'captain', category: 'authority', difficulty: 2, cluePool: ['A role linked to command', 'Usually holds temporary authority'] },
  { text: 'challenge', category: 'event', difficulty: 2, cluePool: ['A competition phase', 'Often linked to pressure and reward'] },
  { text: 'coalition', category: 'social', difficulty: 2, cluePool: ['A social strategy term', 'A group built for leverage'] },
  { text: 'confession', category: 'social', difficulty: 2, cluePool: ['Often follows pressure', 'A statement with consequences'] },
  { text: 'decision', category: 'authority', difficulty: 2, cluePool: ['Usually appears after review', 'A moment of final choice'] },
  { text: 'defense', category: 'safety', difficulty: 2, cluePool: ['Connected to safety', 'Used when someone is under pressure'] },
  { text: 'disguise', category: 'strategy', difficulty: 2, cluePool: ['A hidden-intent move', 'Connected to concealment'] },
  { text: 'showdown', category: 'event', difficulty: 2, cluePool: ['A dramatic head-to-head', 'Often part of judgment or ranking'] },
  { text: 'tribunal', category: 'authority', difficulty: 2, cluePool: ['A title linked to authority', 'Usually appears before a final call'] },
  { text: 'authority', category: 'authority', difficulty: 3, cluePool: ['A title linked to authority', 'Connected to command and rank'] },
  { text: 'breaking point', category: 'tension', difficulty: 3, cluePool: ['Connected to pressure', 'A moment when control starts to crack'] },
  { text: 'danger zone', category: 'safety', difficulty: 3, cluePool: ['Connected to safety', 'A place linked to risk'] },
  { text: 'deflection', category: 'strategy', difficulty: 3, cluePool: ['A strategic redirection', 'Used to shift blame or focus'] },
  { text: 'elimination', category: 'ranking', difficulty: 3, cluePool: ['Connected to judgment or ranking', 'A final outcome nobody wants'] },
  { text: 'exposure', category: 'social', difficulty: 3, cluePool: ['Often follows deception', 'The truth moves into the open'] },
  { text: 'final call', category: 'authority', difficulty: 3, cluePool: ['Usually appears after review', 'The last word in a tense moment'] },
  { text: 'immunity', category: 'safety', difficulty: 3, cluePool: ['Connected to safety', 'Temporary protection from danger'] },
  { text: 'influence', category: 'social', difficulty: 3, cluePool: ['A social strategy term', 'Power without direct command'] },
  { text: 'interrogation', category: 'authority', difficulty: 3, cluePool: ['Usually follows suspicion', 'Questions arrive under pressure'] },
  { text: 'maneuver', category: 'strategy', difficulty: 3, cluePool: ['A strategic move', 'Often subtle rather than direct'] },
  { text: 'nomination', category: 'ranking', difficulty: 3, cluePool: ['Often part of judgment or ranking', 'A formal move toward danger'] },
  { text: 'observer room', category: 'authority', difficulty: 4, cluePool: ['Connected to surveillance', 'A place for watching, not acting'] },
  { text: 'outcast', category: 'social', difficulty: 4, cluePool: ['A social isolation term', 'A position outside the group'] },
  { text: 'paranoia', category: 'tension', difficulty: 4, cluePool: ['Built by secrecy and fear', 'A state of social distrust'] },
  { text: 'plot twist', category: 'event', difficulty: 4, cluePool: ['A sudden change in direction', 'Often follows confidence'] },
  { text: 'power of safety', category: 'safety', difficulty: 4, cluePool: ['Connected to safety', 'A protective title with authority'] },
  { text: 'pressure zone', category: 'tension', difficulty: 4, cluePool: ['Connected to pressure', 'A place where mistakes feel louder'] },
  { text: 'public meter', category: 'ranking', difficulty: 4, cluePool: ['Often linked to judgment or ranking', 'A visible measure of favor'] },
  { text: 'ranking', category: 'ranking', difficulty: 4, cluePool: ['Connected to judgment or ranking', 'Order matters here'] },
  { text: 'secret deal', category: 'strategy', difficulty: 4, cluePool: ['A social strategy term', 'Built quietly between a few people'] },
  { text: 'silent vote', category: 'authority', difficulty: 4, cluePool: ['A dramatic formal process', 'Influence is hidden rather than spoken'] },
  { text: 'survival', category: 'safety', difficulty: 4, cluePool: ['Connected to safety', 'The goal when danger is rising'] },
  { text: 'turning point', category: 'event', difficulty: 4, cluePool: ['A major shift in momentum', 'Usually appears after mounting pressure'] },
  { text: 'leader of house', category: 'authority', difficulty: 5, cluePool: ['A title linked to authority', 'A role that governs a round'] },
  { text: 'eviction night', category: 'event', difficulty: 5, cluePool: ['A dramatic event title', 'Usually follows judgment or ranking'] },
  { text: 'exemption', category: 'safety', difficulty: 5, cluePool: ['Connected to safety', 'A narrow way out of danger'] },
  { text: 'exposure night', category: 'event', difficulty: 5, cluePool: ['A dramatic event title', 'Secrets do not stay buried here'] },
  { text: 'inner circle', category: 'social', difficulty: 5, cluePool: ['A social strategy term', 'A small trusted group with influence'] },
  { text: 'judgment', category: 'authority', difficulty: 5, cluePool: ['Often part of judgment or ranking', 'The mood gets heavy before this lands'] },
  { text: 'recruitment', category: 'social', difficulty: 5, cluePool: ['A social strategy term', 'Bringing someone into a plan'] },
  { text: 'rivalry', category: 'social', difficulty: 5, cluePool: ['Usually appears after conflict', 'Competition becomes personal here'] },
  { text: 'safe seat', category: 'safety', difficulty: 5, cluePool: ['Connected to safety', 'A protected position in a tense board'] },
  { text: 'social game', category: 'social', difficulty: 5, cluePool: ['A social strategy term', 'Wins often come from people, not just challenges'] },
  { text: 'ultimatum', category: 'authority', difficulty: 5, cluePool: ['A title linked to authority', 'A final demand under pressure'] },
  { text: 'whisper', category: 'social', difficulty: 5, cluePool: ['A social tactic', 'Small sound, large consequences'] },
];

export const MYSTERY_BOX_POOL: MysteryBoxDefinition[] = [
  { id: 'reveal_one', label: 'Reveal 1 Letter', description: 'One hidden letter is exposed.', category: 'positive' },
  { id: 'reveal_two', label: 'Reveal 2 Letters', description: 'Two hidden letters are exposed.', category: 'positive' },
  { id: 'freeze_timer', label: 'Timer Freeze', description: 'The timer freezes for 8 seconds.', category: 'positive' },
  { id: 'remove_one_error', label: 'Pressure Relief', description: 'One previous wrong guess is erased.', category: 'positive' },
  { id: 'shield_wrong', label: 'Fault Shield', description: 'The next wrong guess will not add pressure.', category: 'positive' },
  { id: 'vague_clue', label: 'Category Trace', description: 'A vague clue is revealed.', category: 'positive' },
  { id: 'vowel_scan', label: 'Vowel Scan', description: 'Learn whether hidden vowels remain.', category: 'positive' },
  { id: 'bonus_token', label: 'Score Token', description: 'Bank +75 bonus points for the round.', category: 'positive' },
  { id: 'slow_timer', label: 'Slow Clock', description: 'Timer speed drops to 0.75x for 12 seconds.', category: 'positive' },
  { id: 'waive_penalty', label: 'Soft Landing', description: 'The next box can ignore its score penalty.', category: 'positive' },
  { id: 'reveal_plus_time', label: 'Letter for Time', description: 'Reveal 1 letter, but add 10 seconds.', category: 'tradeoff' },
  { id: 'double_reveal_score_cut', label: 'Deep Cut', description: 'Reveal 2 letters, but reduce the round score by 12%.', category: 'tradeoff' },
  { id: 'strong_clue_double_wrong', label: 'Sharper Clue', description: 'Get a clearer clue, but the next wrong guess counts double.', category: 'tradeoff' },
  { id: 'freeze_breaks_perfect', label: 'Cold Pause', description: 'Freeze the timer, but lose perfect-round eligibility.', category: 'tradeoff' },
  { id: 'remove_two_errors_minus_100', label: 'Heavy Bargain', description: 'Remove 2 wrong guesses, but deduct 100 points.', category: 'tradeoff' },
  { id: 'family_clue_plus_time', label: 'Family File', description: 'Reveal the word family, but add 5 seconds.', category: 'tradeoff' },
  { id: 'double_speed', label: 'Panic Clock', description: 'Timer speed doubles for 8 seconds.', category: 'cripple' },
  { id: 'disable_keyboard', label: 'Signal Jam', description: 'Three unused letters are disabled briefly.', category: 'cripple' },
  { id: 'distort_used', label: 'Static Wash', description: 'Used-letter history distorts for 7 seconds.', category: 'cripple' },
  { id: 'higher_time_penalty', label: 'Penalty Surge', description: 'Time penalty increases to -6/sec for 10 seconds.', category: 'cripple' },
  { id: 'lock_boxes', label: 'Lockdown', description: 'Mystery boxes lock for 12 seconds.', category: 'cripple' },
  { id: 'broad_clue', label: 'Wide Signal', description: 'Get a clue that is true but not very helpful.', category: 'cripple' },
  { id: 'next_wrong_minus_40', label: 'Risk Marker', description: 'The next wrong guess triggers an extra -40 penalty.', category: 'cripple' },
  { id: 'hidden_risk', label: 'Hidden Risk', description: 'If the round is failed, take an extra -80 penalty.', category: 'cripple' },
];

export function isLetter(char: string): boolean {
  return /^[A-Z]$/i.test(char);
}

export function normalizeWord(text: string): string {
  return text.toUpperCase();
}

export function getWordBank(): WordEntry[] {
  return WORD_BANK;
}

export function pickRoundWords(seed: number): WordEntry[] {
  const rng = mulberry32((seed ^ 0x41c6ce57) >>> 0);
  const used = new Set<string>();
  const rounds: WordEntry[] = [];
  for (let difficulty = 1 as WordDifficulty; difficulty <= 5; difficulty = (difficulty + 1) as WordDifficulty) {
    const candidates = WORD_BANK.filter((entry) => entry.difficulty === difficulty && !used.has(entry.text));
    const pool = candidates.length > 0 ? candidates : WORD_BANK.filter((entry) => !used.has(entry.text));
    const chosen = pool[Math.floor(rng() * pool.length)];
    used.add(chosen.text);
    rounds.push(chosen);
  }
  return rounds;
}

export function getSolutionLetters(word: string): string[] {
  return Array.from(new Set(normalizeWord(word).split('').filter((char) => isLetter(char))));
}

export function computeRevealRatio(word: string, guessedLetters: Iterable<string>, bonusLetters: Iterable<string>): number {
  const guessed = new Set(Array.from(guessedLetters, (letter) => letter.toUpperCase()));
  const bonus = new Set(Array.from(bonusLetters, (letter) => letter.toUpperCase()));
  const letters = normalizeWord(word).split('').filter((char) => isLetter(char));
  if (letters.length === 0) return 1;
  const revealed = letters.filter((char) => guessed.has(char) || bonus.has(char)).length;
  return revealed / letters.length;
}

export function isWordSolved(word: string, guessedLetters: Iterable<string>, bonusLetters: Iterable<string>): boolean {
  return getSolutionLetters(word).every((letter) => {
    const normalized = letter.toUpperCase();
    return Array.from(guessedLetters, (guess) => guess.toUpperCase()).includes(normalized)
      || Array.from(bonusLetters, (guess) => guess.toUpperCase()).includes(normalized);
  });
}

export function buildDisplayTokens(word: string, guessedLetters: Iterable<string>, bonusLetters: Iterable<string>): string[] {
  const guessed = new Set(Array.from(guessedLetters, (letter) => letter.toUpperCase()));
  const bonus = new Set(Array.from(bonusLetters, (letter) => letter.toUpperCase()));
  return normalizeWord(word)
    .split('')
    .map((char) => {
      if (!isLetter(char)) return char;
      return guessed.has(char) || bonus.has(char) ? char : '•';
    });
}

export function calculateRoundScore({
  solved,
  errors,
  elapsedSeconds,
  timePenaltyPoints,
  boxesOpened,
  perfectEligible,
  revealedRatio,
  mysteryAdjustments,
  bonusTokenPoints,
}: CalculateRoundScoreParams): RoundScoreBreakdown {
  const roundedTimePenalty = -Math.round(timePenaltyPoints);
  const errorPenalty = errors * -60;

  if (!solved) {
    const baseScore = revealedRatio >= 0.5 ? 250 : revealedRatio >= 0.3 ? 100 : 0;
    const finalRoundScore = Math.max(0, baseScore + roundedTimePenalty + mysteryAdjustments.reduce((sum, item) => sum + item.value, 0));
    return {
      baseScore,
      errorPenalty: 0,
      timePenalty: roundedTimePenalty,
      mysteryAdjustments,
      bonuses: [],
      finalRoundScore,
    };
  }

  const bonuses: ScoreLineItem[] = [];
  if (elapsedSeconds <= 15) {
    bonuses.push({ label: 'Fast solve bonus', value: 180 });
  } else if (elapsedSeconds <= 25) {
    bonuses.push({ label: 'Fast solve bonus', value: 100 });
  } else if (elapsedSeconds <= 40) {
    bonuses.push({ label: 'Fast solve bonus', value: 40 });
  }
  if (errors <= 1) bonuses.push({ label: 'Precision bonus', value: 80 });
  if (boxesOpened === 0) bonuses.push({ label: 'No-box bonus', value: 50 });
  if (perfectEligible && errors === 0 && boxesOpened === 0 && elapsedSeconds <= 25) {
    bonuses.push({ label: 'Perfect round bonus', value: 250 });
  }
  if (bonusTokenPoints > 0) bonuses.push({ label: 'Token bonus', value: bonusTokenPoints });

  const baseScore = 1000;
  const finalRoundScore = Math.max(
    150,
    baseScore + errorPenalty + roundedTimePenalty + mysteryAdjustments.reduce((sum, item) => sum + item.value, 0) + bonuses.reduce((sum, item) => sum + item.value, 0),
  );

  return {
    baseScore,
    errorPenalty,
    timePenalty: roundedTimePenalty,
    mysteryAdjustments,
    bonuses,
    finalRoundScore,
  };
}

export function buildClue(entry: WordEntry, variant: 'vague' | 'clear' | 'broad' = 'vague'): string {
  const pool = entry.cluePool;
  if (variant === 'clear') return pool[0] ?? `Connected to ${entry.category}`;
  if (variant === 'broad') return `This term belongs somewhere in ${entry.category}.`;
  return pool[1] ?? pool[0] ?? `Connected to ${entry.category}`;
}

export function getCategoryFamily(entry: WordEntry): string {
  if (entry.category === 'safety') return 'safety';
  if (entry.category === 'ranking') return 'ranking';
  if (entry.category === 'social') return 'social';
  if (entry.category === 'authority') return 'judgment';
  return 'strategy';
}

export function shouldAttemptMysterySpawn(second: number): boolean {
  return second === 9 || second === 19 || second === 29 || second === 39 || second === 49;
}

export function shouldForceSecondMysteryBox(second: number, spawnedCount: number): boolean {
  return second === 30 && spawnedCount < 2 && spawnedCount < 3;
}
