import { getPoolByFilter, type GameRegistryEntry } from '../../src/minigames/registry'

export type ScoringDirection =
  | 'higher'
  | 'lower'
  | 'survival'
  | 'elimination'
  | 'bracket'
  | 'placement'
  | 'custom'

interface QualityDetail {
  input: string
  scoring: ScoringDirection
  tie: string
  logic: string
  component?: string
  host?: string
  risk?: string
}

export interface MinigameQualityRow {
  registryId: string
  displayName: string
  supportedModes: string[]
  minimumParticipants: number
  maximumParticipants: number | null
  participantBoundsAreExplicit: boolean
  humanPath: string
  aiPath: string
  spectatorPath: string
  primaryInput: string
  scoringDirection: ScoringDirection
  tiePolicy: string
  timeoutPolicy: string
  partialCompletionPolicy: string
  retryAndDismissalPolicy: string
  authoritativeResultShape: string
  seasonStateEffects: string
  evidence: {
    logic: string[]
    component: string[]
    host: string[]
    playwright: string[]
  }
  uncoveredRisks: string[]
}

const HOST_BROWSER_SMOKE = 'e2e/playwright/minigameLab.smoke.spec.ts'

/**
 * Facts that are not safely derivable from registry metadata. A completeness
 * test requires these keys to match the active registry exactly.
 */
export const ACTIVE_MINIGAME_QUALITY_DETAILS: Record<string, QualityDetail> = {
  quickTap: {
    input: 'rapid pointer/touch tapping',
    scoring: 'higher',
    tie: 'Higher effective taps; then lower supplied tiebreaker; then stable participant order.',
    logic: 'tests/unit/quickTapRace/quickTapRaceCanvasEngine.test.ts',
    component: 'tests/quickTapRace.component.test.tsx',
    risk: 'No dedicated real-host Vitest path.',
  },
  memoryMatch: {
    input: 'ordered pointer/touch color selection',
    scoring: 'placement',
    tie: 'Furthest round, fewer mistakes, then faster completion.',
    logic: 'tests/memoryColors.competition.test.ts',
    component: 'tests/unit/memoryColors/MemoryColorsComp.styles.test.ts',
    risk: 'Component evidence is mostly structural.',
  },
  timingBar: {
    input: 'pointer/touch stop and lock controls',
    scoring: 'higher',
    tie: 'Higher locked accuracy; then the authoritative deterministic secondary result.',
    logic: 'tests/unit/timingBar/timingBar.logic.test.ts',
    component: 'tests/unit/timingBar/timingBar.component.test.tsx',
  },
  estimationGame: {
    input: 'numeric input and submit',
    scoring: 'higher',
    tie: 'Higher average accuracy; then lower supplied tiebreaker.',
    logic: 'tests/estimationGame.competition.test.ts',
    host: 'tests/minigameHost.estimationGame.test.tsx',
  },
  holdWall: {
    input: 'press-and-hold pointer/touch',
    scoring: 'survival',
    tie: 'Last participant holding; seeded AI drop order resolves simultaneous boundaries.',
    logic: 'tests/unit/hold-the-wall/holdTheWallSlice.test.ts',
    component: 'tests/unit/hold-the-wall/GameController.holdTimeout.test.ts',
    host: 'tests/minigameHost.holdWall.test.tsx',
    risk: 'Background/visibility interruption needs browser evidence.',
  },
  famousFigures: {
    input: 'text guess, hint, and submit',
    scoring: 'higher',
    tie: 'Higher total clue score; then the authoritative game result.',
    logic: 'tests/unit/famous-figures/scoring.test.ts',
    component: 'tests/unit/famous-figures/FamousFiguresComp.test.tsx',
  },
  silentSaboteur: {
    input: 'secret target and vote selection',
    scoring: 'elimination',
    tie: 'The victim decides ordinary vote ties; the documented final-two jury rule owns finale ties.',
    logic: 'tests/minigames.silentSaboteur.rules.test.ts',
    component: 'tests/unit/silent-saboteur/SilentSaboteurComp.test.tsx',
    host: 'tests/integration/minigame.silentSaboteur.integration.test.ts',
  },
  majorityRules: {
    input: 'multiple-choice vote selection',
    scoring: 'elimination',
    tie: 'The authoritative round rule resolves tied outcomes from seeded state.',
    logic: 'tests/unit/majorityRules/majorityRules.logic.test.ts',
    component: 'tests/unit/majorityRules/majorityRules.component.test.tsx',
    host: 'tests/unit/majorityRules/minigameHostMajorityRulesSeed.test.tsx',
  },
  pressurePlank: {
    input: 'timed pointer/touch balance controls',
    scoring: 'higher',
    tie: 'Higher raw endurance score; then lower supplied tiebreaker.',
    logic: 'tests/pressurePlank.competition.test.ts',
    risk: 'Raw hosted score still needs dedicated store/result consistency coverage.',
  },
  colorMatch: {
    input: 'pointer/touch color selection',
    scoring: 'higher',
    tie: 'Higher accuracy; then lower supplied tiebreaker.',
    logic: 'tests/minigames.colorMatch.rules.test.ts',
    component: 'tests/colorMatch.component.test.tsx',
    host: 'tests/unit/colorMatch/minigameHostColorMatchSeed.test.tsx',
  },
  logicLocks: {
    input: 'pointer/touch lock manipulation',
    scoring: 'higher',
    tie: 'Authoritative puzzle completion; then seeded duration/accuracy.',
    logic: 'tests/unit/codeBreaker/vaultCrackerCanvasEngine.test.ts',
    component: 'tests/unit/codeBreaker/CodeBreakerComp.test.tsx',
    host: 'tests/minigameHost.codeBreaker.test.tsx',
  },
  snake: {
    input: 'keyboard arrows or directional touch controls',
    scoring: 'higher',
    tie: 'Higher score; then deterministic seeded AI/tiebreak data.',
    logic: 'tests/snake.competition.test.ts',
    component: 'tests/snakeGame.results.test.tsx',
    host: 'tests/minigameHost.snake.test.tsx',
  },
  cardClash: {
    input: 'pointer/touch card choice and peek',
    scoring: 'bracket',
    tie: 'Authoritative bracket rounds resolve equal card outcomes with the game seed.',
    logic: 'tests/cardClash.competition.test.ts',
    component: 'tests/unit/house-of-cards/HouseOfCardsComp.peek.test.tsx',
    host: 'tests/unit/house-of-cards/minigameHostHouseOfCardsSeed.test.tsx',
  },
  hangman: {
    input: 'keyboard or on-screen letter selection',
    scoring: 'higher',
    tie: 'Higher authoritative round score; then deterministic engine order.',
    logic: 'src/components/HangmanChallengeComp/__tests__/hangmanChallengeEngine.test.ts',
    component: 'src/components/HangmanChallengeComp/__tests__/HangmanChallengeComp.test.tsx',
    host: 'tests/minigameHost.hangman.test.tsx',
  },
  tiltLabyrinth: {
    input: 'tilt/drag or keyboard direction controls',
    scoring: 'lower',
    tie: 'Faster valid completion; then authoritative deterministic order.',
    logic: 'tests/integration/minigame.tiltLabyrinth.integration.test.ts',
    component: 'tests/unit/tiltLabyrinth/TiltLabyrinthComp.test.tsx',
    risk: 'Device-orientation sensors require a later native phase.',
  },
  threeDigitsQuiz: {
    input: 'numeric/multiple-choice selection',
    scoring: 'higher',
    tie: 'Higher correct-and-speed score; then lower supplied tiebreaker.',
    logic: 'tests/unit/number-trivia/numberTrivia.test.tsx',
    host: 'tests/minigameHost.numberTrivia.test.tsx',
  },
  capitalization: {
    input: 'keyboard/text capitalization entry',
    scoring: 'higher',
    tie: 'The component owns full standings and returns one authoritative winner.',
    logic: 'tests/unit/capitalization/capitalization.logic.test.ts',
    component: 'tests/unit/capitalization/capitalization.component.test.tsx',
  },
  tetris: {
    input: 'keyboard or on-screen movement/rotation controls',
    scoring: 'higher',
    tie: 'Higher authoritative score; then game-owned deterministic order.',
    logic: 'tests/minigames.tetris.rules.test.ts',
    host: 'tests/integration/minigame.tetris.integration.test.ts',
  },
  minesweeps: {
    input: 'pointer/touch tile reveal and flag',
    scoring: 'higher',
    tie: 'Authoritative solve/accuracy result; then deterministic game order.',
    logic: 'tests/minigames.minesweeps.rules.test.ts',
    component: 'tests/minesweeps.results.test.tsx',
    host: 'tests/minigameHost.minesweeps.test.tsx',
  },
  dontGoOver: {
    input: 'numeric estimate and submit',
    scoring: 'elimination',
    tie: 'Over-bids lose; equal valid guesses eliminate the slower player; all-over repeats.',
    logic: 'tests/unit/cwgo.outcome.test.ts',
    component: 'tests/unit/cwgo.spectator.test.tsx',
    host: 'tests/minigameHost.cwgo.test.tsx',
  },
  blackjackTournament: {
    input: 'pointer/touch card-action controls',
    scoring: 'bracket',
    tie: 'Authoritative tournament rules own pushes and bracket advancement.',
    logic: 'tests/minigames.blackjackTournament.rules.test.ts',
    component: 'tests/unit/blackjackTournament/BlackjackTournamentComp.styles.test.ts',
    host: 'tests/integration/minigame.blackjackTournament.integration.test.ts',
    risk: 'Component evidence is partly structural.',
  },
  riskWheel: {
    input: 'pointer/touch spin and decision controls',
    scoring: 'placement',
    tie: 'Seeded wheel/bracket state returns one authoritative placement winner.',
    logic: 'tests/minigames.riskWheel.rules.test.ts',
    component: 'tests/unit/riskWheel/RiskWheelComp.completion.test.tsx',
    host: 'tests/unit/riskWheel/minigameHostRiskWheelSeed.test.tsx',
  },
  wildcardWestern: {
    input: 'pointer/touch choice and duel controls',
    scoring: 'placement',
    tie: 'Seeded authoritative duel state resolves equal round outcomes.',
    logic: 'tests/unit/wildcard-western/helpers.test.ts',
    component: 'tests/unit/wildcard-western/WildcardWesternComp.completion.test.tsx',
  },
  castleRescue: {
    input: 'keyboard or on-screen platform controls',
    scoring: 'higher',
    tie: 'Higher rescue score; then lower supplied tiebreaker.',
    logic: 'tests/unit/castle-rescue/ranking.test.ts',
    component: 'tests/unit/castle-rescue/continue-button.test.tsx',
  },
  glass_bridge_brutal: {
    input: 'pointer/touch path choice',
    scoring: 'elimination',
    tie: 'Survival and deterministic finish order produce one authoritative winner.',
    logic: 'tests/unit/glass-bridge/glassBridge.logic.test.ts',
    component: 'src/components/GlassBridgeComp/__tests__/GlassBridgeComp.test.tsx',
    host: 'tests/unit/glass-bridge/minigameHostGlassBridgeSeed.test.tsx',
  },
  crystal_path_shattered: {
    input: 'pointer/touch path choice',
    scoring: 'elimination',
    tie: 'Authoritative survival/order result chooses one participant.',
    logic: 'tests/crystalPathShattered.logic.test.ts',
    component: 'tests/crystalPathShattered.asyncFlow.test.tsx',
    host: 'tests/integration/minigame.crystalPathShattered.integration.test.ts',
  },
  rescueTheKing: {
    input: 'pointer/touch board movement',
    scoring: 'higher',
    tie: 'Higher rescue score; then lower supplied tiebreaker.',
    logic: 'tests/unit/rescue-the-king/logic.test.ts',
    risk: 'Browser smoke is currently the only real-component host evidence.',
  },
  trapAuction: {
    input: 'pointer/touch bid and target controls',
    scoring: 'custom',
    tie: 'Authoritative auction rules resolve equal bids and return one winner.',
    logic: 'tests/unit/trapAuction/trapAuction.logic.test.ts',
    component: 'tests/unit/trapAuction/trapAuction.component.test.tsx',
    risk: 'Bid idempotency needs store/host integration evidence.',
  },
  gridOfLuck: {
    input: 'pointer/touch grid-cell choice',
    scoring: 'placement',
    tie: 'Seeded grid rules return one authoritative winner for two to four players.',
    logic: 'tests/unit/gridOfLuck.logic.test.ts',
    component: 'tests/unit/gridOfLuck.component.test.tsx',
    host: 'tests/minigameHost.gridOfLuck.test.tsx',
  },
  bigSpender: {
    input: 'pointer/touch spend-or-bank decision',
    scoring: 'placement',
    tie: 'Authoritative elimination rules resolve equal balances deterministically.',
    logic: 'tests/unit/big-spender/bigSpenderLogic.test.ts',
    risk: 'No focused component or store/host Vitest test.',
  },
  chainOfGreed: {
    input: 'pointer/touch split, steal, vote, and duel choices',
    scoring: 'placement',
    tie: 'A genuinely tied elimination vote triggers the deterministic duel policy.',
    logic: 'tests/unit/chain-of-greed/chainOfGreed.logic.test.ts',
    component: 'tests/unit/chain-of-greed/ChainOfGreed.component.test.tsx',
    host: 'tests/integration/minigame.chainOfGreed.integration.test.ts',
  },
  batteryLow: {
    input: 'pointer/touch charge allocation',
    scoring: 'survival',
    tie: 'Authoritative charge/elimination rules return one placement winner.',
    logic: 'tests/unit/battery-low/batteryLow.logic.test.ts',
    risk: 'No focused component or store/host integration test.',
  },
  houseOfDarkness: {
    input: 'pointer/touch memory-card selection',
    scoring: 'survival',
    tie: 'More completed rounds, then remaining lifespan, lower total damage, fewer mistakes, faster total time, and stable participant order.',
    logic: 'tests/unit/house-of-darkness/houseOfDarknessUtils.test.ts',
    component: 'tests/unit/house-of-darkness/HouseOfDarknessComp.test.tsx',
    host: 'tests/unit/house-of-darkness/houseOfDarknessRegistry.test.ts',
    risk: 'Long multi-round completion still needs a real browser terminal-path driver.',
  },
}

function describeTimeout(game: GameRegistryEntry): string {
  return game.timeLimitMs > 0
    ? `Registry boundary: ${game.timeLimitMs} ms; boundary completion must be deterministic.`
    : 'Component-owned timer or no global limit; late timers cannot change an accepted result.'
}

export function getMinigameQualityMatrix(): MinigameQualityRow[] {
  return getPoolByFilter({ retired: false }).map((game) => {
    const detail = ACTIVE_MINIGAME_QUALITY_DETAILS[game.key]
    if (!detail) throw new Error(`Active minigame ${game.key} has no quality detail profile`)

    return {
      registryId: game.key,
      displayName: game.title,
      supportedModes: ['season competition through MinigameHost', 'registry-backed Minigame Lab'],
      minimumParticipants: game.minPlayers ?? 1,
      maximumParticipants: game.maxPlayers ?? null,
      participantBoundsAreExplicit: game.minPlayers != null || game.maxPlayers != null,
      humanPath: 'Real interactive component mounted through MinigameHost.',
      aiPath: 'Seeded competition AI participates under the same ranking contract.',
      spectatorPath: 'Host/spectator outcome uses the same participant and result contract.',
      primaryInput: detail.input,
      scoringDirection: detail.scoring,
      tiePolicy: detail.tie,
      timeoutPolicy: describeTimeout(game),
      partialCompletionPolicy: 'Exit records a partial result; explicit Continue commits it.',
      retryAndDismissalPolicy:
        'Retry resets one attempt; dismissal/late callbacks cannot commit twice.',
      authoritativeResultShape: game.authoritative
        ? 'Finite raw value plus authoritativeWinnerId from the participant set; optional rawResults, last place, and tiebreaker.'
        : 'Finite human raw value plus optional tiebreaker; MinigameHost combines it with AI results.',
      seasonStateEffects:
        'Parent applies result, announcement, reward, history, and phase transition exactly once.',
      evidence: {
        logic: [detail.logic],
        component: detail.component ? [detail.component] : [],
        host: detail.host ? [detail.host] : [],
        playwright: [HOST_BROWSER_SMOKE],
      },
      uncoveredRisks: detail.risk ? [detail.risk] : [],
    }
  })
}
