# bbmobilenew automated test-strategy audit

> **Historical baseline notice:** This document is the evidence-based audit snapshot taken before Phase 2 remediation. Its failure counts, tooling gaps, coverage values and release recommendation intentionally describe that earlier source state. For the current post-remediation results, remaining blockers and fix plan, use [`quality-phase-2-report.md`](./quality-phase-2-report.md).

**Audit date:** 2026-07-21  
**Repository state audited:** branch `codex/cross-platform-bottom-nav`, including the pre-existing dirty working tree (44 status entries at the end of the audit check run; the later preservation check normalized this to 43 original relevant modified/untracked paths after excluding generated result paths). 41 tracked source/test files represented about 1,538 additions and 204 deletions, plus untracked `src/social/socialStoryBible.ts`.  
**Audit constraint:** no production code or test was changed. Generated `dist/`, `coverage/`, and Playwright result artifacts were produced only by the requested checks. This report is the only intentional source-controlled audit artifact.

## Executive product summary

**Release recommendation: NO-GO until the Critical and High findings below are resolved and the release suite is green.**

The repository has an unusually broad automated-test surface: 371 runnable Vitest files, 4 Playwright specifications, approximately 4,459 Vitest cases, React Testing Library component tests, and many targeted rule/invariant tests for competitions and season mechanics. This is a strong foundation. It is not currently reliable release protection, however:

- The current Vitest run has **4,337 passing, 121 failing, and 1 todo** test out of 4,459. Eighty-nine reported suites contain failures.
- The failures include high-value behavior: ceremony state transitions, challenge dispatch, winner identity, nomination and eviction presentation, spectator progression, final-four/finale recovery, social targeting/costs, minigame completion, and responsive layout. Some are brittle/outdated assertions, but several assert genuine state invariants and cannot safely be dismissed.
- The exact lint command timed out after 125 seconds. A diagnostic run excluding nested worktrees and generated results completed and found **3 errors and 1 warning**, including `Math.random()` in a React render path and an unstable hook dependency.
- TypeScript and both the web and Capacitor-targeted Vite builds pass. That demonstrates compilability, not functional correctness.
- Playwright did not exercise the app locally because the required Chromium/WebKit binaries are absent. The suite also has inconsistent base-URL defaults. CI installs the browsers, but the audit found no recent run evidence in the repository itself.
- Default V8 coverage reports **66.83% statements, 69.46% lines, 67.24% functions, and 56.15% branches**. There are no coverage thresholds or include-all policy. Critical orchestration is substantially weaker: `GameScreen.tsx` has 34.82% branch coverage, `store.ts` 8.33%, and save persistence 56.19%.
- CI is fragmented. The main workflow never runs Vitest or coverage. A workflow named “Castle Rescue Tests” actually runs the entire unit suite. No native Android/iOS build or test, formatting gate, dependency audit, secret scan, or save-compatibility gate exists.

### Current confidence

| Product concern                                   |  Confidence | Product interpretation                                                                                                                                                          |
| ------------------------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compilation and web/mobile asset bundling         | Medium-high | Both builds complete, but large chunk warnings remain and no native app compilation occurs.                                                                                     |
| Individual minigame rules                         |      Medium | Many detailed rule tests pass, but host contracts, seed stress, registry invariants, and several full components fail.                                                          |
| Core week progression and elimination correctness |         Low | Lower-level reducer tests are extensive, but current ceremony/nomination/eviction/final-four integration failures and low orchestration branch coverage prevent confidence.     |
| Save/resume/migration                             |         Low | A few focused serializer/corruption tests exist; no whole-store reload, migration matrix, quota failure, atomicity, or E2E resume test exists.                                  |
| Social relationships and AI                       |  Low-medium | Broad unit/integration coverage exists, but current autonomy, policy, maneuvers, group cost, and target selection tests fail; nondeterministic render behavior is lint-invalid. |
| Navigation/startup/onboarding                     |         Low | Some route and Home Hub components are tested, but one Home Hub test fails and there is no real E2E new-game/startup journey.                                                   |
| Currency, purchases, ads, and rewards             |         Low | Ads state/service and some reward mechanics are tested. There is no transaction-level purchase ledger/inventory E2E and no cross-reload double-spend protection.                |
| Finale/recap/archive                              |  Low-medium | Focused finale/archive tests exist, but finale recovery integration currently fails and E2E could not run.                                                                      |
| Android/iOS behavior                              |    Very low | Only generated sample JUnit tests exist; the Android instrumentation sample even expects the template package `com.getcapacitor.app`, not the configured app id. No native CI.  |
| Web browser behavior                              |  Low-medium | Component coverage is broad; production build passes; real Playwright execution was unavailable.                                                                                |
| Security and dependency health                    | Low/unknown | No configured dependency, secret, SAST, or supply-chain check. This audit did not make a network-dependent vulnerability claim.                                                 |

## Audit method and evidence standard

Coverage was not treated as proof of behavior. A product area is credited only where tests assert an externally meaningful result such as a phase transition, winner/evictee identity, persisted round-trip state, visible/operable control, deterministic replay, resource balance, or error recovery. Tests that only search CSS source strings, validate registry shape, mount mocked stubs, check asset existence, or assert exact copy are labeled structural or mixed evidence.

Test declaration counts were extracted from source and reconciled against Vitest's JSON result. Parameterized `test.each`/loops cause Vitest's executed count to exceed simple source declarations. The authoritative run result is the 4,459 executed/todo cases reported by Vitest.

## Test and quality tooling inventory

| Capability              | Tool/configuration                                                                                 | Audit finding                                                                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/integration runner | Vitest 4.1.2 via `vite.config.ts`; jsdom; globals; `src/test/setup.ts`; 15 s timeout               | Includes only `tests/**/*.test.{ts,tsx}` and `src/**/*.test.{ts,tsx}`. `tests/diaryWeek.spec.cjs` is not matched and is therefore dead automation.                                                              |
| Component testing       | React Testing Library 16.3.2, DOM Testing Library, `user-event`, jest-dom                          | Extensively used. Some large screen tests mock enough children/services that failures and passes can reflect wiring assumptions rather than a working screen.                                                   |
| End-to-end              | Playwright 1.58.2; desktop Chromium, Pixel 7 Chromium, iPhone 13 WebKit; retry 1; trace on retry   | Four spec files expand to 38 authored scenarios per project/114 cases. Mostly debug/minigame-lab paths; no core player journey. Local browser binaries absent.                                                  |
| Native tests            | Android JUnit sample unit and instrumentation tests                                                | Template-only, not product protection. No iOS XCTest target found.                                                                                                                                              |
| Lint                    | ESLint 9 flat config; TypeScript ESLint; React hooks/refresh                                       | `lint:ci` is strict, but config ignores only `dist`; nested `.worktrees` and generated artifacts create traversal cost. Diagnostic root run found 3 errors/1 warning.                                           |
| Formatting              | Prettier 3.8.1; `.prettierrc`, `.prettierignore`; `format` and `format:check` scripts              | Not enforced by CI. Not run as a release gate in this audit because it is absent from the requested safe-check list and can scan nested/generated trees.                                                        |
| Type checking           | TypeScript 5.9 project references; `tsc -b`; separate `tsconfig.test.json`                         | `npm run typecheck` passed. Vitest's configured `typecheck.tsconfig` does not itself enable a separate Vitest typecheck run.                                                                                    |
| Build                   | Vite 8; web and Capacitor modes; `tsc -b` before build                                             | Web and mobile-mode builds pass. No Gradle/Xcode build or Capacitor sync validation in CI.                                                                                                                      |
| Coverage                | `@vitest/coverage-v8`; CLI only                                                                    | No repository coverage block, include/exclude policy, thresholds, changed-file gate, or CI upload. Default run reports failures and should not be used as a green metric.                                       |
| CI                      | GitHub Actions: `ci.yml`, `lint.yml`, `e2e-playwright.yml`, `test-castle-rescue.yml`, `deploy.yml` | Fragmented/duplicated builds and lint; no single required release job. Main CI omits tests. E2E starts one server while Playwright also starts another.                                                         |
| Dependency/security     | npm lockfiles at root/server/Cloudflare worker                                                     | No Dependabot/Renovate config, `npm audit`, CodeQL/SAST, secret scanning workflow, SBOM, license gate, or lockfile integrity job found. GitHub-host security features cannot be inferred from repository files. |

## Results of safe checks

| Check                                                                       | Result                                                                                 | Classification                                               | Product meaning                                                                                                                                                |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint:ci`                                                           | **Timed out** at 125.1 s without diagnostics                                           | Infrastructure/configuration, then confirmed source failure  | The exact command is too broad for this workspace. It cannot be considered passing.                                                                            |
| Diagnostic ESLint excluding `.worktrees`, coverage and Playwright artifacts | **Failed:** 3 errors, 1 warning in 133.7 s                                             | Actual code-quality defects plus configuration cost          | `SocialPanelV2.tsx`: impure render-time random and hook dependency warning; `routes.tsx`: fast-refresh export violation; `SocialManeuvers.ts`: `prefer-const`. |
| `npm run typecheck`                                                         | **Passed** in 62.5 s                                                                   | Green static check                                           | Current TS project references compile.                                                                                                                         |
| `npm test -- --reporter=verbose`                                            | **Failed** in 174.6 s                                                                  | Mixed: product regression, outdated tests, and brittle tests | 4,337 pass; 121 fail; 1 todo. Release blocker until triaged.                                                                                                   |
| Coverage run                                                                | **Failed tests; report generated** in 319.4 s                                          | Coverage measurement valid as diagnostic, not gate           | 66.83 S / 56.15 B / 67.24 F / 69.46 L.                                                                                                                         |
| `npm run build`                                                             | **Passed** in 37.1 s                                                                   | Green build with warning                                     | 1,701 modules; several chunks exceed 500 kB, including ~1.09 MB game route and ~1.22 MB cinematic chunk before gzip.                                           |
| `npm run build:mobile`                                                      | **Passed** in 95.2 s                                                                   | Green web bundle for Capacitor with warning                  | Uses relative base correctly; not a native Android/iOS compilation or device test.                                                                             |
| `npm run test:e2e`                                                          | **Not runnable in environment**; 114 cases attempted/retried and browser launch failed | Environmental issue                                          | Missing Playwright browser executables. No gameplay assertion ran.                                                                                             |
| Aligned-base-URL E2E retry                                                  | Same browser-launch failure                                                            | Environmental issue                                          | Confirms browser installation is the immediate blocker.                                                                                                        |

### Important failure clusters

The 121 failures are not all equivalent. The main clusters are:

1. **Potential product/state regressions (Critical/High):** TV feed no longer caps at 50; challenge phase dispatch and winner identity paths fail; POS/LOH partial-completion advancement fails; nomination, ceremony, eviction, spectator, final-four/finale recovery, special-veto activation, and jury transitions fail; social alliance/cost/targeting outcomes fail; Glass Bridge AI concurrency fails; several minigame rule/invariant tests fail.
2. **Likely stale tests after intentional UI/product changes (Medium):** Diary Room greeting copy/entry timing, Home Hub splash/Play sequence, TV labels, HUD sizing, safe-area CSS expectations, and some Social Panel action-selection expectations. These must be reconciled with an explicit current product specification; changing the assertion blindly would hide regressions.
3. **Brittle or implementation-coupled failures (Low/Medium):** CSS source-string tests, mocked minigame-stub `toBeVisible` checks where the stub is removed from the document, exact label/copy checks, registry completeness assumptions, and full-screen tests with many mocked child components.
4. **Harness/environment failures:** Playwright browser packages missing locally; base URL defaults are inconsistent across specs/config; jsdom logs unimplemented `HTMLMediaElement.pause()` repeatedly.

## Product feature inventory from source

The game is a hash-routed React/Redux application with a large central state machine in `src/store/gameSlice.ts`, separate finale/challenge/profile/settings/ads/public-opinion/social slices, and a Capacitor Android/iOS shell. Important behaviors found in source include:

- **Initialization/onboarding:** intro assets and splash session, profile/guest selection, player creation, classic versus Survivor run creation, rules-seen flags, audio gate/unlock, remote config, diagnostics, and direct-route guards.
- **State/progression:** seeded season construction; week/phase state machine; LOH/POS competitions; human decision guards; debug/spectator paths; double/triple eviction, Democracia, public mode, secret missions, Battle Back, twin shock, final four/final three, jury, and terminal phases.
- **Player/contestant state:** active/LOH/nominated/jury/evicted/winner/runner-up states, stats, placement, achievements, avatars, profiles, public approval, challenge performance, and archive summaries.
- **Social:** affinity, trust, threat, relationships, memories, commitments, energy, incoming interactions, group actions, alliances/rivalries, betrayal/backfire, action costs, targeting policy, AI driver, public opinion, and eviction lockouts.
- **Nominations/voting/elimination:** nomination eligibility, automatic third nominees, replacement nominees, targeted safety use, public save, votes and tiebreaks, sole final-four vote, pending eviction cinematic, jury threshold, placement ordering, and cleanup/idempotency.
- **Competitions/minigames:** registry and scheduler plus many React/canvas games; human and AI simulations; authoritative versus raw results; sequential/parallel play; host completion/dismissal; retry/reward flows.
- **Scoring/ties/qualification:** score adapters, bracket/placement normalization, tiebreak time, cutoff ties, last-place rules, authoritative winners, final-two/final-three qualifiers, and no-NaN invariants.
- **Randomization:** central seeded RNG and per-voter/per-game derived seeds coexist with direct `Math.random`/`Date.now` use. Some tests inject random functions; 16 test files reference real time/random sources and deserve deterministic review.
- **Persistence:** profile metadata, settings, user profile, ads state, archives, classic/survivor save slots, legacy single-slot migration, corrupt-save quarantine/recovery event, guest non-persistence, and multi-slice hydration. Snapshot versions 1 and saved-run profile version 2 exist.
- **Economy/rewards:** Eyeoleans/influence/energy-like balances, minigame hint costs, ad rewards, no-ads ownership/daily caps, secret mission rewards, public favorite/achievement rewards, retries, and unlocks. No single audited transactional ledger abstraction was found.
- **Navigation/UI:** hash routes for home, game, diary room, houseguests, profile/edit/picker, leaderboard, credits, week, create-player, game-over/self-evicted, rules, public meter, settings/admin, and dev test pages; lazy routes and route error/loading screens.
- **Mobile/cross-platform:** safe-area CSS, viewport meta, responsive roster sizing, portrait guard, touch/device APIs, Capacitor relative asset base, transparent status bar, iOS `contentInset: never`, Android/iOS native shells, and web fallbacks.
- **Ending/recap:** jury voting and recovery, final faceoff, final-three choices, winner/runner-up finalization, public favorite, winner cinematic/interview/goodbyes/lights out, recap data/timeline/newspaper/eviction ladder, season archive and leaderboard.
- **Errors/invalid data:** route error boundary, save recovery notice/quarantine, persistence try/catch fallbacks, missing/stale nominee and tribunal guards, missing-winner fallbacks, invalid profile normalization, remote config fallback, and game diagnostics.

## Feature-to-test traceability matrix

Legend: **Y** meaningful current coverage; **P** partial/mixed/structural; **N** none identified; **F** relevant tests currently fail. Confidence considers assertion quality and current pass state, not raw coverage.

| Product behavior                       | Unit | Component | Integration |       E2E | Normal scenarios asserted                                                           | Edge scenarios asserted                                          | Important missing regressions                                                                                                                                                         | Failure severity | Confidence |
| -------------------------------------- | ---: | --------: | ----------: | --------: | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------: | ---------: |
| Startup, profile selection, onboarding |    P |         F |           P |         N | Home splash, profile picker, route guard, game-mode utilities                       | Guest/profile normalization; rules-seen                          | Fresh install through first playable phase; interrupted onboarding; direct deep link; remote-config failure; audio permission denial                                                  |         Critical |        Low |
| Game state/week progression            |    Y |         P |           F |         N | Many phase advances and mode flows                                                  | Double/triple eviction, Battle Back, third nominee, special veto | Full normal week from saved state; repeated-click/idempotency at every boundary; invariant check after every phase; malformed hydrated phase                                          |         Critical |        Low |
| Player/contestant lifecycle            |    Y |         P |           F |         N | Stats, status, winner identity, replacement transitions                             | Jury thresholds, returnees, spectator                            | Duplicate/missing IDs; user eliminated mid-modal; placement after re-eviction; roster size extremes                                                                                   |         Critical | Low-medium |
| Social relationships/interactions      |  Y/F |         F |           F |         N | Affinity, memories, actions, inbox and panels                                       | Cooldowns, invalidation, eviction lockout, backfire              | Cross-week decay/cleanup; save/reload social graph; all action cost/balance invariants; multi-party atomicity                                                                         |             High |        Low |
| Alliances/rivalries/social AI          |    Y |         P |           F |         N | Policy target preferences, influence, maneuvers                                     | Betrayal, reciprocal alliance, no eligible targets               | Deterministic replay from seed; alliance consistency after eviction/return; AI never targets invalid/self players across long seasons                                                 |             High | Low-medium |
| Nominations/replacements               |    Y |       P/F |           F |         P | Human/AI nomination flows, third nominee, animations                                | Public mode, double eviction, replacement eligibility            | Store-to-UI-to-store journey without mocks; reload while nomination pending; invalid persisted nominees                                                                               |         Critical |        Low |
| Voting/ties/eviction                   |    Y |       P/F |           F |         P | Vote simulation, public tie, eviction flows                                         | Multi-nominee wording, AI tiebreak, sole final-four vote         | Deterministic tally audit across all modes; reload during live vote/cinematic; exact one evictee and one placement commit                                                             |         Critical |        Low |
| Competitions/minigame host             |    Y |         F |         Y/F | N (unrun) | Registry, host dismissal/completion, many game rules                                | Partial runs, retries, spectator, active-game contract           | Every active game completes through real host on all three browsers; unmount/reload; background/resume                                                                                |             High | Medium-low |
| Scoring/ties/qualification             |  Y/F |         P |           F |         N | Score adapters, rankings, last place, authoritative winner                          | Cutoff ties, no NaN, final-two variants                          | Property tests for conservation/ordering; adversarial equal scores; invalid winner IDs; floating-point boundaries                                                                     |         Critical | Low-medium |
| Seeded determinism/randomness          |  Y/F |         P |           P |         N | Seed stress, RNG helpers, per-game seeds                                            | Several multi-seed loops                                         | Whole-week/season replay equality; ban uncontrolled random in reducers/render; timezone/clock independence                                                                            |             High | Low-medium |
| Save/load/migration/recovery           |    P |         P |           N |         N | Corrupt JSON quarantine, saved unlocks, archives/profiles                           | Some legacy version handling and guest behavior                  | Full multi-slice round trip; v1→v2 fixture matrix; unknown future version; quota/write failure; atomic save; crash during write; restore pending challenge/finale/social/public state |         Critical |        Low |
| Inventory/currency/purchases/rewards   |    P |         P |           P |         N | Ads persistence/limits, secret mission rewards, some hint costs                     | Duplicate/idempotency in selected games                          | Atomic debit+grant; insufficient funds; retry after reload; duplicate ad callback; purchase restoration; no negative/overflow balance; server receipt validation where applicable     |         Critical |        Low |
| Navigation/screen transitions          |    P |         Y |           F | N (unrun) | Nav components, route and selected screen rendering                                 | Spectator and eliminated-player routes                           | All production routes smoke; back/deep-link/reload; pending modal navigation; NotFound/error recovery; keyboard/focus route behavior                                                  |         Critical |        Low |
| Mobile layout/safe areas/orientation   |    F |         P |           F | N (unrun) | CSS contracts, viewport meta, responsive budget                                     | Pixel/iPhone-like dimensions, short viewports                    | Real browser visual assertions; dynamic safe-area/keyboard; rotation; notches; zoom/accessibility; native status bar integration                                                      |             High |        Low |
| Android/iOS/web specifics              |    N |         P |           N | N (unrun) | Capacitor-mode bundle only                                                          | Web fallbacks in scattered units                                 | Gradle/Xcode compile, package id, permissions, lifecycle pause/resume, back button, status bar, storage eviction, WebView asset/API behavior                                          |         Critical |   Very low |
| Finale/season end/recap                |    Y |         Y |           F | P (unrun) | Finale slice, archive, recap, sound, winner identity                                | Jury recovery, public favorite, final-four/final-three           | Non-debug full season finish; reload at every finale phase; ties; missing recap assets/data; archive written exactly once                                                             |         Critical | Low-medium |
| Error/invalid/missing data             |    P |         P |         P/F |         N | Save quarantine, remote fallback, route boundary, selected invalid-candidate guards | Missing winner/candidate cases                                   | Systematic state-schema validation; malformed-but-valid JSON; storage denial; asset/network failures; error-boundary navigation recovery                                              |         Critical |        Low |
| Audio/ads/live ops/services            |    Y |         P |           P |         N | Sound queue/registry/startup, ads service/middleware, rollouts/telemetry            | Disabled audio, limits, fallback config                          | Real autoplay lifecycle; native pause/resume; offline/timeout; duplicate callbacks; privacy/consent; telemetry payload contract                                                       |             High | Low-medium |

## Coverage assessment

### Aggregate default V8 result

| Metric     | Covered / total | Percent |
| ---------- | --------------: | ------: |
| Statements | 29,205 / 43,697 |  66.83% |
| Branches   | 19,029 / 33,884 |  56.15% |
| Functions  |   6,016 / 8,946 |  67.24% |
| Lines      | 26,269 / 37,817 |  69.46% |

No threshold is configured. The coverage run contains 121 failures. Therefore the percentages describe execution during a broken run, not accepted protection.

### High-business-value weak spots

| Module                                        | Statements | Branches | Functions | Lines | Why it matters                                                                                           |
| --------------------------------------------- | ---------: | -------: | --------: | ----: | -------------------------------------------------------------------------------------------------------- |
| `src/store/store.ts`                          |      29.68 |     8.33 |     25.00 | 30.64 | Cross-slice persistence subscriptions and save selection; a defect can lose/cross-contaminate progress.  |
| `src/screens/GameScreen/GameScreen.tsx`       |      44.64 |    34.82 |     35.38 | 46.94 | Primary orchestration of challenges, ceremonies, prompts, transitions and recovery.                      |
| `src/store/saveStatePersistence.ts`           |      65.04 |    56.19 |     68.18 | 69.09 | Save versions, legacy migration, corruption quarantine and profile slots.                                |
| `src/store/gameSlice.ts`                      |      76.13 |    64.58 |     82.50 | 80.93 | Central season state machine; decent line coverage still leaves thousands of branch outcomes unverified. |
| `src/screens/ProfilePicker/ProfilePicker.tsx` |          — |    31.48 |     28.88 | 32.94 | Profile selection and multi-slice hydrate path.                                                          |
| `src/store/finaleSlice.ts`                    |          — |    32.00 |     45.83 | 55.38 | Jury/finale state; current recovery integration fails.                                                   |
| `src/store/secretMissionMiddleware.ts`        |          — |    30.09 |     40.90 | 41.60 | Reward eligibility/consumption and progression side effects.                                             |
| `src/social/SocialManeuvers.ts`               |      71.79 |    62.35 |     58.82 | 77.88 | Multi-resource actions, alliances, betrayal; several current tests fail.                                 |

Examples at or near zero meaningful branch coverage include full components for Estimation, Rescue the King, Blackjack Tournament, Big Spender, Biography Blitz, Tetris, Hold the Wall, Traveling Dots, Memory Colors and Pressure Plank; Lane Racers rendering; and the Cordova native audio adapter. Some have well-tested pure logic or slices, but their real UI/lifecycle paths remain unprotected.

## Test-quality findings

### Strong patterns

- Many pure rule modules test normal outcomes, ties, invalid inputs, idempotency and deterministic seeds.
- Competition AI, scoring adapters, secret missions, public opinion, sound, profile normalization, and several social reducers have detailed tests.
- There are no snapshot-only tests; the static scan found zero `toMatchSnapshot`/inline snapshot assertions.
- No focused `.only` tests were found and no explicit `.skip` tests were found.
- The suite contains useful contract, invariant and seed-stress concepts even though some currently fail.

### Weak assertions and tests that can pass while behavior is wrong

- Numerous `toBeDefined()`/`toBeTruthy()` checks prove presence, not correctness, accessibility or operability.
- CSS/style tests read source text and assert literal declarations. They catch accidental string changes but can fail on harmless refactors and pass while the rendered layout is unusable.
- Registry/audit/asset-manifest tests prove metadata/files exist, not that a game can be played or completed.
- The generic minigame contract mocks/stubs many game components. A stub mount/finish can pass while the real game is broken; current visibility failures also show harness coupling.
- Large `GameScreen` integration files mock animation, sound, minigames and child panels. They are useful orchestration tests but not substitutes for browser journeys.
- Exact copy/label assertions in Diary Room and TV announcements are brittle unless the wording itself is a product requirement.

### Excessive mocking

The static scan found roughly **1,070 `vi.mock`/`vi.fn`/`vi.spyOn` declarations** across test files. Mocking is concentrated in full-screen orchestration, audio/canvas games and generic minigame contracts. The risk is false confidence at module boundaries: persistence, browser APIs, animations, native lifecycle and cross-slice effects are often replaced rather than exercised.

### Duplication/coupling

- Minigame behavior is often tested in a pure logic test, slice test, host test, integration test, rules audit, registry audit, contract test and seed-stress test. This can be valuable, but several layers repeat metadata/shape assertions while the actual component path remains weak.
- Social policy/maneuver tests exist under both `src/social/__tests__`, `tests/social`, and `tests/integration`; overlap should be consolidated around contracts and state outcomes.
- The file named `tests/diaryWeek.spec.cjs` contains 15 declarations but is excluded by Vitest's include glob, so it creates the appearance of coverage without running.
- The two HTML files under `tests/` are manual/mockup harnesses, not automated tests.

### Skipped, disabled and flaky-looking tests

- **Todo:** one `it.todo` in `tests/integration/social.maneuvers.test.ts` for the friendly-action affinity delta. The preceding implemented test now covers a similar path, so the todo is likely stale/duplicative and should be resolved explicitly.
- **Skipped/only:** none found in Vitest/Playwright sources.
- **Dead:** `tests/diaryWeek.spec.cjs` is outside the configured include pattern.
- **Native samples:** Android's two generated sample tests are not run by npm/CI and do not assert game behavior. The instrumentation expected package is stale.
- **Nondeterminism:** 16 tests directly reference `Math.random` or `Date.now`. Many intentionally mock them, but tests using real clock/random plus timers/event IDs should be made seed/clock-controlled. The production lint error for render-time `Math.random()` is a concrete instability risk.
- **Potential flake amplifiers:** extensive fake timers, animation delays, retries, 11 Playwright workers, real browser screenshot/overflow checks, and jsdom media gaps. Playwright's global retry of 1 can conceal one-off failures unless first-attempt flake rate is reported.

## Highest-risk untested or inadequately protected behavior

| Priority | Gap                                                                              | Product failure mode                                                                  |
| -------: | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Critical | Full save → reload → resume across all Redux slices and pending phases           | Lost/corrupted progress, resumed game in impossible state, wrong profile data.        |
| Critical | Versioned migration fixtures and atomic/quota-failure handling                   | Update destroys existing seasons or silently drops part of a save.                    |
| Critical | End-to-end normal new-game startup and first week                                | Player cannot start or gets stuck despite unit tests/build passing.                   |
| Critical | State-machine invariant/property test across every phase and mode                | Multiple winners/evictees, missing nominees, phase deadlock, stale pending decisions. |
| Critical | Transactional currency/purchase/reward tests                                     | Negative balance, double charge/grant, lost entitlement, ad callback duplication.     |
| Critical | Real browser nomination→competition→vote→eviction smoke                          | Incorrect result or unusable navigation at the core gameplay loop.                    |
| Critical | Reload during ceremony, live vote, eviction, final four, jury and finale         | Duplicate elimination/archive/reward or unrecoverable stuck screen.                   |
|     High | Every active minigame completes through the real host for human and AI/spectator | Major mechanic blocked or wrong winner applied.                                       |
|     High | Whole-season seeded replay/golden invariant                                      | Same seed diverges; nondeterministic AI/results prevent diagnosis and fairness.       |
|     High | Native Android/iOS lifecycle, safe area, orientation, back and storage           | Mobile build starts but is clipped, loses state, or cannot navigate.                  |
|     High | Social graph invariants through eviction, Battle Back and save/reload            | Invalid alliances/targets, resource leakage, repeated incoming interactions.          |
|   Medium | Error boundaries/offline/asset failure and recovery                              | Feature breaks but restart/navigation may recover.                                    |
|      Low | Exact visual/copy conformance beyond critical control visibility                 | Cosmetic drift without gameplay loss.                                                 |

## CI findings

1. `ci.yml` runs build, lint and typecheck, but **no tests or coverage**. Build already invokes TypeScript, so type checking is duplicated.
2. `lint.yml` duplicates lint with the stricter `lint:ci` script.
3. `test-castle-rescue.yml` runs `npm test` for the entire suite; the name is misleading and its branch filters differ from main CI.
4. `e2e-playwright.yml` correctly installs Chromium/WebKit, but starts Vite manually on port 3000 while Playwright configuration also owns a server on 4173. Specs have inconsistent defaults (`final4`/others reference 3000 paths while the minigame lab defaults to 4173). Use one server owner and one `baseURL`.
5. No coverage generation/threshold/upload, format check, dependency/security scan, native build/test, server tests, Cloudflare worker tests, migration fixture test, or artifact-size budget is required.
6. Deploy builds independently and can deploy after its own build without depending on a single green release-quality workflow.
7. The release script `test:release-full` is stronger than CI but is not itself the required CI gate; it repeats `test:minigames`, then the entire `test`, then the release audit.

## Recommended target test strategy

### Before the next release

1. **Triage and restore the current 121 failures.** For every failure, product/engineering must first decide the intended behavior; then fix code for invariant regressions or update only genuinely obsolete assertions. Do not blanket-update tests.
2. **Add state-machine invariant tests** that generate/iterate legal phases for Classic, public, Democracia, double/triple eviction, Battle Back, Survivor, final four and final three. Assert exactly one valid next state, no invalid IDs, no duplicate status roles, no negative resources, and terminal behavior.
3. **Add save compatibility tests** using committed v1/v2/malformed fixtures and a complete multi-slice round trip. Cover quota/write failure and exactly-once restoration of pending actions.
4. **Add a minimal E2E release smoke suite** described below and make it green on desktop Chromium, Pixel Chromium and iPhone WebKit.
5. **Add transaction tests** for every debit/grant/purchase/ad reward path with insufficient funds, duplicate callbacks, reload and idempotency.
6. **Run real active minigames through MinigameHost** at least once per result mode and maintain a smaller representative browser set per PR; run the full registry nightly.
7. **Add native build gates** (`assembleDebug`/unit tests for Android, simulator build/unit tests for iOS on macOS) and replace template native tests with app-id/startup/lifecycle smoke tests.

### Smallest valuable E2E smoke suite

Per PR, run these journeys on desktop Chromium plus one mobile Chromium; run iPhone WebKit nightly and before release:

1. Fresh storage → Home → create/select profile → start Classic season → game screen usable.
2. Play/resolve one LOH competition → nominate → POS → vote → exactly one eviction → next week.
3. Save mid-week → reload page/new context → resume with the same player statuses, balances, seed and pending phase → continue once without duplicate effects.
4. Inject a supported old save fixture → migrate/resume → save in current version; inject corrupt JSON → visible recovery without startup crash.
5. Debit/grant one representative currency/reward; reload; verify exact balance and no duplicate grant.
6. Fast-forward through a supported public/finale fixture → jury vote → winner → recap/archive exactly once.
7. Navigate every production route and return to game; verify no console/page errors, critical controls visible, no horizontal overflow, and portrait guard behavior.

Debug state injection may be used for long setup, but at least journeys 1–3 must enter through real player-facing controls.

### Tests to add soon

- Seeded whole-week and whole-season replay comparison.
- Social lifecycle/load tests and long-run AI target validity.
- Accessibility checks for focus order, modal trapping, labels, reduced motion, zoom and touch target size.
- Offline/remote-config/audio/ads failure recovery.
- Native background/foreground, hardware back, keyboard, safe-area and rotation tests.
- Visual regression for a small set of critical mobile screens, not every cosmetic variation.

### Lower-value tests that can wait

- More literal CSS source-string assertions.
- More registry/asset-exists tests once one authoritative audit exists.
- Exhaustive copy variations that do not change decisions.
- Snapshot coverage of large components.
- Per-minigame E2E on every browser for every PR; use representative PR smoke plus full nightly matrix.

### Recommended CI quality gates

1. One required `release-quality` workflow: clean install; format check; lint; typecheck; Vitest; coverage; web build; Capacitor build; minimal Playwright smoke.
2. Fail on any skipped/focused test unless allowlisted with an expiry; report todos separately.
3. No retries for unit/integration. Playwright may retry once, but any passed-on-retry test is reported as flaky and blocks release after a defined budget (recommended zero for the smoke suite).
4. Use one Playwright `webServer` and `use.baseURL`; remove per-spec hardcoded ports. Cache browser binaries in CI where appropriate.
5. Add Android build/unit gate and scheduled/emulator smoke; add iOS build/unit gate on macOS before release.
6. Add lockfile-based dependency review/audit, Dependabot or equivalent, secret scanning, CodeQL/SAST, and least-privilege workflow permissions. Establish vulnerability severity/exception policy rather than blindly failing on every advisory.
7. Gate deploy on the completed release-quality job, not only a fresh build.
8. Keep build artifact-size budgets for the oversized main/game/cinematic chunks.

### Coverage thresholds by risk area

Coverage is a backstop, not the definition of done. Recommended initial gates after stabilizing the suite:

| Risk area                                                    | Line | Branch | Additional behavioral gate                                                             |
| ------------------------------------------------------------ | ---: | -----: | -------------------------------------------------------------------------------------- |
| Persistence/migration/profile isolation/economy transactions |  90% |    85% | Required round-trip, old-version, corrupt, quota and idempotency scenarios.            |
| Core state machine, nomination/vote/eviction/finale/scoring  |  90% |    85% | Required invariant/property and E2E core-loop tests.                                   |
| Social AI/relationships/public opinion                       |  85% |    80% | Seeded deterministic and lifecycle invariant tests.                                    |
| Minigame pure rules/scoring/result adapters                  |  85% |    80% | Contract for every active registry entry; representative real-component browser smoke. |
| Critical navigation/orchestration screens                    |  80% |    75% | E2E route/start/resume smoke and accessibility assertions.                             |
| Presentational UI/cinematics                                 |  65% |    55% | Critical controls and reduced-motion paths; avoid chasing cosmetic branches.           |
| Native adapters                                              |  80% |    75% | Platform build/device lifecycle tests.                                                 |

Use changed-file coverage to prevent regression, and raise thresholds gradually. Do not set a single repository-wide 90% target that rewards trivial tests.

## Prioritized remediation backlog with acceptance criteria

| ID  | Priority | Improvement/fix plan                                             | Suggested level             | Acceptance criteria                                                                                                                                                                                 |
| --- | -------: | ---------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Critical | Classify and repair all 121 current failures by product contract | Unit/component/integration  | Every failure has a documented intended behavior; current suite passes twice from clean state; no blanket assertion weakening.                                                                      |
| R2  | Critical | Save/hydration/migration hardening                               | Unit + integration + E2E    | Full current snapshot round-trips all slices; v1/v2 fixtures migrate; unknown/corrupt/quota cases preserve recoverable data and show notice; resume produces no duplicate event/reward/elimination. |
| R3  | Critical | Core phase-machine invariants                                    | Unit/property + integration | Every supported phase/mode has a legal transition or explicit human block; IDs/statuses/nominee counts remain valid; repeated advance/complete is idempotent.                                       |
| R4  | Critical | Nomination→vote→eviction smoke                                   | Integration + E2E           | Real user controls complete one week on desktop/mobile; declared tally matches evictee; one placement/event is written; next week is usable.                                                        |
| R5  | Critical | Economy transaction integrity                                    | Unit + integration + E2E    | Debit and grant are atomic; insufficient balance cannot mutate state; duplicate callback/reload cannot double-charge/grant; persisted balance is exact.                                             |
| R6  |     High | Minigame host/result contract repair                             | Component + integration     | Every active entry renders real component, terminates, returns finite ranking/winner among participants, honors ties/partial/dismiss, and clears pending challenge exactly once.                    |
| R7  |     High | Seed determinism policy                                          | Unit/property               | Same seed+inputs yield identical state/results/logical event order; different seeds vary within invariants; reducers/render paths contain no uncontrolled random/time.                              |
| R8  |     High | Social consistency repair                                        | Unit + integration          | Action availability, aggregate costs, alliance reciprocity, betrayal, cooldown, eviction lockout and target validity pass; save/reload preserves graph without orphan IDs.                          |
| R9  |     High | Startup/navigation browser smoke                                 | E2E                         | Fresh install reaches playable game; all production routes load/return; direct `/game` safely redirects/guards; no uncaught console/page errors or unusable critical nav.                           |
| R10 |     High | Mobile/native confidence                                         | Native integration + E2E    | Correct package IDs; Android/iOS builds pass; portrait/safe-area/back/background/resume/storage scenarios pass on representative devices.                                                           |
| R11 |     High | Consolidate CI/release gate                                      | CI                          | One required workflow runs all release gates; deploy depends on it; local/CI Playwright use the same base URL/server; artifacts retained on failure.                                                |
| R12 |     High | Security baseline                                                | CI/security                 | Automated dependency review, secret scan and SAST run; high/critical vulnerability policy and exception expiry documented; lockfiles and workflow permissions validated.                            |
| R13 |   Medium | Replace brittle CSS/copy tests                                   | Component/visual            | Tests assert rendered visibility/operability/accessibility and layout bounds; copy is asserted only where semantic decision wording matters.                                                        |
| R14 |   Medium | Test-suite performance/flakiness                                 | Test infrastructure         | Vitest output is quiet by default; media APIs are stubbed centrally; first-attempt/retry rates tracked; PR suite meets agreed runtime without scanning `.worktrees`.                                |
| R15 |      Low | Remove dead/sample automation                                    | Maintenance                 | `diaryWeek.spec.cjs` is converted/included or deleted after coverage replacement; native sample tests become product tests; sole todo resolved.                                                     |

## How to fix the current failures from a product perspective

The safe implementation order is:

1. **Freeze intended product rules.** Write a short decision table for nomination counts, safety use, vote ties, final-four/final-three selection, social costs/alliances, minigame qualification and safe-area ownership. Many failures are impossible to classify correctly without this.
2. **Fix invariant regressions first.** Prioritize wrong winner/evictee, stuck phase, invalid target, duplicate reward, lost save and inability to start/navigate. Add a focused regression test before changing code.
3. **Repair orchestration contracts.** Align `GameScreen`, store thunks/reducers and child component callbacks so each transition applies once. Reduce mocks at the boundary by using a configured real store.
4. **Reconcile intended UI changes.** Only after gameplay rules are green, update stale copy/CSS/label tests to assert semantic behavior and rendered bounds.
5. **Stabilize infrastructure.** Exclude nested worktrees/generated artifacts from lint/format; unify Playwright server/baseURL; install browsers in documented bootstrap/CI; quiet jsdom media gaps.
6. **Add missing Critical tests and make CI authoritative.** A passing build is not enough. Block deploy until unit/integration, core E2E, coverage risk gates, security baseline and mobile builds pass.

Codex can implement this backlog in a follow-up change pass. The recommended first implementation batch is R1 triage plus R2/R3/R4, followed by R5/R6/R8 and then CI/native/security hardening. Each batch should be reviewed and committed independently so product-rule fixes are not mixed with wholesale test rewrites.

## Complete automated-test inventory

### Inventory interpretation

- **Runnable Vitest:** 371 files, 4,459 cases in the audited run.
- **Playwright:** 4 spec files; 38 dynamically authored cases multiplied across 3 projects = 114 cases. None executed an assertion locally because browser binaries were missing.
- **Android:** 2 generated JUnit sample files, 1 test each, not run by npm/CI.
- **Dead automation:** `tests/diaryWeek.spec.cjs` (15 declarations) is excluded by Vitest configuration.
- **Manual fixtures:** `tests/test_intro_hub.html` and `tests/test_intro_hub_mobile_mockup.html` are not automated tests.

The compact inventory below records every automated test path. Counts in parentheses are executed/source-declared cases where available. Level is inferred from exercised boundary. **Behavioral** means it asserts a product result; **mixed** combines behavior with mocks/implementation details; **structural** checks styles/assets/registry/shape; **sample/dead** provides no current product protection. Current failures are marked `FAIL`.

> To keep this audit readable, files are grouped by product area; the filename is the most specific product-area label. Exact failure names and run totals are recorded in the preceding sections.

### End-to-end and native

| Path                                                                                   | Level/count                  | Signal/status                                           |
| -------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------- |
| `e2e/playwright/final4-pov.spec.ts`                                                    | E2E, 3 authored × 3 projects | Behavioral; unrun (environment)                         |
| `e2e/playwright/finale.spec.ts`                                                        | E2E, 1 × 3                   | Behavioral; unrun (environment)                         |
| `e2e/playwright/gridOfLuck.spec.ts`                                                    | E2E, 2 × 3                   | Mixed visual/behavioral; unrun (environment)            |
| `e2e/playwright/minigameLab.smoke.spec.ts`                                             | E2E, 32 active games × 3     | Mixed mount/overflow/console smoke; unrun (environment) |
| `android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java`                | Unit, 1                      | Sample only; not run                                    |
| `android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` | Native integration, 1        | Stale sample; not run                                   |
| `tests/diaryWeek.spec.cjs`                                                             | Intended unit, 15            | **Dead: excluded by config**                            |

### Runnable Vitest file index

The following index is exhaustive for the 371 files included in the run. A path containing `integration` or `.flow.` is integration level; `.tsx` screen/component files are component level; other files are unit unless their name explicitly says integration. `styles`, `inventory`, `manifest`, `registry.audit`, `release-readiness.audit`, and broad `contract` files are structural/mixed; all other named rule/flow tests are behavioral or mixed.

- src/bb/**tests**/confessionalBigEye.test.ts — unit; 10 tests; behavioral
- src/bb/**tests**/engine.test.ts — unit; 60 tests; behavioral
- src/bb/**tests**/localBigEyeDirector.test.ts — unit; 4 tests; behavioral
- src/cinematic/timeline/timeline.test.ts — unit; 3 tests; behavioral
- src/components/AnimatedVoteResultsModal/**tests**/AnimatedVoteResultsModal.test.tsx — component; 6 tests; mixed
- src/components/AudioGate/**tests**/AudioGate.test.tsx — component; 2 tests; mixed
- src/components/DebugPanel/**tests**/DebugPanel.test.tsx — component; 5 tests; mixed
- src/components/DebugPanel/**tests**/MinigameDebugControls.test.tsx — component; 1 test; mixed
- src/components/DebugPanel/**tests**/SurvivorDebugControls.test.tsx — component; 3 tests; mixed
- src/components/FloatingActionBar/**tests**/ConfessionalSpotlightOverlay.test.tsx — component; 5 tests; mixed
- src/components/FloatingActionBar/**tests**/FloatingActionBar.test.tsx — component; 26 tests; mixed
- src/components/FullSizeCutoutImage/**tests**/FullSizeCutoutImage.test.tsx — component; 4 tests; mixed
- src/components/GameBottomNav/**tests**/GameBottomNav.test.tsx — component; 3 tests; mixed
- src/components/GameControlDock/**tests**/GameControlDock.test.tsx — component; 3 tests; mixed
- src/components/GameTopChip/**tests**/GameTopChip.test.tsx — component; 2 tests; mixed
- src/components/GlassBridgeComp/**tests**/GlassBridgeComp.test.tsx — component; 8 tests; mixed; **FAIL 1**
- src/components/HangmanChallengeComp/**tests**/HangmanChallengeComp.test.tsx — component; 6 tests; mixed
- src/components/HangmanChallengeComp/**tests**/hangmanChallengeEngine.test.ts — component; 5 tests; mixed
- src/components/HouseguestGrid/**tests**/AvatarTile.test.tsx — component; 2 tests; mixed
- src/components/HouseguestGrid/**tests**/HouseguestGrid.test.tsx — component; 3 tests; mixed
- src/components/HousematesBioCinematic/**tests**/housematesBioData.test.ts — component; 4 tests; mixed
- src/components/IncomingInteractionsInbox/**tests**/IncomingInteractionsInbox.test.tsx — component; 6 tests; mixed
- src/components/KolequantSplash/**tests**/KolequantSplash.test.tsx — component; 2 tests; mixed
- src/components/layout/**tests**/NavBar.test.tsx — component; 9 tests; mixed
- src/components/MinigameHost/**tests**/MinigameHost.test.tsx — component; 3 tests; mixed
- src/components/PlayerAvatar/**tests**/PlayerAvatar.test.tsx — component; 9 tests; mixed
- src/components/PlayerAvatar/**tests**/relationshipOutline.test.ts — component; 18 tests; mixed
- src/components/PublicSaveReveal/**tests**/PublicSaveReveal.test.tsx — component; 6 tests; mixed
- src/components/SeasonRecapCinematic/**tests**/FinaleNewspaperMontage.test.tsx — component; 1 test; mixed
- src/components/SeasonRecapCinematic/**tests**/RecapImage.test.tsx — component; 1 test; mixed
- src/components/SocialPanel/**tests**/SocialPanel.test.tsx — component; 10 tests; mixed
- src/components/SocialPanel/**tests**/socialPanelFeatureFlag.test.tsx — component; 4 tests; mixed
- src/components/SocialPanelV2/**tests**/ActionCard.test.tsx — component; 31 tests; mixed
- src/components/SocialPanelV2/**tests**/ActionGrid.test.tsx — component; 22 tests; mixed
- src/components/SocialPanelV2/**tests**/ExpandedPlayerView.test.tsx — component; 7 tests; mixed
- src/components/SocialPanelV2/**tests**/PlayerCard.test.tsx — component; 26 tests; mixed
- src/components/SocialPanelV2/**tests**/RecentActivity.test.tsx — component; 16 tests; mixed
- src/components/SocialPanelV2/**tests**/SocialPanelV2.test.tsx — component; 44 tests; mixed; **FAIL 3**
- src/components/SocialPanelV2/**tests**/SocialPanelV2.transferLogs.test.tsx — component; 12 tests; mixed
- src/components/SocialSummary/**tests**/SocialSummaryPopup.test.tsx — component; 12 tests; mixed
- src/components/TVLog/**tests**/TVLog.test.tsx — component; 16 tests; mixed
- src/components/TwinShockIntroCinematic/**tests**/TwinShockIntroCinematic.test.tsx — component; 2 tests; mixed
- src/components/TwinShockRevealOverlay/**tests**/TwinShockRevealOverlay.test.tsx — component; 3 tests; mixed
- src/components/ui/**tests**/TvZone.announcement.test.tsx — component; 71 tests; mixed; **FAIL 1**
- src/components/ui/**tests**/TvZone.saveChip.test.tsx — component; 1 test; mixed
- src/components/ui/**tests**/TvZone.screenStyle.test.tsx — component; 2 tests; mixed
- src/components/ui/DemocraciaResultsReveal/**tests**/DemocraciaResultsReveal.test.tsx — component; 3 tests; mixed
- src/components/ui/ShockIntroOverlay/**tests**/ShockIntroOverlay.test.tsx — component; 3 tests; mixed
- src/components/ui/SpectatorView/**tests**/SpectatorView.test.tsx — component; 17 tests; mixed
- src/features/twists/**tests**/dayStartShock.test.ts — unit; 2 tests; behavioral
- src/hooks/**tests**/useGameMode.test.tsx — component; 5 tests; behavioral
- src/modes/**tests**/gameModes.test.ts — unit; 2 tests; behavioral
- src/modes/survivorAchievements.test.ts — unit; 7 tests; behavioral
- src/screens/Credits/**tests**/Credits.test.tsx — component; 5 tests; mixed
- src/screens/Credits/**tests**/creditsSceneLayout.test.ts — component; 4 tests; mixed
- src/screens/DiaryRoom/**tests**/confessionalDecisionPresentation.test.ts — component; 2 tests; mixed
- src/screens/DiaryRoom/**tests**/DiaryRoom.test.tsx — component; 25 tests; mixed; **FAIL 2**
- src/screens/GameScreen/**tests**/battleBackFlow.test.ts — component; 5 tests; mixed
- src/screens/GameScreen/**tests**/dislikedBoostPrompt.test.ts — component; 3 tests; mixed
- src/screens/GameScreen/**tests**/gameScreenUiGuards.test.ts — component; 4 tests; mixed
- src/screens/HomeHub/**tests**/HomeHub.test.tsx — component; 11 tests; mixed; **FAIL 1**
- src/screens/ProfilePicker/ProfilePicker.test.tsx — component; 2 tests; mixed
- src/screens/PublicMeter/**tests**/PublicMeter.test.tsx — component; 2 tests; mixed
- src/services/**tests**/bigBrotherFallback.test.ts — unit; 23 tests; behavioral
- src/services/**tests**/bigBrotherLocalDirector.test.ts — unit; 3 tests; behavioral
- src/services/**tests**/bigEyeVip.test.ts — unit; 4 tests; behavioral
- src/services/ads/**tests**/adsService.test.ts — unit; 9 tests; behavioral
- src/services/diagnostics/gameDiagnostics.test.ts — unit; 1 test; behavioral
- src/social/**tests**/incomingInteractionAutonomy.test.ts — unit; 13 tests; behavioral
- src/social/**tests**/incomingInteractionInvalidation.test.ts — unit; 4 tests; behavioral
- src/social/**tests**/incomingInteractionPresentation.test.ts — unit; 6 tests; behavioral
- src/social/**tests**/incomingInteractions.test.ts — unit; 9 tests; behavioral
- src/social/**tests**/interactionVariantBank.test.ts — unit; 72 tests; behavioral
- src/social/**tests**/socialModuleAvailability.test.ts — unit; 4 tests; behavioral
- src/store/**tests**/adsMiddleware.test.ts — unit; 10 tests; behavioral
- src/store/**tests**/adsSlice.test.ts — unit; 2 tests; behavioral
- src/store/saveStatePersistence.test.ts — unit; 3 tests; behavioral
- src/utils/**tests**/debugMode.test.ts — unit; 6 tests; behavioral
- src/utils/gameStatusLanguage.test.ts — unit; 2 tests; behavioral
- tests/achievementSummary.test.ts — unit; 2 tests; behavioral
- tests/activityService.test.ts — unit; 20 tests; behavioral
- tests/battleBack.flow.test.ts — integration; 39 tests; behavioral
- tests/bullseyeBlitz.competition.test.ts — unit; 37 tests; behavioral
- tests/bullseyeBlitz.reactComponents.test.ts — unit; 1 test; mixed
- tests/bullseyeBlitz.tournament.test.tsx — component; 6 tests; behavioral
- tests/cardClash.competition.test.ts — unit; 35 tests; behavioral
- tests/codeBreaker.competition.test.ts — unit; 53 tests; behavioral
- tests/colorMatch.component.test.tsx — component; 6 tests; mixed
- tests/colorMatch.react.test.ts — unit; 27 tests; behavioral
- tests/comp_selection.test.tsx — component; 5 tests; behavioral
- tests/competition.test.ts — unit; 13 tests; behavioral
- tests/crystalPathShattered.asyncFlow.test.tsx — component; 5 tests; behavioral; **FAIL 1**
- tests/crystalPathShattered.logic.test.ts — unit; 19 tests; behavioral
- tests/crystalPathShattered.styles.test.ts — unit; 4 tests; structural
- tests/cwgo.helpers.test.ts — unit; 27 tests; behavioral
- tests/cwgo.slice.test.ts — unit; 10 tests; behavioral
- tests/democracia.flow.test.ts — integration; 50 tests; behavioral
- tests/displayMode.test.ts — unit; 12 tests; behavioral
- tests/doubleEviction.flow.test.ts — integration; 43 tests; behavioral
- tests/endgame.flow.test.ts — integration; 30 tests; behavioral
- tests/estimationGame.competition.test.ts — unit; 47 tests; behavioral
- tests/favoritePlayer.flow.test.ts — integration; 23 tests; behavioral
- tests/finaleControls.test.tsx — component; 2 tests; behavioral
- tests/finalFaceoff.publicVote.test.tsx — component; 4 tests; behavioral
- tests/gameOver.screen.test.tsx — component; 5 tests; mixed
- tests/gameRoute.test.tsx — component; 2 tests; behavioral
- tests/gameSlice.stats.test.ts — unit; 12 tests; behavioral
- tests/hoh.eligibility.test.ts — unit; 8 tests; behavioral
- tests/hohCompLastPlace.test.ts — unit; 8 tests; behavioral
- tests/houseguestAssets.inventory.test.ts — unit; 2 tests; structural
- tests/houseguests.screen.test.tsx — component; 11 tests; mixed
- tests/integration/ceremony.fixes.test.tsx — integration; 14 tests; behavioral; **FAIL 14**
- tests/integration/challenge.flow.dispatch.test.tsx — integration; 23 tests; behavioral; **FAIL 5**
- tests/integration/confessionalDecision.test.tsx — integration; 44 tests; behavioral; **FAIL 3**
- tests/integration/eviction.cinematic.test.tsx — integration; 15 tests; behavioral; **FAIL 5**
- tests/integration/finale.recovery.test.tsx — integration; 1 test; behavioral; **FAIL 1**
- tests/integration/gameScreen.avatarHoldPreview.test.tsx — integration; 1 test; mixed; **FAIL 1**
- tests/integration/gameScreen.battleBackAnnouncements.test.tsx — integration; 1 test; mixed; **FAIL 1**
- tests/integration/gameScreen.compactRosterLayout.test.tsx — integration; 2 tests; mixed
- tests/integration/gameScreen.competitionRetryPromptRemoval.test.tsx — integration; 1 test; mixed; **FAIL 1**
- tests/integration/gameScreen.dislikedBoostPrompt.test.tsx — integration; 2 tests; mixed; **FAIL 2**
- tests/integration/gameScreen.publicMeterDisabled.test.tsx — integration; 3 tests; mixed; **FAIL 3**
- tests/integration/incomingAutonomy.integration.test.ts — integration; 11 tests; behavioral; **FAIL 1**
- tests/integration/jury.transition.test.tsx — integration; 5 tests; behavioral; **FAIL 5**
- tests/integration/minigame.biographyBlitz.integration.test.ts — integration; 14 tests; behavioral
- tests/integration/minigame.blackjackTournament.integration.test.ts — integration; 22 tests; behavioral
- tests/integration/minigame.chainOfGreed.integration.test.ts — integration; 2 tests; behavioral
- tests/integration/minigame.crystalPathShattered.integration.test.ts — integration; 2 tests; behavioral
- tests/integration/minigame.cwgo.integration.test.ts — integration; 16 tests; behavioral
- tests/integration/minigame.gridOfLuck.integration.test.ts — integration; 2 tests; behavioral
- tests/integration/minigame.laneRacers.integration.test.ts — integration; 2 tests; behavioral
- tests/integration/minigame.majorityRules.integration.test.ts — integration; 9 tests; behavioral
- tests/integration/minigame.silentSaboteur.final2.test.tsx — integration; 9 tests; behavioral
- tests/integration/minigame.silentSaboteur.integration.test.ts — integration; 23 tests; behavioral
- tests/integration/minigame.tetris.integration.test.ts — integration; 27 tests; behavioral
- tests/integration/minigame.tiltLabyrinth.integration.test.ts — integration; 33 tests; behavioral
- tests/integration/nomination.animation.test.tsx — integration; 14 tests; behavioral; **FAIL 14**
- tests/integration/pov.autoskip.test.tsx — integration; 8 tests; behavioral; **FAIL 8**
- tests/integration/social.ai.test.ts — integration; 11 tests; behavioral
- tests/integration/social.engine.test.ts — integration; 9 tests; behavioral
- tests/integration/social.eventdeltas.test.ts — integration; 6 tests; behavioral
- tests/integration/social.influence.test.ts — integration; 15 tests; behavioral
- tests/integration/social.lifecycle.test.ts — integration; 7 tests; behavioral
- tests/integration/social.maneuvers.test.ts — integration; 89 tests; behavioral; **FAIL 6; TODO 1**
- tests/integration/social.memory.test.ts — integration; 4 tests; behavioral
- tests/integration/social.policy.test.ts — integration; 18 tests; behavioral; **FAIL 3**
- tests/integration/specialVeto.activation.test.tsx — integration; 1 test; behavioral; **FAIL 1**
- tests/integration/spectator.advance.test.tsx — integration; 4 tests; behavioral; **FAIL 4**
- tests/integration/spotlight.animation.test.tsx — integration; 16 tests; behavioral
- tests/integration/winner.identity.test.tsx — integration; 6 tests; behavioral; **FAIL 4**
- tests/interactive.flow.test.ts — integration; 30 tests; behavioral
- tests/introHub.sideUtilities.test.ts — unit; 11 tests; behavioral
- tests/leaderboard.screen.test.tsx — component; 6 tests; mixed
- tests/liveVoteOverlayBlur.test.ts — unit; 7 tests; mixed
- tests/logsReducer.test.ts — unit; 9 tests; behavioral; **FAIL 2**
- tests/memoryColors.competition.test.ts — unit; 35 tests; behavioral
- tests/memoryColors.registry.test.ts — unit; 7 tests; behavioral
- tests/minesweeps.explosion.test.tsx — component; 1 test; behavioral
- tests/minesweeps.react.test.ts — unit; 7 tests; behavioral
- tests/minesweeps.results.test.tsx — component; 2 tests; behavioral
- tests/minigameHost.codeBreaker.test.tsx — component; 1 test; mixed
- tests/minigameHost.cwgo.test.tsx — component; 2 tests; mixed
- tests/minigameHost.estimationGame.test.tsx — component; 4 tests; mixed
- tests/minigameHost.gridOfLuck.test.tsx — component; 1 test; mixed
- tests/minigameHost.hangman.test.tsx — component; 2 tests; mixed
- tests/minigameHost.holdWall.test.tsx — component; 2 tests; mixed
- tests/minigameHost.minesweeps.test.tsx — component; 2 tests; mixed
- tests/minigameHost.numberTrivia.test.tsx — component; 2 tests; mixed
- tests/minigameHost.snake.test.tsx — component; 2 tests; mixed
- tests/minigameHost.tiltedLedge.test.tsx — component; 6 tests; mixed
- tests/minigames.aiAudit.batch2.test.ts — unit; 3 tests; behavioral
- tests/minigames.aiAudit.batch3.test.ts — unit; 19 tests; behavioral
- tests/minigames.aiAudit.batch4.test.ts — unit; 11 tests; behavioral
- tests/minigames.aiAudit.batch5.test.ts — unit; 11 tests; behavioral
- tests/minigames.aiAudit.batch6.test.ts — unit; 10 tests; behavioral
- tests/minigames.aiElimination.batch1.test.ts — unit; 5 tests; behavioral
- tests/minigames.blackjackTournament.rules.test.ts — unit; 4 tests; behavioral
- tests/minigames.castleRescue.rules.test.ts — unit; 4 tests; behavioral; **FAIL 1**
- tests/minigames.chainOfGreed.rules.test.ts — unit; 4 tests; behavioral; **FAIL 1**
- tests/minigames.colorMatch.rules.test.ts — unit; 3 tests; behavioral
- tests/minigames.contract.test.tsx — component; 32 tests; mixed; **FAIL 4**
- tests/minigames.gridOfLuck.rules.test.ts — unit; 4 tests; behavioral
- tests/minigames.invariants.test.ts — unit; 5 tests; behavioral; **FAIL 1**
- tests/minigames.majorityRules.rules.test.ts — unit; 4 tests; behavioral
- tests/minigames.minesweeps.rules.test.ts — unit; 4 tests; behavioral
- tests/minigames.registry.audit.test.ts — unit; 4 tests; structural; **FAIL 1**
- tests/minigames.riskWheel.rules.test.ts — unit; 4 tests; behavioral
- tests/minigames.seedStress.test.tsx — component; 32 tests; behavioral; **FAIL 6**
- tests/minigames.silentSaboteur.rules.test.ts — unit; 3 tests; behavioral
- tests/minigames.tetris.rules.test.ts — unit; 3 tests; behavioral
- tests/minigames.trapAuction.rules.test.ts — unit; 4 tests; behavioral
- tests/pressurePlank.competition.test.ts — unit; 23 tests; behavioral
- tests/quickTapRace.competition.test.ts — unit; 28 tests; behavioral
- tests/quickTapRace.component.test.tsx — component; 4 tests; mixed
- tests/release-readiness.audit.test.ts — unit; 6 tests; structural
- tests/scoreboard.compute.test.ts — unit; 24 tests; behavioral
- tests/seasonArchive.test.ts — unit; 12 tests; behavioral
- tests/seasonFinale.flow.test.ts — integration; 4 tests; behavioral
- tests/seasonFinaleOverlay.sound.test.tsx — component; 1 test; mixed
- tests/seasonRecapCinematic.test.tsx — component; 17 tests; behavioral
- tests/settings.compactRoster.test.tsx — component; 3 tests; behavioral
- tests/settings.screen.test.tsx — component; 8 tests; mixed
- tests/snake.competition.test.ts — unit; 20 tests; behavioral
- tests/snakeAiSimulator.test.ts — unit; 27 tests; behavioral
- tests/snakeGame.results.test.tsx — component; 7 tests; behavioral
- tests/social/evictionSocialLockout.test.ts — unit; 13 tests; behavioral
- tests/social/incomingAutonomy.unit.test.ts — unit; 29 tests; behavioral; **FAIL 3**
- tests/social/incomingInteractionScheduler.unit.test.ts — unit; 3 tests; behavioral
- tests/social/socialCommitments.unit.test.ts — unit; 3 tests; behavioral
- tests/social/socialFixes.test.ts — unit; 12 tests; behavioral
- tests/social/socialMemory.reducer.test.ts — unit; 2 tests; behavioral
- tests/social/SocialPolicy.test.ts — unit; 27 tests; behavioral
- tests/specialVeto.flow.test.ts — integration; 48 tests; behavioral
- tests/spotlight.flow.test.ts — integration; 7 tests; behavioral
- tests/spotlight.viewport.test.tsx — component; 8 tests; mixed
- tests/survivorReplacementTransition.test.ts — unit; 1 test; behavioral
- tests/survivorStandout.test.ts — unit; 6 tests; behavioral
- tests/thirdNominee.flow.test.ts — integration; 48 tests; behavioral
- tests/travelingDots.competition.test.ts — unit; 21 tests; behavioral
- tests/tribunalMemberStage.speechBubble.test.tsx — component; 1 test; behavioral
- tests/tribunalPhaseAnnouncement.test.ts — unit; 2 tests; behavioral
- tests/unit/avatarAssetManifest.test.ts — unit; 3 tests; structural
- tests/unit/avatarCandidates.test.ts — unit; 4 tests; behavioral
- tests/unit/battery-low/batteryLow.logic.test.ts — unit; 11 tests; behavioral
- tests/unit/big-spender/bigSpenderLogic.test.ts — unit; 29 tests; behavioral
- tests/unit/biography-blitz/biographyBlitz.edgeCases.test.ts — unit; 29 tests; behavioral
- tests/unit/biography-blitz/biographyBlitzSlice.test.ts — unit; 55 tests; behavioral
- tests/unit/biography-blitz/bioQuestionGenerator.test.ts — unit; 11 tests; behavioral
- tests/unit/blackjackTournament/BlackjackTournamentComp.styles.test.ts — unit; 3 tests; structural
- tests/unit/blackjackTournament/blackjackTournamentSlice.test.ts — unit; 87 tests; behavioral
- tests/unit/bullseye-blitz/BullseyeBlitz.styles.test.ts — unit; 1 test; structural; **FAIL 1**
- tests/unit/capitalization/capitalization.component.test.tsx — component; 2 tests; mixed
- tests/unit/capitalization/capitalization.logic.test.ts — unit; 12 tests; behavioral
- tests/unit/castle-rescue/collision.test.ts — unit; 31 tests; behavioral
- tests/unit/castle-rescue/continue-button.test.tsx — component; 9 tests; behavioral
- tests/unit/castle-rescue/finalize-score.test.ts — unit; 10 tests; behavioral
- tests/unit/castle-rescue/generator.test.ts — unit; 14 tests; behavioral
- tests/unit/castle-rescue/pipe.test.ts — unit; 13 tests; behavioral
- tests/unit/castle-rescue/progression.test.ts — unit; 28 tests; behavioral
- tests/unit/castle-rescue/ranking.test.ts — unit; 9 tests; behavioral
- tests/unit/castle-rescue/resolveFullSolidCollision.test.ts — unit; 9 tests; behavioral
- tests/unit/castle-rescue/scoring.test.ts — unit; 13 tests; behavioral
- tests/unit/castle-rescue/session.test.ts — unit; 6 tests; behavioral
- tests/unit/castle-rescue/subroom.test.ts — unit; 24 tests; behavioral
- tests/unit/castle-rescue/timeout.test.ts — unit; 9 tests; behavioral
- tests/unit/chain-of-greed/ChainOfGreed.component.test.tsx — component; 7 tests; mixed
- tests/unit/chain-of-greed/chainOfGreed.logic.test.ts — unit; 8 tests; behavioral
- tests/unit/chatOverlay.test.tsx — component; 11 tests; mixed
- tests/unit/codeBreaker/CodeBreakerComp.test.tsx — component; 6 tests; behavioral
- tests/unit/codeBreaker/vaultCrackerCanvasEngine.test.ts — unit; 4 tests; behavioral
- tests/unit/colorMatch/minigameHostColorMatchSeed.test.tsx — component; 3 tests; mixed
- tests/unit/competition-ai/bracketTemplate.test.ts — unit; 22 tests; behavioral
- tests/unit/competition-ai/castleRescueAi.test.ts — unit; 3 tests; behavioral
- tests/unit/competition-ai/competition-ai.foundation.test.ts — unit; 6 tests; behavioral; **FAIL 1**
- tests/unit/competition-ai/competitionScheduler.test.ts — unit; 4 tests; behavioral
- tests/unit/competition-ai/competitionSeasonModifiers.test.ts — unit; 2 tests; behavioral
- tests/unit/competition-ai/competitionTelemetry.test.ts — unit; 1 test; behavioral
- tests/unit/competition-ai/houseguestProfiles.test.ts — unit; 3 tests; behavioral
- tests/unit/competition-ai/hybridScoreResolver.test.ts — unit; 27 tests; behavioral
- tests/unit/competition-ai/quickTapSimulation.test.ts — unit; 25 tests; behavioral
- tests/unit/competition-ai/simulateAiPerformance.test.ts — unit; 13 tests; behavioral
- tests/unit/competition-ai/simulateMinigameAiScore.test.ts — unit; 13 tests; behavioral
- tests/unit/cwgo.outcome.test.ts — unit; 5 tests; behavioral
- tests/unit/cwgo.questionOrder.test.ts — unit; 5 tests; behavioral
- tests/unit/cwgo.scaledInput.test.ts — unit; 12 tests; behavioral
- tests/unit/cwgo.spectator.test.tsx — component; 1 test; behavioral
- tests/unit/famous-figures/data.test.ts — unit; 6 tests; behavioral
- tests/unit/famous-figures/FamousFiguresComp.test.tsx — component; 3 tests; behavioral
- tests/unit/famous-figures/famousFiguresSlice.test.ts — unit; 40 tests; behavioral
- tests/unit/famous-figures/fuzzy.test.ts — unit; 22 tests; behavioral
- tests/unit/famous-figures/hints.test.ts — unit; 6 tests; behavioral
- tests/unit/famous-figures/match-flow.integration.test.ts — integration; 4 tests; behavioral
- tests/unit/famous-figures/scoring.test.ts — unit; 10 tests; behavioral
- tests/unit/favoriteAudienceSurgeRequest.test.ts — unit; 3 tests; behavioral
- tests/unit/finale/finaleSlice.test.ts — unit; 2 tests; behavioral
- tests/unit/finale/FinalLightsOutSequence.test.tsx — component; 2 tests; behavioral
- tests/unit/gameScreen/animationHardening.contract.test.ts — unit; 2 tests; mixed
- tests/unit/gameScreen/ceremonyTileMeasurement.test.ts — unit; 4 tests; mixed
- tests/unit/gameSlice.relationshipDecisions.test.ts — unit; 4 tests; behavioral
- tests/unit/glass-bridge/glassBridge.logic.test.ts — unit; 50 tests; behavioral
- tests/unit/glass-bridge/glassBridge.parallel.test.ts — unit; 5 tests; behavioral
- tests/unit/glass-bridge/minigameHostGlassBridgeSeed.test.tsx — component; 4 tests; mixed
- tests/unit/glass-bridge/useGlassBridgeAudio.test.ts — unit; 4 tests; behavioral
- tests/unit/gridOfLuck.component.test.tsx — component; 3 tests; mixed; **FAIL 1**
- tests/unit/gridOfLuck.logic.test.ts — unit; 8 tests; behavioral
- tests/unit/gridOfLuck.styles.test.ts — unit; 2 tests; structural
- tests/unit/gridOfLuckAnimations.test.ts — unit; 1 test; behavioral
- tests/unit/hold-the-wall/GameController.effectsScheduler.test.ts — unit; 11 tests; behavioral
- tests/unit/hold-the-wall/GameController.holdTimeout.test.ts — unit; 12 tests; behavioral
- tests/unit/hold-the-wall/holdTheWallSlice.test.ts — unit; 21 tests; behavioral
- tests/unit/house-of-cards/HouseOfCardsComp.peek.test.tsx — component; 4 tests; behavioral
- tests/unit/house-of-cards/HouseOfCardsComp.styles.test.ts — unit; 2 tests; structural
- tests/unit/house-of-cards/minigameHostHouseOfCardsSeed.test.tsx — component; 3 tests; mixed
- tests/unit/house-of-cards/useHouseOfCardsAudio.test.ts — unit; 2 tests; behavioral
- tests/unit/hud/HudSizing.styles.test.ts — unit; 2 tests; structural; **FAIL 2**
- tests/unit/laneRacers/laneRacersCanvasEngine.test.ts — unit; 6 tests; behavioral
- tests/unit/laneRacers/layout.test.ts — unit; 1 test; behavioral
- tests/unit/laneRacers/renderUi.test.ts — unit; 1 test; behavioral
- tests/unit/layout/responsiveGameLayout.test.ts — unit; 13 tests; behavioral; **FAIL 5**
- tests/unit/layout/safeArea.styles.test.ts — unit; 6 tests; structural; **FAIL 1**
- tests/unit/layout/viewportMeta.test.ts — unit; 2 tests; mixed
- tests/unit/liveOpsRollouts.test.ts — unit; 3 tests; behavioral
- tests/unit/majorityRules/majorityRules.component.test.tsx — component; 7 tests; mixed
- tests/unit/majorityRules/majorityRules.logic.test.ts — unit; 7 tests; behavioral
- tests/unit/majorityRules/majorityRules.styles.test.ts — unit; 3 tests; structural
- tests/unit/majorityRules/minigameHostMajorityRulesSeed.test.tsx — component; 3 tests; mixed
- tests/unit/memoryColors/MemoryColorsComp.styles.test.ts — unit; 2 tests; structural
- tests/unit/minigameHost.dismissal.test.tsx — component; 12 tests; mixed
- tests/unit/minigameHostCloseButton.styles.test.ts — unit; 1 test; structural
- tests/unit/minigameHostTimeline.styles.test.ts — unit; 1 test; structural
- tests/unit/minigameRegistry.retirement.test.ts — unit; 3 tests; behavioral
- tests/unit/minigameResponsiveSafety.styles.test.ts — unit; 4 tests; structural
- tests/unit/number-trivia/numberTrivia.test.tsx — component; 12 tests; behavioral
- tests/unit/productTelemetry.test.ts — unit; 2 tests; behavioral
- tests/unit/profilesSlice.test.ts — unit; 28 tests; behavioral
- tests/unit/publicFavoriteOverlay.styles.test.ts — unit; 1 test; structural
- tests/unit/publicFavoriteOverlay.test.tsx — component; 11 tests; mixed
- tests/unit/publicOpinion/eventDrivenReactions.test.ts — unit; 43 tests; behavioral
- tests/unit/publicOpinion/missionActionMapper.test.ts — unit; 20 tests; behavioral
- tests/unit/publicOpinion/publicEvictionTie.test.ts — unit; 2 tests; behavioral
- tests/unit/publicOpinion/publicFinalVote.test.ts — unit; 9 tests; behavioral
- tests/unit/publicOpinion/publicHeadlineService.test.ts — unit; 13 tests; behavioral
- tests/unit/publicOpinion/publicOpinionMiddleware.test.ts — unit; 7 tests; behavioral
- tests/unit/publicOpinion/publicOpinionService.test.ts — unit; 8 tests; behavioral
- tests/unit/publicOpinion/publicOpinionSlice.test.ts — unit; 12 tests; behavioral
- tests/unit/quickTapRace/quickTapRaceCanvasEngine.test.ts — unit; 12 tests; behavioral
- tests/unit/quickTapRace/useQuickTapRaceAudio.test.ts — unit; 2 tests; behavioral
- tests/unit/remoteConfig.test.ts — unit; 31 tests; behavioral
- tests/unit/rescue-the-king/logic.test.ts — unit; 37 tests; behavioral
- tests/unit/riskWheel/idempotency.test.ts — unit; 4 tests; behavioral
- tests/unit/riskWheel/minigameHostRiskWheelSeed.test.tsx — component; 3 tests; mixed
- tests/unit/riskWheel/RiskWheelComp.completion.test.tsx — component; 4 tests; behavioral
- tests/unit/riskWheel/RiskWheelComp.styles.test.ts — unit; 2 tests; structural
- tests/unit/riskWheel/RiskWheelComp.test.tsx — component; 3 tests; behavioral
- tests/unit/riskWheel/riskWheelSlice.test.ts — unit; 84 tests; behavioral
- tests/unit/riskWheel/rng.test.ts — unit; 11 tests; behavioral
- tests/unit/riskWheel/useRiskWheelAudio.test.ts — unit; 5 tests; behavioral
- tests/unit/seasonFinale/finaleGoodbyes.test.ts — unit; 6 tests; behavioral
- tests/unit/seasonNumbering.test.ts — unit; 9 tests; behavioral
- tests/unit/secretMission/secretMission.activation.test.ts — unit; 69 tests; behavioral
- tests/unit/secretMission/secretMission.logic.test.ts — unit; 29 tests; behavioral
- tests/unit/secretMission/secretMission.pr4.test.ts — unit; 9 tests; behavioral
- tests/unit/secretMission/secretMission.reward.test.ts — unit; 42 tests; behavioral
- tests/unit/settings.restart.test.ts — unit; 29 tests; behavioral
- tests/unit/silent-saboteur/helpers.test.ts — unit; 33 tests; behavioral
- tests/unit/silent-saboteur/SilentSaboteurComp.test.tsx — component; 3 tests; behavioral
- tests/unit/silent-saboteur/slice.test.ts — unit; 24 tests; behavioral
- tests/unit/social.normalize.test.ts — unit; 31 tests; behavioral
- tests/unit/sound/cinematicAudio.test.ts — unit; 2 tests; behavioral
- tests/unit/sound/queue.test.ts — unit; 33 tests; behavioral
- tests/unit/sound/registry.test.ts — unit; 24 tests; behavioral
- tests/unit/sound/resolveDesiredMusic.test.ts — unit; 12 tests; behavioral
- tests/unit/sound/soundMiddleware.test.ts — unit; 9 tests; behavioral
- tests/unit/sound/startup.test.ts — unit; 13 tests; behavioral
- tests/unit/tiltedLedge.test.tsx — component; 5 tests; behavioral
- tests/unit/tiltLabyrinth/TiltLabyrinthComp.test.tsx — component; 8 tests; behavioral
- tests/unit/timingBar/timingBar.component.test.tsx — component; 4 tests; mixed
- tests/unit/timingBar/timingBar.logic.test.ts — unit; 38 tests; behavioral
- tests/unit/trapAuction/trapAuction.component.test.tsx — component; 4 tests; mixed
- tests/unit/trapAuction/trapAuction.logic.test.ts — unit; 91 tests; behavioral
- tests/unit/twinShock.test.ts — unit; 13 tests; behavioral
- tests/unit/ui/hold-the-wall/effects.hook.test.ts — unit; 15 tests; behavioral
- tests/unit/ui/hold-the-wall/Hourglass.test.tsx — component; 9 tests; behavioral
- tests/unit/ui/playerAvatar.badges.test.tsx — component; 2 tests; behavioral
- tests/unit/ui/TvZone.twist.test.tsx — component; 5 tests; mixed
- tests/unit/verdictBoard.input.test.ts — unit; 1 test; behavioral
- tests/unit/wildcard-western/helpers.test.ts — unit; 11 tests; behavioral
- tests/unit/wildcard-western/slice.test.ts — unit; 18 tests; behavioral
- tests/unit/wildcard-western/useWildcardWesternAudio.test.ts — unit; 5 tests; behavioral
- tests/unit/wildcard-western/WildcardWesternComp.completion.test.tsx — component; 6 tests; behavioral
- tests/unit/wildcard-western/WildcardWesternComp.styles.test.ts — unit; 2 tests; structural

## Final conclusion

bbmobilenew has substantial testing effort and many valuable low-level specifications, especially for minigame rules and complex season variants. The present repository state is nevertheless **not adequately protected for release** because the automated suite is red, critical orchestration/persistence branches are weak, E2E coverage does not represent a normal player journey, native behavior is essentially untested, and CI does not enforce one coherent quality/security gate.

The fastest route to trustworthy product confidence is not to chase the aggregate coverage number. It is to restore the current behavior contracts, add whole-state save/resume and phase invariants, protect one real gameplay week plus finale/economy journeys in E2E, and then make those checks mandatory before deployment.
