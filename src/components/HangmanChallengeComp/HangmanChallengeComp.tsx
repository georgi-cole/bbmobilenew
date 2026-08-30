import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react'
import type { MinigameParticipant, ReactMinigameCompletion } from '../MinigameHost/MinigameHost'
import {
  MYSTERY_BOX_POOL,
  buildClue,
  buildDisplayTokens,
  calculateRoundScore,
  computeRevealRatio,
  getCategoryFamily,
  isLetter,
  isWordSolved,
  normalizeWord,
  pickRoundWords,
  shouldAttemptMysterySpawn,
  shouldForceSecondMysteryBox,
  type MysteryBoxDefinition,
  type RoundScoreBreakdown,
  type ScoreLineItem,
} from './hangmanChallengeEngine'
import './HangmanChallengeComp.css'
import { sanitizeVerdictBoardLetterInput } from './verdictBoardInput'

const TOTAL_ROUNDS = 5
const MAX_ERRORS = 7
const TIMER_STEP_MS = 250
const BOX_LOCK_MS = 12_000
const DISTORT_MS = 7_000
const DISABLE_KEYBOARD_MS = 6_000
const FREEZE_MS = 8_000
const FREEZE_TRADEOFF_MS = 6_000
const SLOW_MS = 12_000
const DOUBLE_MS = 8_000
const TIME_PENALTY_SURGE_MS = 10_000
const SCORE_CUT_MULTIPLIER = 0.88
const MEDALS = ['🥇', '🥈', '🥉']
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const PRESSURE_CRACK_INDICES = Array.from({ length: MAX_ERRORS }, (_, index) => index)

const participantFallbacks: Array<
  Pick<MinigameParticipant, 'id' | 'name' | 'isHuman' | 'precomputedScore' | 'previousPR'>
> = [
  { id: 'you', name: 'You', isHuman: true, precomputedScore: 0, previousPR: null },
  { id: 'warden', name: 'Warden', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'specter', name: 'Specter', isHuman: false, precomputedScore: 0, previousPR: null },
  { id: 'oracle', name: 'Oracle', isHuman: false, precomputedScore: 0, previousPR: null },
]

type GamePhase = 'intro' | 'playing' | 'breakdown' | 'scoreboard' | 'final'

type TimedEffectKind =
  | 'freeze_timer'
  | 'slow_timer'
  | 'double_speed'
  | 'higher_time_penalty'
  | 'lock_boxes'
  | 'distort_used'
  | 'disable_keyboard'

interface ActiveTimedEffect {
  id: TimedEffectKind
  label: string
  remainingMs: number
}

interface VisibleMysteryBox {
  id: number
  spawnedAtSecond: number
}

type MysteryBoxDialog =
  | { stage: 'offer' }
  | { stage: 'result'; effect: MysteryBoxDefinition }
  | null

interface RoundSummary {
  participantId: string
  participantName: string
  avatarText: string
  roundNumber: number
  word: string
  solved: boolean
  errors: number
  elapsedSeconds: number
  boxesOpened: number
  roundScore: number
  cumulativeScore: number
  appliedEffects: string[]
}

interface AttemptedLetter {
  letter: string
  result: 'correct' | 'wrong'
}

interface RoundState {
  attemptedLetters: AttemptedLetter[]
  guessedLetters: string[]
  revealedLetters: string[]
  wrongLetters: string[]
  wrongCount: number
  elapsedMs: number
  timePenaltyPoints: number
  visibleBox: VisibleMysteryBox | null
  boxesSpawned: number
  boxesOpened: number
  activeTimedEffects: ActiveTimedEffect[]
  disabledLetters: string[]
  clueMessage: string | null
  boxLog: string[]
  scoreAdjustments: ScoreLineItem[]
  scoreMultiplier: number
  perfectEligible: boolean
  shieldNextWrong: boolean
  nextWrongDouble: boolean
  nextWrongExtraPenalty: boolean
  waiveNextPenalty: boolean
  hiddenRiskArmed: boolean
  bonusTokenPoints: number
  boardFlash: 'correct' | 'wrong' | 'spawn' | 'solved' | 'failed' | null
}

interface Props {
  onFinish?: (value: number, tiebreakerMs?: number, completion?: ReactMinigameCompletion) => void
  seed?: number
  participantIds?: string[]
  participants?: MinigameParticipant[]
  autoStart?: boolean
}

function createEmptyRoundState(): RoundState {
  return {
    attemptedLetters: [],
    guessedLetters: [],
    revealedLetters: [],
    wrongLetters: [],
    wrongCount: 0,
    elapsedMs: 0,
    timePenaltyPoints: 0,
    visibleBox: null,
    boxesSpawned: 0,
    boxesOpened: 0,
    activeTimedEffects: [],
    disabledLetters: [],
    clueMessage: null,
    boxLog: [],
    scoreAdjustments: [],
    scoreMultiplier: 1,
    perfectEligible: true,
    shieldNextWrong: false,
    nextWrongDouble: false,
    nextWrongExtraPenalty: false,
    waiveNextPenalty: false,
    hiddenRiskArmed: false,
    bonusTokenPoints: 0,
    boardFlash: null,
  }
}

function hashString(input: string): number {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function initialAvatar(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'
  )
}

function secondsLabel(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function findRandomHiddenLetters(
  word: string,
  guessedLetters: string[],
  revealedLetters: string[],
  amount: number,
  rng: () => number
): string[] {
  const guessed = new Set(
    [...guessedLetters, ...revealedLetters].map((letter) => letter.toUpperCase())
  )
  const hiddenUnique = Array.from(
    new Set(
      normalizeWord(word)
        .split('')
        .filter((char) => isLetter(char) && !guessed.has(char))
    )
  )
  const chosen: string[] = []
  while (hiddenUnique.length > 0 && chosen.length < amount) {
    const index = Math.floor(rng() * hiddenUnique.length)
    const [letter] = hiddenUnique.splice(index, 1)
    chosen.push(letter)
  }
  return chosen
}

function chooseDisabledLetters(
  alphabet: string[],
  guessedLetters: string[],
  disabledLetters: string[],
  rng: () => number
): string[] {
  const blocked = new Set([...guessedLetters, ...disabledLetters])
  const available = alphabet.filter((letter) => !blocked.has(letter))
  const picks: string[] = []
  while (available.length > 0 && picks.length < 3) {
    const index = Math.floor(rng() * available.length)
    const [letter] = available.splice(index, 1)
    picks.push(letter)
  }
  return picks
}

function sortedLeaderboard(entries: RoundSummary[]): RoundSummary[] {
  return [...entries].sort((a, b) => {
    if (b.cumulativeScore !== a.cumulativeScore) return b.cumulativeScore - a.cumulativeScore
    if (b.roundScore !== a.roundScore) return b.roundScore - a.roundScore
    if (a.elapsedSeconds !== b.elapsedSeconds) return a.elapsedSeconds - b.elapsedSeconds
    return a.participantName.localeCompare(b.participantName)
  })
}

function formatAdjustment(value: number): string {
  return `${value >= 0 ? '+' : ''}${value}`
}

export default function HangmanChallengeComp({
  onFinish,
  seed = 0,
  participantIds = [],
  participants,
}: Props) {
  const resolvedParticipants = useMemo<MinigameParticipant[]>(() => {
    if (participants && participants.length > 0) return participants
    if (participantIds.length > 0) {
      return participantIds.map((id, index) => ({
        id,
        name: index === 0 ? 'You' : `Contestant ${index + 1}`,
        isHuman: index === 0,
        precomputedScore: 0,
        previousPR: null,
      }))
    }
    return participantFallbacks
  }, [participantIds, participants])

  const humanParticipant = useMemo(
    () =>
      resolvedParticipants.find((participant) => participant.isHuman) ?? resolvedParticipants[0],
    [resolvedParticipants]
  )
  const roundWords = useMemo(() => pickRoundWords(seed >>> 0), [seed])
  const rngRef = useRef<() => number>(() => Math.random())
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spawnCheckpointRef = useRef<Set<number>>(new Set())
  const visibleBoxIdRef = useRef(0)

  const [phase, setPhase] = useState<GamePhase>('intro')
  const [roundIndex, setRoundIndex] = useState(0)
  const [roundState, setRoundState] = useState<RoundState>(createEmptyRoundState)
  const [mysteryBoxDialog, setMysteryBoxDialog] = useState<MysteryBoxDialog>(null)
  const [breakdown, setBreakdown] = useState<RoundScoreBreakdown | null>(null)
  const [animatedRoundScore, setAnimatedRoundScore] = useState(0)
  const [roundLeaderboard, setRoundLeaderboard] = useState<RoundSummary[]>([])
  const [letterInput, setLetterInput] = useState('')
  const [cumulativeScores, setCumulativeScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(resolvedParticipants.map((participant) => [participant.id, 0]))
  )
  const [roundHistory, setRoundHistory] = useState<RoundSummary[][]>([])

  useEffect(() => {
    rngRef.current = (() => {
      let state = (seed ^ 0x9e3779b9) >>> 0
      return () => {
        state = Math.imul(state + 0x6d2b79f5, 1) >>> 0
        state ^= state >>> 15
        state = Math.imul(state | 1, state ^ (state >>> 7)) >>> 0
        return ((state ^ (state >>> 14)) >>> 0) / 4294967296
      }
    })()
  }, [seed])

  const currentWord = roundWords[roundIndex]
  const displayTokens = useMemo(
    () =>
      buildDisplayTokens(currentWord.text, roundState.guessedLetters, roundState.revealedLetters),
    [currentWord.text, roundState.guessedLetters, roundState.revealedLetters]
  )
  const solved = useMemo(
    () => isWordSolved(currentWord.text, roundState.guessedLetters, roundState.revealedLetters),
    [currentWord.text, roundState.guessedLetters, roundState.revealedLetters]
  )
  const elapsedSeconds = Math.floor(roundState.elapsedMs / 1000)
  const revealRatio = useMemo(
    () =>
      computeRevealRatio(currentWord.text, roundState.guessedLetters, roundState.revealedLetters),
    [currentWord.text, roundState.guessedLetters, roundState.revealedLetters]
  )
  const boxesLocked = roundState.activeTimedEffects.some((effect) => effect.id === 'lock_boxes')
  const keyboardDistorted = roundState.activeTimedEffects.some(
    (effect) => effect.id === 'distort_used'
  )
  const pressureRatio = roundState.wrongCount / MAX_ERRORS
  const pressureFill =
    roundState.wrongCount >= MAX_ERRORS
      ? 'linear-gradient(180deg, rgba(255, 112, 112, 0.96), rgba(120, 18, 36, 0.94))'
      : roundState.wrongCount >= MAX_ERRORS - 1
        ? 'linear-gradient(180deg, rgba(255, 134, 98, 0.96), rgba(172, 42, 56, 0.94))'
        : roundState.wrongCount >= 4
          ? 'linear-gradient(180deg, rgba(255, 177, 96, 0.96), rgba(208, 86, 52, 0.92))'
          : roundState.wrongCount >= 2
            ? 'linear-gradient(180deg, rgba(255, 214, 120, 0.96), rgba(227, 128, 70, 0.92))'
            : 'linear-gradient(180deg, rgba(111, 220, 255, 0.94), rgba(53, 135, 224, 0.9))'
  const normalizedInput = sanitizeVerdictBoardLetterInput(letterInput)
  const inputIsUsed =
    normalizedInput.length > 0 &&
    (roundState.guessedLetters.includes(normalizedInput) ||
      roundState.wrongLetters.includes(normalizedInput))
  const inputIsDisabled =
    normalizedInput.length > 0 && roundState.disabledLetters.includes(normalizedInput)
  const canSubmitInput = normalizedInput.length > 0 && !inputIsUsed && !inputIsDisabled

  const badgeLabels = useMemo(() => {
    const labels = roundState.activeTimedEffects.map(
      (effect) => `${effect.label} ${Math.ceil(effect.remainingMs / 1000)}s`
    )
    if (roundState.shieldNextWrong) labels.push('Shielded wrong guess')
    if (roundState.nextWrongDouble) labels.push('Next wrong counts double')
    if (roundState.nextWrongExtraPenalty) labels.push('Next wrong: -40')
    if (roundState.waiveNextPenalty) labels.push('Next box score penalty waived')
    if (roundState.hiddenRiskArmed) labels.push('Hidden fail risk')
    return labels
  }, [
    roundState.activeTimedEffects,
    roundState.hiddenRiskArmed,
    roundState.nextWrongDouble,
    roundState.nextWrongExtraPenalty,
    roundState.shieldNextWrong,
    roundState.waiveNextPenalty,
  ])

  const resetRound = useCallback(() => {
    spawnCheckpointRef.current = new Set()
    setRoundState(createEmptyRoundState())
    setBreakdown(null)
    setAnimatedRoundScore(0)
    setLetterInput('')
    setMysteryBoxDialog(null)
  }, [])

  useEffect(() => {
    if (phase !== 'playing') return undefined
    const interval = setInterval(() => {
      setRoundState((prev) => {
        const nextEffects = prev.activeTimedEffects
          .map((effect) => ({
            ...effect,
            remainingMs: Math.max(0, effect.remainingMs - TIMER_STEP_MS),
          }))
          .filter((effect) => effect.remainingMs > 0)
        const frozen = nextEffects.some((effect) => effect.id === 'freeze_timer')
        const slowed = nextEffects.some((effect) => effect.id === 'slow_timer')
        const doubled = nextEffects.some((effect) => effect.id === 'double_speed')
        const penaltyRate = nextEffects.some((effect) => effect.id === 'higher_time_penalty')
          ? 6
          : 4
        const speed = frozen ? 0 : doubled ? 2 : slowed ? 0.75 : 1
        const deltaElapsed = TIMER_STEP_MS * speed
        const keepDisabled = nextEffects.some((effect) => effect.id === 'disable_keyboard')
          ? prev.disabledLetters
          : []
        return {
          ...prev,
          activeTimedEffects: nextEffects,
          disabledLetters: keepDisabled,
          elapsedMs: prev.elapsedMs + deltaElapsed,
          timePenaltyPoints: prev.timePenaltyPoints + (deltaElapsed / 1000) * penaltyRate,
        }
      })
    }, TIMER_STEP_MS)
    return () => clearInterval(interval)
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing') return
    if (roundState.visibleBox || roundState.boxesSpawned >= 3) return
    if (spawnCheckpointRef.current.has(elapsedSeconds)) return

    if (shouldAttemptMysterySpawn(elapsedSeconds)) {
      spawnCheckpointRef.current.add(elapsedSeconds)
      const shouldSpawnBox =
        elapsedSeconds === 9 || (elapsedSeconds !== 9 && rngRef.current() <= 0.25)
      if (shouldSpawnBox) {
        visibleBoxIdRef.current += 1
        setRoundState((prev) => ({
          ...prev,
          visibleBox: { id: visibleBoxIdRef.current, spawnedAtSecond: elapsedSeconds },
          boxesSpawned: prev.boxesSpawned + 1,
          boardFlash: 'spawn',
        }))
      }
      return
    }

    if (shouldForceSecondMysteryBox(elapsedSeconds, roundState.boxesSpawned)) {
      spawnCheckpointRef.current.add(elapsedSeconds)
      visibleBoxIdRef.current += 1
      setRoundState((prev) => ({
        ...prev,
        visibleBox: { id: visibleBoxIdRef.current, spawnedAtSecond: elapsedSeconds },
        boxesSpawned: prev.boxesSpawned + 1,
        boardFlash: 'spawn',
      }))
    }
  }, [elapsedSeconds, phase, roundState.boxesSpawned, roundState.visibleBox])

  useEffect(() => {
    if (!roundState.boardFlash) return undefined
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = setTimeout(() => {
      setRoundState((prev) => ({ ...prev, boardFlash: null }))
    }, 450)
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current)
    }
  }, [roundState.boardFlash])

  const chooseMysteryEffect = useCallback((): MysteryBoxDefinition => {
    const activeKinds = new Set(roundState.activeTimedEffects.map((effect) => effect.id))
    const categoryRoll = rngRef.current()
    const targetCategory =
      categoryRoll < 0.5 ? 'positive' : categoryRoll < 0.8 ? 'tradeoff' : 'cripple'
    let eligible = MYSTERY_BOX_POOL.filter((effect) => effect.category === targetCategory)
    eligible = eligible.filter((effect) => {
      if (effect.id === 'double_speed' && activeKinds.has('double_speed')) return false
      if (
        effect.id === 'freeze_timer' &&
        (activeKinds.has('freeze_timer') || activeKinds.has('double_speed'))
      )
        return false
      if (
        effect.id === 'slow_timer' &&
        (activeKinds.has('slow_timer') || activeKinds.has('double_speed'))
      )
        return false
      if (effect.id === 'higher_time_penalty' && activeKinds.has('higher_time_penalty'))
        return false
      if (effect.id === 'lock_boxes' && activeKinds.has('lock_boxes')) return false
      if (effect.id === 'distort_used' && activeKinds.has('distort_used')) return false
      if (effect.id === 'disable_keyboard' && activeKinds.has('disable_keyboard')) return false
      return true
    })
    const pool = eligible.length > 0 ? eligible : MYSTERY_BOX_POOL
    return pool[Math.floor(rngRef.current() * pool.length)]
  }, [roundState.activeTimedEffects])

  const openMysteryBox = useCallback(() => {
    if (!roundState.visibleBox || phase !== 'playing' || boxesLocked) return
    const effect = chooseMysteryEffect()
    setMysteryBoxDialog({ stage: 'result', effect })
    const hiddenLetters = () =>
      findRandomHiddenLetters(
        currentWord.text,
        roundState.guessedLetters,
        roundState.revealedLetters,
        2,
        rngRef.current
      )

    setRoundState((prev) => {
      const nextState: RoundState = {
        ...prev,
        visibleBox: null,
        boxesOpened: prev.boxesOpened + 1,
      }
      const adjustments = [...prev.scoreAdjustments]
      const effectLabels = [...prev.boxLog]
      const penaltyProtected = prev.waiveNextPenalty
      const pushAdjustment = (label: string, value: number) => {
        adjustments.push({ label, value: penaltyProtected && value < 0 ? 0 : value })
      }
      const revealed = [...prev.revealedLetters]
      const log = (message: string) => effectLabels.unshift(message)

      switch (effect.id) {
        case 'reveal_one': {
          revealed.push(
            ...findRandomHiddenLetters(
              currentWord.text,
              prev.guessedLetters,
              prev.revealedLetters,
              1,
              rngRef.current
            )
          )
          log('Mystery Box: 1 letter revealed')
          break
        }
        case 'reveal_two': {
          revealed.push(...hiddenLetters())
          log('Mystery Box: 2 letters revealed')
          break
        }
        case 'freeze_timer': {
          nextState.activeTimedEffects = [
            ...prev.activeTimedEffects.filter((entry) => entry.id !== 'freeze_timer'),
            { id: 'freeze_timer', label: 'Timer frozen', remainingMs: FREEZE_MS },
          ]
          log('Mystery Box: timer frozen for 8s')
          break
        }
        case 'remove_one_error': {
          nextState.wrongCount = Math.max(0, prev.wrongCount - 1)
          if (prev.wrongLetters.length > 0) {
            nextState.wrongLetters = prev.wrongLetters.slice(0, -1)
          }
          log('Mystery Box: 1 wrong guess erased')
          break
        }
        case 'shield_wrong': {
          nextState.shieldNextWrong = true
          log('Mystery Box: next wrong guess shielded')
          break
        }
        case 'vague_clue': {
          nextState.clueMessage = buildClue(currentWord, 'vague')
          log('Mystery Box: clue acquired')
          break
        }
        case 'vowel_scan': {
          const hiddenVowelsExist = normalizeWord(currentWord.text)
            .split('')
            .some(
              (char) =>
                'AEIOU'.includes(char) &&
                !prev.guessedLetters.includes(char) &&
                !prev.revealedLetters.includes(char)
            )
          nextState.clueMessage = hiddenVowelsExist
            ? 'Scan result: hidden vowels are still in play.'
            : 'Scan result: no hidden vowels remain.'
          log('Mystery Box: vowel scan complete')
          break
        }
        case 'bonus_token': {
          nextState.bonusTokenPoints = prev.bonusTokenPoints + 75
          log('Mystery Box: +75 bonus token banked')
          break
        }
        case 'slow_timer': {
          nextState.activeTimedEffects = [
            ...prev.activeTimedEffects.filter((entry) => entry.id !== 'slow_timer'),
            { id: 'slow_timer', label: 'Clock slowed', remainingMs: SLOW_MS },
          ]
          log('Mystery Box: timer slowed for 12s')
          break
        }
        case 'waive_penalty': {
          nextState.waiveNextPenalty = true
          log('Mystery Box: next score penalty waived')
          break
        }
        case 'reveal_plus_time': {
          revealed.push(
            ...findRandomHiddenLetters(
              currentWord.text,
              prev.guessedLetters,
              prev.revealedLetters,
              1,
              rngRef.current
            )
          )
          nextState.elapsedMs = prev.elapsedMs + 10_000
          nextState.timePenaltyPoints = prev.timePenaltyPoints + 40
          log('Mystery Box: 1 letter for +10s')
          break
        }
        case 'double_reveal_score_cut': {
          revealed.push(...hiddenLetters())
          nextState.scoreMultiplier = penaltyProtected
            ? prev.scoreMultiplier
            : prev.scoreMultiplier * SCORE_CUT_MULTIPLIER
          log(
            penaltyProtected
              ? 'Mystery Box: score cut neutralized'
              : 'Mystery Box: 12% score cut applied'
          )
          break
        }
        case 'strong_clue_double_wrong': {
          nextState.clueMessage = buildClue(currentWord, 'clear')
          nextState.nextWrongDouble = true
          log('Mystery Box: sharper clue, next wrong counts double')
          break
        }
        case 'freeze_breaks_perfect': {
          nextState.activeTimedEffects = [
            ...prev.activeTimedEffects.filter((entry) => entry.id !== 'freeze_timer'),
            { id: 'freeze_timer', label: 'Cold pause', remainingMs: FREEZE_TRADEOFF_MS },
          ]
          nextState.perfectEligible = false
          log('Mystery Box: timer frozen, perfect bonus lost')
          break
        }
        case 'remove_two_errors_minus_100': {
          nextState.wrongCount = Math.max(0, prev.wrongCount - 2)
          nextState.wrongLetters = prev.wrongLetters.slice(
            0,
            Math.max(0, prev.wrongLetters.length - 2)
          )
          pushAdjustment('Heavy bargain', -100)
          log('Mystery Box: -100 for pressure relief')
          break
        }
        case 'family_clue_plus_time': {
          nextState.clueMessage = `Family clue: this belongs to ${getCategoryFamily(currentWord)}.`
          nextState.elapsedMs = prev.elapsedMs + 5_000
          nextState.timePenaltyPoints = prev.timePenaltyPoints + 20
          log('Mystery Box: family clue for +5s')
          break
        }
        case 'double_speed': {
          nextState.activeTimedEffects = [
            ...prev.activeTimedEffects.filter((entry) => entry.id !== 'double_speed'),
            { id: 'double_speed', label: 'Clock doubled', remainingMs: DOUBLE_MS },
          ]
          log('Mystery Box: timer speed doubled')
          break
        }
        case 'disable_keyboard': {
          nextState.activeTimedEffects = [
            ...prev.activeTimedEffects.filter((entry) => entry.id !== 'disable_keyboard'),
            { id: 'disable_keyboard', label: 'Signal jam', remainingMs: DISABLE_KEYBOARD_MS },
          ]
          nextState.disabledLetters = chooseDisabledLetters(
            ALPHABET,
            [...prev.guessedLetters, ...prev.wrongLetters],
            prev.disabledLetters,
            rngRef.current
          )
          log('Mystery Box: 3 letters disabled briefly')
          break
        }
        case 'distort_used': {
          nextState.activeTimedEffects = [
            ...prev.activeTimedEffects.filter((entry) => entry.id !== 'distort_used'),
            { id: 'distort_used', label: 'Static wash', remainingMs: DISTORT_MS },
          ]
          log('Mystery Box: used-letter display distorted')
          break
        }
        case 'higher_time_penalty': {
          nextState.activeTimedEffects = [
            ...prev.activeTimedEffects.filter((entry) => entry.id !== 'higher_time_penalty'),
            {
              id: 'higher_time_penalty',
              label: 'Penalty surge',
              remainingMs: TIME_PENALTY_SURGE_MS,
            },
          ]
          log('Mystery Box: time penalty increased')
          break
        }
        case 'lock_boxes': {
          nextState.activeTimedEffects = [
            ...prev.activeTimedEffects.filter((entry) => entry.id !== 'lock_boxes'),
            { id: 'lock_boxes', label: 'Boxes locked', remainingMs: BOX_LOCK_MS },
          ]
          log('Mystery Box: boxes locked for 12s')
          break
        }
        case 'broad_clue': {
          nextState.clueMessage = buildClue(currentWord, 'broad')
          log('Mystery Box: broad clue received')
          break
        }
        case 'next_wrong_minus_40': {
          nextState.nextWrongExtraPenalty = true
          log('Mystery Box: next wrong adds -40')
          break
        }
        case 'hidden_risk': {
          nextState.hiddenRiskArmed = true
          log('Mystery Box: hidden fail risk armed')
          break
        }
        default:
          break
      }

      return {
        ...nextState,
        revealedLetters: Array.from(new Set(revealed)),
        scoreAdjustments: adjustments,
        waiveNextPenalty: effect.id === 'waive_penalty',
        boardFlash: 'spawn',
        boxLog: effectLabels.slice(0, 4),
      }
    })
  }, [
    boxesLocked,
    chooseMysteryEffect,
    currentWord,
    phase,
    roundState.guessedLetters,
    roundState.revealedLetters,
    roundState.visibleBox,
  ])

  const rejectMysteryBox = useCallback(() => {
    setRoundState((previous) => ({ ...previous, visibleBox: null }))
    setMysteryBoxDialog(null)
  }, [])

  const guessLetter = useCallback(
    (letter: string) => {
      if (phase !== 'playing') return
      if (
        roundState.guessedLetters.includes(letter) ||
        roundState.wrongLetters.includes(letter) ||
        roundState.disabledLetters.includes(letter)
      ) {
        return
      }
      const isCorrect = normalizeWord(currentWord.text).includes(letter)
      setRoundState((prev) => {
        if (isCorrect) {
          return {
            ...prev,
            attemptedLetters: [...prev.attemptedLetters, { letter, result: 'correct' }],
            guessedLetters: [...prev.guessedLetters, letter],
            boardFlash: 'correct',
          }
        }

        const adjustments = [...prev.scoreAdjustments]
        const wrongIncrement = prev.shieldNextWrong ? 0 : prev.nextWrongDouble ? 2 : 1
        const nextWrongCount = clamp(prev.wrongCount + wrongIncrement, 0, MAX_ERRORS)
        if (prev.nextWrongExtraPenalty) adjustments.push({ label: 'Risk marker', value: -40 })
        return {
          ...prev,
          attemptedLetters: [...prev.attemptedLetters, { letter, result: 'wrong' }],
          wrongLetters: [...prev.wrongLetters, letter],
          wrongCount: nextWrongCount,
          scoreAdjustments: adjustments,
          shieldNextWrong: false,
          nextWrongDouble: false,
          nextWrongExtraPenalty: false,
          guessedLetters: [...prev.guessedLetters],
          boardFlash: nextWrongCount >= MAX_ERRORS ? 'failed' : 'wrong',
        }
      })
    },
    [
      currentWord.text,
      phase,
      roundState.disabledLetters,
      roundState.guessedLetters,
      roundState.wrongLetters,
    ]
  )

  const finishRound = useCallback(
    (roundSolved: boolean) => {
      const elapsed = Math.floor(roundState.elapsedMs / 1000)
      const baseBreakdown = calculateRoundScore({
        solved: roundSolved,
        errors: roundState.wrongCount,
        elapsedSeconds: elapsed,
        timePenaltyPoints: roundState.timePenaltyPoints,
        boxesOpened: roundState.boxesOpened,
        perfectEligible: roundState.perfectEligible,
        revealedRatio: revealRatio,
        mysteryAdjustments: [...roundState.scoreAdjustments],
        bonusTokenPoints: roundState.bonusTokenPoints,
      })

      const multiplierPenalty =
        roundState.scoreMultiplier < 1
          ? Math.round(
              (baseBreakdown.baseScore +
                baseBreakdown.errorPenalty +
                baseBreakdown.timePenalty +
                baseBreakdown.mysteryAdjustments.reduce((sum, item) => sum + item.value, 0) +
                baseBreakdown.bonuses.reduce((sum, item) => sum + item.value, 0)) *
                (roundState.scoreMultiplier - 1)
            )
          : 0
      const hiddenRiskPenalty = !roundSolved && roundState.hiddenRiskArmed ? -80 : 0
      const finalAdjustments = [...baseBreakdown.mysteryAdjustments]
      if (multiplierPenalty !== 0)
        finalAdjustments.push({ label: 'Score cut', value: multiplierPenalty })
      if (hiddenRiskPenalty !== 0)
        finalAdjustments.push({ label: 'Hidden risk', value: hiddenRiskPenalty })

      const finalBreakdown = calculateRoundScore({
        solved: roundSolved,
        errors: roundState.wrongCount,
        elapsedSeconds: elapsed,
        timePenaltyPoints: roundState.timePenaltyPoints,
        boxesOpened: roundState.boxesOpened,
        perfectEligible: roundState.perfectEligible,
        revealedRatio: revealRatio,
        mysteryAdjustments: finalAdjustments,
        bonusTokenPoints: roundState.bonusTokenPoints,
      })

      const simulateAiRound = (participant: MinigameParticipant): RoundSummary => {
        const localSeed =
          (seed ^ hashString(`${participant.id}-${roundIndex}-${currentWord.text}`)) >>> 0
        let localState = localSeed || 1
        const localRng = () => {
          localState = Math.imul(localState + 0x6d2b79f5, 1) >>> 0
          localState ^= localState >>> 15
          localState = Math.imul(localState | 1, localState ^ (localState >>> 7)) >>> 0
          return ((localState ^ (localState >>> 14)) >>> 0) / 4294967296
        }
        const skill = clamp(0.38 + (hashString(participant.id) % 45) / 100, 0.38, 0.82)
        const difficultyWeight = 0.08 * currentWord.difficulty
        const solveChance = clamp(0.8 - difficultyWeight + skill * 0.22, 0.28, 0.93)
        const aiSolved = localRng() < solveChance
        const boxesOpened = aiSolved ? Math.floor(localRng() * 2.2) : Math.floor(localRng() * 2.7)
        const elapsedSecondsAi = aiSolved
          ? Math.round(
              clamp(14 + currentWord.difficulty * 5 + (1 - skill) * 22 + localRng() * 12, 11, 62)
            )
          : Math.round(clamp(32 + currentWord.difficulty * 5 + localRng() * 18, 24, 78))
        const errors = aiSolved
          ? Math.round(
              clamp(
                (1 - skill) * 4 + currentWord.difficulty - 1 + localRng() * 2,
                0,
                MAX_ERRORS - 1
              )
            )
          : Math.round(clamp(3 + currentWord.difficulty * 0.8 + localRng() * 2.5, 2, MAX_ERRORS))
        const revealedRatioAi = aiSolved
          ? 1
          : clamp(0.18 + skill * 0.35 + localRng() * 0.2, 0.12, 0.74)
        const adjustments: ScoreLineItem[] = []
        const appliedEffects: string[] = []
        let bonusToken = 0
        if (boxesOpened > 0 && localRng() < 0.4) {
          adjustments.push({ label: 'AI mystery tradeoff', value: -40 })
          appliedEffects.push('Trade-off box')
        }
        if (boxesOpened > 1 && localRng() < 0.35) {
          bonusToken = 75
          appliedEffects.push('Score token')
        }
        const aiBreakdown = calculateRoundScore({
          solved: aiSolved,
          errors,
          elapsedSeconds: elapsedSecondsAi,
          timePenaltyPoints: elapsedSecondsAi * 4,
          boxesOpened,
          perfectEligible: true,
          revealedRatio: revealedRatioAi,
          mysteryAdjustments: adjustments,
          bonusTokenPoints: bonusToken,
        })
        const nextTotal = (cumulativeScores[participant.id] ?? 0) + aiBreakdown.finalRoundScore
        return {
          participantId: participant.id,
          participantName: participant.name,
          avatarText: initialAvatar(participant.name),
          roundNumber: roundIndex + 1,
          word: currentWord.text,
          solved: aiSolved,
          errors,
          elapsedSeconds: elapsedSecondsAi,
          boxesOpened,
          roundScore: aiBreakdown.finalRoundScore,
          cumulativeScore: nextTotal,
          appliedEffects,
        }
      }

      const humanRoundScore = finalBreakdown.finalRoundScore
      const humanSummary: RoundSummary = {
        participantId: humanParticipant.id,
        participantName: humanParticipant.name,
        avatarText: initialAvatar(humanParticipant.name),
        roundNumber: roundIndex + 1,
        word: currentWord.text,
        solved: roundSolved,
        errors: roundState.wrongCount,
        elapsedSeconds: elapsed,
        boxesOpened: roundState.boxesOpened,
        roundScore: humanRoundScore,
        cumulativeScore: (cumulativeScores[humanParticipant.id] ?? 0) + humanRoundScore,
        appliedEffects: roundState.boxLog,
      }

      const aiSummaries = resolvedParticipants
        .filter((participant) => participant.id !== humanParticipant.id)
        .map((participant) => simulateAiRound(participant))
      const nextLeaderboard = sortedLeaderboard([humanSummary, ...aiSummaries])
      const nextTotals = Object.fromEntries(
        nextLeaderboard.map((entry) => [entry.participantId, entry.cumulativeScore])
      )

      setBreakdown(finalBreakdown)
      setAnimatedRoundScore(0)
      setRoundLeaderboard(nextLeaderboard)
      setCumulativeScores((prev) => ({ ...prev, ...nextTotals }))
      setRoundHistory((prev) => [...prev, nextLeaderboard])
      setRoundState((prev) => ({
        ...prev,
        visibleBox: null,
        boardFlash: roundSolved ? 'solved' : 'failed',
      }))
      setPhase(roundIndex >= TOTAL_ROUNDS - 1 ? 'final' : 'breakdown')
    },
    [
      cumulativeScores,
      currentWord,
      humanParticipant,
      resolvedParticipants,
      revealRatio,
      roundIndex,
      roundState,
      seed,
    ]
  )

  useEffect(() => {
    if (phase !== 'playing') return
    if (solved) {
      const timeout = setTimeout(() => finishRound(true), 0)
      return () => clearTimeout(timeout)
    }
    if (roundState.wrongCount >= MAX_ERRORS) {
      const timeout = setTimeout(() => finishRound(false), 650)
      return () => clearTimeout(timeout)
    }
    return undefined
  }, [finishRound, phase, roundState.wrongCount, solved])

  const submitLetterGuess = useCallback(() => {
    if (!canSubmitInput) return
    guessLetter(normalizedInput)
    setLetterInput('')
  }, [canSubmitInput, guessLetter, normalizedInput])

  const handleLetterInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setLetterInput(sanitizeVerdictBoardLetterInput(event.target.value))
  }, [])

  const handleLetterInputSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      submitLetterGuess()
    },
    [submitLetterGuess]
  )

  const handleAlphabetPress = useCallback(
    (letter: string) => {
      if (
        roundState.guessedLetters.includes(letter) ||
        roundState.wrongLetters.includes(letter) ||
        roundState.disabledLetters.includes(letter)
      )
        return
      guessLetter(letter)
      setLetterInput('')
    },
    [guessLetter, roundState.disabledLetters, roundState.guessedLetters, roundState.wrongLetters]
  )

  useEffect(() => {
    if (phase !== 'breakdown' || !breakdown) return undefined
    const total = breakdown.finalRoundScore
    let frame = 0
    const interval = setInterval(() => {
      frame += 1
      const progress = Math.min(1, frame / 12)
      setAnimatedRoundScore(Math.round(total * progress))
      if (progress >= 1) clearInterval(interval)
    }, 45)
    return () => clearInterval(interval)
  }, [breakdown, phase])

  const finalRankings = useMemo(() => {
    if (roundHistory.length < TOTAL_ROUNDS) return []
    const latest = roundHistory[roundHistory.length - 1] ?? []
    return sortedLeaderboard(latest)
  }, [roundHistory])

  const finishCompetition = useCallback(() => {
    if (!onFinish || finalRankings.length === 0) return
    const rawResults = Object.fromEntries(
      finalRankings.map((entry) => [entry.participantId, entry.cumulativeScore])
    )
    const winner = finalRankings[0]
    onFinish(rawResults[humanParticipant.id] ?? winner.cumulativeScore, undefined, {
      authoritativeWinnerId: winner.participantId,
      rawValue: rawResults[humanParticipant.id] ?? winner.cumulativeScore,
      rawResults,
    })
  }, [finalRankings, humanParticipant.id, onFinish])

  const proceedFromScoreboard = useCallback(() => {
    if (roundIndex >= TOTAL_ROUNDS - 1) {
      setPhase('final')
      return
    }
    resetRound()
    setPhase('intro')
    setRoundIndex((prev) => prev + 1)
  }, [resetRound, roundIndex])

  const winnerNames =
    finalRankings.length > 0
      ? finalRankings
          .filter((entry) => entry.cumulativeScore === finalRankings[0].cumulativeScore)
          .map((entry) => entry.participantName)
      : []

  const mysteryBoxDialogView =
    mysteryBoxDialog ??
    (phase === 'playing' && roundState.visibleBox ? { stage: 'offer' as const } : null)

  return (
    <div
      className={`hangman-challenge${roundState.boardFlash ? ` hangman-challenge--${roundState.boardFlash}` : ''}`}
    >
      <div className="hangman-challenge__bg" aria-hidden="true" />
      <header className="hangman-challenge__header">
        <div>
          <p className="hangman-challenge__eyebrow">Verdict Board</p>
          <h2 className="hangman-challenge__title">
            Round {roundIndex + 1} of {TOTAL_ROUNDS}
          </h2>
          <p className="hangman-challenge__subtitle">
            Cumulative score: {cumulativeScores[humanParticipant.id] ?? 0}
          </p>
        </div>
        <div
          className={`hangman-challenge__timer${roundState.activeTimedEffects.some((effect) => effect.id === 'freeze_timer') ? ' is-frozen' : ''}${roundState.activeTimedEffects.some((effect) => effect.id === 'double_speed') ? ' is-urgent' : ''}`}
        >
          <span>Timer</span>
          <strong>{secondsLabel(elapsedSeconds)}</strong>
        </div>
      </header>

      {phase === 'intro' && (
        <section className="hangman-challenge__intro">
          <p className="hangman-challenge__intro-kicker">Pressure cycle engaged</p>
          <h3>{currentWord.category.toUpperCase()} FILE</h3>
          <p>
            {currentWord.difficulty <= 2
              ? 'Opening phase: common strategic language.'
              : currentWord.difficulty === 3
                ? 'Mid-cycle: layered terms and phrases.'
                : 'Final phase: prestige phrases and heavier ambiguity.'}
          </p>
          <button
            className="hangman-challenge__cta"
            type="button"
            onClick={() => setPhase('playing')}
          >
            Enter round
          </button>
        </section>
      )}

      {phase === 'playing' && (
        <>
          <section className="hangman-challenge__status-grid">
            <div className="hangman-challenge__pressure-card">
              <div className="hangman-challenge__pressure-head">
                <span>Pressure</span>
              </div>
              <div
                className={`hangman-challenge__pressure-glass${roundState.wrongCount >= MAX_ERRORS ? ' is-shattered' : ''}`}
                aria-hidden="true"
              >
                <div
                  className="hangman-challenge__pressure-glass-fill"
                  style={{ height: `${pressureRatio * 100}%`, background: pressureFill }}
                />
                {PRESSURE_CRACK_INDICES.map((index) => (
                  <span
                    key={index}
                    className={`hangman-challenge__pressure-crack hangman-challenge__pressure-crack--${(index % 4) + 1}${index < roundState.wrongCount ? ' is-visible' : ''}`}
                  />
                ))}
                {roundState.wrongCount >= MAX_ERRORS && (
                  <div className="hangman-challenge__shatter-burst">
                    {Array.from({ length: 7 }, (_, index) => (
                      <span
                        key={index}
                        className={`hangman-challenge__shard hangman-challenge__shard--${index + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="hangman-challenge__playfield">
            <section className="hangman-challenge__board" aria-label="Solution board">
              <div className="hangman-challenge__fracture-layer" aria-hidden="true" />
              <div className="hangman-challenge__tiles">
                {displayTokens.map((token, index) => (
                  <span
                    key={`${token}-${index}`}
                    className={`hangman-challenge__tile${token === '•' ? '' : ' is-revealed'}${token === ' ' ? ' is-gap' : ''}`}
                  >
                    {token === ' ' ? '' : token}
                  </span>
                ))}
              </div>
            </section>
            <section
              className={`hangman-challenge__keyboard-panel${keyboardDistorted ? ' is-distorted' : ''}`}
              aria-label="Letter entry"
            >
              <div className="hangman-challenge__used-head">
                <span>Letter entry</span>
                <strong>{roundState.attemptedLetters.length} tried</strong>
              </div>
              <form className="hangman-challenge__letter-form" onSubmit={handleLetterInputSubmit}>
                <label className="hangman-challenge__input-shell">
                  <span className="hangman-challenge__input-label">Guess a letter</span>
                  <input
                    aria-label="Guess a letter"
                    autoCapitalize="characters"
                    autoComplete="off"
                    className="hangman-challenge__letter-input"
                    inputMode="none"
                    maxLength={1}
                    onChange={handleLetterInputChange}
                    onFocus={(event) =>
                      event.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' })
                    }
                    pattern="[A-Za-z]"
                    placeholder="A–Z"
                    type="text"
                    value={letterInput}
                  />
                </label>
                <button
                  className="hangman-challenge__key hangman-challenge__submit"
                  disabled={!canSubmitInput}
                  type="submit"
                >
                  Guess
                </button>
              </form>
              <div className="hangman-challenge__alphabet" aria-label="Letter keyboard">
                {ALPHABET.map((letter) => {
                  const attempted =
                    roundState.guessedLetters.includes(letter) ||
                    roundState.wrongLetters.includes(letter)
                  const disabled = attempted || roundState.disabledLetters.includes(letter)
                  return (
                    <button
                      key={letter}
                      className={`hangman-challenge__alphabet-key${attempted ? ' is-used' : ''}`}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleAlphabetPress(letter)}
                      aria-label={`Letter ${letter}`}
                    >
                      {letter}
                    </button>
                  )
                })}
              </div>
              <p className="hangman-challenge__input-hint">
                {inputIsDisabled
                  ? `${normalizedInput} is jammed by the current signal effect.`
                  : inputIsUsed
                    ? `${normalizedInput} is already on the board.`
                    : roundState.disabledLetters.length > 0
                      ? `Jammed right now: ${roundState.disabledLetters.join(', ')}`
                      : 'Tap one letter at a time.'}
              </p>
              <div className="hangman-challenge__attempts" aria-label="Attempted letters">
                {roundState.attemptedLetters.length > 0 ? (
                  roundState.attemptedLetters.map(({ letter, result }, index) => (
                    <span
                      key={`${letter}-${index}`}
                      className={`hangman-challenge__attempt-chip${result === 'correct' ? ' is-correct' : ' is-wrong'}`}
                    >
                      {letter}
                    </span>
                  ))
                ) : (
                  <span className="hangman-challenge__attempt-empty">No letters called yet.</span>
                )}
              </div>
            </section>
          </section>

          {badgeLabels.length > 0 && (
            <div className="hangman-challenge__badges" aria-label="Active modifiers">
              {badgeLabels.map((label) => (
                <span key={label} className="hangman-challenge__badge">
                  {label}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {mysteryBoxDialogView && (
        <div className="hangman-challenge__mystery-layer" role="presentation">
          <section
            className="hangman-challenge__mystery-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              mysteryBoxDialogView.stage === 'offer'
                ? 'Mystery box available'
                : 'Mystery box effect applied'
            }
          >
            {mysteryBoxDialogView.stage === 'offer' ? (
              <>
                <p className="hangman-challenge__eyebrow">Mystery box</p>
                <h3>A sealed case is available</h3>
                <p>Open it for an immediate effect, or leave it and continue the round.</p>
                <div className="hangman-challenge__mystery-actions">
                  <button
                    type="button"
                    className="hangman-challenge__cta"
                    onClick={rejectMysteryBox}
                  >
                    Continue without it
                  </button>
                  <button
                    type="button"
                    className="hangman-challenge__cta hangman-challenge__cta--box"
                    disabled={boxesLocked}
                    autoFocus
                    onClick={openMysteryBox}
                  >
                    Open mystery box
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="hangman-challenge__eyebrow">Case effect applied</p>
                <h3>{mysteryBoxDialogView.effect.label}</h3>
                <p>{mysteryBoxDialogView.effect.description}</p>
                <button
                  type="button"
                  className="hangman-challenge__cta hangman-challenge__cta--box"
                  autoFocus
                  onClick={() => setMysteryBoxDialog(null)}
                >
                  OK
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {phase === 'breakdown' && breakdown && (
        <section className="hangman-challenge__overlay" aria-label="Round breakdown">
          <div className="hangman-challenge__overlay-card">
            <p className="hangman-challenge__eyebrow">Round {roundIndex + 1} breakdown</p>
            <h3>
              {displayTokens.every((token) => token !== '•')
                ? 'Board stabilized'
                : 'Board blackout'}
            </h3>
            <div className="hangman-challenge__score-burst">{animatedRoundScore}</div>
            <div className="hangman-challenge__breakdown-list">
              <div>
                <span>Base score</span>
                <strong>{formatAdjustment(breakdown.baseScore)}</strong>
              </div>
              <div>
                <span>Error penalty</span>
                <strong>{formatAdjustment(breakdown.errorPenalty)}</strong>
              </div>
              <div>
                <span>Time penalty</span>
                <strong>{formatAdjustment(breakdown.timePenalty)}</strong>
              </div>
              {breakdown.mysteryAdjustments.map((item) => (
                <div key={`${item.label}-${item.value}`}>
                  <span>{item.label}</span>
                  <strong>{formatAdjustment(item.value)}</strong>
                </div>
              ))}
              {breakdown.bonuses.map((item) => (
                <div key={`${item.label}-${item.value}`}>
                  <span>{item.label}</span>
                  <strong>{formatAdjustment(item.value)}</strong>
                </div>
              ))}
              <div className="is-final">
                <span>Final round score</span>
                <strong>{breakdown.finalRoundScore}</strong>
              </div>
            </div>
            <button
              className="hangman-challenge__cta"
              type="button"
              onClick={() => setPhase('scoreboard')}
            >
              Continue to scoreboard
            </button>
          </div>
        </section>
      )}

      {phase === 'scoreboard' && (
        <section className="hangman-challenge__overlay" aria-label="Round scoreboard">
          <div className="hangman-challenge__overlay-card hangman-challenge__overlay-card--scoreboard">
            <p className="hangman-challenge__eyebrow">Round {roundIndex + 1} standings</p>
            <h3>Round summary</h3>
            <div className="hangman-challenge__scoreboard">
              {roundLeaderboard.map((entry, index) => (
                <article className="hangman-challenge__score-row" key={entry.participantId}>
                  <div className="hangman-challenge__score-rank">
                    {MEDALS[index] ?? `#${index + 1}`}
                  </div>
                  <span className="hangman-challenge__avatar">{entry.avatarText}</span>
                  <strong className="hangman-challenge__score-name">{entry.participantName}</strong>
                  <span
                    className={`hangman-challenge__score-status${entry.solved ? ' is-solved' : ' is-failed'}`}
                    aria-label={entry.solved ? 'Solved' : 'Failed'}
                  >
                    {entry.solved ? '✓' : '—'}
                  </span>
                  <strong className="hangman-challenge__round-points">+{entry.roundScore}</strong>
                  <span className="hangman-challenge__score-inline-total">
                    Total <strong>{entry.cumulativeScore}</strong>
                  </span>
                </article>
              ))}
            </div>
            <button
              className="hangman-challenge__cta"
              type="button"
              onClick={proceedFromScoreboard}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {phase === 'final' && (
        <section
          className="hangman-challenge__overlay hangman-challenge__overlay--final"
          aria-label="Final results"
        >
          <div className="hangman-challenge__overlay-card hangman-challenge__overlay-card--scoreboard hangman-challenge__overlay-card--final">
            <p className="hangman-challenge__eyebrow">Final verdict</p>
            <div className="hangman-challenge__final-winner">
              <span>{winnerNames.length > 1 ? 'Joint winners' : 'Winner'}</span>
              <strong>{winnerNames.join(' & ') || 'Winner'}</strong>
              <em>{finalRankings[0]?.cumulativeScore ?? 0} points</em>
            </div>
            <div className="hangman-challenge__scoreboard">
              {finalRankings.map((entry, index) => (
                <article
                  className={`hangman-challenge__score-row${entry.cumulativeScore === finalRankings[0]?.cumulativeScore ? ' is-winner' : ''}`}
                  key={entry.participantId}
                >
                  <div className="hangman-challenge__score-rank">
                    {MEDALS[index] ?? `#${index + 1}`}
                  </div>
                  <span className="hangman-challenge__avatar">{entry.avatarText}</span>
                  <strong className="hangman-challenge__score-name">{entry.participantName}</strong>
                  <strong className="hangman-challenge__final-points">
                    {entry.cumulativeScore}
                  </strong>
                </article>
              ))}
            </div>
            <button className="hangman-challenge__cta" type="button" onClick={finishCompetition}>
              Lock verdict
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
