# Minigame Audit Stack

This repository now has layered automated coverage for minigames.

## What The Stack Covers

1. Registry audit
   - `tests/minigames.registry.audit.test.ts`
   - Verifies every minigame entry has valid metadata, scoring rules, and a host mapping.

2. Host contract
   - `tests/minigames.contract.test.tsx`
   - Mounts every active game through `MinigameHost` with stubs so the wrapper flow stays stable.

3. Seed stress
   - `tests/minigames.seedStress.test.tsx`
   - Replays the host across multiple seeds to catch state leaks and brittle result handling.

4. Rule-level suites
   - `tests/minigames.riskWheel.rules.test.ts`
   - `tests/minigames.blackjackTournament.rules.test.ts`
   - `tests/minigames.majorityRules.rules.test.ts`
   - `tests/minigames.silentSaboteur.rules.test.ts`
   - `tests/minigames.minesweeps.rules.test.ts`
   - `tests/minigames.colorMatch.rules.test.ts`
   - `tests/minigames.trapAuction.rules.test.ts`
   - `tests/minigames.chainOfGreed.rules.test.ts`
   - `tests/minigames.gridOfLuck.rules.test.ts`
   - `tests/minigames.tetris.rules.test.ts`
   - These exercise the real helper functions and reducers that define the games' rules, including the chain-vote and grid-chaos engines.

5. Visual smoke
   - `e2e/playwright/minigameLab.smoke.spec.ts`
   - Runs the Dev-only Minigame Lab with `freeze=1` so Playwright can capture stable screenshots.
   - Playwright is configured for desktop Chromium, mobile Chromium, and mobile WebKit.

## How To Run It

- `npm run test:minigames`
- `npm run test:e2e`
- `npm run test:release-full`

## How To Extend It

When adding a new minigame, aim for this order:

1. Add the registry entry and wire the React component or legacy module into the host.
2. Add at least one pure helper or reducer test for the real game logic.
3. Add host coverage if the new game changes how `MinigameHost` mounts or completes a game.
4. Add a Playwright smoke case if the game has important layout or freeze-mode behavior.

## Notes

- Prefer deterministic seeds and pure helpers for the first audit layer.
- Use `#/minigame-lab?...&freeze=1` for stable visual QA when a screenshot matters.
- The freeze mode is route-driven, so it works without changing the normal fullscreen flow.