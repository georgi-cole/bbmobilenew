# Minigame quality contract

## Purpose

This is the release contract for every non-retired entry in `src/minigames/registry.ts`. The executable catalog lives in `tests/helpers/minigameQualityMatrix.ts`; `tests/minigames.qualityMatrix.test.ts` fails when the active registry and catalog differ, when cited evidence disappears, or when this documentation omits an active ID.

A passing render test alone is not sufficient. Protection is only meaningful when the asserted result is the result a player sees and the season stores.

## Authoritative result contract

Every accepted minigame completion must satisfy all of these rules:

1. The same seed and the same inputs produce the same logical result.
2. Every scheduled participant is represented exactly once. Unknown, duplicate, evicted, or inactive IDs are rejected rather than invented.
3. All numeric scores and tiebreakers are finite. `NaN`, infinities, and malformed persisted values fail safely.
4. A winner and last-place player, when required, belong to the participant set.
5. Pure rules, component callback, MinigameHost, season state, announcement, reward, and recap agree on winner, loser, rankings, and ties.
6. A completion is accepted exactly once. Double click, rerender, retry, late timer, unmount, and duplicate callback cannot apply a second result, reward, charge, history event, or phase advance.
7. Authoritative games return `authoritativeWinnerId` and may return `authoritativeLastPlaceId`, `rawResults`, and a lower-is-better `tiebreakerMs`. Non-authoritative games return a finite human raw value for the host to combine with seeded AI results.
8. Higher score wins unless the registry adapter or the per-game matrix says lower, survival, elimination, bracket, placement, or custom.
9. An equal canonical score uses the documented per-game tie policy. Where the shared scorer is responsible, a lower supplied tiebreaker wins; absent a tiebreaker, stable participant order is the deterministic final fallback.
10. Exit before completion is visibly marked partial and requires an explicit Continue before the parent accepts it. Closing after acceptance cannot erase the result.
11. Retry resets only the current attempt. State from a previous game cannot leak into the next competition.
12. Animation, audio, cinematic timing, and reduced-motion settings never decide game correctness.

## Player-understanding contract

Before play, the real host must show the registry title, objective, instructions, metric, and time policy. During play, the player must be able to identify the available action and whether it was accepted. At the terminal state, the player must see the outcome and one obvious next action.

Instructions are a gameplay contract: when wording and implementation disagree, the rule is unresolved until evidence is evaluated and the decision is recorded in `docs/product-rule-decisions.md`.

## Host and lifecycle contract

For each active entry the real MinigameHost path must prove that it:

- mounts the real component with valid participants and seed;
- exposes rules/start, the primary interaction, progress/status, exit, and a terminal or documented partial path;
- calls the parent exactly once with a valid result;
- removes the modal/overlay after continue;
- cancels timers and listeners on unmount;
- cannot accept a late callback after dismissal or accepted completion;
- preserves the accepted result across reload when the surrounding phase supports reload;
- uses the same result shape in the Minigame Lab and season gameplay.

The registry-wide Vitest contract may mock components only to isolate host dispatch behavior. It does not count as real-component evidence. Real-component evidence must come from a focused host test or Playwright.

## Deterministic rule matrix

PR validation uses a small reproducible seed matrix and prints the failing seed and inputs. Nightly validation should use a substantially larger matrix. A seed increase is not a substitute for boundary cases.

Each applicable rule layer should cover:

- normal, minimum, maximum, one-player, and empty inputs;
- duplicate, missing, unknown, evicted, and inactive participants;
- all-zero, equal, negative, malformed, and extremely large scores;
- exact timeout boundary and actions immediately before/after it;
- qualification cutoffs and final-two/final-three transitions;
- human plus AI, AI-only, and spectator outcomes;
- partial completion, retry, dismissal, remount, and duplicate completion;
- stable ordering, participant conservation, valid result schema, and finite numbers.

Not every item applies to every component. A non-applicable case must be explicit in the matrix or focused test, not silently absent.

## Browser and layout contract

The registry-driven Playwright smoke must cover every active ID on desktop Chromium. The PR subset also covers representative high-risk games on mobile Chromium; nightly/release expand to all games on mobile Chromium and WebKit plus 320?568 stress.

For every exercised viewport:

- no horizontal document overflow;
- no clipped or covered primary control;
- critical touch targets are at least 44?44 CSS pixels unless a documented exception exists;
- controls have accessible names and visible focus;
- rules, state, outcome, and continue/dismiss controls are readable;
- no invisible full-screen overlay remains after completion;
- unexpected console errors, page errors, and unhandled rejections fail the test;
- reduced motion remains playable.

Browser emulation is web-platform evidence, not native Android or iOS evidence. Native lifecycle, keyboard, safe-area, and sensor testing remains a later quality phase.

## Evidence levels

- Logic: pure rules, reducers, seeded AI, scoring, or invariant tests.
- Component: real component behavior under React Testing Library.
- Host/integration: real host or Redux/state transition contract.
- Browser: Playwright through the real host/lab or player-facing route.
- Season journey: real player controls through the surrounding game phase.

The matrix records present evidence and known risk. Final executed results belong in `docs/quality-phase-2-report.md`; configuration or test existence is never reported there as a pass unless it was actually run.
