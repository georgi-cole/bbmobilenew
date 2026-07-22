# Product rule decisions

This log records rule ambiguities resolved during Phase 2. It follows the evidence order in the quality-program specification: player-facing rules, state contracts, multiple behavioral tests, history, equivalent mechanics, then the fairest deterministic player experience.

## Classic game history retains 1,000 events

**Ambiguity.** A legacy test title still described a 50-entry TV-feed cap, while the active Redux game state retained 1,000 entries.

**Evidence examined.**

- `src/store/gameSlice.ts` defines `MAX_GAME_HISTORY_EVENTS = 1000` and applies it consistently to main-game history writes.
- The pre-existing working tree intentionally contained the 1,000-event production change.
- The test body was the only part still asserting 50.
- Survivor mode has separate 50-entry replacement-event behavior; this decision does not silently change that mode.

**Chosen behavior.** The main Classic game history keeps the newest 1,000 events and drops the oldest beyond that boundary.

**Rejected alternatives.** Reverting production to 50 would discard substantially more season context. Treating history as unbounded would allow saves to grow indefinitely.

**Player reason.** One thousand events preserves useful season/recap context while retaining a deterministic storage bound.

## Equal canonical scores use the lower supplied tiebreaker

**Ambiguity.** A test expected equal scores in the opposite order from the shared scorer.

**Evidence examined.**

- `src/minigames/scoring.ts` documents tiebreakers as elapsed time in milliseconds where lower is better.
- AI tiebreakers are generated as simulated elapsed time.
- Estimation, Color Match, Snake, and other components forward elapsed time under the same contract.

**Chosen behavior.** Authoritative winner status sorts first, canonical score sorts descending, and equal scores sort by tiebreaker ascending. A missing tiebreaker is treated as infinity; if both are missing, stable participant order is the final deterministic fallback.

**Rejected alternatives.** Higher elapsed time winning is unintuitive and contradicts component contracts. Random tie resolution would violate reproducibility.

**Player reason.** Faster equivalent performance wins, and identical seeds/inputs stay reproducible.

## Chain of Greed enters a duel only for a real vote tie

**Ambiguity.** The regression fixture claimed to test a tied elimination but its votes were not tied.

**Evidence examined.**

- Player-facing rules say standard rounds end with weakest-link votes.
- `resolveVoteElimination` enters its duel branch only when the highest vote totals are equal.
- Endgame score ties already use the same explicit duel concept.

**Chosen behavior.** Only equal top vote totals trigger the deterministic duel. The fixture now supplies an actual 2-2 tie and asserts one valid elimination.

**Rejected alternatives.** Forcing the tie branch for a non-tie would make majority votes meaningless. Changing expected output without making the fixture tied would create false protection.

**Player reason.** The displayed vote count and elimination mechanic now agree.

## Pressure Plank is raw-score hosted, not authoritative-result hosted

**Ambiguity.** The registry marked Pressure Plank authoritative although its generic hosted component returns the human raw result and does not own full participant standings.

**Evidence examined.**

- `src/components/PressurePlank/PressurePlank.tsx` reports its hosted result without a full authoritative winner payload.
- The surrounding challenge path combines the human result with AI results.
- The registry contract requires authoritative games to own and return the authoritative winner.

**Chosen behavior.** `pressurePlank` is non-authoritative with the raw scoring adapter in the generic host registry. Specialized season state may still calculate last place through its own reducer, but that does not make the generic host callback authoritative.

**Rejected alternatives.** Fabricating an authoritative winner in the host would duplicate logic and could disagree with the store.

**Player reason.** There is one owner for each result, preventing conflicting winners.

## Capitalization owns full authoritative standings

**Ambiguity.** Capitalization returned a complete participant result but its registry adapter was raw.

**Evidence examined.**

- `Capitalization.tsx` ranks the full field and emits `authoritativeWinnerId` plus raw results.
- Capitalization AI and elimination logic are internal to the component.
- MinigameHost already forwards authoritative completions directly.

**Chosen behavior.** Capitalization uses the authoritative adapter and its component-owned winner/standings.

**Rejected alternatives.** Re-ranking its output as a human raw score would simulate AI twice and can produce a different winner.

**Player reason.** The result screen, store, reward, and recap all use the same standings.

## The Crystal Path releases a capped final-minute batch

**Ambiguity.** A stale test expected every remaining AI mover to start concurrently when one minute remained.

**Evidence examined.**

- `src/features/glassBridge/glassBridgeSlice.ts` defines `MAX_PARALLEL_MOVERS = 3`.
- The state machine respects occupied tiles while time permits and bypasses waiting only in the final 15 seconds.
- Component orchestration releases additional movers gradually before that final emergency window.

**Chosen behavior.** At the remaining-minute threshold, at most three movers are active concurrently; others remain queued and are released in stages. Only the final 15 seconds remove the wait safeguard.

**Rejected alternatives.** Releasing everyone with a minute left contradicts collision/occupancy rules and makes the earlier staged-release logic irrelevant.

**Player reason.** The scene remains readable and fair while still guaranteeing late progression.

## Accepted alliances are reciprocal and meet the minimum affinity floor

**Ambiguity.** Incoming accepted alliances established reciprocal affinity, but outgoing maneuvers could leave a one-sided or too-low relationship and permit duplicate proposals.

**Evidence examined.**

- `src/social/socialAlliance.ts` defines an alliance as reciprocal affinity of at least `MIN_ALLIANCE_AFFINITY`.
- Incoming acceptance already raises both directions to that floor.
- Alliance tags and targeting policy assume an existing alliance cannot be proposed again.

**Chosen behavior.** An accepted alliance raises both relationship directions to the minimum floor, repairs stale low-affinity tags, and blocks duplicate alliance proposals.

**Rejected alternatives.** A tag-only alliance or one-way threshold creates contradictory UI and AI decisions. Allowing repeated proposals spends energy for no new relationship.

**Player reason.** Both contestants agree on the alliance, and the UI/AI cannot contradict that state.

## Social result and log deltas equal the persisted relationship change

**Ambiguity.** Non-alliance maneuvers intentionally applied a scaled relationship delta in state, but the returned result and activity log reported the unscaled value.

**Evidence examined.**

- The reducer/maneuver path persisted the scaled delta.
- UI summaries and logs consume the returned delta.
- The activated regression asserts result, log, and state together.

**Chosen behavior.** The maneuver result and log report the exact delta applied to persisted state.

**Rejected alternatives.** Keeping a hidden multiplier makes player feedback false. Removing the multiplier would change game balance without product evidence.

**Player reason.** The relationship feedback now tells the truth about what changed.

## Finale recovery preloads the real lazy module in the integration harness

**Ambiguity.** The finale recovery test timed out even though production recovery behavior was correct.

**Evidence examined.**

- The route lazily loads `FinalFaceoff`.
- Focused state evidence showed recovery could continue when the real module was available.
- Increasing the timeout or mocking the route would hide the integration boundary.

**Chosen behavior.** The integration test statically preloads the real FinalFaceoff module before exercising lazy route recovery.

**Rejected alternatives.** A longer timeout would conceal nondeterminism; a stub would stop testing the real recovery module.

**Player reason.** Production behavior remains unchanged while the test deterministically proves the real recovery path.

## A finale fixture has exactly two active finalists

**Ambiguity.** The existing Playwright shortcut forced a fresh full cast directly to jury, so every active housemate became a finalist even though the finale tally contract is a final two.

**Evidence examined.**

- `FinalFaceoff` derives finalists from players who are neither evicted nor Tribunal members.
- `finaleSlice` tallies the two finalist IDs that define the final vote.
- Normal season progression reaches jury only after the roster has been reduced to the final two.

**Chosen behavior.** A shortened finale test fixture must leave exactly two active finalists, assign a valid odd Tribunal, and mark the remaining players pre-jury before entering the finale. The declared winner must belong to that finalist pair.

**Rejected alternatives.** Jumping a fresh cast directly to jury can produce a visually completed test while silently ignoring most alleged finalists. Accepting any displayed winner would not protect the real game rule.

**Player reason.** The finale result now represents the same two contestants the season and vote tally consider eligible to win.

## An evicted Classic player is season-over, not a hidden competition spectator

**Ambiguity.** A challenge-flow test expected an evicted human to silently spectate and advance an AI-only Classic competition.

**Evidence examined.**

- `GameScreen.tsx` explicitly sets `preJuryGameOver` for an evicted non-Survivor human.
- The player-facing modal says the season is over and the player cannot return or cast a finale vote.
- The challenged competition still resolved correctly in state before the obsolete UI wait timed out.

**Chosen behavior.** The test must assert the explicit season-over experience, or use an active non-participating player when testing spectator competition progression.

**Rejected alternatives.** Extending the timeout would not make the inaccessible spectator premise valid. Removing the season-over guard would contradict current Classic rules.

**Player reason.** Eliminated players receive a clear terminal state instead of an unreachable or misleading competition screen.

## Responsive layout tests follow the current refined HUD contract

**Ambiguity.** Nine structural tests asserted pre-refinement CSS values and omitted the now-required `inlineLogVisible` layout input.

**Evidence examined.**

- The current HUD intentionally caps inline rows at three and budgets space differently when the inline feed is hidden.
- Bottom-nav panel height and safe-area spacer are separate concerns.
- Dock scaling/gap variables and Bullseye's safe-area-aware 100% height were intentional responsive changes.

**Chosen behavior.** Tests assert the current inputs and observable budget invariants, including a no-inline-feed refined-chrome case, rather than old literal CSS values.

**Rejected alternatives.** Reverting the layout would reintroduce control crowding. Keeping tests that omit a required input provides no product protection.

**Player reason.** The checks now protect usable vertical space and safe-area separation rather than obsolete implementation literals.

## A resolved AI eviction tie still enters eviction choreography

**Ambiguity.** The UI required `awaitingTieBreak` to remain true before showing AI eviction choreography, while the reducer deliberately clears that flag after it selects the pending evictee.

**Evidence examined.**

- The reducer keeps the exact tied tally and writes one valid `pendingEvicteeId` when the AI resolves the tie.
- The existing choreography regression expects the resolved evictee to receive the normal player-facing reveal rather than silently advancing.
- Retaining `awaitingTieBreak` after resolution would misrepresent state as still awaiting a decision.

**Chosen behavior.** A matching tally, a real tie and a valid pending evictee are sufficient to start choreography after AI resolution; the stale awaiting flag is not required.

**Rejected alternatives.** Keeping the flag true would corrupt the state-machine meaning. Skipping choreography would hide a major elimination result from the player.

**Player reason.** The elimination result is shown exactly once and the state accurately records that the decision is already resolved.

## QA state mutation requires an explicit debug or E2E guard

**Ambiguity.** A public `?qa=1` query could expose a nomination control that mutates season state even when the application was not intentionally running in debug/E2E mode.

**Evidence examined.**

- The nomination control can trigger a real state transition.
- Existing debug and E2E modes already provide an explicit guarded context for automation.
- A URL query alone is easy for a player or shared link to activate accidentally.

**Chosen behavior.** QA controls require both the requested QA query and the existing debug/E2E guard. The query alone is inert in an ordinary production session.

**Rejected alternatives.** Leaving query-only access would expose state mutation. Removing the control entirely would discard a useful guarded test path.

**Player reason.** Ordinary players cannot accidentally alter nominations through a URL, while authorized test flows remain deterministic.

## A self-evicted human receives the vote result immediately

**Ambiguity.** An outdated integration test expected an advertising prompt before the self-evicted player's own vote breakdown.

**Evidence examined.**

- The terminal Classic flow presents the player's elimination result immediately.
- The vote breakdown is the direct explanation for why the season ended.
- Delaying it behind an unrelated monetization prompt weakens clarity and can make the result appear blocked.

**Chosen behavior.** A self-evicted human sees the vote breakdown immediately; the flow does not require an ad prompt first.

**Rejected alternatives.** Restoring the stale ad-first ordering would subordinate a critical game result to an unrelated prompt.

**Player reason.** The player immediately understands the decisive vote and can trust that the terminal state matches the result.

## Duplicate protection follows the progression step, not only the phase name

**Ambiguity.** The floating primary action prevented a second activation until the named game phase changed. The Safety Ceremony deliberately performs several valid AI replacement steps inside `pos_ceremony_results`, so the first accepted activation could leave a visible, enabled button that silently ignored every later valid activation.

**Evidence examined.**

- The retained mobile trace showed repeated successful clicks on the real visible and enabled control, with no overlay interception, page error, console error, or unhandled rejection.
- State remained at AI replacement step 2 in `pos_ceremony_results`; the named phase did not change between the ceremony's internal steps.
- The reducer supports both intentional strategic outcomes: the Safety winner may use the power and select a backup nominee, or may hold it and nominate nobody.
- A focused deterministic regression reproduces the original used-Safety path with seed `1244317494` and proves steps 1 to 2 to 0 complete exactly once.

**Chosen behavior.** Duplicate protection keys an activation to the complete progression snapshot: phase, AI replacement step/waiting state, special-veto stage, and player-input readiness. A repeated activation against the same snapshot is ignored, while a new valid step inside the same named phase is accepted.

**Rejected alternatives.** Removing duplicate protection would permit double advances. Requiring every internal step to have a new public phase would distort the state model. Adding sleeps, retries, or longer browser bounds would hide the deterministic deadlock without fixing it.

**Player reason.** A rapid double tap still cannot skip gameplay, but a legitimate next step never becomes a button that looks usable and does nothing. Both valid strategic outcomes remain unchanged.
