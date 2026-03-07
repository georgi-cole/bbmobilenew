# Famous Figures

A Big Brother-style trivia minigame where players identify famous historical figures from progressive clues. Sister game to **Biography Blitz**.

## Game Rules

1. A famous historical figure is hidden — you see only an initial "clue" sentence.
2. You can request up to **5 hints**, each more specific than the last.
3. Type your guess at any time — fuzzy matching accepts reasonable spelling variants.
4. **Scoring:** fewer hints used = higher score.
   | Hints used | Points |
   |------------|--------|
   | 0 (base clue only) | **10** |
   | 1 | 9 |
   | 2 | 7 |
   | 3 | 5 |
   | 4 | 3 |
   | 5 | 1 |
   | Overtime  | 1 |
5. **Three rounds** per match. Highest cumulative score wins.
6. **Tiebreaker:** most correct rounds. If still tied, the first tied player wins.

---

## Dataset Format (JSON Schema)

Each figure in `src/games/famous-figures/data/famous_figures.json` follows this schema:

```json
{
  "canonicalName": "Leonardo da Vinci",
  "normalizedName": "leonardo vinci",
  "acceptedAliases": ["Da Vinci", "Leonardo", "Leonardo da Vinci"],
  "normalizedAliases": ["vinci", "leonardo", "leonardo vinci"],
  "hints": [
    "Hint 1 — vague, no direct identifying info",
    "Hint 2 — general field or era",
    "Hint 3 — notable works or events",
    "Hint 4 — more specific detail",
    "Hint 5 — most specific, near-giveaway (first name or strong clue)"
  ],
  "baseClueFact": "A single sentence shown as the initial clue.",
  "difficulty": "easy",
  "category": "artist",
  "era": "Renaissance"
}
```

### Field definitions

| Field | Type | Description |
|-------|------|-------------|
| `canonicalName` | `string` | The official display name used in reveals |
| `normalizedName` | `string` | Output of `normalizeForMatching(canonicalName)` |
| `acceptedAliases` | `string[]` | Alternative names players might use |
| `normalizedAliases` | `string[]` | `normalizeForMatching` applied to each alias |
| `hints` | `[string, string, string, string, string]` | Exactly 5 hints, vague → specific |
| `baseClueFact` | `string` | Opening clue shown before any hint is requested |
| `difficulty` | `"easy" \| "medium" \| "hard"` | Affects AI correct-answer probability |
| `category` | `string` | Free-form (artist, scientist, ruler, leader, etc.) |
| `era` | `string` | Historical period |

---

## Alias Rules

An alias is a recognisable alternative form of the name. Good aliases:

- **Mononyms** — single-name recognition (`"Mozart"`, `"Michelangelo"`)
- **Shortened forms** — omit first or last name (`"Einstein"`, `"Darwin"`)
- **Regnal names** — title-only forms used historically (`"Caesar"`)
- **Honorific forms** — `"Mahatma Gandhi"` (Mohandas Gandhi's honorific)
- **Abbreviations** — `"MLK"` for Martin Luther King Jr

All aliases and the canonical name must have a corresponding pre-computed `normalizedAlias` (the output of `normalizeForMatching`). Always regenerate normalized forms when adding or modifying a figure.

---

## Fuzzy Matching

The fuzzy matcher is in `src/games/famous-figures/fuzzy.ts`.

### Normalisation (`normalizeForMatching`)

1. NFD Unicode decomposition → strip combining diacritics (removes accents)
2. Replace apostrophes/elision marks (`'`, `'`, `` ` ``) with spaces
3. Lowercase
4. Strip non-alphanumeric/space characters (punctuation, hyphens)
5. Remove standalone particles: `de da del di von van al ibn el of the d l`
6. Collapse whitespace

**Examples:**

| Input | Normalised |
|-------|-----------|
| `Galileo Galilei` | `galileo galilei` |
| `Leonardo da Vinci` | `leonardo vinci` |
| `Joan of Arc` | `joan arc` |
| `Jeanne d'Arc` | `jeanne arc` |
| `Alexander the Great` | `alexander great` |
| `Nikola Tesla` | `nikola tesla` |

### Damerau-Levenshtein Distance

Full **Damerau-Levenshtein** distance (not restricted). Transpositions count as a single edit (e.g. `"enistein"` → `"einstein"` = 1 edit).

### Acceptance threshold

- If the normalised alias length **≤ 4**: require **exact match** (prevents short strings like `"MLK"` accepting `"MLJ"`).
- Otherwise: accept if DL distance ≤ `Math.max(1, Math.floor(aliasLength × 0.22))`.

---

## How to Add / Modify Figures

1. Open `src/games/famous-figures/data/famous_figures.json`.
2. Add a new object following the JSON schema above.
3. **Manually compute** `normalizedName` and `normalizedAliases` using `normalizeForMatching`:
   ```ts
   import { normalizeForMatching } from 'src/games/famous-figures/fuzzy';
   console.log(normalizeForMatching('Joan of Arc')); // → "joan arc"
   ```
4. Write at least 5 hints of increasing specificity. Hint 5 should include the first name or an unambiguous clue.
5. Run tests: `npm run test:famous-figures`

---

## Edge Cases

### Mononyms
Figures known by a single name (e.g. Michelangelo, Mozart, Cleopatra):
- The `canonicalName` is the mononym and is **always a direct match target** — you do not need to add it to `acceptedAliases`.
- Only add the mononym to `acceptedAliases` / `normalizedAliases` if you also want to list alternative spellings or variants of the mononym itself.
- Short mononyms (≤4 chars) are matched by **exact** spelling only (no fuzzy distance allowed).

### Regnal and title names
- Caesar (alias for Julius Caesar), Gandhi (for Mahatma Gandhi).
- Place the short form in `acceptedAliases` so it is matched against directly.

### Particles in names
The normaliser strips `de`, `da`, `del`, `di`, `von`, `van`, `al`, `ibn`, `el`, `of`, `the`, `d`, `l`. Pre-compute all `normalizedName`/`normalizedAliases` fields using the normaliser function to ensure accuracy.

### Diacritics
The normaliser strips all combining diacritics via NFD decomposition. `Cleopâtra`, `Gàlilëo`, `Góngora` all normalise without accents.

---

## Admin Fallback Notes

- The 20-figure dataset is embedded in the bundle; no server fetch is required.
- If a figure at index N is somehow missing (programming error), the relevant `submitPlayerGuess` call silently no-ops.
- Seed-based figure shuffling ensures reproducible round order across page reloads.

---

## Run Instructions

```bash
# Run Famous Figures unit tests only
npm run test:famous-figures

# Run all tests
npm test

# Start the development server
npm run start:famous-figures
```

---

## File Locations

| File | Purpose |
|------|---------|
| `src/games/famous-figures/model.ts` | TypeScript types (`FigureRow`, `MatchStatus`, …) |
| `src/games/famous-figures/fuzzy.ts` | Normalisation + Damerau-Levenshtein matching |
| `src/games/famous-figures/data/famous_figures.json` | 20-figure dataset |
| `src/features/famousFigures/famousFiguresSlice.ts` | Redux slice (state machine) |
| `src/features/famousFigures/thunks.ts` | Outcome resolution thunk |
| `src/components/FamousFiguresComp/FamousFiguresComp.tsx` | React UI component |
| `src/components/FamousFiguresComp/FamousFiguresComp.css` | Styles |
| `tests/unit/famous-figures/` | Unit + integration tests |
