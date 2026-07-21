# bbmobilenew Phase 2 quality remediation report

> **Final continuation:** [`phase-2-final-validation.md`](./phase-2-final-validation.md) is authoritative for the final 4,482-test results, 276-case Playwright inventory, current blockers, and release recommendation. Counts and missing-journey statements below describe the earlier Phase 2 checkpoint.

**Report date:** 2026-07-21 (Europe/Sofia)  
**Baseline branch:** `codex/cross-platform-bottom-nav`  
**Baseline HEAD:** `4dd79d53be0272691915143c14e876de001b6253`  
**Baseline source:** [`quality-phase-2-baseline.md`](./quality-phase-2-baseline.md) and [`test-strategy-audit.md`](./test-strategy-audit.md)

## Executive product summary

**Current release recommendation: NO-GO until the browser blocker, missing Critical journeys, and 1,188-file formatting baseline are resolved. Phase 2 must not yet be described as complete.**

Phase 2 converted a large part of the test collection from a red, inconsistently configured suite into more meaningful protection. The work fixed verified gameplay defects in eviction choreography and social state, repaired stale integration harnesses that were not mounting the real profile state, clarified disputed minigame rules, added a registry-enforced quality catalog for all 32 active minigames, and added five real player-facing Playwright journeys. Playwright now has one server owner, one base URL, no automatic retry, retained failure artifacts, and a shared unexpected-browser-error collector.

The starting point was 121 failing Vitest tests, one unresolved todo, a lint diagnostic with three errors and one warning, and no locally executed browser assertions. With Vitest bounded to four workers, the completed source state passed **1,465 suites and 4,466/4,466 tests twice**, with zero failed, skipped or todo tests. The two final complete runs took 221.2 and 222.9 seconds. Full lint, TypeScript, coverage, web build and Capacitor/mobile-mode build also pass. The exact repository-wide format check remains red.

Browser coverage is **configured and discoverable, not executed**. Playwright discovers **258 cases across six projects**: 43 logical tests at 1366×768 desktop Chromium, Pixel-like mobile Chromium, iPhone-like WebKit, 320×568, 360×800 and 1920×1080. The local Chromium/WebKit download did not complete and no browser gameplay assertion ran. The format gate also remains red because the repository contains extensive pre-existing formatting drift; generated/native output and two non-CSS asset notes are now excluded without hiding actual source.

From a product perspective, confidence improved most in social-state consistency, AI eviction-tie presentation, minigame result contracts, and responsive component contracts. PR, nightly, release and deployment-gating workflows are now defined, but have not executed in GitHub and are intentionally blocked by any red required gate. The largest remaining risks are execution of the configured save/migration/corruption journeys, a complete week from competition through eviction, finale/archive idempotence, reward callback and purchase/currency integrity, real all-minigame browser execution, weak branch protection in persistence/finale/store setup and the legacy formatting baseline.

### Evidence labels used in this report

- **Executed:** the named check reached product assertions and its result was observed.
- **Configured:** code or CI is present and test discovery succeeds, but the test did not execute in a browser/runtime.
- **Blocked:** an external runtime or environment condition prevented execution.

## Current product confidence

| Product concern                       | Baseline confidence |                           Current confidence | Product interpretation                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------: | -------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core startup and usable Day 1         |                 Low |                                   Low-medium | A real fresh-profile/campaign journey is authored and discoverable, but has not run in a browser. Component/integration coverage remains the only executed evidence.                                                                           |
| Week progression, voting and eviction |                 Low | Medium at reducer/integration level; low E2E | Broken real-store test setup was repaired and the AI eviction-tie choreography defect was fixed. A complete real week is still missing from Playwright.                                                                                        |
| Save and resume                       |                 Low |                                   Low-medium | Real save/resume plus runtime-derived legacy migration and corrupt-current-save recovery journeys are authored and discoverable. Browser execution and broader duplicate-transition/state-field checks remain unproven.                        |
| Social relationships and AI           |          Low-medium |        Medium-high at unit/integration level | 358 broader social tests and 78 Social Panel tests passed focused validation. Relationship deltas, alliance reciprocity, duplicate handling, betrayal probability and render determinism were corrected. Browser proof remains blocked.        |
| Minigame rules and host behavior      |              Medium |                                       Medium | Rule conflicts and several harness defects were resolved; a machine-checked catalog covers every active registry entry. Many games still lack a dedicated real-host Vitest path, and all browser entries are only configured.                  |
| Currency, purchases and rewards       |                 Low |                                          Low | The social-energy journey now double-activates Execute and requires one persisted debit, but it has not run. Reward callbacks remain untested in-browser, and the current Store has no player-facing purchase transaction/ledger to protect.   |
| Finale, recap and archive             |          Low-medium |                                   Low-medium | Finale recovery integration now mounts the real finale reducer. The required real UI finale/archive idempotence journey is not present or executed.                                                                                            |
| Navigation and route recovery         |                 Low |                                   Low-medium | A production navigation/unknown-route recovery journey is authored, plus route/component checks. It has not run in a browser.                                                                                                                  |
| Responsive/safe-area behavior         |          Low-medium |           Medium at component-contract level | The focused 23-test layout cluster passed. Shared browser geometry assertions exist, but no browser viewport was actually exercised in this environment.                                                                                       |
| Web build                             |         Medium-high |                                         High | Final production build passed; oversized chunks remain a startup/performance risk, not a build failure.                                                                                                                                        |
| Android/iOS behavior                  |            Very low |                                     Very low | Mobile-mode web bundling is not native Android/iOS verification. No native build/device suite was added in this phase.                                                                                                                         |
| Security and dependency health        |         Low/unknown |                                   Low-medium | A mutable production-store exposure remains unresolved; offline full/production audits found zero cached-advisory vulnerabilities; online high-severity audit gates are configured. Secret scan, SAST, SBOM and native evidence remain absent. |

## Preservation and audit integrity

Before Phase 2 edits, a verified recovery checkpoint was created outside the repository at:

`C:\Users\georg\Documents\Codex\quality-backups\bbmobilenew-phase2-20260721-020505`

The checkpoint contains the recorded branch, HEAD, root and working-tree status, a 143,537-byte `working-tree.patch`, a one-byte `cached.patch` showing no staged changes, an untracked-file manifest, and preserved copies of the eligible untracked files `docs/test-strategy-audit.md` and `src/social/socialStoryBible.ts`. The protected `C:\Users\georg\.git_backup` location was not touched.

The repository began Phase 2 with substantial user-owned modifications. Work proceeded on top of those files without reset, clean, stash, stage, commit, or wholesale restore. A final path comparison found **43/43 original relevant modified/untracked paths still present and zero missing**; generated `coverage/` and `test-results/` were intentionally excluded from that source-preservation comparison. No staging or commit was performed. The backup remains the recovery authority for exact overlap review.

## Before/after quality ledger

The right-hand column is deliberately conservative. Focused green checks are not upgraded to release-gate success.

| Gate                             | Before Phase 2                                                                | Current observed result                                                                                                                           | Final status                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Vitest full suite                | **4,337 passed, 121 failed, 1 todo; 4,459 total**                             | **1,465/1,465 suites and 4,466/4,466 tests passed twice** with four workers; zero failed, skipped or todo.                                        | **Passed twice:** 221.2 s and 222.9 s.                                       |
| Focused core-flow regression set | Failures across ceremony, challenge, eviction, finale and related screens     | **143/143 accounted for as passing** after real reducers and intended terminal-state assertions were restored.                                    | Executed focused evidence.                                                   |
| Social unit/integration          | Maneuvers, policy, autonomy, costs and targeting failures; one todo           | **358/358** broader social tests passed. The previously unresolved todo is active and passing.                                                    | Executed focused evidence.                                                   |
| Social Panel component tests     | Render randomness and stale assumptions                                       | **78/78** passed; focused lint/typecheck passed.                                                                                                  | Executed focused evidence.                                                   |
| Responsive/layout unit tests     | Nine stale layout expectations among baseline failures                        | **23/23** focused layout tests passed.                                                                                                            | Executed focused evidence; browser layout is blocked.                        |
| Minigame quality-matrix tests    | No registry-enforced completeness matrix                                      | **4/4** matrix/completeness tests passed and cover all 32 active IDs.                                                                             | Executed focused evidence.                                                   |
| ESLint                           | Exact command timed out; narrowed diagnostic found **3 errors, 1 warning**    | Exact `npm run lint:ci` completed with zero warnings/errors.                                                                                      | **Passed:** 87.5 s.                                                          |
| Formatting                       | Not a working release gate                                                    | Exact `npm run format:check` remains red across **1,188 legacy files**. Generated/native/report output and two non-code asset notes are excluded. | **Failed / unresolved.** Phase 2-owned files pass focused Prettier checks.   |
| TypeScript                       | Passed in 62.5 s                                                              | Exact `npm run typecheck` completed after correcting the duplicate run-status declaration.                                                        | **Passed:** 25.8 s.                                                          |
| Coverage                         | 66.83% statements, 56.15% branches, 67.24% functions, 69.46% lines; suite red | Final bounded profile passed and wrote a valid summary: 68.27% statements, 58.21% branches, 69.12% functions, 70.92% lines.                       | **Passed:** 441 s. Exact global and nine critical-file baseline floors pass. |
| Web production build             | Passed in 37.1 s, with large-chunk warnings                                   | Final `npm run build` passed; 1,701 modules transformed.                                                                                          | **Passed:** 73.4 s; large-chunk warning remains.                             |
| Mobile-mode production build     | Passed in 95.2 s, with large-chunk warnings                                   | Final `npm run build:mobile` passed; 1,701 modules transformed.                                                                                   | **Passed:** 67.8 s; not a native/device build.                               |
| Playwright discovery             | 114 cases across four specs/three projects                                    | **258 cases across five specs/six projects** discover successfully.                                                                               | Configured only.                                                             |
| Playwright execution             | Browser executable missing; zero app assertions                               | Browser installation timed out/incomplete; zero browser assertions executed.                                                                      | **Blocked.**                                                                 |

### Final validation fields that must be updated before release

| Required final evidence                                | Result                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact format check                                     | **FAILED** - 1,188 legacy files require formatting; generated/native/report output is excluded; Phase 2-owned files pass focused checks.   |
| Exact lint                                             | **PASSED** - zero warnings/errors.                                                                                                         |
| Exact typecheck                                        | **PASSED** - zero TypeScript errors.                                                                                                       |
| Full Vitest pass 1                                     | **PASSED** - 1,465 suites; 4,466 tests; zero failed/skipped/todo; 221.2 s.                                                                 |
| Full Vitest pass 2, unchanged source                   | **PASSED** - 1,465 suites; 4,466 tests; zero failed/skipped/todo; 222.9 s.                                                                 |
| Coverage totals and critical-file branches             | **PASSED** - 68.27% statements, 58.21% branches, 69.12% functions, 70.92% lines; the exact-baseline global and nine-file risk gate passed. |
| Web build                                              | **PASSED** - 73.4 s; oversized chunk warning recorded.                                                                                     |
| Mobile-mode build                                      | **PASSED** - 67.8 s; oversized chunk warning recorded; not native device proof.                                                            |
| Playwright core journeys, first attempt/no retry       | **BLOCKED - browser binary unavailable**                                                                                                   |
| Playwright core journeys, second run/no retry          | **BLOCKED - browser binary unavailable**                                                                                                   |
| Playwright all-minigame desktop smoke                  | **BLOCKED - browser binary unavailable**                                                                                                   |
| Playwright representative mobile smoke                 | **BLOCKED - browser binary unavailable**                                                                                                   |
| Playwright WebKit subset                               | **BLOCKED - WebKit binary unavailable**                                                                                                    |
| Final `git status --short` and preservation comparison | **PASSED WITH DIRTY TREE EXPECTED** - original user-owned areas remain; no stage/commit/stash/reset/clean was used.                        |

## Product defects and rule conflicts remediated

### Core progression, eviction and terminal states

| Severity | Player-facing issue                                                                                                                                      | Root cause and correction                                                                                                                                                                                                                  | Executed evidence                                                           | Remaining risk                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| High     | An AI eviction tie could resolve in state but fail to enter the intended eviction choreography/presentation path.                                        | `GameScreen` required `game.awaitingTieBreak` even though the reducer deliberately clears it after choosing the pending evictee. The UI guard now relies on the exact tally, tie and pending-evictee invariants instead of the stale flag. | The existing choreography regression passes in the focused core set.        | Full browser week/tie journey is absent.                                                         |
| High     | Ceremony, challenge, nomination, eviction, jury, spectator, final-four and finale integration tests could fail for reasons unrelated to player behavior. | Fourteen integration-store fixtures omitted the real profiles reducer; finale recovery also omitted the real Final Faceoff reducer. The fixtures now mount the real state slices used by production.                                       | Focused core cluster is fully accounted for as passing (143 tests).         | These remain integration tests; one complete real UI week is still required.                     |
| High     | `?qa=1` could expose a state-mutating nomination control without the application being in an explicitly guarded debug/E2E mode.                          | QA nomination controls now require both `qa=1` and the existing debug-mode guard. Regression setup enables the supported E2E guard explicitly.                                                                                             | Focused nomination test passes; TypeScript/focused lint passed at the time. | A built-production negative browser check should prove the control is absent without debug mode. |
| High     | Tests expected an evicted Classic player to continue as a spectator, contradicting the current terminal product contract.                                | Assertions now verify the exact season-over/Tribunal terminal experience. A self-evicted player receives the vote breakdown immediately rather than an unrelated ad prompt.                                                                | Focused eviction/public-meter tests pass.                                   | The policy is documented, but a real E2E terminal journey remains missing.                       |
| Medium   | Social control expectations treated a season-over overlay as if the underlying action disappeared.                                                       | The intended product behavior is that the control remains present but explicitly unavailable (`aria-disabled=true`) while the terminal dialog owns the flow.                                                                               | Focused public-meter test passes.                                           | Browser focus/overlay interception still needs real rendering evidence.                          |

### Social relationships, alliances and AI

| Severity | Player-facing issue                                                                                                              | Correction                                                                                                                   | Executed evidence                                                | Remaining risk                                                                            |
| -------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| High     | A social action could report/log one relationship change while persisting a different value, making feedback and state disagree. | The returned and logged delta now equals the delta actually persisted after clamping/rule application.                       | 358/358 broader social tests passed.                             | End-to-end visible feedback versus reloaded relationship state is not yet exercised.      |
| High     | An accepted alliance could be one-sided, below the alliance affinity floor, duplicated, or leave stale tags.                     | Alliance acceptance is reciprocal, enforces `MIN_ALLIANCE_AFFINITY`, is duplicate-safe, and repairs stale relationship tags. | Maneuver/policy/integration coverage passes in the 358-test run. | Multi-week alliance lifecycle and eviction cleanup deserve a browser/integration journey. |
| High     | Risky betrayal behavior had lost its intended chance path, making social AI less logical than the player-facing rule.            | The betrayal chance was restored under the documented risky-action policy.                                                   | Targeted social policy tests pass.                               | Larger deterministic seed distribution should run nightly and print failing seeds.        |
| Medium   | `SocialPanelV2` used randomness during React render, so identical state could show different narratives and fail lint purity.    | Render-time randomness was removed and cost-memo dependencies were corrected.                                                | 78/78 Social Panel tests and final full lint passed.             | Visual/browser proof remains blocked.                                                     |

### Minigames, scoring and consistency

| Severity | Product rule or defect                                                                                                             | Decision/correction                                                                                    | Executed evidence                                                                             | Remaining risk                                                                                                          |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| High     | The TV/history test expected a 50-entry cap while the current product retains a 1,000-entry main history.                          | The regression now exercises the real 1,000-entry cap.                                                 | Focused reducer test passed during remediation.                                               | The test title should remain aligned with the 1,000-entry rule; persistence-size pressure needs performance monitoring. |
| High     | Generic lower-is-better scoring had an inconsistent expected ranking.                                                              | Lower numeric results now order winners consistently, with the documented deterministic tiebreak path. | Minigame invariant tests pass focused validation.                                             | Each display/store adapter still needs cross-layer verification.                                                        |
| High     | Chain of Greed's test claimed to exercise a tie but supplied a non-tied vote.                                                      | The fixture now creates a genuine 2-2 tie before deterministic duel resolution.                        | Focused rules test passes.                                                                    | Double-input and late-duel callback behavior remains a browser risk.                                                    |
| High     | Pressure Plank could be treated as an authoritative full-standing result even though it emits a raw player score for host ranking. | Registry metadata now marks it non-authoritative/raw.                                                  | Registry/contract tests pass.                                                                 | Dedicated real-host/store consistency coverage is still missing.                                                        |
| High     | Capitalization produces component-owned standings but did not advertise the correct authoritative adapter.                         | Registry metadata now identifies its authoritative result contract.                                    | Component/logic and registry checks pass focused validation.                                  | Direct host-to-store-to-announcement equality remains missing.                                                          |
| High     | Big Spender had no competition AI model in the registry.                                                                           | A seeded AI model was added so AI participants use the same competition pipeline.                      | Registry and related focused checks passed.                                                   | Component/store/host coverage is still a named matrix gap.                                                              |
| High     | Glass Bridge expected all AI participants to move at once, conflicting with the production concurrency cap.                        | The regression now enforces the capped `MAX_PARALLEL_MOVERS` batch and final timing policy.            | The component test passes focused validation.                                                 | Short-viewport/final-minute concurrency needs browser execution.                                                        |
| Medium   | Several host tests could auto-resolve before the test or player had a chance to confirm completion.                                | The shared host harness now exposes an explicit Finish action; contract/seed-stress helpers use it.    | Affected 96-test minigame cluster passed with four workers; the full suite then passed twice. | Real-browser host interaction and universal per-game idempotence remain unproven.                                       |
| Medium   | Castle Rescue, Diary Room timers, TV labels and related tests encoded stale signatures/timing/accessibility assumptions.           | Tests now await owned timers, use current result signatures and query accessible labels.               | Related focused tests passed.                                                                 | Long-running canvas and unmount behavior remain underprotected.                                                         |

These material rule choices are recorded with evidence and rejected alternatives in [`product-rule-decisions.md`](./product-rule-decisions.md). Tests were not weakened to generic rendering checks, and no skip/only mechanism was introduced to hide a failing behavior.

## Tests and infrastructure added or strengthened

| Category                         | Change                                                                               |                                                                   Amount/evidence | What it protects                                                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry quality contract        | `tests/helpers/minigameQualityMatrix.ts` and `tests/minigames.qualityMatrix.test.ts` |                                                                  4 executed tests | Active registry IDs exactly match the catalog; required metadata exists; cited test files exist; every active ID appears in the documentation. |
| Core Playwright journeys         | `e2e/playwright/core-player-journeys.spec.ts`                                        | 5 authored journeys; 30 cases across six projects, 8 in the two-project PR matrix | Fresh profile/campaign, save/reload, route recovery, rapid-repeat one-unit social debit, and legacy/corrupt-save recovery.                     |
| Browser error handling           | `e2e/playwright/support/test.ts`                                                     |                                                          Shared automatic fixture | Fails a test on unexpected console errors, page errors or unhandled rejections and attaches structured error evidence.                         |
| Browser layout contract          | `e2e/playwright/support/layoutAssertions.ts`                                         |                                                             2 reusable assertions | Horizontal overflow and viewport containment. These are configured but not yet browser-executed.                                               |
| Core integration fixtures        | Fourteen game-flow integration files plus finale recovery                            |                                        143 focused tests accounted for as passing | Production-equivalent profiles/finale state and observable player flow.                                                                        |
| Social regression coverage       | Maneuvers, policy, autonomy and panel tests                                          |                                          358 broader social + 78 panel tests pass | Costs, affinity, reciprocity, stale-tag repair, deterministic rendering and risky-action policy.                                               |
| Responsive contracts             | HUD, safe-area and responsive-layout test updates                                    |                                                                        23/23 pass | Current supported component/layout contract without relying on obsolete CSS strings.                                                           |
| Minigame harness and rule checks | Host harness, contract, seed stress, invariants and focused component/rule tests     |                                Affected five-file cluster 96/96 with four workers | Explicit completion, deterministic seeds, result shape, concurrency and rule alignment.                                                        |

No meaningful test was intentionally deleted, skipped, focused or replaced with a shallow `toBeTruthy()`-style assertion. The baseline todo was turned into an active behavioral test.

## Active minigame protection achieved

The executable source of this catalog is `tests/helpers/minigameQualityMatrix.ts`; [`minigame-test-matrix.md`](./minigame-test-matrix.md) contains the complete rules, timing, tie and evidence detail. “Browser configured” below means only that the registry-backed Playwright lab mount and shared Exit -> partial result -> Continue path are discoverable. It does **not** mean the game was played in a browser during this phase or that its primary interaction reached a normal result.

| Active registry ID       | Achieved non-browser protection                         | Browser state            | Highest remaining gap                   |
| ------------------------ | ------------------------------------------------------- | ------------------------ | --------------------------------------- |
| `quickTap`               | Logic engine + real component                           | Configured, not executed | Dedicated real-host Vitest path         |
| `memoryMatch`            | Competition logic; style contract                       | Configured, not executed | Interactive component completion        |
| `timingBar`              | Logic + component                                       | Configured, not executed | Host callback/store consistency         |
| `estimationGame`         | Competition logic + host integration                    | Configured, not executed | Focused real-component path             |
| `holdWall`               | Slice rules + timeout/effects + host                    | Configured, not executed | Background/visibility lifecycle         |
| `famousFigures`          | Scoring/match flow + component                          | Configured, not executed | Host callback/store consistency         |
| `silentSaboteur`         | Rules/helpers + component + final-two integration       | Configured, not executed | Mobile final-two presentation           |
| `majorityRules`          | Rules/logic + component + host/integration              | Configured, not executed | Long mobile rounds                      |
| `pressurePlank`          | Competition logic; raw-result metadata corrected        | Configured, not executed | Raw score through host/store            |
| `colorMatch`             | Rules + component + seeded host                         | Configured, not executed | Low residual risk; browser proof        |
| `logicLocks`             | Canvas engine + component + host                        | Configured, not executed | Short canvas viewport                   |
| `snake`                  | Competition/AI + results component + host               | Configured, not executed | Simultaneous keyboard/touch input       |
| `cardClash`              | Competition + peek component + seeded host              | Configured, not executed | Late animation after exit               |
| `hangman`                | Engine + component + host                               | Configured, not executed | Keyboard/touch overlap                  |
| `tiltLabyrinth`          | Collision/integration + component integration           | Configured, not executed | Native motion-sensor behavior           |
| `threeDigitsQuiz`        | Number-trivia rules + host                              | Configured, not executed | Focused component path                  |
| `capitalization`         | Logic + component; authoritative metadata corrected     | Configured, not executed | Callback/store equality                 |
| `tetris`                 | Rules + integration                                     | Configured, not executed | Held-key/touch geometry                 |
| `minesweeps`             | Rules + component states + host                         | Configured, not executed | Long-press/right-click parity           |
| `dontGoOver`             | Outcome/helpers + spectator + host/integration          | Configured, not executed | Complete three-life final journey       |
| `blackjackTournament`    | Rules/slice + integration; style contract               | Configured, not executed | Interactive mobile completion           |
| `riskWheel`              | Rules/slice/idempotence + completion + host             | Configured, not executed | Reduced-motion behavior                 |
| `wildcardWestern`        | Helpers/slice + completion component                    | Configured, not executed | Real-host callback/store path           |
| `castleRescue`           | Ranking/rules/timeout + continue component              | Configured, not executed | Long canvas lifecycle/unmount           |
| `glass_bridge_brutal`    | Logic/concurrency + component + seeded host             | Configured, not executed | Short viewport/final-minute concurrency |
| `crystal_path_shattered` | Logic + async component + integration                   | Configured, not executed | Delayed timer after unmount             |
| `rescueTheKing`          | Rescue logic                                            | Configured, not executed | No focused component/host evidence      |
| `trapAuction`            | Logic/rules + component                                 | Configured, not executed | Bid/store idempotence                   |
| `gridOfLuck`             | Logic/rules + component + host/integration              | Configured, not executed | Low residual risk; browser proof        |
| `bigSpender`             | Logic + newly registered seeded AI                      | Configured, not executed | Component/store/host coverage           |
| `chainOfGreed`           | Logic/rules + component + integration; true tie fixture | Configured, not executed | Double-vote/duel input                  |
| `batteryLow`             | Logic                                                   | Configured, not executed | Component/store/host coverage           |

### What the matrix proves - and what it does not

The machine check prevents a newly activated minigame from silently disappearing from the quality catalog. It also makes missing host/component evidence visible. The configured browser matrix now includes the real common dismissal/result/Continue route for every active game, but it does not prove game-specific primary input, normal completion, completion idempotence, logic-to-component-to-host-to-store equality, overlay cleanup, mobile geometry, reduced motion or late-timer safety. It cannot close even the configured gap until it runs against real Chromium/WebKit binaries.

## Determinism, duplicate events and consistency

### Improved in this phase

- The same rendered social state no longer changes because of `Math.random()` during React render.
- Lower-is-better ordering uses the declared direction, and the Chain of Greed tie regression now supplies an actual tie.
- Big Spender now has a seeded AI path in the competition registry.
- Alliance creation is reciprocal and duplicate-safe, and can repair stale tags without creating another alliance.
- The host harness requires explicit completion, preventing an auto-resolve race from making a test pass or fail before the intended terminal event.
- Glass Bridge validates its designed concurrency cap instead of demanding an impossible all-at-once batch.

### Still not universally proven

- Every active minigame does not yet have an executed cross-layer assertion showing logic winner = component result = host result = store = announcement/reward/history.
- A duplicate-completion callback, repeated Continue click, late timer, remount and dismissal race are not tested for every active game.
- The default 12-seed matrix passed within both complete suites and again focused; the configured 50-seed nightly/release run has not executed in CI.
- Seed failures now report the exact minigame and seed, but a real nightly run and historical flake reporting remain unverified.

## Playwright: configured coverage versus executed evidence

### Infrastructure correction

Playwright now has one authoritative URL, `http://127.0.0.1:4173/bbmobilenew/`, and `playwright.config.ts` alone owns the Vite server. Per-spec local-port defaults were removed. Automatic retries were changed from one to zero so a flaky first attempt cannot be hidden. Failed runs retain trace, screenshot, video and an HTML report under `test-results/` and `playwright-report/`. CI jobs are configured to install Chromium or WebKit per job and upload both result directories for 14 days on PRs and 30 days on nightly/release/deployment runs.

All E2E specifications use the shared browser-error fixture. Unexpected console errors, page errors and unhandled promise rejections fail the test and are attached as `unexpected-browser-errors.json`.

### New real player journeys

| Journey                           | Real UI behavior asserted                                                                                                                   |       Discovery |        Execution |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------: | ---------------: |
| Fresh start                       | Clear context, load Home, create profile, start Campaign, see usable Day 1/game navigation/player                                           | 6 project cases | **Not executed** |
| Save and resume                   | Advance to LOH, save, return Home, reload, Continue Last, restore exact phase/day/player                                                    | 6 project cases | **Not executed** |
| Navigation and recovery           | Game to Rules and back; unknown route to visible recovery then Home                                                                         | 6 project cases | **Not executed** |
| Representative resource integrity | Double-activate Social Execute, charge exactly one energy, save/home/reload, preserve balance                                               | 6 project cases | **Not executed** |
| Legacy migration/corrupt recovery | Derive a legacy slot from a real UI save, migrate via Continue Last, quarantine corrupt v2, preserve an unrelated save, and recover visibly | 6 project cases | **Not executed** |

These journeys use accessible role/name locators and state/visibility waits rather than fixed sleeps or direct Redux dispatches. Their implementation is meaningful, but only discovery has been proven.

### Discovered projects and viewports

| Project                    | Configured target        | Discovered cases | Actually executed product assertions |
| -------------------------- | ------------------------ | ---------------: | -----------------------------------: |
| Desktop Chromium           | 1366 x 768               |         43 cases |                                    0 |
| Pixel-like mobile Chromium | Pixel 7 device profile   |         43 cases |                                    0 |
| iPhone-like WebKit         | iPhone 13 device profile |         43 cases |                                    0 |
| Narrow Chromium            | 320 x 568                |         43 cases |                                    0 |
| Compact mobile Chromium    | 360 x 800                |         43 cases |                                    0 |
| Wide desktop Chromium      | 1920 x 1080              |         43 cases |                                    0 |

### Required core evidence still missing or blocked

- A complete real week from LOH through nominations, POS/replacement, vote/tie, exactly one eviction and a usable next week.
- Execution of the authored runtime-derived legacy migration and corrupt-save recovery journey, including its v2 rewrite and unrelated-save preservation assertions.
- A reward-callback idempotency journey. The rapid-repeat social debit is useful, but the current Store exposes no real purchase transaction or receipt/ledger; release scope must either exclude purchases explicitly or implement and protect that capability.
- A deterministic finale through jury result, exactly one winner/runner-up, recap/archive once, reload without duplication.
- Production-route coverage beyond the currently sampled Rules/unknown-route flow.

### Exact environment blocker

The required Playwright browser binaries are not available. The initial Chromium/WebKit installation attempts stalled. Cleanup was deliberately limited to verified installer processes and a verified-empty stale Playwright download lock; a later observer temporarily saw descendant installer processes after the wrapper ended. A final read-only check found none of those reported process IDs, but the cache remains incomplete. No broad cache or repository deletion was performed. A clean Chromium installation was attempted with an extended connection timeout:

```powershell
$env:PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT='120000'
npx playwright install chromium
```

It produced no useful download output and was terminated after approximately 604 seconds. The Playwright cache contains an incomplete `chromium-1208` tree, including a zero-byte `D3DCompiler_47.dll`; `chromium_headless_shell-1208` and WebKit are absent. A final zero-retry targeted launch selected four core tests and failed the first before gameplay with this exact trace error:

```text
browserType.launch: Executable doesn't exist at C:\Users\georg\AppData\Local\ms-playwright\chromium_headless_shell-1208\chrome-headless-shell-win64\chrome-headless-shell.exe
```

The outer command later timed out during reporter/process cleanup after 273.2 seconds. The retained trace is diagnostic proof of the missing runtime, not gameplay evidence. Consequently, **no browser, viewport, screenshot-based UX review, or gameplay E2E assertion can be listed as passing**.

Smallest remediation: on a machine/network allowed to download Playwright assets, first verify no active installer owns the cache or lock; remove only the verified incomplete Playwright revision directories/lock; run `npx playwright install --with-deps chromium webkit`; verify `npx playwright test --list`; then run each required suite twice with retries disabled. Do not delete broad cache or repository directories.

## UX and responsive-layout findings

The responsive component contract improved: nine stale HUD/safe-area/layout expectations were replaced with current observable layout/accessibility contracts, and the focused 23-test layout set passes. No production layout change was made solely to satisfy those tests. Social controls also expose unavailable state through `aria-disabled` under the terminal flow, and TV queries now use accessible labels.

Browser-only UX claims remain unverified. The shared assertions can detect horizontal document overflow and whether a critical control leaves the viewport, but they have not run. There is no reliable Phase 2 screenshot set proving 320 x 568, 360 x 800, Pixel-like, iPhone-like, 1366 x 768 and 1920 x 1080 usability. Touch-target size, modal focus trap, visible keyboard focus, reduced-motion progression, blocked-audio behavior, canvas clipping and invisible overlays remain release risks. Any generated `test-results/` or `playwright-report/` content from failed launch attempts is diagnostic infrastructure output, not visual product evidence.

## Coverage assessment

The baseline and final full reports are directly comparable:

| Metric     | Baseline covered / total | Baseline percent | Final covered / total | Final percent |   Change |
| ---------- | -----------------------: | ---------------: | --------------------: | ------------: | -------: |
| Statements |          29,205 / 43,697 |           66.83% |       29,851 / 43,719 |        68.27% | +1.44 pp |
| Branches   |          19,029 / 33,884 |           56.15% |       19,744 / 33,915 |        58.21% | +2.06 pp |
| Functions  |            6,016 / 8,946 |           67.24% |         6,188 / 8,952 |        69.12% | +1.88 pp |
| Lines      |          26,269 / 37,817 |           69.46% |       26,834 / 37,836 |        70.92% | +1.46 pp |

The first final attempt used the ordinary four-worker/15-second profile, recorded 15 timer-heavy failures/cancellations and hung during report finalization. The same five affected files then passed **70/70 under coverage** with two workers and a 60-second instrumentation-only timeout. The complete suite subsequently passed with that profile in 441 seconds and produced `coverage/coverage-summary.json`. The reusable `npm run test:coverage` script now owns this proven profile; ordinary tests retain the 15-second timeout.

Critical final branch coverage remains risk-heavy: `src/store/store.ts` **8.33%**, `src/store/finaleSlice.ts` **32%**, `src/store/saveStatePersistence.ts` **56.19%**, `src/social/SocialEnergyBank.ts` **62.5%**, `src/social/SocialManeuvers.ts` **64.62%**, `src/screens/GameScreen/GameScreen.tsx` **65.37%**, `src/store/gameSlice.ts` **65.52%**, `src/minigames/scoring.ts` **80.43%**, and `src/components/MinigameHost/MinigameHost.tsx` **86.71%**. The improved global percentage therefore does not close the Critical persistence/finale/economy/state-machine gaps.

The checked-in `coverage:check` command now prevents regression below the exact observed global baseline and the nine critical-file branch baselines listed above. These are low-watermark ratchets, not healthy target coverage and not evidence that the underlying behavior is sufficient. The release strategy should raise risk-area protection rather than impose one arbitrary global 90% target:

- Core game state, nomination/vote/eviction, persistence/migration, scoring adapters, economy/rewards and finale: raise meaningful branch coverage toward at least 80%, with explicit critical-path behavioral tests.
- `GameScreen` orchestration and central store setup: first require complete state-transition scenarios and no uncovered Critical branches; a numeric target without those scenarios would be misleading.
- Pure minigame scoring/result adapters: target at least 90% branches where deterministic exhaustive/property tests are practical.
- Presentation-only code: prevent regression globally and prioritize accessibility/interaction evidence over padding line coverage.

## Lint, formatting and suite-stability findings

ESLint now ignores nested `.worktrees`, coverage, distribution output, Playwright reports/results, rendering output, Capacitor/Wrangler output and native build products while continuing to lint project source. The render-time randomness, stale memo dependency, refresh-export exception and `prefer-const` findings were addressed with narrow changes. Exact final `npm run lint:ci` passes with zero warnings/errors.

Formatting is not green. Generated reports, native build/cache output, generated Capacitor assets and two asset-pack prose files carrying a `.css` extension are now ignored. The exact check still reports extensive pre-existing source/documentation drift. All Phase 2-owned CI, E2E, matrix and report files pass focused Prettier checks. A broad rewrite would intermingle large formatting churn with user-owned gameplay work, so the remaining baseline needs an isolated mechanical change or a rigorously implemented changed-file gate. Until the exact CI command passes, format remains a release-process failure.

The seven provisional full-suite failures were timeouts in Crystal Path, Quick Tap, Memory Match, Snake, Capitalization and Rescue the King under high parallel load. The same affected five-file cluster passed all 96 tests with four workers in 80.20 seconds. Vitest is now bounded to four workers without increasing ordinary test timeouts or adding retries, and the complete 4,466-test suite passes twice. Those seven failures are resolved as infrastructure contention.

## CI findings and changes

### Implemented

- The E2E workflow no longer starts a second server or supplies a conflicting base URL; Playwright configuration owns both.
- PR CI has named static-quality, full product-test, explicit minigame/seed, coverage-evidence and web/mobile build jobs.
- PR, release and deployment CI run `coverage:check`, which enforces the exact current global baseline and the nine named critical-file branch baselines after producing coverage evidence.
- PR browser CI is configured to run real core journeys on desktop/mobile Chromium and every active minigame on desktop Chromium.
- Nightly CI configures a 50-seed matrix and all browser scenarios across six viewport/device projects.
- Release CI configures the complete functional, coverage, build, dependency-audit and six-project browser matrix.
- GitHub Pages deployment now depends directly on release-quality and six-project browser jobs, so an independent workflow cannot deploy around a red gate.
- CI jobs are configured to install the required Chromium or WebKit revision with system dependencies per job.
- Playwright retains first-attempt failure evidence with zero retries; report/result artifacts are uploaded after failure for 14 days on PRs and 30 days nightly/release.
- ESLint no longer spends release time traversing known generated/nested trees.
- Deterministic seed failures now include the minigame ID and exact seed; the matrix is bounded from 1 to 100 and defaults to 12 locally/PR, 50 nightly/release.
- Production dependency auditing at `high` severity is configured in static, release and deployment gates.
- `test:guard` rejects focused or disabled test markers (`skip`, `only`, `todo`, `fixme`, `xdescribe`, `xit`, `xtest`) and passed across 378 test/spec files; PR, nightly, release and deployment run it.
- The reusable `test:release-full` command now includes formatting, the disabled-test guard, coverage plus its risk ratchet, Playwright, and both web/mobile builds.

### Still missing or unverified

- The release-only legacy migration/corrupt-save journey is configured but unexecuted; full-week, valid finale/archive idempotency and reward-callback suites are still not established.
- The workflows have been parsed/formatted and their Playwright commands collect, but no GitHub Actions run was executed in this local-only task; configured gates are not runtime proof.
- The format job will correctly remain red until the legacy baseline is remediated.
- Coverage regression is enforced at the exact current global and nine critical-file baselines. Those low-watermark floors must be ratcheted upward as the missing behavioral tests are added; they do not satisfy the recommended 80%/90% risk-area targets.
- `@axe-core/playwright`, selected visual comparisons and first-attempt flake trend reporting are not implemented.
- CodeQL/SAST, secret scanning, SBOM/license and native build/device checks remain absent from repository CI.
- Test counts, runtime and first-attempt flake reporting are not published as a coherent CI summary.
- Release/deployment workflow logic is duplicated in places, so future drift remains possible until the common gate is consolidated or made reusable.

Deployment is now blocked behind strict local release-quality and six-project browser jobs, but the overall CI structure is not yet fully consolidated because of the duplicated workflow logic above. It cannot be called green until GitHub executes it and the red formatting/browser gates are resolved.

## Security and data-integrity posture

One concrete security/product-integrity defect was fixed: a URL query alone can no longer enable the state-mutating QA nomination path; the existing debug/E2E guard is also required. This reduces accidental or malicious production-state mutation through an exposed developer control.

Security confidence remains limited. `npm audit --omit=dev --offline` and the full `npm audit --offline` both reported zero vulnerabilities in the local advisory cache, but an offline result may not include current advisories. Online high-severity production dependency audits are now repository-enforced in PR/release/deployment workflows. Secret scanning, SAST/CodeQL, SBOM/license and native supply-chain jobs are absent, and persistence still lacks executed browser migration/corruption evidence. In addition, `src/main.tsx` currently exposes the mutable Redux store as `window.__store` in every build; local save data is not a server trust boundary, but this unnecessarily enables console or injected-script state mutation and does not meet the requested production-absent read-only probe contract. These are important gaps, not proof of a known remote exploit.

## Runtime impact

| Check                     |                         Baseline runtime | Current observed runtime/impact                                                         |
| ------------------------- | ---------------------------------------: | --------------------------------------------------------------------------------------- |
| Full Vitest pass 1        |                                  174.6 s | **221.2 s**, four workers, 4,466/4,466 passed.                                          |
| Full Vitest pass 2        |                                  208.2 s | **222.9 s**, same source state, 4,466/4,466 passed.                                     |
| Coverage                  |                                  319.4 s | **441 s**, passed with two workers/60-second instrumentation timeout and valid summary. |
| Typecheck                 |                                   62.5 s | **25.8 s** latest post-E2E pass.                                                        |
| Lint                      |         Baseline exact command timed out | **87.5 s** latest post-E2E pass with zero warnings.                                     |
| Web build                 |                                   37.1 s | **73.4 s**, passed with large-chunk warning.                                            |
| Mobile-mode build         |                                   95.2 s | **67.8 s**, passed with large-chunk warning.                                            |
| Affected minigame cluster |                  Not separately recorded | 96/96 passed with four workers in 80.20 s.                                              |
| Browser install           | Immediate missing executable at baseline | Clean Chromium install stalled for about 604 s and remained incomplete.                 |

Bounded Vitest workers trade runtime for stability and lower memory/CPU contention. That is preferable to hiding stalls with longer ordinary test timeouts or retries. GitHub-hosted runtime and shard strategy still need measurement from the first CI executions.

## Remaining risk and prioritized remediation backlog

### Critical - required before release

1. **Establish a green, enforceable formatting gate without mixing it into gameplay changes.**  
   Product risk: a permanently red required check teaches the team to bypass release protection and can conceal unintended source drift. The functional suite has already passed twice from the same source state.  
   Acceptance criteria: remediate the 1,188-file legacy baseline in an isolated, reviewable mechanical change or adopt a rigorously defined changed-file transition gate; preserve generated/native exclusions without hiding project source; then rerun format, lint, typecheck, both builds, coverage/risk gate and the full Vitest suite from the reconciled source state.

2. **Restore a usable Playwright browser runtime and execute first-attempt suites.**  
   Product risk: startup, navigation, persistence, layout and runtime errors are currently inferred from jsdom rather than a real browser.  
   Acceptance criteria: pinned Chromium and WebKit revisions install; zero-retry core smoke passes twice on desktop and mobile Chromium; failure artifacts are retained; WebKit release subset runs; no unexpected console/page/unhandled-rejection errors.

3. **Add and execute a complete real core week.**  
   Product risk: the most important gameplay loop can nominate, veto, vote, evict or advance incorrectly despite lower-level green tests.  
   Acceptance criteria: through real controls, complete LOH, valid nominations, POS and replacement decision, deterministic vote/tie policy, exactly one valid eviction, correct placement/history and a usable next week; reload once mid-flow and prove no duplicate transition.

4. **Execute and harden the configured save migration and corrupt-save recovery journey.**  
   Product risk: saved progress can be lost, mis-migrated or cause startup failure.  
   Acceptance criteria: load each supported legacy fixture, continue, save in current format, reload again; corrupt one slot and show a visible recoverable error without destroying another valid slot; phase, players, seed, balances, nominations and pending decisions match exactly.

5. **Add finale/archive idempotence coverage.**  
   Product risk: an incorrect or duplicate winner/archive is a Critical trust failure.  
   Acceptance criteria: a documented deterministic fixture enters the real UI before the finale; jury outcome produces exactly one winner and runner-up; recap/archive and rewards are written once; reload/repeated Continue cannot duplicate or change them.

6. **Protect purchase/currency/reward transactions.**  
   Product risk: double debit/grant or lost balance directly harms player trust.  
   Acceptance criteria: first make an explicit release-scope decision because the current Store has no real purchase transaction or receipt ledger. If purchases are in scope, implement an authoritative transaction boundary and protect earn, spend, purchase and reward paths through real UI/service contracts. In either scope, exact balances persist across reload; duplicate callback, retry, rapid click and late completion apply once; insufficient balance is visible and non-mutating.

### High - release gate or immediate follow-up

1. **Complete real-host evidence for every active minigame.**  
   Acceptance criteria: each game mounts through the actual host, displays objective/instructions, reaches a terminal result, reports valid participants/finite values, completes exactly once, dismisses per policy, clears overlays/listeners/timers and returns control. Stubs may isolate unrelated dependencies but not the behavior under test.

2. **Execute the all-active-minigame browser matrix.**  
   Acceptance criteria: all 32 run on desktop Chromium; high-risk games run on Pixel-like mobile; nightly includes all six projects; each asserts objective, primary input, feedback, result, Continue/dismissal, no overflow, control containment and no runtime errors.

3. **Execute and finish the configured CI dependency graph.**  
   Acceptance criteria: the new PR/nightly/release/deployment jobs pass in GitHub; formatting and coverage become reliable; required status checks are enabled; artifacts and counts/runtimes are published; configured migration/corrupt-save plus full-week, reward/economy and finale/archive journeys execute before the deployment gate can pass.

4. **Raise meaningful branch protection in critical state modules.**  
   Acceptance criteria: every nomination/vote/eviction, save/migration, finale, reward/economy and scoring branch has an observable behavioral assertion; `GameScreen`, persistence and store branch coverage rises without shallow coverage-only tests; global coverage cannot regress.

5. **Add dependency and secret/supply-chain checks.**  
   Acceptance criteria: lockfile-based audit with an explicit severity policy, automated update policy, secret scan, SAST/CodeQL-equivalent and artifact/SBOM policy run in CI; findings are triaged rather than globally ignored.

6. **Remove the production mutable-store global before adding exact-state E2E probes.**  
   Acceptance criteria: ordinary production bundles do not assign `window.__store` or expose dispatch; existing development debugging remains development-only; any Playwright probe is read-only, enabled only by an explicit E2E guard, absent from production output, and covered by a build/release regression check.

### Medium - add soon

- **Multi-week social lifecycle:** add deterministic alliance/rivalry tests covering eviction cleanup and visible relationship feedback after reload. Acceptance criteria: the same seed reproduces the same lifecycle; evicted players cannot act; reciprocal state and player-visible history agree before and after reload.
- **Adversarial minigame callbacks:** add duplicate callback, remount, late-timer and dismissal cases to high-timer or authoritative games. Acceptance criteria: one accepted completion produces one result, reward/history write and phase transition; later callbacks are inert and timers/listeners are released.
- **Motion/audio/visibility/resize resilience:** exercise representative timer/canvas games with reduced motion, blocked audio, background/visibility changes and resize. Acceptance criteria: logical outcomes and progression do not depend on animation/audio completion; no overlay or dead end remains.
- **Credible participant contracts:** define game-specific minimum/maximum participant metadata. Acceptance criteria: registry validation rejects unsupported counts; instructions and runtime behavior agree; boundary cases return a valid result or explicit recoverable error.
- **Replace brittle source-string checks:** move remaining high-value cases to rendered geometry, accessibility or interaction evidence. Acceptance criteria: assertions observe player behavior, fail for the intended regression, and do not depend on unrelated CSS formatting or DOM nesting.
- **Bundle/native startup review:** measure the large web chunks and native startup rather than treating build success as performance evidence. Acceptance criteria: agreed device/network budgets are recorded and met, or optimized with a tracked exception and product impact.

### Low - can wait after release protection

- **Normalize non-contract copy assertions.** Acceptance criteria: tests assert semantic role/state unless exact wording is an approved player contract; copy-only changes do not break unrelated mechanics tests.
- **Expand non-critical visual regression coverage.** Acceptance criteria: stable representative baselines exist only after semantic/layout checks pass; intentional differences are reviewed rather than broadly updated.
- **Retire the legacy formatting backlog if a changed-file transition gate is chosen.** Acceptance criteria: complete the repository-wide baseline in an isolated mechanical change, keep generated/native exclusions narrow, and remove the temporary transition policy once the full check is green.
- **Broaden desktop presentation review.** Acceptance criteria: representative larger resolutions show no clipping, unreadable scaling or blocked controls, with reviewed artifacts for failures.

## Fixability and ownership

Most remaining product work is repository-fixable, and I can implement it in a focused follow-up. A passing release verdict still needs external execution and one product-scope decision.

| Remaining gap                                                              | Who can close it                                       | Required input or dependency                                                                           |
| -------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Full-week, finale/archive, reward idempotency and deeper minigame journeys | Codex/repository work                                  | Deterministic fixtures and focused production/test changes, followed by browser execution              |
| Mutable production `window.__store` and low critical branch coverage       | Codex/repository work                                  | Development-only read-only probe design; regression tests and builds                                   |
| Formatting gate                                                            | Codex/repository work in an isolated mechanical change | Choose full-baseline cleanup now or a temporary changed-file transition gate                           |
| Purchase protection                                                        | Product decision, then Codex implementation            | Decide whether purchases are a release capability; the current Store has no transaction/receipt ledger |
| Chromium/WebKit execution                                                  | Environment/CI owner, then Codex test triage           | Network/runtime access capable of installing the pinned Playwright binaries                            |
| GitHub required checks, online security jobs and artifact review           | Repository administrator/CI, with Codex fixes          | Run the configured workflows and enable required status checks                                         |
| Native Android/iOS confidence                                              | Mobile release owner plus Codex remediation            | Supported devices/emulators and a native smoke matrix; browser emulation is insufficient               |

Browser flakiness remains unknown because zero gameplay assertions executed. The seven earlier Vitest timeout cases were resolved by the checked-in four-worker contention bound and both complete suites then passed; that is evidence of an infrastructure contention defect, not proof that unexecuted E2E tests are stable.

## Definition-of-done accounting

| Required outcome                                | State                                       | Evidence or blocker                                                                                            |
| ----------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Zero failing original Vitest tests              | **Met**                                     | 4,466/4,466 pass twice under the checked-in four-worker bound.                                                 |
| No hidden skip/focus/todo                       | **Met**                                     | Both final runs and the explicit `test:guard` scan found none; CI now rejects future disabled/focused markers. |
| Lint/typecheck/web/mobile builds pass           | **Met**                                     | Exact final commands pass; build-size warnings are recorded separately.                                        |
| Repository-wide format check                    | **Not met**                                 | Exact check reports 1,188 legacy files; Phase 2-owned files pass focused checks.                               |
| Full coverage run and summary                   | **Met**                                     | Bounded coverage profile passes in 441 s and writes the final JSON summary.                                    |
| Every active game in machine matrix             | **Met**                                     | 32/32, completeness tests 4/4.                                                                                 |
| Logic/rule evidence or documented gap per game  | **Met as cataloging; uneven as protection** | Matrix names evidence and technical gaps.                                                                      |
| Real host or executed Playwright smoke per game | **Not met**                                 | Several host gaps; browser paths configured only.                                                              |
| Completion idempotence proven per game          | **Not met**                                 | Strong for selected games, not universal.                                                                      |
| Logic/UI/host/store consistency per game        | **Not met**                                 | Selected coverage only.                                                                                        |
| Reproducible deterministic failures             | **Partially met**                           | Failures identify game/seed; 12-seed default passed; 50-seed nightly/release is configured, not run.           |
| Fresh start journey                             | **Configured, blocked**                     | Authored/discovered; browser unavailable.                                                                      |
| Full-week journey                               | **Not met**                                 | Not authored.                                                                                                  |
| Save/resume journey                             | **Configured, blocked**                     | Save/resume and legacy migration/corrupt recovery are authored/discovered; browser unavailable.                |
| Economy journey                                 | **Partially configured, blocked**           | Social-energy debit authored; full transaction matrix missing.                                                 |
| Finale/archive journey                          | **Not met**                                 | Existing E2E coverage is not the required real deterministic release journey.                                  |
| One Playwright server/base URL                  | **Met**                                     | Configuration and CI are aligned.                                                                              |
| Desktop/mobile critical journeys pass           | **Not met**                                 | Zero browser assertions executed.                                                                              |
| Unexpected browser errors fail tests            | **Configured**                              | Shared auto fixture exists; execution blocked.                                                                 |
| Critical/High UX defects fixed                  | **Unknown in browser**                      | Focused component issues addressed; rendered audit blocked.                                                    |
| CI enforces practical PR/release gates          | **Configured, not executed**                | PR/nightly/release/deploy dependencies exist; red format/browser gates prevent a green claim.                  |
| Executed evidence separated from assumptions    | **Met in documentation**                    | This report and minigame matrix explicitly label configured versus executed.                                   |

## Evidence and artifact locations

- Baseline: [`docs/quality-phase-2-baseline.md`](./quality-phase-2-baseline.md)
- Original audit/risk register: [`docs/test-strategy-audit.md`](./test-strategy-audit.md)
- Product-rule decisions: [`docs/product-rule-decisions.md`](./product-rule-decisions.md)
- Minigame quality contract: [`docs/minigame-quality-contract.md`](./minigame-quality-contract.md)
- Active minigame matrix: [`docs/minigame-test-matrix.md`](./minigame-test-matrix.md)
- Minigame UX findings: [`docs/minigame-ux-findings.md`](./minigame-ux-findings.md)
- E2E coverage matrix: [`docs/e2e-coverage-matrix.md`](./e2e-coverage-matrix.md)
- Registry-backed matrix source: `tests/helpers/minigameQualityMatrix.ts`
- Core player journeys: `e2e/playwright/core-player-journeys.spec.ts`
- Browser error fixture: `e2e/playwright/support/test.ts`
- Browser layout assertions: `e2e/playwright/support/layoutAssertions.ts`
- Playwright HTML report directory: `playwright-report/` (currently failed-launch/discovery-era evidence, not proof of gameplay)
- Playwright result/trace/screenshot/video directory: `test-results/` (failure artifacts only when a browser can run)
- Coverage report directory: `coverage/` (valid final `coverage-summary.json`; generated and gitignored)
- Coverage regression gate: `scripts/check-risk-coverage.mjs` (executed successfully against the final summary)
- Recovery checkpoint: `C:\Users\georg\Documents\Codex\quality-backups\bbmobilenew-phase2-20260721-020505`

## Final product decision

The remediation has fixed important logic and made the remaining risks much easier to see and reproduce. It has **not** yet established that the game is fully functional, logical, stable and secure across real browsers and release journeys. The safe decision is to keep the release blocked, execute the configured browser/CI gates, remediate the formatting baseline, and add the missing Critical journeys in backlog order.
