# bbmobilenew Phase 2 quality baseline

**Captured:** 2026-07-21 (Europe/Sofia)  
**Repository:** `C:\Users\georg\Documents\Codex\2026-07-05\work-on-githut-directly-no-local\work\bbmobilenew`  
**Branch:** `codex/cross-platform-bottom-nav`  
**HEAD:** `4dd79d53be0272691915143c14e876de001b6253`

## Recovery checkpoint

Before Phase 2 edits, the complete recovery checkpoint was written to:

`C:\Users\georg\Documents\Codex\quality-backups\bbmobilenew-phase2-20260721-020505`

Verification at capture time:

- 45 `git status --short` entries were recorded.
- `working-tree.patch` exists and is 143,537 bytes.
- `cached.patch` exists; there were no staged changes.
- Both eligible untracked source/documentation files were copied with relative paths: `docs/test-strategy-audit.md` and `src/social/socialStoryBible.ts`.
- HEAD, branch, repository root, status and untracked-file manifest files all exist.

Generated audit artifacts (`coverage/` and `test-results/`) were not treated as source/config/test/documentation files.

## Existing repository state

The baseline includes substantial user-owned, pre-existing changes in social systems, `GameScreen`, `gameSlice`, UI components and related tests. Phase 2 must preserve and build on those changes; it must not restore, stash, stage or overwrite them to manufacture a clean baseline.

## Quality-gate baseline

| Gate                                        | Baseline result                                           | Runtime/evidence                      |
| ------------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| ESLint exact `npm run lint:ci`              | Timed out before diagnostics                              | 125.1 s                               |
| ESLint with nested/generated trees excluded | Failed: 3 errors, 1 warning                               | 133.7 s                               |
| TypeScript `npm run typecheck`              | Passed                                                    | 62.5 s                                |
| Full Vitest                                 | **Failed: 4,337 passed, 121 failed, 1 todo; 4,459 total** | 174.6 s verbose run; 208.2 s JSON run |
| Coverage                                    | Failed because suite was red; report generated            | 319.4 s                               |
| Web production build                        | Passed with chunk-size warnings                           | 37.1 s                                |
| Capacitor/mobile-mode build                 | Passed with chunk-size warnings                           | 95.2 s                                |
| Playwright                                  | No app assertions ran; missing browser executables        | 114 cases attempted/retried; 180.1 s  |

### Baseline coverage

| Metric     | Covered / total | Percent |
| ---------- | --------------: | ------: |
| Statements | 29,205 / 43,697 |  66.83% |
| Branches   | 19,029 / 33,884 |  56.15% |
| Functions  |   6,016 / 8,946 |  67.24% |
| Lines      | 26,269 / 37,817 |  69.46% |

Critical-file branch baselines: `store.ts` 8.33%, `GameScreen.tsx` 34.82%, `saveStatePersistence.ts` 56.19%, `gameSlice.ts` 64.58%, `MinigameHost.tsx` 87.04%.

## Testing baseline

- Vitest 4.1.2 with jsdom and React Testing Library.
- 371 runnable Vitest files.
- Approximately 1,070 mock/spy declarations.
- No snapshot assertions, focused tests or explicit skipped tests found.
- One unresolved `it.todo` in `tests/integration/social.maneuvers.test.ts`.
- `tests/diaryWeek.spec.cjs` contains 15 declarations but is excluded by the configured Vitest include pattern.
- Minigame-focused baseline inventory: 91 unit/rule files (1,414 executed cases), 36 component files (202 cases), 14 integration files (166 cases), plus registry-driven Playwright lab smoke.
- Four Playwright spec files expand to 114 cases across three projects.

## Playwright baseline

- Projects: desktop Chromium, Pixel 7/mobile Chromium, iPhone 13/mobile WebKit.
- Global retry: 1.
- Trace: first retry; screenshot: failure; video: disabled.
- `playwright.config.ts` owns a Vite server on port 4173.
- CI also starts a separate Vite server on port 3000.
- `final4-pov.spec.ts` and `finale.spec.ts` default to port 3000 with `/bbmobilenew`; `gridOfLuck.spec.ts` and `minigameLab.smoke.spec.ts` default to port 4173.
- Browser binaries required by Playwright 1.58.2 were not installed locally. The observed launch error was `Executable doesn't exist` for the Playwright Chromium headless shell; WebKit was likewise unavailable.

## Active minigame registry baseline

The registry contains 32 active entries:

| ID                       | Display name               |
| ------------------------ | -------------------------- |
| `quickTap`               | Quick Tap Race             |
| `memoryMatch`            | Memory Colors              |
| `timingBar`              | Timing Bar                 |
| `estimationGame`         | Estimation                 |
| `holdWall`               | Hold the Wall              |
| `famousFigures`          | Famous Figures             |
| `silentSaboteur`         | Silent Saboteur            |
| `majorityRules`          | Majority Rules             |
| `pressurePlank`          | Pressure Plank             |
| `colorMatch`             | Color Match                |
| `logicLocks`             | Vault Cracker              |
| `snake`                  | Serpentine                 |
| `cardClash`              | House of Cards             |
| `hangman`                | Verdict Board              |
| `tiltLabyrinth`          | Tilt Labyrinth             |
| `threeDigitsQuiz`        | Number Trivia              |
| `capitalization`         | Capitalization             |
| `tetris`                 | Fit Me In                  |
| `minesweeps`             | Minesweeps                 |
| `dontGoOver`             | Don't go over              |
| `blackjackTournament`    | Blackjack Tournament       |
| `riskWheel`              | Risk Wheel                 |
| `wildcardWestern`        | Wildcard Western           |
| `castleRescue`           | Find Your Twin             |
| `glass_bridge_brutal`    | The Crystal Path           |
| `crystal_path_shattered` | Crystal Path: Infinity     |
| `rescueTheKing`          | Rescue the King            |
| `trapAuction`            | Trap Auction               |
| `gridOfLuck`             | Grid of Luck               |
| `bigSpender`             | Big Spender: Broke or Boom |
| `chainOfGreed`           | Chain of Greed             |
| `batteryLow`             | Battery Low                |

## Baseline risk posture

The starting state is a release **NO-GO**. Compilation succeeds, but lint, unit/component/integration behavior, browser execution, critical orchestration coverage, persistence journeys, economy integrity, and native confidence do not meet the Phase 2 definition of done. Detailed failure inventory and risk analysis are in `docs/test-strategy-audit.md`.
