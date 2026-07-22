# Minigame UX findings

## Product conclusion

As of 2026-07-21, the registry-driven framework accounts for all 32 active minigames, but browser UX confidence is **low**. The Playwright collection contains an all-active-minigame mount and partial-exit path, yet no Playwright case completed locally after the Phase 2 changes because the Chromium and WebKit binaries are incomplete. Test discovery and source inspection are not substitutes for rendered interaction.

No Critical or High visual defect is claimed as fixed without browser evidence. Conversely, the absence of an observed defect must not be read as proof that a minigame is usable on a supported viewport.

## Evidence boundary

| Evidence                          | Result                                                                      | What it proves                                                                                                               | What it does not prove                                                                  |
| --------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Registry quality matrix           | 32 active IDs represented; its four completeness checks passed              | No active registry entry can silently disappear from the documented quality catalog                                          | UI usability or completion                                                              |
| Focused minigame regression rerun | 96/96 focused cases passed after the initial full-suite contention failures | The seven timeout-only failures were reproducible as worker-contention symptoms, not assertion regressions                   | Browser behavior or every per-game branch                                               |
| Playwright discovery              | 192 minigame-lab cases discovered: 32 games across six projects             | Every active ID has a configured host/lab mount and Exit -> partial result -> Continue case at each declared viewport/device | Any browser case passed                                                                 |
| Playwright browser execution      | **Blocked; 0/192 minigame-lab cases completed**                             | The local browser-install problem is real and reproducible                                                                   | A product pass or fail                                                                  |
| Screenshots for this source state | None produced by a completed browser case                                   | Nothing                                                                                                                      | Visual correctness; older repository screenshots are not evidence for this source state |

The six configured projects are desktop Chromium at 1366×768, Pixel 7 mobile Chromium at 412×839, iPhone 13 WebKit at 390×664, narrow Chromium at 320×568, compact mobile Chromium at 360×800, and wide desktop Chromium at 1920×1080. Browser emulation would still not prove native Android/iOS safe-area, keyboard, sensor, or lifecycle behavior.

## Result-coherence findings resolved in Phase 2

### UX-R01 — Pressure Plank could have two owners for the result

- **Severity:** High, fixed in configuration and regression tests; browser confirmation remains pending.
- **Minigame/screen:** Pressure Plank through MinigameHost and its result presentation.
- **Viewport/browser:** Rule is platform-independent. No post-fix browser viewport executed.
- **Reproduction:** Compare the hosted component callback, which supplies a human raw score, with the former authoritative registry setting.
- **Expected player experience:** The score shown after play, AI comparison, winner, reward, announcement, and stored result all come from one calculation.
- **Observed experience/evidence:** Source contracts showed that the generic host had a raw human result while the registry described it as a full authoritative result. That could permit a second owner to re-rank the field. Evidence is recorded in `docs/product-rule-decisions.md` and the Pressure Plank profile in `tests/helpers/minigameQualityMatrix.ts`.
- **Change made:** The registry now treats Pressure Plank as non-authoritative so MinigameHost combines the raw human score with seeded AI results once.
- **Remaining acceptance criterion:** Complete a real hosted browser attempt, assert the displayed winner and ranking equal the accepted host/store result, then continue and verify one phase transition and one history event.

### UX-R02 — Capitalization could be re-ranked after already deciding the winner

- **Severity:** High, fixed in configuration and component regression tests; browser confirmation remains pending.
- **Minigame/screen:** Capitalization result and season hand-off.
- **Viewport/browser:** Rule is platform-independent. No post-fix browser viewport executed.
- **Reproduction:** Complete Capitalization and compare its full standings and `authoritativeWinnerId` with the former raw-result registry adapter.
- **Expected player experience:** The winner shown by the game remains the winner announced, rewarded, persisted, and recapped.
- **Observed experience/evidence:** The component already owned full participant standings, but the former adapter allowed the host to treat its output as one human raw score and simulate/rank again. Evidence is recorded in `docs/product-rule-decisions.md` and the Capitalization tests cited by the executable matrix.
- **Change made:** Capitalization now uses the authoritative adapter and forwards its component-owned standings.
- **Remaining acceptance criterion:** Run the real host in a browser, complete one deterministic attempt, and prove component result = host result = store result = visible announcement, including an equal-score case.

## Open findings

### UX-O01 — Browser UX validation cannot start

- **Severity:** Critical release-quality blocker; this is an environment/evidence failure, not proof of a product defect.
- **Minigame/screen:** All 32 minigames and MinigameHost.
- **Viewport/browser:** All six configured Chromium/WebKit viewport and device projects.
- **Reproduction:** Run `npx playwright test e2e/playwright/minigameLab.smoke.spec.ts`. Launch requires a missing `chromium_headless_shell-1208` executable. A clean `npx playwright install chromium` attempt ran for about 604 seconds without completing; the cache retained an incomplete Chromium 1208 directory, including a zero-byte `D3DCompiler_47.dll`, and no WebKit bundle.
- **Expected player experience:** Each game opens and remains usable at every supported project viewport, with failures retaining a screenshot, trace, video, and HTML report.
- **Observed experience:** Browser launch fails before a page is created, so no player-facing behavior is observed.
- **Evidence:** `playwright.config.ts`, `e2e/playwright/minigameLab.smoke.spec.ts`, the partial Playwright cache, and the launch/install output described in `docs/e2e-coverage-matrix.md`.
- **Recommended action:** Repair the browser cache/download in an environment with working access, install Chromium and WebKit, and run the minigame suite twice with retries disabled.
- **Acceptance criterion:** 32/32 games pass desktop Chromium twice; the risk-based mobile subset passes Pixel 7 twice; the full nightly matrix passes all six projects; all failures retain artifacts.

### UX-O02 — The all-game smoke stops before gameplay

- **Severity:** High.
- **Minigame/screen:** Every active minigame in the Minigame Lab host.
- **Viewport/browser:** All six configured projects; none executed.
- **Reproduction:** Inspect `e2e/playwright/minigameLab.smoke.spec.ts`. Each case opens the frozen lab, checks the selected title/dialog/geometry and horizontal overflow, then uses the real host Exit control, verifies the partial-result screen, and presses Continue. It does not use the selected game's primary input or prove a normal completion.
- **Expected player experience:** The objective and rules are understandable; the primary action responds; status is visible; a valid result appears; Continue/dismiss returns control without an overlay or duplicate completion.
- **Observed experience:** The configured contract protects the common dismissal/result/Continue route, but a game can still pass while its own start button, touch controls, timer, progress feedback, or normal result is broken.
- **Evidence:** The assertions in `e2e/playwright/minigameLab.smoke.spec.ts` and the broader requirements in `docs/minigame-quality-contract.md`.
- **Recommended action:** Add registry metadata or per-game drivers for start, one meaningful input, terminal/partial completion, and Continue. Keep component-specific behavior explicit rather than hiding it behind a universal click loop.
- **Acceptance criterion:** Every game proves one accepted input, visible feedback, one valid terminal or documented partial result, exactly one completion callback, and a usable post-result exit through the real host.

### UX-O03 — Four games depend on the blocked browser path for meaningful hosted UI confidence

- **Severity:** High.
- **Minigame/screen:** Pressure Plank, Rescue the King, Big Spender, and Battery Low.
- **Viewport/browser:** All supported web viewports; none executed.
- **Reproduction:** Review their rows in `docs/minigame-test-matrix.md`. They have logic evidence but no focused real-component and no dedicated host/integration evidence in the quality catalog.
- **Expected player experience:** Each real component mounts through MinigameHost, accepts the intended touch/pointer input, reaches a result, stores it once, and returns control.
- **Observed experience:** Their only cataloged end-user host route is the configured but unexecuted browser smoke. For Rescue the King, the catalog explicitly identifies browser smoke as the only real-component host evidence.
- **Evidence:** `tests/helpers/minigameQualityMatrix.ts` and `docs/minigame-test-matrix.md`.
- **Recommended action:** Add focused real-component host tests before release, then exercise the same path in Playwright.
- **Acceptance criterion:** For each of the four games, a real-component host test and one desktop browser journey assert valid participants, result schema, winner ownership, idempotent completion, dismissal, and cleared overlay/pending state.

### UX-O04 — Mobile, accessibility, and interruption risks are mostly untested

- **Severity:** High.
- **Minigame/screen:** All minigames; highest concern for Snake, Hangman, Tetris, Tilt Labyrinth, Castle Rescue, Hold the Wall, Crystal Path, and other timed/touch-heavy games.
- **Viewport/browser:** Pixel 7 Chromium, iPhone 13 WebKit, 320×568 and 360×800 stress projects are configured; orientation-resize variants are missing.
- **Reproduction:** Inspect the shared layout assertion and smoke. It checks document width, but not 44×44 touch targets, primary-control containment, clipped text, visible focus, modal focus containment, safe areas, keyboard/touch parity, reduced motion, blocked audio, visibility changes, or orientation resize.
- **Expected player experience:** Controls are reachable and named, status remains readable, modality is correct, and resizing/backgrounding cannot corrupt or block progress.
- **Observed experience:** Those behaviors are not asserted. The error collector is valuable but catches runtime errors, not unusable geometry or ambiguous feedback.
- **Evidence:** `e2e/playwright/support/layoutAssertions.ts`, `e2e/playwright/support/test.ts`, and the missing assertions in the smoke spec.
- **Recommended action:** Add shared touch-size, viewport-containment, fixed-panel overflow, focus, and safe-area assertions; add representative keyboard/pointer overlap, resize, reduced-motion, and visibility-change journeys.
- **Acceptance criterion:** High-risk games pass Pixel 7 and iPhone projects with primary controls inside the viewport and at least 44×44 CSS pixels (or a documented exception), readable status/result, visible focus, and successful completion after resize/reduced motion.

### UX-O05 — Participant limits are not a reliable player-facing contract

- **Severity:** Medium, potentially High if a season supplies an unsupported field.
- **Minigame/screen:** 31 active registry entries; Grid of Luck is the exception with an explicit 2–4 range.
- **Viewport/browser:** All.
- **Reproduction:** Read the active registry through `tests/helpers/minigameQualityMatrix.ts`. Most entries fall back to minimum 1 and no maximum; the lab separately constrains previews to 2–12.
- **Expected player experience:** The host schedules only a supported number of players and explains any qualification/cutoff before play.
- **Observed experience:** Registry metadata cannot currently reject an unsupported field or document the intended maximum. The generic fallback may not match a component's actual geometry or rules.
- **Evidence:** The executable matrix and the shared-gap note in `docs/minigame-test-matrix.md`.
- **Recommended action:** Establish product-supported participant bounds per game, put them in registry metadata, validate host input, and add boundary tests.
- **Acceptance criterion:** Every active entry declares reviewed minimum/maximum values; host rejects invalid counts recoverably; min/max and qualification-cutoff tests pass without missing or duplicated participants.

### UX-O06 — Some component evidence is structural rather than behavioral

- **Severity:** Medium.
- **Minigame/screen:** Memory Colors and Blackjack Tournament, plus games whose catalog has no focused component row.
- **Viewport/browser:** All; none browser-executed.
- **Reproduction:** Follow the component evidence paths in the matrix. Memory Colors and Blackjack Tournament cite style/structure-oriented tests, which cannot prove an interactive completion path.
- **Expected player experience:** Rules, inputs, state feedback, result, and next action work in the rendered component.
- **Observed experience:** Structural checks may pass while the interaction or lifecycle is broken.
- **Evidence:** `tests/unit/memoryColors/MemoryColorsComp.styles.test.ts`, `tests/unit/blackjackTournament/BlackjackTournamentComp.styles.test.ts`, and their matrix profiles.
- **Recommended action:** Add behavioral component cases with real input and terminal state; retain structural checks only for layout contracts they genuinely protect.
- **Acceptance criterion:** Each affected component starts through visible controls, accepts a representative action, shows progress, reaches or safely exits a terminal state, and calls completion once.

### UX-O07 — Screenshot capture exists, but visual regression and review evidence do not

- **Severity:** Medium.
- **Minigame/screen:** All minigames, especially dense boards and result overlays.
- **Viewport/browser:** All six configured projects, including 320×568 and 1920×1080; none has produced a completed review artifact.
- **Reproduction:** The smoke attaches a current screenshot, while Playwright retains screenshots only on failure. No completed run or approved visual baseline exists for this source state.
- **Expected player experience:** Representative screens are visually reviewed at risky breakpoints and regressions in clipped/covered controls are detected.
- **Observed experience:** There are no current-state screenshots to review and no selected visual comparisons.
- **Evidence:** `e2e/playwright/minigameLab.smoke.spec.ts`, `playwright.config.ts`, and the absence of completed-run artifacts.
- **Recommended action:** After browser installation, capture and review all desktop starts plus a representative mobile terminal-state set. Add narrowly selected, stable visual comparisons rather than pixel snapshots for every animation frame.
- **Acceptance criterion:** Reviewed artifacts exist for every desktop start state and for high-risk mobile start/result states; any visual baseline uses frozen seed/time and has an explicit owner.

## Per-minigame UX risk matrix

All Browser entries below mean **configured, not executed**. Existing evidence paths are enumerated in `docs/minigame-test-matrix.md`; this table identifies the next player-facing proof needed.

| Registry ID              | Display name               | Primary UX risk to close                                                 | Minimum acceptance evidence                                              |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `quickTap`               | Quick Tap Race             | Rapid taps, timeout boundary, and duplicate Finish through the real host | Desktop and Pixel host completion; one result and one Continue           |
| `memoryMatch`            | Memory Colors              | Current component evidence is mostly structural                          | Behavioral component completion plus mobile ordered-input journey        |
| `timingBar`              | Timing Bar                 | Lock timing and post-lock callback/store agreement                       | Real-host deterministic lock, result, and reload-safe hand-off           |
| `estimationGame`         | Estimation                 | Numeric keyboard, validation, and result clarity                         | Mobile numeric entry; invalid/valid submit; host result matches display  |
| `holdWall`               | Hold the Wall              | Background/visibility interruption while holding                         | Pixel visibility-change case and exactly-once terminal result            |
| `famousFigures`          | Famous Figures             | Hint/guess flow has no dedicated host evidence                           | Host start, hint, guess feedback, terminal result, Continue              |
| `silentSaboteur`         | Silent Saboteur            | Dense final-two decision presentation                                    | Pixel/iPhone final-two selection with readable tie explanation           |
| `majorityRules`          | Majority Rules             | Long rounds and changing vote feedback on mobile                         | Mobile multi-round progress and no dead-end after elimination            |
| `pressurePlank`          | Pressure Plank             | Raw result must stay consistent with host/store winner                   | Hosted completion across desktop/mobile and one authoritative hand-off   |
| `colorMatch`             | Color Match                | Timeout/input boundary and color-only state                              | Named state feedback plus before/after-timeout input behavior            |
| `logicLocks`             | Vault Cracker              | Lock controls on a short viewport                                        | 320×568 control containment, named controls, valid completion            |
| `snake`                  | Serpentine                 | Simultaneous key/touch input and resize                                  | Keyboard/touch parity, resize survival, no duplicate movement/completion |
| `cardClash`              | House of Cards             | Late peek/animation after exit                                           | Exit during animation; no late callback or covered Continue              |
| `hangman`                | Verdict Board              | Physical keyboard and on-screen key overlap                              | Mixed-input case with one accepted letter and reachable result           |
| `tiltLabyrinth`          | Tilt Labyrinth             | Browser fallback and native motion sensor behavior                       | Browser drag/key completion plus later native sensor validation          |
| `threeDigitsQuiz`        | Number Trivia              | Numeric choice clarity without focused component evidence                | Behavioral component and Pixel choice/feedback/result path               |
| `capitalization`         | Capitalization             | Text keyboard and authoritative standings agreement                      | Mobile text entry and component = host = store winner proof              |
| `tetris`                 | Fit Me In                  | Held-key/touch geometry and short viewport                               | Repeat-input case; controls visible at 320×568; clean dismissal          |
| `minesweeps`             | Minesweeps                 | Long-press/right-click parity and accidental reveal                      | Desktop right-click and mobile long-press with equivalent visible state  |
| `dontGoOver`             | Don't go over              | Three-life flow, all-over repeat, and final explanation                  | Full interactive final with lives/status and deterministic winner        |
| `blackjackTournament`    | Blackjack Tournament       | Structural component evidence does not prove card actions                | Behavioral card-action round and mobile tournament progression           |
| `riskWheel`              | Risk Wheel                 | Animation must not own correctness                                       | Reduced-motion completion with identical accepted result                 |
| `wildcardWestern`        | Wildcard Western           | Duel callback/store path lacks dedicated host evidence                   | Real-host duel, displayed winner agreement, one exit                     |
| `castleRescue`           | Find Your Twin             | Long canvas lifecycle and small-screen controls                          | Mobile control containment, unmount cleanup, terminal Continue           |
| `glass_bridge_brutal`    | The Crystal Path           | Short viewport and final-minute concurrent movers                        | Pixel/320×568 staged-release run with readable status and result         |
| `crystal_path_shattered` | Crystal Path: Infinity     | Delayed timers after unmount                                             | Route-away/unmount case proves no late result overwrite                  |
| `rescueTheKing`          | Rescue the King            | No focused component or host protection                                  | Real-component host test plus desktop/Pixel board interaction            |
| `trapAuction`            | Trap Auction               | Repeated bid and store idempotency                                       | Double-submit case, one debit/result, clear disabled reason              |
| `gridOfLuck`             | Grid of Luck               | One reveal is configured, but full result/Continue is not                | Complete 2- and 4-player runs; CTA remains visible on mobile             |
| `bigSpender`             | Big Spender: Broke or Boom | No focused component/host test; debit clarity                            | Real host with double-tap protection and exact visible balance           |
| `chainOfGreed`           | Chain of Greed             | Double vote/duel input and tie explanation                               | Genuine tied vote, one duel result, no second submit                     |
| `batteryLow`             | Battery Low                | No focused component/host test; allocation feedback                      | Real host allocation, timeout, one elimination, readable charge state    |

## Prioritized actionable work

1. **Release blocker:** repair Playwright browser installation, execute all 32 desktop host/partial-exit cases, and retain the first real artifact set.
2. **Before release:** add registry-driven or per-game primary-input/normal-terminal drivers; add dedicated host coverage for Pressure Plank, Rescue the King, Big Spender, and Battery Low.
3. **Before release:** execute high-risk touch/timed games on Pixel 7 and iPhone 13; add 320×568 stress, touch-size, primary-control containment, and focus assertions.
4. **Soon:** declare participant bounds for every registry entry and add min/max host validation.
5. **Soon:** cover reduced motion, visibility/background, resize/orientation, mixed keyboard/pointer input, blocked audio, and unmount/route-change cleanup.
6. **Later:** add selected frozen-state visual comparisons and native Android/iOS lifecycle, keyboard, safe-area, and motion-sensor validation.

## Release decision rule

Do not describe the minigame UX suite as passing until browsers are installed and the relevant cases execute. Discovery, a configured project, a screenshot hook, and source-level geometry assertions are useful infrastructure, but none is player-observed evidence.
