# BB Engine — Developer Guide

The Big Brother engine (`src/bb/engine.ts`) is a pure-TypeScript, offline-capable rule-based classifier that generates realistic, context-aware replies for the Diary Room confessional.

---

## Quick start

```typescript
import { bigBrotherReply } from './src/bb/engine';

const reply = bigBrotherReply('I miss my parents so much', {
  playerName: 'Jordan',
  seed: 42,
});
// { text: '…Jordan…', intent: 'grief_family', sentiment: { score: -0.45, intensity: 0.75 }, replyId: 'gf-2' }
```

Run the tests:

```bash
npm test                        # full suite
npx vitest run src/bb           # engine tests only
```

---

## API

### `bigBrotherReply(input, ctx?)`

Generates a deterministic Big Brother reply.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `string` | The player's diary entry text. |
| `ctx.playerName` | `string?` | Substituted for `{{name}}` in templates. Defaults to `"Houseguest"`. |
| `ctx.seed` | `number?` | Seed for PRNG. Combined with a text hash for full determinism. |
| `ctx.lastReplyIds` | `string[]?` | Recent reply IDs to avoid repeating. |
| `ctx.lastIntents` | `IntentId[]?` | Intent history for context (future weighting). |
| `ctx.moodScore` | `number?` | Accumulated mood (-1…+1, future use). |
| `ctx.recentNames` | `string[]?` | Housemate names recently mentioned. |

Returns `EngineReply`:

```typescript
interface EngineReply {
  text: string;           // Final reply (with "— Big Brother" suffix)
  intent: IntentId;       // Detected intent
  sentiment: SentimentResult; // { score: -1…+1, intensity: 0…1 }
  replyId: string;        // Template ID (e.g. "gf-2")
}
```

---

### `detectIntent(text)`

Returns the `IntentId` for the given text.

**Intents:** `safety` | `anger` | `grief_family` | `grief_pet` | `loneliness` | `strategy` | `social_anxiety` | `confession` | `validation` | `humor` | `quit`

**Scoring priority:**
1. **Phrase match** (normalised substring, 2× weight) — highest priority
2. **Regex pattern match** with negation awareness (1× weight + sentiment alignment bonus)
3. **Sentiment fallback** when no patterns match

**Negation handling:** Tokens within 3 positions after a negator (`not`, `don't`, `never`, etc.) are marked negated. Negated regex matches are skipped; negated sentiment words have their contribution inverted (×-0.5).

---

### `scoreSentiment(text)`

Returns `SentimentResult`:

```typescript
interface SentimentResult {
  score: number;     // -1 (very negative) … +1 (very positive)
  intensity: number; // 0 (neutral) … 1 (extreme)
}
```

Uses the built-in `SENTIMENT_LEXICON` (60+ words) with negation awareness.

---

### Utility helpers

```typescript
normalize(text): string        // lowercase + remove punctuation (keep apostrophes)
tokenize(text): string[]       // split normalised text into tokens
bigrams(tokens): string[]      // ["a b", "b c", ...]
trigrams(tokens): string[]     // ["a b c", "b c d", ...]
```

---

## Tuning guide

### Add / modify reply templates

Edit the `TEMPLATES` record in `src/bb/engine.ts`. Each intent has an array of `ReplyTemplate`:

```typescript
{ id: 'anger-15', text: "{{name}}, Big Brother hears you. What is driving this?" }
```

Rules:
- Keep `text` under **205 characters** (the `" — Big Brother"` suffix adds 14; total limit is 220).
- Use `{{name}}` as the player-name placeholder.
- Give each template a unique `id` (used for anti-repeat tracking).

### Add a new intent

1. Add the intent name to the `IntentId` type union.
2. Add an entry to `INTENT_SPECS` with `phrases`, `patterns`, `sentimentBias`, and `weight`.
3. Add a matching entry to `TEMPLATES` (at least 5 templates recommended).

### Add / modify intent phrases

Phrases are matched against **normalised** (lowercase, no punctuation) text and have 2× weight priority over regex patterns. Keep them specific:

```typescript
phrases: ['want to quit', 'ready to leave', ...],
```

### Adjust sentiment lexicon

Add entries to `SENTIMENT_LEXICON` (a `Record<string, number>`):

```typescript
'elated': 0.75,     // positive
'betrayed': -0.7,   // negative
```

Weights should be in the range **-1 to +1**.

### Adjust intent scoring weights

`weight` in `INTENT_SPECS` scales the raw score. Raise it to make an intent win more easily (e.g. `safety` should always win):

```typescript
quit: { phrases: [...], patterns: [...], sentimentBias: -0.5, weight: 1.4 }
```

---

## Offline fallback

`src/services/bigBrotherFallback.ts` is a thin wrapper that exposes the same API as the old standalone module. It re-exports `detectIntent` and `scoreSentiment` directly from the engine for backward compatibility.

`generateOfflineBigBrotherReply(req)` accepts an optional `context: BBContext` field to thread through `lastReplyIds` and other per-player context.

---

## Diary Room typing indicator

When the user submits a diary entry, `DiaryRoom.tsx` waits for the Big Brother reply and then shows a pulsing **"🎙️ Big Brother is typing…"** indicator for a delay proportional to the reply length:

```
delay = clamp(400 + replyText.length × 6, 500, 2200) ms
```

This is client-side only and does not affect the TV feed. The reply is dispatched to the tvFeed only after the delay completes.

---

## Running tests

```bash
# All tests
npm test

# Engine unit tests only
npx vitest run src/bb/__tests__/engine.test.ts

# Fallback service tests
npx vitest run src/services/__tests__/bigBrotherFallback.test.ts
```

Test coverage:

| Area | Cases |
|------|-------|
| `normalize` / `tokenize` | basic functionality, curly apostrophes |
| `bigrams` / `trigrams` | edge cases |
| `scoreSentiment` | positive, negative, clamping, negation |
| `detectIntent` | all intents, negation handling, phrase priority |
| `bigBrotherReply` | name substitution, char limit, determinism, anti-repeat |
