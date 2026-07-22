# bbmobilenew Phase 2 final validation

**Final update:** 2026-07-22 (Europe/Sofia)

**Baseline:** `codex/cross-platform-bottom-nav` at `4dd79d53be0272691915143c14e876de001b6253`

**Validated game/test revision:** `f21cec04bbef48f861290999c9a29804300aad1a`

## Final product decision

**GO to mark PR #1219 ready for human review; do not merge automatically.** The web game and Capacitor package pass the Phase 2 functional, quality, build, dependency-audit, and browser gates. The mobile Safety Ceremony deadlock is fixed and protected at component and rendered-browser levels.

This is not native-device certification. Before an Android or iOS store release, complete a native smoke and explicitly disposition the remaining Dependabot alerts.

## Final verified evidence

| Check                 | Result                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Full Vitest passes    | 378 files; 4,512/4,512 passed twice on unchanged source; 0 failed/skipped/pending/todo; final standard pass also green                   |
| CI coverage           | 68.48% statements; 58.47% branches; 69.34% functions; 71.11% lines; all named risk floors passed                                         |
| Quality gates         | Formatting transition, zero-warning ESLint, TypeScript, disabled/focused-test guard, production debug-global scan, and diff check passed |
| Builds                | Web production and Capacitor mobile-mode builds passed                                                                                   |
| Mobile browser proof  | 7/7 passed in each of 3 consecutive clean runs: 21/21, zero test retries, unchanged game/test revision                                   |
| Desktop browser proof | 7/7 passed in each of the same 3 runs: 21/21                                                                                             |
| Active-minigame smoke | Passed in all 3 runs                                                                                                                     |

The three clean attempts are E2E run `29948670990`. Mobile jobs were `89020517544`, `89021437131`, and `89022313495`; desktop jobs were `89020517495`, `89021436461`, and `89022313454`; minigame jobs were `89020517470`, `89021436517`, and `89022313459`. No retries, sleeps, larger timeouts, enlarged safety bounds, or direct Redux bypasses were added.

CI run `29948671128` passed the Capacitor build (`89020517690`), quality/dependency audit (`89020517706`), coverage (`89020517753`), 4,512-test functional suite (`89020517772`), and web build (`89020517783`). Separate lint run `29948671108`, job `89020517846`, passed.

## Product defect corrected

The retained mobile artifact from run `29925350396`, job `88940948895`, showed Playwright repeatedly clicking a real visible and enabled **Advance to next phase** control. There was no overlay interception, stale locator, browser/page error, or unhandled rejection. State stayed in `pos_ceremony_results` at AI replacement step 2.

The duplicate-action guard used only the public phase name, while the Safety Ceremony performs several valid internal steps inside that phase. The first valid click therefore locked later steps while leaving the button looking usable. Duplicate protection now keys on the real progression snapshot. It still blocks repeated input at one step but accepts the next legitimate in-phase step.

A deterministic component regression reproduces seed `1244317494`, proves Safety use and steps 1 to 2 to 0 happen exactly once, clears the pending minigame, makes one backup nomination, and reaches `social_2`. The rendered journey proves the real control and state transition for both valid strategic outcomes: use Safety or hold it.

## Failed evidence retained

| Run                                   | Finding                                                       | Classification                                                               |
| ------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `29925350396`                         | Enabled control could not finish Safety replacement           | Actual product regression; fixed                                             |
| `29945690654` / `1a6f9db2`            | Probe omitted a cleared value while E2E required exact `null` | Weak probe-representation assertion; corrected without weakening Redux proof |
| `29946221855` / `e7cac47a`            | Desktop legitimately held Safety                              | Over-specific test assumption; both strategy outcomes are valid              |
| `29946884969`, attempt 3 / `67ad61d4` | Mobile full-week path also legitimately held Safety           | Valid strategic branch; final E2E covers both outcomes                       |

These failures remain part of the audit trail and are not counted toward the three successful runs.

## Remaining release risks and acceptance criteria

- Before a native store release, run Android/iOS smoke for startup, save/restore, safe areas, orientation, background/resume, keyboard, and platform bridges. Browser emulation is not native evidence.
- GitHub reports 5 High, 2 Moderate, and 1 Low Dependabot alerts. Fix or explicitly accept them in separate security work; avoid broad dependency upgrades in this functional PR.
- Add normal-completion browser drivers for all active minigames; current registry smoke does not prove every game-specific terminal path.
- Add CodeQL/SAST, secret scanning, SBOM/license and native supply-chain checks; update Actions emitting Node 20 deprecation warnings.
- Human review must confirm the Safety Ceremony rule and regression. The final docs-only revision must remain green. Any later game/test change requires renewed validation.

## Archived pre-browser-execution record

The material below preserves the earlier bounded local-browser blocker and is superseded by the final GitHub execution evidence above. Its old NO-GO statement and old counts are historical, not the current release recommendation.

## Product decision at that checkpoint

**Release recommendation at that checkpoint: NO-GO until the configured Playwright jobs pass in GitHub Actions.** Local unit, component, integration, coverage, and source checks provided medium-high confidence in core game logic but did not yet prove browser execution.

## Final evidence ledger

| Check                | Final observed result                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Full Vitest pass 1   | 1,470/1,470 suites; 4,482/4,482 tests; 0 failed/skipped/pending/todo; 276.44 s                       |
| Full Vitest pass 2   | Same totals on identical source; 0 failures; 256.04 s                                                |
| Coverage             | 374 files and 4,482 tests passed; 68.35% statements, 58.29% branches, 69.18% functions, 70.98% lines |
| Risk coverage        | Global ratchet and every named high-risk file floor passed                                           |
| Playwright discovery | 46 logical tests in 6 specs x 6 projects = 276 configured cases                                      |
| Playwright execution | Configured 276; executed 0; passed 0; failed 0; skipped 0; blocked 276                               |
| Local browser setup  | One fresh isolated Chromium/WebKit install attempt ended at 244 s with no executable; no retry       |

The final source passed both full suites without retries. The jsdom `HTMLMediaElement.pause()` notices are environment limitations and did not correspond to failed assertions.

## Product protection now present

- Fresh profile and campaign startup is represented in a real-control browser journey.
- A seeded complete week asserts a valid LOH, distinct nominations, a POS winner, finite vote totals, exactly one max-vote evictee, one placement, and one elimination history event.
- That week saves at nomination results, reloads, resumes the same phase/week/seed/nominees/history count, and double-activates the week-end control to prove one advance.
- Save/resume, runtime-derived legacy migration, corrupt-current-save recovery, and isolation of another profile are configured.
- Rapid duplicate social execution accepts one debit and preserves it after reload.
- Reward success handles concurrent requests, a reentrant callback, and a delayed duplicate callback while granting exactly +3 once and recording one use.
- Reward bridge failure grants zero, records no use, remains visible/retryable, and stays correct after save/reload.
- Finale flow double-activates Continue and protects one result, reward, recap, and archive.
- Final 4/Final 3, Grid of Luck, route recovery, responsive viewports, and browser error collection are included.
- All 32 active minigames have a registry-driven host smoke for instructions, mount, partial Exit/result, double Continue idempotence, and overlay cleanup.

The minigame smoke does **not** prove normal game-specific completion. Primary-input drivers and terminal-result assertions remain open, especially for the gaps listed in `minigame-test-matrix.md`.

## Defects and hardening completed

- The floating primary action accepts one advance per phase, preventing a fast double tap from skipping state.
- Reward handlers are removed before user callback code runs; same-placement concurrency is blocked; native throws grant nothing and clear pending state.
- The mutable production Redux global was removed.
- The E2E probe requires a development build plus explicit `window.__E2E__`, returns a frozen read-only snapshot, and exposes no dispatch.
- Production builds scan for forbidden debug globals.
- Context-sensitive social explanations, alliance/state rules, eviction tie choreography, self-eviction vote presentation, minigame result ownership, and deterministic test fixtures have focused regressions.
- Changed-file formatting is a transition gate: new/previously clean files are strict while merge-base legacy debt is reported, not mislabeled as fixed.

## Playwright status and required execution

Playwright itself is configured correctly. Discovery proves the configuration and TypeScript specs load. It does not prove the game ran.

The final local setup attempt used a brand-new isolated browser cache outside the repository. It produced no progress before its four-minute bound. Inspection found no usable Chromium executable and no WebKit install. Windows denied command-line inspection of all processes, although no named Playwright installer was present. The attempt was not repeated and no broad cache cleanup occurred.

GitHub Actions is therefore the execution authority. It must install the pinned browser per job, run with zero retries, retain screenshot/trace/video/report artifacts on failure, and treat unexpected console errors, page errors, and unhandled rejections as failures.

The smallest valuable release smoke is:

1. fresh startup/campaign;
2. deterministic full week including save/reload and one eviction;
3. save/resume plus migration/corruption isolation;
4. navigation/deep-link recovery;
5. duplicate-safe social debit;
6. reward success and bridge failure;
7. finale/reward/recap/archive idempotence;
8. representative desktop/mobile/WebKit minigames plus the complete desktop active-minigame host smoke.

## Remaining risk backlog

### Critical before release

- Execute the configured Chromium/WebKit journeys in CI and fix any product or test failure without lowering assertions.
- Keep deployment blocked behind functional, coverage, build, dependency, and browser jobs.
- Run a native Android/iOS smoke before a native release; Playwright device emulation is not native evidence.

### High soon

- Add primary-input and normal-completion browser drivers for every active minigame, prioritizing touch/timer/canvas games and catalogued host gaps.
- Add native lifecycle, safe-area, keyboard, orientation, background/restore, sensor, and storage coverage.
- Add SAST/CodeQL, secret scanning, SBOM/license, and native dependency/supply-chain checks.

### Medium/lower value

- Expand accessibility, reduced-motion, resize/interruption, and visual regression coverage.
- Reduce the legacy formatting baseline in a separate mechanical change.
- Raise risk floors only with meaningful assertions; do not chase one arbitrary global percentage.

## Acceptance criteria for closure

- Required GitHub Actions checks are green on the draft PR with retained artifacts and zero retries.
- Browser reports distinguish configured, executed, passed, failed, skipped, and blocked counts.
- Any failed product journey is reproduced and fixed at the narrowest correct layer, then protected by a regression.
- No Critical journey relies only on source inspection, coverage touch, mocks, or discovery.
- Production builds contain no mutable debug store or E2E state probe.
- Android/iOS release evidence is reported separately from web emulation.

## Preservation and ownership

The authoritative pre-Phase-2 checkpoint is `C:\Users\georg\Documents\Codex\quality-backups\bbmobilenew-phase2-20260721-020505`. A continuation checkpoint is `C:\Users\georg\.codex\visualizations\2026\07\20\019f8173-5835-7100-9579-d8d8b1940507\bbmobilenew-phase2-continuation-20260721`.

Forty-one tracked paths existed in the original working-tree patch. They are conservatively treated as mixed ownership and included as complete files rather than splitting or discarding user hunks. `docs/test-strategy-audit.md` and `src/social/socialStoryBible.ts` were originally untracked and are also preserved. The recovered `gameSlice.ts` was verified as HEAD plus the original patch before the guarded deterministic E2E seed hook was added.

Generated coverage, Playwright results/reports, browser caches, and external JSON reports are excluded. The untracked `store-assets/` and `.cast-contact-sheet.jpg` are not relabeled as Phase 2 work and require an explicit staging decision.

## Source documents

- `test-strategy-audit.md`: historical read-only audit and traceability matrix.
- `quality-phase-2-report.md`: detailed earlier remediation checkpoint; this file supersedes conflicting counts and missing-journey statements.
- `e2e-coverage-matrix.md`: detailed E2E design and earlier blocker evidence; the 276-case ledger here is authoritative.
- `minigame-test-matrix.md`, `minigame-quality-contract.md`, `minigame-ux-findings.md`: per-game rules, evidence, and open UX risks.
- `product-rule-decisions.md`: product-rule resolutions.
