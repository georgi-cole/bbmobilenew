# Biography Blitz Competition

A trivia-style elimination minigame for *Big Brother Mobile*. Contestants answer questions about each other's houseguest biographies; wrong answers mean elimination. The last contestant standing wins the HOH or POV.

---

## How it works

1. All active contestants see the same question each round.
2. **Avatar mode** (default when dynamic bio questions are available): a grid of all active contestants' avatars is shown; players tap the avatar of the person they think answers the question.
3. **Text-button mode** (fallback when dynamic generation fails): standard A/B/C/D answer buttons.
4. Contestants who answer incorrectly are eliminated at the end of the round.
5. If *everyone* answers incorrectly the round is voided and no one is eliminated.
6. The last surviving contestant is declared the winner.

---

## Hot Streak mechanic

A contestant who wins **2 consecutive rounds** earns a **Hot Streak** bonus for the *next round only*:

- Their avatar tile in the contestant strip shows a 🔥 flame icon.
- One provably-wrong avatar in the answer grid is visually dimmed for that player only (`bb-blitz__avatar-btn--bonus-hint` CSS class).
- The bonus never reveals the correct answer — only rules out one impossible choice.
- The bonus is consumed after one round (whether or not it was used).
- If the streak owner is eliminated the streak is cleared immediately.

---

## Configuration flags

Both flags are passed in the `startBiographyBlitz` Redux action payload:

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `testMode` | `boolean` | `false` | Collapses all animation delays and the 15 s human timeout to near-zero for CI / unit tests. |
| `dynamicQuestions` | `BiographyBlitzQuestion[]` | `[]` | Pre-generated question bank from live houseguest bios. Falls back to the static `BIOGRAPHY_BLITZ_QUESTIONS` bank when empty. |

The component also accepts a `testMode` prop which is OR'd with the Redux flag.

---

## File layout

```
src/
  competitions/biography_blitz/
    index.ts                  ← stable public API (re-exports)
    README.md                 ← this file

  features/biographyBlitz/
    biography_blitz_logic.tsx ← Redux slice (state machine)
    thunks.ts                 ← resolveBiographyBlitzOutcome
    biographyBlitzQuestions.ts← static fallback question bank (30 Qs)
    bioQuestionGenerator.ts   ← live houseguest bio question generator

  components/BiographyBlitzComp/
    biography_blitz_game.tsx  ← React UI component
    BiographyBlitzComp.css    ← styles + cinematic animations

tests/
  unit/biography-blitz/
    biographyBlitzSlice.test.ts         ← slice + AI unit tests
    biographyBlitz.edgeCases.test.ts    ← edge-case + hot streak tests
    bioQuestionGenerator.test.ts        ← question generator tests
  integration/
    minigame.biographyBlitz.integration.test.ts
```

---

## Running tests

```bash
# Unit tests only
npx vitest run tests/unit/biography-blitz/

# Integration tests only
npx vitest run tests/integration/minigame.biographyBlitz.integration.test.ts

# All tests
npx vitest run
```

---

## Wiring with MinigameHost

The competition is registered in `src/minigames/registry.ts` under the key `biographyBlitz` with:

```ts
implementation: 'react',
reactComponentKey: 'BiographyBlitz',
authoritative: true,
scoringAdapter: 'authoritative',
category: 'trivia',
```

`MinigameHost` routes the `BiographyBlitz` key to `<BiographyBlitzComp>` directly (not through the generic `reactComponents` map), passing `participantIds`, `participants`, `prizeType`, `seed`, and `onComplete`.

The outcome thunk `resolveBiographyBlitzOutcome` dispatches `applyMinigameWinner` exactly once, guarded by the `outcomeResolved` flag.
