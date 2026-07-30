# Active minigame test matrix

## How this stays complete

This matrix covers every non-retired registry entry. Its executable source is `tests/helpers/minigameQualityMatrix.ts`. The completeness test compares its keys with `getPoolByFilter({ retired: false })`, verifies cited files exist, and checks that every active key appears in this document.

Evidence codes: **L** logic/rules, **C** real component, **H** host/integration, **B** registry-driven Playwright. ?B configured? means a browser path exists; only `docs/quality-phase-2-report.md` may claim it passed after execution.

## Contracts common to every row

| Field              | Current contract                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supported modes    | Season competition through MinigameHost and registry-backed Minigame Lab. The surrounding season engine decides LOH/POS or special-prize context. |
| Human path         | The real interactive React component is mounted by MinigameHost.                                                                                  |
| AI path            | Seeded competition AI supplies participant results under the same ranking contract.                                                               |
| Spectator path     | Host/spectator outcome uses the same participants and authoritative-result contract; dedicated presentation varies by game.                       |
| Partial completion | Exit is visible as partial and explicit Continue is required before parent acceptance.                                                            |
| Retry/dismissal    | Retry resets one attempt; dismissal, rerender, and late callbacks cannot commit twice.                                                            |
| Result shape       | Authoritative games return a finite value and participant-owned winner; raw games return a finite human value for host ranking.                   |
| Season effects     | Result, announcement, reward, history, and phase transition are applied exactly once by the parent.                                               |

Except for `gridOfLuck` (explicitly 2?4), the registry currently omits game-specific participant bounds. The runtime default is minimum 1 with no registry maximum, while the QA lab constrains interactive previews to 2?12. This is recorded as a shared design gap; the matrix does not pretend the default is a verified game-specific maximum.

## Rules, input, timing, and ties

| Registry ID              | Display name               | Primary input         | Direction   |    Registry timeout | Tie / qualification policy                                           |
| ------------------------ | -------------------------- | --------------------- | ----------- | ------------------: | -------------------------------------------------------------------- |
| `quickTap`               | Quick Tap Race             | rapid tap             | higher      |                30 s | effective taps, lower tiebreaker, stable order                       |
| `memoryMatch`            | Memory Colors              | ordered colors        | placement   |               owned | furthest round, fewer mistakes, faster time                          |
| `timingBar`              | Timing Bar                 | stop and lock         | higher      |               owned | locked accuracy, authoritative secondary result                      |
| `estimationGame`         | Estimation                 | numeric submit        | higher      |               owned | average accuracy, lower tiebreaker                                   |
| `holdWall`               | Hold the Wall              | press and hold        | survival    |               owned | last holding; seeded drop order at boundary                          |
| `famousFigures`          | Famous Figures             | guess/hints           | higher      |               owned | total clue score, authoritative result                               |
| `silentSaboteur`         | Silent Saboteur            | target/vote           | elimination |               owned | victim decides ordinary tie; final-two jury rule                     |
| `majorityRules`          | Majority Rules             | choice/vote           | elimination |               owned | authoritative seeded round policy                                    |
| `pressurePlank`          | Pressure Plank             | timed balance         | higher      |               owned | raw score, lower tiebreaker                                          |
| `colorMatch`             | Color Match                | color choice          | higher      |                25 s | accuracy, lower tiebreaker                                           |
| `logicLocks`             | Vault Cracker              | lock controls         | higher      |               owned | completion, then seeded duration/accuracy                            |
| `snake`                  | Serpentine                 | direction             | higher      |               owned | score, seeded tiebreak data                                          |
| `cardClash`              | House of Cards             | card/peek             | bracket     |               owned | authoritative seeded bracket                                         |
| `hangman`                | Verdict Board              | letters               | higher      |               owned | round score, deterministic engine order                              |
| `tiltLabyrinth`          | Tilt Labyrinth             | tilt/drag/keys        | lower       |               owned | fastest valid completion                                             |
| `threeDigitsQuiz`        | Number Trivia              | numeric choice        | higher      |               owned | correctness/speed, lower tiebreaker                                  |
| `capitalization`         | Capitalization             | text entry            | higher      |               owned | component-owned full standings                                       |
| `tetris`                 | Fit Me In                  | move/rotate           | higher      |               owned | authoritative score/order                                            |
| `minesweeps`             | Minesweeps                 | reveal/flag           | higher      |               owned | authoritative solve/accuracy                                         |
| `dontGoOver`             | Don''t go over             | numeric estimate      | elimination |               owned | over loses; equal valid guess loses on slower time; all-over repeats |
| `blackjackTournament`    | Blackjack Tournament       | card actions          | bracket     |               owned | tournament push/bracket rules                                        |
| `riskWheel`              | Risk Wheel                 | spin/decision         | placement   |               owned | seeded authoritative bracket                                         |
| `wildcardWestern`        | Wildcard Western           | choice/duel           | placement   |               owned | seeded authoritative duel                                            |
| `castleRescue`           | Find Your Twin             | platform controls     | higher      |               150 s | rescue score, lower tiebreaker                                       |
| `glass_bridge_brutal`    | The Crystal Path           | path choice           | elimination | dynamic; 160 s base | survival and deterministic finish order                              |
| `crystal_path_shattered` | Crystal Path: Infinity     | path choice           | elimination |               160 s | authoritative survival/order                                         |
| `rescueTheKing`          | Rescue the King            | board movement        | higher      |               180 s | rescue score, lower tiebreaker                                       |
| `trapAuction`            | Trap Auction               | bid/target            | custom      |               owned | authoritative auction tie rule                                       |
| `gridOfLuck`             | Grid of Luck               | grid choice           | placement   |               owned | seeded authoritative winner; 2?4 players                             |
| `bigSpender`             | Big Spender: Broke or Boom | spend/bank            | placement   |               owned | authoritative equal-balance policy                                   |
| `chainOfGreed`           | Chain of Greed             | split/steal/vote/duel | placement   |               owned | only a genuinely tied vote enters deterministic duel                 |
| `batteryLow`             | Battery Low                | charge allocation     | survival    |               owned | authoritative charge/elimination result                              |
| `houseOfDarkness`        | House of Darkness          | memory-card selection | survival    |               owned | rounds, lifespan, damage, mistakes, time, stable order               |

?Owned? means the component has no registry-wide timeout; its round state machine owns timing. Late timers still cannot overwrite an accepted result.

## Existing evidence and highest remaining per-game risk

| Registry ID              | Logic evidence             | Component evidence       | Host/integration evidence   | Browser      | Highest uncovered risk                  |
| ------------------------ | -------------------------- | ------------------------ | --------------------------- | ------------ | --------------------------------------- |
| `quickTap`               | quickTapRaceCanvasEngine   | quickTapRace.component   | ?                           | B configured | dedicated real-host Vitest              |
| `memoryMatch`            | memoryColors.competition   | styles only              | ?                           | B configured | interactive component completion        |
| `timingBar`              | timingBar.logic            | timingBar.component      | ?                           | B configured | real-host callback/store                |
| `estimationGame`         | estimationGame.competition | ?                        | minigameHost.estimationGame | B configured | focused component path                  |
| `holdWall`               | holdTheWallSlice           | hold timeout/effects     | minigameHost.holdWall       | B configured | background visibility                   |
| `famousFigures`          | scoring + match flow       | FamousFiguresComp        | ?                           | B configured | real-host callback/store                |
| `silentSaboteur`         | rules/helpers              | SilentSaboteurComp       | integration + final two     | B configured | mobile final-two presentation           |
| `majorityRules`          | rules/logic                | majorityRules.component  | host seed + integration     | B configured | long mobile rounds                      |
| `pressurePlank`          | competition                | ?                        | ?                           | B configured | raw result/store consistency            |
| `colorMatch`             | rules/react                | colorMatch.component     | host seed                   | B configured | low                                     |
| `logicLocks`             | canvas engine              | CodeBreakerComp          | minigameHost.codeBreaker    | B configured | short canvas viewport                   |
| `snake`                  | competition + AI           | results component        | minigameHost.snake          | B configured | simultaneous key/touch                  |
| `cardClash`              | competition                | peek component           | host seed                   | B configured | late animation after exit               |
| `hangman`                | engine                     | HangmanChallengeComp     | minigameHost.hangman        | B configured | key/touch overlap                       |
| `tiltLabyrinth`          | integration/collision      | TiltLabyrinthComp        | integration                 | B configured | native motion sensor                    |
| `threeDigitsQuiz`        | numberTrivia               | ?                        | minigameHost.numberTrivia   | B configured | focused component path                  |
| `capitalization`         | capitalization.logic       | capitalization.component | ?                           | B configured | callback/store consistency              |
| `tetris`                 | rules                      | ?                        | integration                 | B configured | held-key/touch geometry                 |
| `minesweeps`             | rules/react                | explosion/results        | minigameHost.minesweeps     | B configured | long-press/right-click parity           |
| `dontGoOver`             | outcome/helpers            | spectator                | host + integration          | B configured | full three-life final E2E               |
| `blackjackTournament`    | rules/slice                | styles only              | integration                 | B configured | interactive mobile completion           |
| `riskWheel`              | rules/slice/idempotency    | completion               | host seed                   | B configured | reduced-motion correctness              |
| `wildcardWestern`        | helpers/slice              | completion               | ?                           | B configured | real-host callback/store                |
| `castleRescue`           | ranking/rules/timeout      | continue component       | ?                           | B configured | long canvas lifecycle                   |
| `glass_bridge_brutal`    | logic/parallel             | GlassBridgeComp          | host seed                   | B configured | short viewport/final-minute concurrency |
| `crystal_path_shattered` | logic                      | async flow               | integration                 | B configured | delayed timer after unmount             |
| `rescueTheKing`          | rescue logic               | ?                        | ?                           | B configured | browser is only real-component evidence |
| `trapAuction`            | logic/rules                | trapAuction.component    | ?                           | B configured | bid/store idempotency                   |
| `gridOfLuck`             | logic/rules                | gridOfLuck.component     | host + integration          | B configured | low                                     |
| `bigSpender`             | bigSpenderLogic            | ?                        | ?                           | B configured | component/store/host coverage           |
| `chainOfGreed`           | logic/rules                | ChainOfGreed.component   | integration                 | B configured | double-vote/duel input                  |
| `batteryLow`             | batteryLow.logic           | ?                        | ?                           | B configured | component/store/host coverage           |
| `houseOfDarkness`        | survival rules + AI        | HouseOfDarknessComp      | registry integration        | B configured | long browser terminal path              |

## Interpretation

The catalog proves registry completeness and keeps the known evidence/gaps visible. It does not upgrade ?configured? browser checks to executed protection. Phase 2 is complete only after the final report records actual browser projects, viewports, repetitions, artifacts, and any remaining exceptions.
