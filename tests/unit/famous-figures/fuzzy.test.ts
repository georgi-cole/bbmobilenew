import { describe, it, expect } from 'vitest';
import {
  normalizeForMatching,
  damerauLevenshtein,
  isAcceptedGuess,
} from '../../../src/games/famous-figures/fuzzy';
import type { FigureRow } from '../../../src/games/famous-figures/model';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mariaMedici: FigureRow = {
  canonicalName: 'Maria de Medici',
  normalizedName: 'maria medici',
  acceptedAliases: ['Maria Medici', 'Marie de Medici'],
  normalizedAliases: ['maria medici', 'marie medici'],
  hints: ['h1', 'h2', 'h3', 'h4', 'h5'],
  baseClueFact: 'A queen of France.',
  difficulty: 'hard',
  category: 'ruler',
  era: 'Renaissance',
};

const napoleonFigure: FigureRow = {
  canonicalName: 'Napoleon Bonaparte',
  normalizedName: 'napoleon bonaparte',
  acceptedAliases: ['Napoleon', 'Bonaparte'],
  normalizedAliases: ['napoleon', 'bonaparte'],
  hints: ['h1', 'h2', 'h3', 'h4', 'h5'],
  baseClueFact: 'French emperor.',
  difficulty: 'medium',
  category: 'ruler',
  era: 'Napoleonic',
};

const mozartFigure: FigureRow = {
  canonicalName: 'Mozart',
  normalizedName: 'mozart',
  acceptedAliases: ['Wolfgang Mozart', 'Wolfgang Amadeus Mozart'],
  normalizedAliases: ['wolfgang mozart', 'wolfgang amadeus mozart'],
  hints: ['h1', 'h2', 'h3', 'h4', 'h5'],
  baseClueFact: 'Austrian composer.',
  difficulty: 'medium',
  category: 'composer',
  era: 'Classical',
};

const caesarFigure: FigureRow = {
  canonicalName: 'Julius Caesar',
  normalizedName: 'julius caesar',
  acceptedAliases: ['Caesar'],
  normalizedAliases: ['caesar'],
  hints: ['h1', 'h2', 'h3', 'h4', 'h5'],
  baseClueFact: 'Roman general.',
  difficulty: 'medium',
  category: 'ruler',
  era: 'Ancient',
};

const daVinciFigure: FigureRow = {
  canonicalName: 'Leonardo da Vinci',
  normalizedName: 'leonardo vinci',
  acceptedAliases: ['Da Vinci', 'Leonardo', 'Leonardo da Vinci'],
  normalizedAliases: ['vinci', 'leonardo', 'leonardo vinci'],
  hints: ['h1', 'h2', 'h3', 'h4', 'h5'],
  baseClueFact: 'Italian Renaissance artist.',
  difficulty: 'easy',
  category: 'artist',
  era: 'Renaissance',
};

// ─── normalizeForMatching ─────────────────────────────────────────────────────

describe('normalizeForMatching', () => {
  it('lowercases text', () => {
    expect(normalizeForMatching('EINSTEIN')).toBe('einstein');
  });

  it('removes diacritics', () => {
    expect(normalizeForMatching('Gàlilëo')).toBe('galileo');
    expect(normalizeForMatching('Cleopâtra')).toBe('cleopatra');
  });

  it('removes punctuation', () => {
    expect(normalizeForMatching("Jeanne d'Arc")).toBe('jeanne arc');
    expect(normalizeForMatching('Martin Luther King Jr.')).toBe('martin luther king jr');
  });

  it('removes particles: de, da, del, von, van, al, ibn, el', () => {
    expect(normalizeForMatching('Leonardo da Vinci')).toBe('leonardo vinci');
    expect(normalizeForMatching('Ludwig van Beethoven')).toBe('ludwig beethoven');
    expect(normalizeForMatching('Vincent de Paul')).toBe('vincent paul');
    expect(normalizeForMatching('El Cid')).toBe('cid');
    expect(normalizeForMatching('Ibn Battuta')).toBe('battuta');
  });

  it('collapses extra whitespace', () => {
    expect(normalizeForMatching('  isaac   newton  ')).toBe('isaac newton');
  });

  it('handles empty string', () => {
    expect(normalizeForMatching('')).toBe('');
  });
});

// ─── damerauLevenshtein ───────────────────────────────────────────────────────

describe('damerauLevenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(damerauLevenshtein('einstein', 'einstein')).toBe(0);
  });

  it('returns string length for empty other', () => {
    expect(damerauLevenshtein('abc', '')).toBe(3);
    expect(damerauLevenshtein('', 'abc')).toBe(3);
  });

  it('counts single substitution', () => {
    expect(damerauLevenshtein('kitten', 'sitten')).toBe(1);
  });

  it('counts single insertion/deletion', () => {
    expect(damerauLevenshtein('einstein', 'einsten')).toBe(1);
  });

  it('counts transposition as 1 (full DL, not restricted)', () => {
    expect(damerauLevenshtein('enistein', 'einstein')).toBe(1);
  });

  it('handles longer strings', () => {
    expect(damerauLevenshtein('napoleon', 'napoleom')).toBe(1);
  });
});

// ─── isAcceptedGuess ──────────────────────────────────────────────────────────

describe('isAcceptedGuess', () => {
  it('accepts exact canonical match', () => {
    expect(isAcceptedGuess('Leonardo da Vinci', daVinciFigure)).toBe(true);
  });

  it('accepts alias match', () => {
    expect(isAcceptedGuess('Da Vinci', daVinciFigure)).toBe(true);
    expect(isAcceptedGuess('Leonardo', daVinciFigure)).toBe(true);
  });

  it('accepts fuzzy match within threshold', () => {
    // "Enistein" → "Einstein" is one transposition
    const einsteinFigure: FigureRow = {
      canonicalName: 'Albert Einstein',
      normalizedName: 'albert einstein',
      acceptedAliases: ['Einstein'],
      normalizedAliases: ['einstein'],
      hints: ['h1', 'h2', 'h3', 'h4', 'h5'],
      baseClueFact: 'Physicist.',
      difficulty: 'easy',
      category: 'scientist',
      era: 'Modern',
    };
    expect(isAcceptedGuess('Enistein', einsteinFigure)).toBe(true);
  });

  it('Maria Medici accepts near-spellings', () => {
    expect(isAcceptedGuess('Maria Medici', mariaMedici)).toBe(true);
    expect(isAcceptedGuess('Maria Medichi', mariaMedici)).toBe(true);
    expect(isAcceptedGuess('Marya Medicci', mariaMedici)).toBe(true);
    expect(isAcceptedGuess('Maria Medechi', mariaMedici)).toBe(true);
  });

  it('Maria Medici does NOT match Napoleon Bonaparte', () => {
    expect(isAcceptedGuess('Maria Medici', napoleonFigure)).toBe(false);
  });

  it('rejects completely wrong guess', () => {
    expect(isAcceptedGuess('Napoleon Bonaparte', mariaMedici)).toBe(false);
  });

  it('accepts mononym match (just "Mozart")', () => {
    expect(isAcceptedGuess('Mozart', mozartFigure)).toBe(true);
  });

  it('accepts short alias exact match only (≤4 chars)', () => {
    // "MLK" is 3 chars — requires exact
    const mlkFigure: FigureRow = {
      canonicalName: 'Martin Luther King Jr',
      normalizedName: 'martin luther king jr',
      acceptedAliases: ['MLK', 'Martin Luther King', 'Dr King'],
      normalizedAliases: ['mlk', 'martin luther king', 'dr king'],
      hints: ['h1', 'h2', 'h3', 'h4', 'h5'],
      baseClueFact: 'Civil rights leader.',
      difficulty: 'easy',
      category: 'leader',
      era: 'Modern',
    };
    expect(isAcceptedGuess('MLK', mlkFigure)).toBe(true);
    expect(isAcceptedGuess('MLJ', mlkFigure)).toBe(false); // 1 char diff but too short → exact only
  });

  it('accepts regnal alias (Caesar matches Julius Caesar)', () => {
    expect(isAcceptedGuess('Caesar', caesarFigure)).toBe(true);
    expect(isAcceptedGuess('Julius Caesar', caesarFigure)).toBe(true);
  });

  it('rejects empty guess', () => {
    expect(isAcceptedGuess('', daVinciFigure)).toBe(false);
    expect(isAcceptedGuess('   ', daVinciFigure)).toBe(false);
  });
});
