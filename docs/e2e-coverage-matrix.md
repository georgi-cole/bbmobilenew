# End-to-end coverage matrix

> **Final continuation:** [`phase-2-final-validation.md`](./phase-2-final-validation.md) supersedes the earlier 258-case count. Current status is 46 logical tests in 6 specs x 6 projects = 276 configured/discovered, 0 executed, and 276 locally blocked pending CI browser installation.

## Executive status

The Phase 2 Playwright structure is materially clearer and now includes five real player-facing journeys, but it is **not an executed quality gate yet**.

- **Configured:** one Playwright-owned Vite server, one base URL, six browser/viewport projects, no retries, central browser-error collection, and failure artifacts.
- **Discovered:** 258 cases from 43 logical tests across six projects.
- **Browser-executed after the changes:** **0/258 completed**. Browser launch is blocked by an incomplete local Playwright installation.
- **Current player confidence from E2E:** low. Test discovery proves that Playwright can load and enumerate the TypeScript specs; it does not prove that Home, gameplay, saving, a minigame, or the finale works in a browser.

This document uses these status words deliberately:

- **Implemented/configured** means the test or infrastructure exists in source.
- **Discovered** means Playwright enumerated the case.
- **Executed** means a browser actually ran the case to completion.
- **Passed** is used only after execution completed with all assertions satisfied.

## Infrastructure inventory

| Contract               | Current implementation                                                                    | Evidence status                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Test runner            | Playwright 1.58.2                                                                         | Installed as a Node dependency                                                            |
| Authoritative server   | `playwright.config.ts` starts Vite on 127.0.0.1:4173                                      | Configured; browser run blocked                                                           |
| Authoritative base URL | `http://127.0.0.1:4173/bbmobilenew/`                                                      | Configured consistently                                                                   |
| Retry policy           | `retries: 0`                                                                              | Configured; appropriate for smoke/flakiness visibility                                    |
| Browser errors         | Automatic fixture fails on console errors, page errors, and reported unhandled rejections | Configured in `e2e/playwright/support/test.ts`; not browser-executed                      |
| Failure evidence       | Screenshot on failure; trace/video retained on failure; HTML and list reporters           | Configured in `playwright.config.ts`; no valid current-state browser artifact produced    |
| Output locations       | `test-results/` and `playwright-report/`                                                  | Configured; existing contents must not be treated as a passing run                        |
| CI browser install     | Per-job `npx playwright install --with-deps chromium` or `webkit`                         | Configured in PR/nightly/release/deploy workflows; not validated by a GitHub run          |
| CI execution           | Risk-tiered PR, nightly, release and deployment jobs                                      | PR: core desktop/mobile + all minigames desktop; nightly/release: six-project full matrix |
| Artifact retention     | Report and results uploaded even on failure                                               | 14 days on PR; 30 days nightly/release/deploy                                             |

## Browser and viewport matrix

The dimensions below come from the installed Playwright device descriptors. They describe intended emulation, not an executed result.

| Project                   | Engine/device             |  Viewport | Touch/mobile | Discovered cases | Executed cases | Status                |
| ------------------------- | ------------------------- | --------: | ------------ | ---------------: | -------------: | --------------------- |
| `desktop-chromium`        | Desktop Chrome / Chromium |  1366×768 | No           |               43 |              0 | Blocked before launch |
| `mobile-chromium`         | Pixel 7 / Chromium        |   412×839 | Yes          |               43 |              0 | Blocked before launch |
| `mobile-webkit`           | iPhone 13 / WebKit        |   390×664 | Yes          |               43 |              0 | WebKit binary absent  |
| `narrow-chromium`         | Chromium mobile stress    |   320×568 | Yes          |               43 |              0 | Blocked before launch |
| `compact-mobile-chromium` | Chromium mobile stress    |   360×800 | Yes          |               43 |              0 | Blocked before launch |
| `wide-desktop-chromium`   | Desktop Chrome / Chromium | 1920×1080 | No           |               43 |              0 | Blocked before launch |

`gridOfLuck.spec.ts` overrides project viewports inside its cases: its “desktop” case uses 1280×1600 and its “mobile” case uses 390×844. Those 12 discovered cases therefore do not validate each normal project viewport height. No portrait-to-landscape resize, reduced-motion, blocked-audio, or page-visibility project/variant is configured.

Browser emulation is web evidence only. It does not replace native Android/iOS checks for safe areas, soft keyboard behavior, app background/restore, orientation events, motion sensors, or native storage lifecycle.

## Spec and case inventory

| Spec                                          | Logical tests | Projects | Discovered cases | Path type                                   | Meaningful behavior configured                                                                                                                                 | Important limitation                                                                                           |
| --------------------------------------------- | ------------: | -------: | ---------------: | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `e2e/playwright/core-player-journeys.spec.ts` |             5 |        6 |               30 | Real production UI                          | Fresh campaign; save/reload; route recovery; rapid-repeat social debit; legacy migration and corrupt-save recovery                                             | No browser execution; no full week, eviction, reward callback, purchase ledger, or finale/archive proof        |
| `e2e/playwright/final4-pov.spec.ts`           |             3 |        6 |               18 | Debug setup, then UI                        | AI and human Final 4 POS eviction presentation; Final 3 part sequencing                                                                                        | Uses debug controls, CSS-coupled selectors, and score-zero minigame dismissal; not a real season journey       |
| `e2e/playwright/finale.spec.ts`               |             1 |        6 |                6 | Valid two-finalist debug setup/fast-forward | Guarded controls create two finalists, an odd Tribunal and pre-jury cast; FinalFaceoff winner must belong to the finalist pair                                 | Does not prove real finale controls, exact tally/runner-up, reward, recap, archive, reload, or idempotency     |
| `e2e/playwright/gridOfLuck.spec.ts`           |             2 |        6 |               12 | Dedicated test route                        | One box reveal has readable beats; mobile CTA/player/box visible                                                                                               | Does not complete the game, verify authoritative result, or use the normal project dimensions                  |
| `e2e/playwright/minigameLab.smoke.spec.ts`    |            32 |        6 |              192 | Registry-backed Minigame Lab                | Every active title/dialog renders, has non-trivial geometry, has no horizontal overflow, and follows the real host Exit -> partial result -> Continue contract | No game-specific primary input, normal completion, callback idempotency, or post-unmount overlay-cleanup proof |
| **Total**                                     |        **43** |    **6** |          **258** | —                                           | —                                                                                                                                                              | **0 cases browser-executed**                                                                                   |

## Product-behavior traceability

| Product behavior             | Existing E2E implementation                                                                                         | Desktop scope | Mobile Chromium scope | WebKit scope  | Current executed protection | Missing regression scenario                                                                    | Failure severity            | Acceptance criterion                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------- | ------------- | --------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fresh startup                | Home loaded in each core test                                                                                       | Discovered    | Discovered            | Discovered    | None                        | Cold-load failure, corrupt storage, permission variants                                        | Critical                    | Two clean-context passes per Chromium project with zero browser errors; WebKit release pass                                 |
| Profile creation             | Real Profile UI creates and selects a named profile                                                                 | Discovered    | Discovered            | Discovered    | None                        | Existing-profile selection, invalid/duplicate names, reload identity                           | Critical                    | Create/select survives reload and starts the intended player exactly once                                                   |
| Classic campaign start       | Real Play → Campaign path reaches Day 1                                                                             | Discovered    | Discovered            | Discovered    | None                        | Alternate onboarding branches and startup recovery                                             | Critical                    | Day 1 action zone, player, toolbar, and navigation are usable at desktop and mobile sizes                                   |
| Complete one core week       | Not implemented                                                                                                     | None          | None                  | None          | None                        | LOH, nominations, POS, replacement, vote, tie, one eviction, next week                         | Critical                    | A real-control deterministic journey proves one valid evictee and consistent winner/nominee/phase state                     |
| Save/reload/resume           | Saves at LOH, returns Home, reloads page, chooses Continue Last                                                     | Discovered    | Discovered            | Discovered    | None                        | New page/context; seed, balances, nominees, pending decisions; duplicate prevention            | Critical                    | Exact current phase and complete protected state survive a new page/context; one Continue creates no duplicate event/reward |
| Save migration               | Real UI save is converted to the supported legacy slot, resumed, and observed rewriting v2                          | Discovered    | Discovered            | Discovered    | None                        | Browser execution; broader legacy variants and full protected-state comparison                 | Critical                    | Runtime-derived legacy save loads through visible UI, rewrites v2, continues, and reloads safely                            |
| Corrupt-save recovery        | Corrupt v2 is quarantined; visible recovery uses valid legacy fallback; unrelated save bytes are asserted unchanged | Discovered    | Discovered            | Discovered    | None                        | Browser execution; partial-but-parseable corruption and multiple-slot matrix                   | Critical                    | Visible recoverable error, Home remains usable, exact corrupt bytes are quarantined, and unrelated saves are unchanged      |
| Economy integrity            | Rapid double activation of a real Social Compliment must charge one energy and persist after reload                 | Discovered    | Discovered            | Discovered    | None                        | Reward duplicate callback; purchases (no current transaction UI/ledger)                        | Critical                    | Exact one-unit debit after rapid repeat input; reload matches; duplicate reward callback cannot grant twice                 |
| Navigation/recovery          | Game→Rules→Back; unknown hash→Not Found→Home                                                                        | Discovered    | Discovered            | Discovered    | None                        | Every production route, route guard, active-game restoration, back/Escape policy               | Critical                    | Route inventory passes without traps/errors and guarded routes recover to the correct safe screen                           |
| Final 4 eviction             | Debug fixture drives AI and human POS paths                                                                         | Discovered    | Discovered            | Discovered    | None                        | Real week setup, exact vote/nominees, reload/idempotency                                       | Critical                    | Real or documented deterministic setup, then real controls evict exactly one eligible player and advance once               |
| Final 3 competitions         | Debug fixture advances and dismisses human minigames with score 0                                                   | Discovered    | Discovered            | Discovered    | None                        | Real interactions/results, winner consistency, reload between parts                            | High                        | Three parts use valid participants/results and produce one final LOH through normal result acceptance                       |
| Finale/winner                | Debug force-jury and fast-forward reaches winner text                                                               | Discovered    | Discovered            | Discovered    | None                        | Real jury controls, exact winner/runner-up, tie, recap/archive/reward once, reload             | Critical                    | One winner and runner-up, one archive/reward, and unchanged count after reload                                              |
| Active minigame load         | Registry generates 32 frozen lab host/partial-exit cases per project                                                | 32 discovered | 32 discovered         | 32 discovered | None                        | Browser launch itself                                                                          | High                        | 32/32 desktop games render twice with no browser errors/overflow and retained artifacts on failure                          |
| Active minigame interaction  | All 32 have a configured host Exit/result/Continue path; only Grid of Luck has a game-specific real input           | Partial       | Partial               | Partial       | None                        | Primary action, status feedback, normal result and exactly-once completion for remaining games | High                        | Every game accepts a meaningful input and reaches one valid normal result or documented partial exit through the real host  |
| Result/store consistency     | Not probed by current browser tests                                                                                 | None          | None                  | None          | None                        | Displayed winner = host/store/announcement/reward/recap                                        | Critical                    | Read-only guarded evidence or visible state proves the same participant/result at each layer                                |
| Completion idempotency       | Not implemented in browser                                                                                          | None          | None                  | None          | None                        | Double submit, repeated Continue, late callback, retry/remount                                 | Critical                    | Aggressive duplicate input causes one accepted result, reward/history write, and phase transition                           |
| Responsive layout            | Initial minigame dialog width/height and document horizontal overflow only                                          | Discovered    | Discovered            | Discovered    | None                        | Control containment, clipping, fixed panels, 44×44 touch, safe area, short viewport            | High                        | Critical controls remain visible, named, operable, and inside each supported viewport                                       |
| Accessibility                | Role/name locators are strong in the new core spec                                                                  | Discovered    | Discovered            | Discovered    | None                        | Focus order/visibility, modal trap, disabled reason, announcements, automated scan             | High                        | Keyboard completes critical paths; focus stays visible/contained; Critical/Serious scan issues resolved or reviewed         |
| Reduced motion/audio blocked | Not implemented                                                                                                     | None          | None                  | None          | None                        | Correctness independent of cinematic/audio completion                                          | High                        | Representative timed/animated games complete with reduced motion and blocked audio with identical logical result            |
| Native Android/iOS           | Out of Playwright scope                                                                                             | None          | None                  | None          | None                        | Safe area, keyboard, background/restore, sensor, orientation, native storage                   | Critical for native release | Separate native smoke matrix passes on supported devices before native release                                              |

## Test taxonomy status

| Tag              | Current use                                            | Scheduling status                                                      | Required improvement                                                |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `@smoke`         | Core startup/save/navigation plus registry/grid smoke  | PR jobs select the risk groups through `@core-journey` and `@minigame` | Keep smoke tags on release-critical quick cases                     |
| `@core-journey`  | Four tagged quick real player journeys                 | Separate desktop/mobile Chromium PR job                                | Add a deterministic full week and finale/archive journey            |
| `@mobile`        | All four mobile-tagged core journeys plus Grid of Luck | Mobile Chromium PR; six-project nightly/release                        | Add orientation/reduced-motion variants                             |
| `@release`       | Core journeys plus existing finale/Final 4 specs       | Complete six-project release workflow                                  | Replace debug shortcuts with required real release journeys         |
| `@economy`       | Rapid-repeat Social energy debit and persistence       | Included through core-journey PR/release                               | Execute it; add duplicate reward callback; decide purchase scope    |
| `@persistence`   | Legacy migration and corrupt-save recovery             | Full nightly/release matrix                                            | Execute, then expand protected-state and legacy-version coverage    |
| `@minigame`      | Registry lab and Grid of Luck                          | All-active desktop Chromium PR job                                     | Add per-game primary interaction and normal terminal-result drivers |
| `@accessibility` | Grid of Luck dedicated cases                           | Included in full nightly/release matrices                              | Add critical-route keyboard, focus and automated scan cases         |
| `@nightly`       | No individual tests require the label                  | Scheduled workflow runs all six projects                               | Add label only if a future case must be excluded from PR by cost    |

CI now creates explicit PR, nightly and release tiers. PR is configured to run the four `@core-journey`-tagged journeys on desktop/mobile Chromium and 34 `@minigame` cases on desktop Chromium. Nightly/release are configured for the full six-project matrix, and deployment depends directly on release-quality/browser jobs. These jobs are configured and parse successfully but have not executed in GitHub; missing product journeys remain missing regardless of scheduling.

## Locator and wait quality

The new core journeys primarily use accessible roles, names, regions, dialogs, and labels, and they wait for visible application states rather than fixed sleeps. That is strong product-facing test design. The automatic fixture also makes unexpected console/page errors fail the case.

Known weaknesses remain:

- `final4-pov.spec.ts` depends on `.dbg-row`, `.dbg-label`, and `.status-pill--phase`, coupling important assertions to CSS structure.
- Finale and Final 4 use debug controls, so they protect a shortened diagnostic flow rather than an ordinary player setup.
- Fresh/saved helpers and the runtime-derived legacy/corrupt fixture live in one spec rather than reusable support; extract them when the next persistence journey is added.
- There is no guarded read-only state probe for result/store consistency. `src/main.tsx` instead exposes mutable `window.__store` in all builds, which should be removed. Exact seed, participant conservation and duplicate-transition evidence should use a development/E2E-only read-only probe that is absent from production.
- No critical journey uses a fixed `waitForTimeout`; this should remain a gate.

## Exact browser execution blocker

The blocker is environmental/infrastructure, not an assertion failure.

Initial installation attempted Chromium and WebKit concurrently and encountered a shared Playwright-cache lock. Only the identified installer processes were stopped, and the verified-empty stale lock was removed. A clean Chromium attempt was then made with:

```powershell
$env:PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT='120000'
npx playwright install chromium
```

It did not complete and was terminated by the command harness after approximately 604 seconds without producing further installer output. Inspection then showed:

- partial `chromium-1208` cache content;
- a zero-byte `D3DCompiler_47.dll` in that partial download;
- no `chromium_headless_shell-1208` installation;
- no WebKit installation; and
- a recreated cache lock.

The browser launch failure identifies the missing executable under the local Playwright cache as `chromium_headless_shell-1208`. Therefore:

- this is not a flaky test;
- this is not evidence that the game passed or failed in Chromium;
- repeating test execution without repairing the install cannot produce meaningful evidence; and
- Playwright's 258 discovered cases must remain reported as **not executed**.

### Smallest remediation

1. Confirm no Playwright installer is active.
2. Remove only the verified incomplete Playwright 1208 cache entries/lock, or use a fresh cache location; do not delete unrelated caches.
3. In an environment with working download access, run `npx playwright install chromium webkit` on Windows or the existing CI command `npx playwright install --with-deps chromium webkit` on Ubuntu.
4. Confirm the expected executables are present with `npx playwright install --list`.
5. Run the exact validation sequence below twice with retries still set to zero.

## Required execution sequence after unblocking

PR-sized proof:

```powershell
npx playwright test e2e/playwright/core-player-journeys.spec.ts --project=desktop-chromium --grep @smoke
npx playwright test e2e/playwright/core-player-journeys.spec.ts --project=mobile-chromium --grep @smoke
npx playwright test e2e/playwright/minigameLab.smoke.spec.ts --project=desktop-chromium
```

Release/nightly proof after missing journeys and tags are implemented:

```powershell
npx playwright test --project=desktop-chromium
npx playwright test --project=mobile-chromium
npx playwright test --project=mobile-webkit
npx playwright test --project=narrow-chromium
npx playwright test --project=compact-mobile-chromium
npx playwright test --project=wide-desktop-chromium
```

Run the smoke sequence twice from the same source state. Do not add retries to manufacture a pass. A first-attempt failure that passes later is a flaky finding and must retain its seed, trace, screenshot, video, and report.

## Prioritized remediation and acceptance criteria

### P0 — Establish executable browser evidence

- **Action:** Repair the local/CI browser install and run the existing collection.
- **Acceptance:** Chromium and WebKit executables are listed; PR smoke passes twice with zero retries; any failure produces readable artifacts in `test-results/` and `playwright-report/`.

### P0 — Add one complete real week

- **Action:** Drive LOH, nominations, POS, replacement decision where applicable, voting, tie handling, one eviction, and next week through player controls. A deterministic setup may choose a bounded game but cannot replace the journey with Redux dispatches.
- **Acceptance:** Exactly one eligible contestant is evicted; winner, nominees, POS holder, votes, evictee, history, and phase agree; next week is usable; repeated Continue cannot advance twice.

### P0 — Complete persistence/recovery protection

- **Action:** Execute and harden the configured save/resume, old-save migration, and corrupt-save recovery journeys; add a new-context protected-state comparison.
- **Acceptance:** Phase, seed, contestants, nominations, pending decision, balances, and history survive; current-format reload works; corrupt input produces a visible recovery path without losing unrelated saves; no duplicate event/reward/eviction occurs.

### P0 — Replace the finale shortcut with a release journey

- **Action:** Use a documented deterministic fixture only for expensive setup, then complete jury/finale through real controls and reload the archive.
- **Acceptance:** Exactly one winner and runner-up, one reward, one recap/archive, and no duplication after dismissal or reload.

### P0 — Prove economy idempotency

- **Action:** Execute the rapid-double-input Social energy case, add duplicate reward-callback protection, and explicitly decide whether purchases are release scope because no transaction/receipt UI currently exists.
- **Acceptance:** Exact balance before/after/reload; one debit or grant under rapid repeat input/duplicate callback; visible insufficient-balance behavior; no negative or corrupted balance.

### P1 — Make every minigame smoke meaningful

- **Action:** Add per-game/registry drivers that start, perform one representative input, observe feedback, reach a valid result or documented partial exit, and continue.
- **Acceptance:** All 32 pass desktop Chromium; representative timed/touch games pass Pixel 7; nightly covers all six projects; displayed result agrees with authoritative state and completion occurs once.

### P1 — Execute and deepen layout/accessibility gates

- **Action:** Execute the configured 320×568, 360×800, 1366×768 and 1920×1080 projects; add touch-size, control containment, fixed-panel overflow, focus, modal, safe-area, and critical accessibility checks.
- **Acceptance:** No critical control is clipped/covered; touch targets meet 44×44 CSS pixels or a reviewed exception; keyboard focus is visible and modal-contained; no unresolved Critical/Serious issue affects a real journey.

### P1 — Verify and complete the configured CI tiers

- **Action:** Execute the configured PR/nightly/release/deploy jobs, then add the missing release-only product journeys.
- **Acceptance:** PR jobs pass core desktop/mobile Chromium and all-minigame desktop smoke; nightly passes six projects and 50 seeds; release includes migration, corrupt save, full core week, economy and finale/archive; deployment occurs only after all required jobs are green.

### P2 — Add native platform validation

- **Action:** Create separate Android/iOS device smoke for startup, navigation, save/restore, keyboard/safe-area, orientation, app backgrounding, and Tilt Labyrinth sensor behavior.
- **Acceptance:** Supported native targets pass on real/simulator devices; results are reported separately from Playwright web emulation.

## Release decision

The E2E implementation is **configured and discoverable, not passing**. Phase 2 cannot be declared complete while browser installation prevents execution, migration/corrupt recovery remains configured-only, full-week and finale/archive journeys are absent, and the minigame matrix proves only mount plus the shared partial-exit contract rather than normal game-specific interaction. The next release should require the P0 criteria above, with all claims tied to actual browser runs and retained evidence.
