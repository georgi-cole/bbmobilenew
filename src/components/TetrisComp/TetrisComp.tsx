/**
 * Fit Me In — adaptive knockout tournament.
 *
 * 3 players: 90-second semifinal + 90-second final.
 * 4 players: qualifier + semifinal + final, 60 seconds each.
 * 5+ players: two qualifiers + semifinal + final, 60 seconds each.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useAppDispatch } from '../../store/hooks'
import {
  completeTetrisTournament,
  initTetris,
  resetTetris,
  type TetrisPrizeType,
} from '../../features/tetris/tetrisSlice'
import { resolveTetrisOutcome } from '../../features/tetris/thunks'
import { getMinigameAiModel, simulateAiPerformance } from '../../ai/competition/index'
import { mulberry32 } from '../../store/rng'
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper'
import type { MinigameParticipant, ReactMinigameCompletion } from '../MinigameHost/MinigameHost'
import {
  buildTetrisOutcomeScores,
  buildTetrisTournamentPlan,
  splitTetrisRound,
  type TetrisRoundPerformance,
  type TetrisRoundPlan,
  type TetrisRoundSplit,
} from './tournament'
import './TetrisComp.css'
import './TetrisTournament.css'

const COLS = 10
const ROWS = 20
const BUFFER_ROWS = 2
const TOTAL_ROWS = ROWS + BUFFER_ROWS
const CELL_PX = 28
const DANGER_ROW = 4
const LINE_CLEAR_POINTS = [0, 100, 300, 500, 800]
const SOFT_DROP_PER_ROW = 1
const HARD_DROP_PER_ROW = 2
const LINES_PER_LEVEL = 10
const WALL_KICK_OFFSETS = [0, -1, 1, -2, 2]
const MEDALS = ['🥇', '🥈', '🥉']

type PieceKey = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
type GamePhase = 'playing' | 'gameover'
type TournamentScreen = 'playing' | 'roundResults' | 'finalResults'
type RoundEndReason = 'time' | 'topout'

interface Piece {
  key: PieceKey
  shape: number[][]
  color: string
}

interface FallingPiece extends Piece {
  x: number
  y: number
  rotationIndex: number
}

interface BoardCell {
  color: string
  avatarId?: string
}

type Board = (BoardCell | null)[][]

interface DisplayCell extends BoardCell {
  kind: 'locked' | 'active' | 'ghost'
}

interface LineEffect {
  id: number
  rows: number[]
  kind: 'single' | 'double' | 'triple' | 'tetris'
}

interface LevelUpEffect {
  id: number
  level: number
}

interface RoundResult {
  plan: TetrisRoundPlan
  split: TetrisRoundSplit
  humanScore: number
  reason: RoundEndReason
}

interface FinalResult {
  rankingBestFirst: string[]
  visibleScores: Record<string, number>
  outcomeScores: Record<string, number>
  winnerId: string
  lastPlaceId: string
  humanScore: number
}

const SHAPES: Record<PieceKey, number[][]> = {
  I: [[1, 1, 1, 1]],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
}

const COLORS: Record<PieceKey, string> = {
  I: '#00d4ff',
  O: '#ffe000',
  T: '#c855f5',
  S: '#44ee66',
  Z: '#ff4444',
  J: '#4477ff',
  L: '#ff9000',
}

const PIECE_KEYS: PieceKey[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
let effectIdCounter = 0

function emptyBoard(): Board {
  return Array.from({ length: TOTAL_ROWS }, () => Array<BoardCell | null>(COLS).fill(null))
}

function rotateShape(shape: number[][]): number[][] {
  return shape[0].map((_, column) => shape.map((row) => row[column]).reverse())
}

function collides(board: Board, shape: number[][], x: number, y: number): boolean {
  for (let row = 0; row < shape.length; row++) {
    for (let column = 0; column < shape[row].length; column++) {
      if (!shape[row][column]) continue
      const nextX = x + column
      const nextY = y + row
      if (nextX < 0 || nextX >= COLS) return true
      if (nextY >= TOTAL_ROWS) return true
      if (nextY >= 0 && board[nextY][nextX] !== null) return true
    }
  }
  return false
}

function ghostY(board: Board, piece: FallingPiece): number {
  let y = piece.y
  while (!collides(board, piece.shape, piece.x, y + 1)) y++
  return y
}

function buildBag(rng: () => number): PieceKey[] {
  const bag = [...PIECE_KEYS]
  for (let index = bag.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1))
    ;[bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]]
  }
  return bag
}

function makePiece(key: PieceKey): Piece {
  return { key, shape: SHAPES[key].map((row) => [...row]), color: COLORS[key] }
}

function spawnFalling(key: PieceKey): FallingPiece {
  const piece = makePiece(key)
  return {
    ...piece,
    x: Math.floor((COLS - piece.shape[0].length) / 2),
    y: BUFFER_ROWS - piece.shape.length,
    rotationIndex: 0,
  }
}

function lockPiece(
  board: Board,
  piece: FallingPiece,
  createCell: (color: string) => BoardCell
): Board {
  const next = board.map((row) => [...row])
  for (let row = 0; row < piece.shape.length; row++) {
    for (let column = 0; column < piece.shape[row].length; column++) {
      if (!piece.shape[row][column]) continue
      const boardY = piece.y + row
      const boardX = piece.x + column
      if (boardY >= 0 && boardY < TOTAL_ROWS && boardX >= 0 && boardX < COLS) {
        next[boardY][boardX] = createCell(piece.color)
      }
    }
  }
  return next
}

function clearFullLines(board: Board): { clearedBoard: Board; clearedRows: number[] } {
  const clearedRows: number[] = []
  let remaining = board.filter((row, index) => {
    const full = row.every((cell) => cell !== null)
    if (full) clearedRows.push(index)
    return !full
  })

  while (remaining.length < TOTAL_ROWS) {
    remaining = [Array<BoardCell | null>(COLS).fill(null), ...remaining]
  }

  return { clearedBoard: remaining, clearedRows }
}

function boardInDanger(board: Board): boolean {
  for (let row = BUFFER_ROWS; row < BUFFER_ROWS + DANGER_ROW; row++) {
    if (board[row].some((cell) => cell !== null)) return true
  }
  return false
}

function boardStackHeight(board: Board): number {
  for (let row = BUFFER_ROWS; row < TOTAL_ROWS; row++) {
    if (board[row].some((cell) => cell !== null)) return TOTAL_ROWS - row
  }
  return 0
}

function dropIntervalMs(level: number, speedMultiplier: number): number {
  const standardInterval = 1000 - (Math.min(level, 20) - 1) * 47
  return Math.max(65, Math.round(standardInterval * speedMultiplier))
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)]
}

function formatTimer(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export interface TetrisCompProps {
  participantIds: string[]
  participants: MinigameParticipant[] | undefined
  prizeType: TetrisPrizeType
  seed: number
  onComplete: (completion?: ReactMinigameCompletion) => void
}

export default function TetrisComp({
  participantIds,
  participants,
  prizeType,
  seed,
  onComplete,
}: TetrisCompProps) {
  const dispatch = useAppDispatch()

  const participantRecords = useMemo<MinigameParticipant[]>(() => {
    const supplied = new Map(
      (participants ?? []).map((participant) => [participant.id, participant])
    )
    return participantIds.map(
      (id) =>
        supplied.get(id) ?? {
          id,
          name: id,
          isHuman: false,
          precomputedScore: 0,
          previousPR: null,
        }
    )
  }, [participantIds, participants])

  const participantById = useMemo(
    () => new Map(participantRecords.map((participant) => [participant.id, participant])),
    [participantRecords]
  )
  const humanId = participantRecords.find((participant) => participant.isHuman)?.id ?? null
  const avatarIds = useMemo(
    () => participantRecords.map((participant) => participant.id),
    [participantRecords]
  )
  const tournamentPlan = useMemo(
    () => buildTetrisTournamentPlan(Math.max(3, participantIds.length)),
    [participantIds.length]
  )

  const [screen, setScreen] = useState<TournamentScreen>('playing')
  const [currentRoundIndex, setCurrentRoundIndex] = useState(0)
  const [activeIds, setActiveIds] = useState<string[]>(participantIds)
  const [eliminationOrderWorstFirst, setEliminationOrderWorstFirst] = useState<string[]>([])
  const [roundResult, setRoundResult] = useState<RoundResult | null>(null)
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null)
  const [gamePhase, setGamePhase] = useState<GamePhase>('playing')
  const [roundEndReason, setRoundEndReason] = useState<RoundEndReason>('time')
  const [remainingMs, setRemainingMs] = useState(tournamentPlan[0].durationMs)
  const [board, setBoard] = useState<Board>(emptyBoard)
  const [current, setCurrent] = useState<FallingPiece | null>(null)
  const [held, setHeld] = useState<Piece | null>(null)
  const [canHold, setCanHold] = useState(true)
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [level, setLevel] = useState(1)
  const [pieces, setPieces] = useState(0)
  const [lineEffects, setLineEffects] = useState<LineEffect[]>([])
  const [levelUpEffects, setLevelUpEffects] = useState<LevelUpEffect[]>([])
  const [lockFlash, setLockFlash] = useState(false)
  const [isDanger, setIsDanger] = useState(false)
  const [simulatingRemainder, setSimulatingRemainder] = useState(false)
  const [upcoming, setUpcoming] = useState<PieceKey[]>([])

  const currentRound = tournamentPlan[currentRoundIndex]
  const rngRef = useRef<() => number>(mulberry32(seed >>> 0))
  const avatarRngRef = useRef<() => number>(mulberry32((seed ^ 0xa11ce) >>> 0))
  const bagRef = useRef<PieceKey[]>([])
  const upcomingRef = useRef<PieceKey[]>([])
  const boardRef = useRef<Board>(emptyBoard())
  const currentRef = useRef<FallingPiece | null>(null)
  const scoreRef = useRef(0)
  const linesRef = useRef(0)
  const levelRef = useRef(1)
  const piecesRef = useRef(0)
  const maxStackHeightRef = useRef(0)
  const canHoldRef = useRef(true)
  const heldRef = useRef<Piece | null>(null)
  const gamePhaseRef = useRef<GamePhase>('playing')
  const remainingMsRef = useRef(currentRound.durationMs)
  const roundEndingRef = useRef(false)
  const previousRoundScoresRef = useRef<Record<string, number>>({})
  const humanLastScoreRef = useRef(0)

  boardRef.current = board
  currentRef.current = current
  scoreRef.current = score
  linesRef.current = lines
  levelRef.current = level
  piecesRef.current = pieces
  canHoldRef.current = canHold
  heldRef.current = held
  gamePhaseRef.current = gamePhase
  remainingMsRef.current = remainingMs

  useEffect(() => {
    const participantNames = Object.fromEntries(
      participantRecords.map((participant) => [participant.id, participant.name])
    )
    dispatch(
      initTetris({
        participantIds,
        participantNames,
        humanPlayerId: humanId,
        competitionType: prizeType,
        seed,
        aiScores: {},
      })
    )

    return () => {
      dispatch(resetTetris())
    }
    // Competition inputs are immutable for the mounted minigame instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch])

  const refillBag = useCallback(() => {
    if (bagRef.current.length === 0) bagRef.current = buildBag(rngRef.current)
  }, [])

  const dequeue = useCallback((): PieceKey => {
    while (upcomingRef.current.length < 1) {
      refillBag()
      upcomingRef.current.push(bagRef.current.shift()!)
    }

    const key = upcomingRef.current.shift()!
    while (upcomingRef.current.length < 3) {
      refillBag()
      upcomingRef.current.push(bagRef.current.shift()!)
    }
    setUpcoming([...upcomingRef.current])
    return key
  }, [refillBag])

  const spawnPiece = useCallback(
    (currentBoard: Board): boolean => {
      const piece = spawnFalling(dequeue())
      if (collides(currentBoard, piece.shape, piece.x, piece.y)) return false
      currentRef.current = piece
      setCurrent(piece)
      return true
    },
    [dequeue]
  )

  const createLockedCell = useCallback(
    (color: string): BoardCell => {
      if (!currentRound.useHouseguestCells || avatarIds.length === 0) return { color }
      const avatarIndex = Math.floor(avatarRngRef.current() * avatarIds.length)
      return { color, avatarId: avatarIds[avatarIndex] }
    },
    [avatarIds, currentRound.useHouseguestCells]
  )

  const simulateAiRound = useCallback(
    (ids: readonly string[], roundIndex: number): TetrisRoundPerformance[] => {
      const round = tournamentPlan[roundIndex]
      const durationScale = round.durationMs / 60_000
      const minimumScore = Math.round(320 * durationScale)
      const maximumScore = Math.round(2700 * durationScale * (1 + round.tensionLevel * 0.025))
      const model = {
        ...getMinigameAiModel('tetris'),
        minScore: minimumScore,
        maxScore: maximumScore,
      }

      return ids.map((playerId, participantIndex) => {
        const participant = participantById.get(playerId)
        const roundSeed =
          (seed ^ Math.imul(roundIndex + 1, 0x9e3779b1) ^ hashString(playerId)) >>> 0
        const detailRng = mulberry32(roundSeed ^ 0x51a7e)
        const simulated = simulateAiPerformance({
          minigameKey: 'tetris',
          seed: roundSeed,
          playerId,
          participantIndex,
          profile: undefined,
          minigameModel: model,
        })
        const legacyScore = Math.max(0, participant?.precomputedScore ?? 0) * durationScale
        const blended = legacyScore > 0 ? simulated * 0.78 + legacyScore * 0.22 : simulated
        const scoreValue = Math.max(
          minimumScore,
          Math.min(Math.round(maximumScore * 1.18), Math.round(blended))
        )
        const linesValue = Math.max(0, Math.floor(scoreValue / (235 + detailRng() * 95)))
        const piecesValue = Math.max(
          linesValue * 3,
          Math.floor(scoreValue / (43 + detailRng() * 16))
        )
        const maxStackHeight = Math.max(2, Math.min(18, Math.round(5 + detailRng() * 10)))

        return {
          playerId,
          score: scoreValue,
          lines: linesValue,
          pieces: piecesValue,
          maxStackHeight,
          previousScore: previousRoundScoresRef.current[playerId] ?? 0,
          tieBreaker: detailRng(),
        }
      })
    },
    [participantById, seed, tournamentPlan]
  )

  const commitTournamentOutcome = useCallback(
    (
      finalStandings: readonly TetrisRoundPerformance[],
      priorEliminationsWorstFirst: readonly string[]
    ) => {
      const finalRankingBestFirst = uniqueIds([
        ...finalStandings.map((entry) => entry.playerId),
        ...[...priorEliminationsWorstFirst].reverse(),
      ])
      const visibleScores = { ...previousRoundScoresRef.current }
      const outcomeScores = buildTetrisOutcomeScores(finalRankingBestFirst, visibleScores)
      const winnerId = finalRankingBestFirst[0]
      const lastPlaceId = finalRankingBestFirst[finalRankingBestFirst.length - 1]
      const humanScore = humanId ? (visibleScores[humanId] ?? humanLastScoreRef.current) : 0

      if (!winnerId || !lastPlaceId) return

      dispatch(
        completeTetrisTournament({
          finalScores: outcomeScores,
          winnerId,
          lastPlaceId,
          humanScore: humanId ? humanScore : null,
        })
      )
      dispatch(resolveTetrisOutcome())
      setFinalResult({
        rankingBestFirst: finalRankingBestFirst,
        visibleScores,
        outcomeScores,
        winnerId,
        lastPlaceId,
        humanScore,
      })
      setScreen('finalResults')
      setSimulatingRemainder(false)
    },
    [dispatch, humanId]
  )

  const finishRound = useCallback(
    (reason: RoundEndReason) => {
      if (roundEndingRef.current || gamePhaseRef.current !== 'playing') return
      roundEndingRef.current = true
      setRoundEndReason(reason)
      setGamePhase('gameover')
      gamePhaseRef.current = 'gameover'

      const humanPerformance: TetrisRoundPerformance | null =
        humanId && activeIds.includes(humanId)
          ? {
              playerId: humanId,
              score: scoreRef.current,
              lines: linesRef.current,
              pieces: piecesRef.current,
              maxStackHeight: maxStackHeightRef.current,
              previousScore: previousRoundScoresRef.current[humanId] ?? 0,
              tieBreaker: mulberry32(
                (seed ^ Math.imul(currentRoundIndex + 1, 0x9e3779b1) ^ hashString(humanId)) >>> 0
              )(),
            }
          : null

      if (humanPerformance) humanLastScoreRef.current = humanPerformance.score
      const aiIds = activeIds.filter((id) => id !== humanId)
      const performances = [
        ...simulateAiRound(aiIds, currentRoundIndex),
        ...(humanPerformance ? [humanPerformance] : []),
      ]
      const split = splitTetrisRound(performances, currentRound.survivorCount)

      for (const performance of performances) {
        previousRoundScoresRef.current[performance.playerId] = performance.score
      }

      if (currentRound.kind === 'final') {
        window.setTimeout(
          () => commitTournamentOutcome(split.standings, eliminationOrderWorstFirst),
          700
        )
        return
      }

      setActiveIds(split.survivorIds)
      setEliminationOrderWorstFirst((previous) => [...previous, ...split.eliminatedWorstFirst])
      setRoundResult({
        plan: currentRound,
        split,
        humanScore: humanPerformance?.score ?? humanLastScoreRef.current,
        reason,
      })
      window.setTimeout(() => setScreen('roundResults'), 650)
    },
    [
      activeIds,
      commitTournamentOutcome,
      currentRound,
      currentRoundIndex,
      eliminationOrderWorstFirst,
      humanId,
      seed,
      simulateAiRound,
    ]
  )

  const lockCurrentPiece = useCallback(() => {
    const piece = currentRef.current
    if (!piece || gamePhaseRef.current !== 'playing') return

    const lockedBoard = lockPiece(boardRef.current, piece, createLockedCell)
    const { clearedBoard, clearedRows } = clearFullLines(lockedBoard)
    const cleared = clearedRows.length
    let addedScore = 0

    if (cleared > 0) {
      addedScore = LINE_CLEAR_POINTS[Math.min(cleared, 4)] * levelRef.current
      const kind =
        cleared === 1 ? 'single' : cleared === 2 ? 'double' : cleared === 3 ? 'triple' : 'tetris'
      const effect: LineEffect = {
        id: ++effectIdCounter,
        rows: clearedRows.map((row) => row - BUFFER_ROWS),
        kind,
      }
      setLineEffects((previous) => [...previous, effect])
      window.setTimeout(
        () => setLineEffects((previous) => previous.filter((item) => item.id !== effect.id)),
        600
      )
    }

    const nextLines = linesRef.current + cleared
    const nextLevel = Math.floor(nextLines / LINES_PER_LEVEL) + 1
    if (nextLevel > levelRef.current) {
      const effect: LevelUpEffect = { id: ++effectIdCounter, level: nextLevel }
      setLevelUpEffects((previous) => [...previous, effect])
      window.setTimeout(
        () => setLevelUpEffects((previous) => previous.filter((item) => item.id !== effect.id)),
        1200
      )
    }

    const nextScore = scoreRef.current + addedScore
    const nextPieces = piecesRef.current + 1
    boardRef.current = clearedBoard
    scoreRef.current = nextScore
    linesRef.current = nextLines
    levelRef.current = nextLevel
    piecesRef.current = nextPieces
    maxStackHeightRef.current = Math.max(maxStackHeightRef.current, boardStackHeight(clearedBoard))
    canHoldRef.current = true

    setBoard(clearedBoard)
    setScore(nextScore)
    setLines(nextLines)
    setLevel(nextLevel)
    setPieces(nextPieces)
    setCanHold(true)
    setIsDanger(boardInDanger(clearedBoard))
    setLockFlash(true)
    window.setTimeout(() => setLockFlash(false), 100)

    if (!spawnPiece(clearedBoard)) finishRound('topout')
  }, [createLockedCell, finishRound, spawnPiece])

  const tryMove = useCallback((deltaX: number, deltaY: number): boolean => {
    const piece = currentRef.current
    if (!piece || gamePhaseRef.current !== 'playing') return false
    if (collides(boardRef.current, piece.shape, piece.x + deltaX, piece.y + deltaY)) return false

    const moved = { ...piece, x: piece.x + deltaX, y: piece.y + deltaY }
    currentRef.current = moved
    setCurrent(moved)
    return true
  }, [])

  const tryRotate = useCallback(() => {
    const piece = currentRef.current
    if (!piece || gamePhaseRef.current !== 'playing') return
    const rotatedShape = rotateShape(piece.shape)
    const rotationIndex = (piece.rotationIndex + 1) % 4

    for (const deltaX of WALL_KICK_OFFSETS) {
      if (!collides(boardRef.current, rotatedShape, piece.x + deltaX, piece.y)) {
        const rotated = {
          ...piece,
          shape: rotatedShape,
          rotationIndex,
          x: piece.x + deltaX,
        }
        currentRef.current = rotated
        setCurrent(rotated)
        return
      }
    }
  }, [])

  const softDrop = useCallback(() => {
    const piece = currentRef.current
    if (!piece || gamePhaseRef.current !== 'playing') return

    if (!collides(boardRef.current, piece.shape, piece.x, piece.y + 1)) {
      const moved = { ...piece, y: piece.y + 1 }
      currentRef.current = moved
      scoreRef.current += SOFT_DROP_PER_ROW
      setCurrent(moved)
      setScore(scoreRef.current)
    } else {
      lockCurrentPiece()
    }
  }, [lockCurrentPiece])

  const hardDrop = useCallback(() => {
    const piece = currentRef.current
    if (!piece || gamePhaseRef.current !== 'playing') return
    const landingY = ghostY(boardRef.current, piece)
    const bonus = (landingY - piece.y) * HARD_DROP_PER_ROW
    const landed = { ...piece, y: landingY }
    currentRef.current = landed
    scoreRef.current += bonus
    setCurrent(landed)
    setScore(scoreRef.current)
    lockCurrentPiece()
  }, [lockCurrentPiece])

  const holdPiece = useCallback(() => {
    const piece = currentRef.current
    if (!piece || !canHoldRef.current || gamePhaseRef.current !== 'playing') return

    const nextHeld: Piece = {
      key: piece.key,
      shape: SHAPES[piece.key].map((row) => [...row]),
      color: piece.color,
    }
    const previousHeld = heldRef.current
    heldRef.current = nextHeld
    canHoldRef.current = false
    setHeld(nextHeld)
    setCanHold(false)

    if (previousHeld) {
      const swapped = spawnFalling(previousHeld.key)
      if (collides(boardRef.current, swapped.shape, swapped.x, swapped.y)) {
        finishRound('topout')
      } else {
        currentRef.current = swapped
        setCurrent(swapped)
      }
    } else if (!spawnPiece(boardRef.current)) {
      finishRound('topout')
    }
  }, [finishRound, spawnPiece])

  useEffect(() => {
    if (screen !== 'playing') return

    const roundSeed = (seed ^ Math.imul(currentRoundIndex + 1, 0x9e3779b1)) >>> 0
    rngRef.current = mulberry32(roundSeed)
    avatarRngRef.current = mulberry32(roundSeed ^ 0xa11ce)
    bagRef.current = []
    upcomingRef.current = []
    const startBoard = emptyBoard()

    boardRef.current = startBoard
    currentRef.current = null
    scoreRef.current = 0
    linesRef.current = 0
    levelRef.current = 1
    piecesRef.current = 0
    maxStackHeightRef.current = 0
    heldRef.current = null
    canHoldRef.current = true
    gamePhaseRef.current = 'playing'
    remainingMsRef.current = currentRound.durationMs
    roundEndingRef.current = false

    setBoard(startBoard)
    setCurrent(null)
    setHeld(null)
    setCanHold(true)
    setScore(0)
    setLines(0)
    setLevel(1)
    setPieces(0)
    setIsDanger(false)
    setLineEffects([])
    setLevelUpEffects([])
    setLockFlash(false)
    setRoundEndReason('time')
    setRemainingMs(currentRound.durationMs)
    setGamePhase('playing')

    refillBag()
    while (upcomingRef.current.length < 3) {
      refillBag()
      upcomingRef.current.push(bagRef.current.shift()!)
    }
    setUpcoming([...upcomingRef.current])
    spawnPiece(startBoard)
  }, [currentRound.durationMs, currentRoundIndex, refillBag, screen, seed, spawnPiece])

  useEffect(() => {
    if (screen !== 'playing' || gamePhase !== 'playing') return

    const deadline = Date.now() + currentRound.durationMs
    const tick = () => {
      const nextRemaining = Math.max(0, deadline - Date.now())
      remainingMsRef.current = nextRemaining
      setRemainingMs(nextRemaining)
      if (nextRemaining <= 0) finishRound('time')
    }

    tick()
    const timer = window.setInterval(tick, 100)
    return () => window.clearInterval(timer)
  }, [currentRound.durationMs, finishRound, gamePhase, screen])

  useEffect(() => {
    if (screen !== 'playing' || gamePhase !== 'playing') return
    const timer = window.setInterval(
      () => {
        const piece = currentRef.current
        if (!piece || gamePhaseRef.current !== 'playing') return
        if (!collides(boardRef.current, piece.shape, piece.x, piece.y + 1)) {
          const moved = { ...piece, y: piece.y + 1 }
          currentRef.current = moved
          setCurrent(moved)
        } else {
          lockCurrentPiece()
        }
      },
      dropIntervalMs(level, currentRound.speedMultiplier)
    )

    return () => window.clearInterval(timer)
  }, [currentRound.speedMultiplier, gamePhase, level, lockCurrentPiece, screen])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (screen !== 'playing' || gamePhaseRef.current !== 'playing') return
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault()
          tryMove(-1, 0)
          break
        case 'ArrowRight':
          event.preventDefault()
          tryMove(1, 0)
          break
        case 'ArrowDown':
          event.preventDefault()
          softDrop()
          break
        case 'ArrowUp':
        case 'x':
        case 'X':
          event.preventDefault()
          tryRotate()
          break
        case ' ':
          event.preventDefault()
          hardDrop()
          break
        case 'c':
        case 'C':
        case 'Shift':
          event.preventDefault()
          holdPiece()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [gamePhase, hardDrop, holdPiece, screen, softDrop, tryMove, tryRotate])

  const simulateRemainingTournament = useCallback(() => {
    setSimulatingRemainder(true)
    let simulatedActiveIds = [...activeIds]
    let simulatedEliminations = [...eliminationOrderWorstFirst]

    for (let roundIndex = currentRoundIndex + 1; roundIndex < tournamentPlan.length; roundIndex++) {
      const round = tournamentPlan[roundIndex]
      const performances = simulateAiRound(simulatedActiveIds, roundIndex)
      const split = splitTetrisRound(performances, round.survivorCount)
      for (const performance of performances) {
        previousRoundScoresRef.current[performance.playerId] = performance.score
      }

      if (round.kind === 'final') {
        commitTournamentOutcome(split.standings, simulatedEliminations)
        return
      }

      simulatedActiveIds = split.survivorIds
      simulatedEliminations = [...simulatedEliminations, ...split.eliminatedWorstFirst]
    }
  }, [
    activeIds,
    commitTournamentOutcome,
    currentRoundIndex,
    eliminationOrderWorstFirst,
    simulateAiRound,
    tournamentPlan,
  ])

  const continueAfterRound = useCallback(() => {
    if (!roundResult) return
    const humanStillActive = humanId ? activeIds.includes(humanId) : false
    if (!humanStillActive) {
      simulateRemainingTournament()
      return
    }

    setRoundResult(null)
    setCurrentRoundIndex((index) => index + 1)
    setScreen('playing')
  }, [activeIds, humanId, roundResult, simulateRemainingTournament])

  const ghost = useMemo<FallingPiece | null>(() => {
    if (!current || gamePhase !== 'playing') return null
    const landingY = ghostY(board, current)
    return landingY === current.y ? null : { ...current, y: landingY }
  }, [board, current, gamePhase])

  const visibleBoard = useMemo<(DisplayCell | null)[][]>(() => {
    const display: (DisplayCell | null)[][] = board
      .slice(BUFFER_ROWS)
      .map((row) => row.map((cell) => (cell ? { ...cell, kind: 'locked' as const } : null)))

    if (ghost && gamePhase === 'playing') {
      for (let row = 0; row < ghost.shape.length; row++) {
        for (let column = 0; column < ghost.shape[row].length; column++) {
          if (!ghost.shape[row][column]) continue
          const displayY = ghost.y - BUFFER_ROWS + row
          const displayX = ghost.x + column
          if (
            displayY >= 0 &&
            displayY < ROWS &&
            displayX >= 0 &&
            displayX < COLS &&
            !display[displayY][displayX]
          ) {
            display[displayY][displayX] = { color: ghost.color, kind: 'ghost' }
          }
        }
      }
    }

    if (current && gamePhase === 'playing') {
      for (let row = 0; row < current.shape.length; row++) {
        for (let column = 0; column < current.shape[row].length; column++) {
          if (!current.shape[row][column]) continue
          const displayY = current.y - BUFFER_ROWS + row
          const displayX = current.x + column
          if (displayY >= 0 && displayY < ROWS && displayX >= 0 && displayX < COLS) {
            display[displayY][displayX] = { color: current.color, kind: 'active' }
          }
        }
      }
    }

    return display
  }, [board, current, gamePhase, ghost])

  if (screen === 'roundResults' && roundResult) {
    const humanStillActive = humanId ? roundResult.split.survivorIds.includes(humanId) : false
    return (
      <div className={`tetris-tournament-results tetris-tension-${roundResult.plan.tensionLevel}`}>
        <div className="tetris-round-results-card">
          <p className="tetris-round-results-kicker">
            Round {roundResult.plan.roundNumber} of {roundResult.plan.totalRounds}
          </p>
          <h2>{roundResult.plan.label} complete</h2>
          <p className="tetris-round-results-summary">
            {humanStillActive
              ? 'You are through to the next round.'
              : 'You have been eliminated. The remaining houseguests will finish the tournament.'}
          </p>
          <ol className="tetris-round-standings" aria-label="Round standings">
            {roundResult.split.standings.map((entry, index) => {
              const participant = participantById.get(entry.playerId)
              const eliminated = !roundResult.split.survivorIds.includes(entry.playerId)
              return (
                <li
                  key={entry.playerId}
                  className={[
                    'tetris-round-standing',
                    participant?.isHuman ? 'tetris-round-standing--you' : '',
                    eliminated ? 'tetris-round-standing--eliminated' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="tetris-round-standing-rank">
                    {MEDALS[index] ?? `${index + 1}.`}
                  </span>
                  <HouseguestAvatar participant={participant} />
                  <span className="tetris-round-standing-name">
                    {participant?.name ?? entry.playerId}
                    {participant?.isHuman ? ' (you)' : ''}
                  </span>
                  <strong>{entry.score.toLocaleString()}</strong>
                  <span className="tetris-round-standing-status">
                    {eliminated ? 'ELIMINATED' : 'SAFE'}
                  </span>
                </li>
              )
            })}
          </ol>
          <button
            type="button"
            className="tetris-round-continue"
            onClick={continueAfterRound}
            disabled={simulatingRemainder}
          >
            {simulatingRemainder
              ? 'Finishing tournament…'
              : humanStillActive
                ? currentRoundIndex + 1 === tournamentPlan.length - 1
                  ? 'Enter the Final'
                  : 'Next Round'
                : 'Reveal the Winner'}
          </button>
        </div>
      </div>
    )
  }

  if (screen === 'finalResults' && finalResult) {
    const winner = participantById.get(finalResult.winnerId)
    return (
      <MinigameCompleteWrapper
        className="tetris-results"
        onContinue={() =>
          onComplete({
            rawValue: finalResult.humanScore,
            rawResults: finalResult.outcomeScores,
            authoritativeWinnerId: finalResult.winnerId,
            authoritativeLastPlaceId: finalResult.lastPlaceId,
          })
        }
        placementsNode={
          <ol className="tetris-results-list" role="list" aria-label="Final rankings">
            {finalResult.rankingBestFirst.map((playerId, index) => {
              const participant = participantById.get(playerId)
              return (
                <li
                  key={playerId}
                  className={[
                    'tetris-results-entry',
                    participant?.isHuman ? 'tetris-results-entry--you' : '',
                    index === 0 ? 'tetris-results-entry--winner' : '',
                    index === finalResult.rankingBestFirst.length - 1
                      ? 'tetris-results-entry--last'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="tetris-results-rank">{MEDALS[index] ?? `${index + 1}.`}</span>
                  <HouseguestAvatar participant={participant} />
                  <span className="tetris-results-name">
                    {participant?.name ?? playerId}
                    {participant?.isHuman && <span className="tetris-results-you-tag"> (you)</span>}
                  </span>
                  <span className="tetris-results-score">
                    {(finalResult.visibleScores[playerId] ?? 0).toLocaleString()}
                  </span>
                </li>
              )
            })}
          </ol>
        }
        placementsRole="list"
        placementsAriaLabel="Final standings"
      >
        <div className="tetris-results-hero">
          <div className="tetris-results-trophy">🏆</div>
          <h2 className="tetris-results-title">
            {winner?.isHuman ? 'You Win!' : `${winner?.name ?? finalResult.winnerId} Wins!`}
          </h2>
          <p className="tetris-results-subtitle">The Houseguest Mosaic Final is complete.</p>
          <div className="tetris-results-your-score">
            Your last score: <strong>{finalResult.humanScore.toLocaleString()}</strong>
          </div>
        </div>
      </MinigameCompleteWrapper>
    )
  }

  const isGameOver = gamePhase === 'gameover'
  const urgent = remainingMs <= 10_000 && !isGameOver
  const progressPercent = Math.max(0, Math.min(100, (remainingMs / currentRound.durationMs) * 100))

  return (
    <div
      className={[
        'tetris-root',
        `tetris-root--tension-${currentRound.tensionLevel}`,
        currentRound.useHouseguestCells ? 'tetris-root--mosaic-final' : '',
        isDanger && !isGameOver ? 'tetris-root--danger' : '',
        urgent ? 'tetris-root--urgent' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="tetris-round-bar">
        <div>
          <span className="tetris-round-number">
            ROUND {currentRound.roundNumber}/{currentRound.totalRounds}
          </span>
          <strong>{currentRound.label}</strong>
          <small>{currentRound.subtitle}</small>
        </div>
        <div className="tetris-round-timer" aria-live="polite">
          {formatTimer(remainingMs)}
        </div>
        <div className="tetris-round-field">{activeIds.length} PLAYING</div>
        <div className="tetris-round-progress" aria-hidden="true">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
      </header>

      {levelUpEffects.map((effect) => (
        <div key={effect.id} className="tetris-levelup-overlay" aria-live="polite">
          ⬆ LEVEL {effect.level}!
        </div>
      ))}

      {isGameOver && (
        <div className="tetris-gameover-overlay" aria-live="assertive">
          <div className="tetris-gameover-text">
            {roundEndReason === 'time' ? 'TIME!' : 'TOPPED OUT'}
          </div>
          <div className="tetris-gameover-score">{score.toLocaleString()}</div>
          <div className="tetris-gameover-sub">Calculating round standings…</div>
        </div>
      )}

      <div className="tetris-layout">
        <div className="tetris-panel tetris-panel--left">
          <section className="tetris-hold" aria-label="Hold piece">
            <div className="tetris-panel-label">HOLD</div>
            <MiniPieceGrid piece={held} dimmed={!canHold} />
          </section>
          <section className="tetris-stats" aria-label="Game stats">
            <Stat label="SCORE" value={score.toLocaleString()} />
            <Stat label="LINES" value={String(lines)} />
            <Stat label="PIECES" value={String(pieces)} />
            <Stat label="LEVEL" value={String(level)} />
          </section>
        </div>

        <div
          className={['tetris-board-wrap', lockFlash ? 'tetris-board-wrap--flash' : '']
            .filter(Boolean)
            .join(' ')}
          aria-label="Fit Me In board"
          role="img"
        >
          <div
            className="tetris-board"
            style={
              {
                '--cols': COLS,
                '--rows': ROWS,
                '--cell': `${CELL_PX}px`,
              } as CSSProperties
            }
          >
            {visibleBoard.map((row, rowIndex) => {
              const lineClearing = lineEffects.some((effect) => effect.rows.includes(rowIndex))
              return row.map((cell, columnIndex) => {
                const participant = cell?.avatarId ? participantById.get(cell.avatarId) : undefined
                return (
                  <div
                    key={`${rowIndex}-${columnIndex}`}
                    className={[
                      'tetris-cell',
                      cell ? 'tetris-cell--filled' : 'tetris-cell--empty',
                      cell?.kind === 'ghost' ? 'tetris-cell--ghost' : '',
                      cell?.kind === 'locked' && cell.avatarId ? 'tetris-cell--avatar' : '',
                      lineClearing && cell?.kind === 'locked' ? 'tetris-cell--clear' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={cell ? ({ '--cell-color': cell.color } as CSSProperties) : undefined}
                    aria-hidden="true"
                  >
                    {cell?.kind === 'locked' && cell.avatarId && (
                      <AvatarCell participant={participant} />
                    )}
                  </div>
                )
              })
            })}
          </div>
        </div>

        <div className="tetris-panel tetris-panel--right">
          <section className="tetris-next" aria-label="Next pieces">
            <div className="tetris-panel-label">NEXT</div>
            {upcoming.slice(0, 3).map((key, index) => (
              <MiniPieceGrid key={`${key}-${index}`} piece={makePiece(key)} />
            ))}
          </section>
        </div>
      </div>

      <div className="tetris-touch-controls" aria-label="Touch controls">
        <div className="tetris-touch-row">
          <ControlButton
            className="tetris-btn--hold"
            label="Hold"
            disabled={isGameOver}
            onPress={holdPiece}
          >
            HOLD
          </ControlButton>
          <ControlButton
            className="tetris-btn--rotate"
            label="Rotate"
            disabled={isGameOver}
            onPress={tryRotate}
          >
            ↻
          </ControlButton>
          <ControlButton
            className="tetris-btn--hard-drop"
            label="Hard drop"
            disabled={isGameOver}
            onPress={hardDrop}
          >
            ⬇
          </ControlButton>
        </div>
        <div className="tetris-touch-row">
          <ControlButton label="Move left" disabled={isGameOver} onPress={() => tryMove(-1, 0)}>
            ◀
          </ControlButton>
          <ControlButton label="Soft drop" disabled={isGameOver} onPress={softDrop}>
            ▼
          </ControlButton>
          <ControlButton label="Move right" disabled={isGameOver} onPress={() => tryMove(1, 0)}>
            ▶
          </ControlButton>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="tetris-stat">
      <span className="tetris-stat-label">{label}</span>
      <span className="tetris-stat-value">{value}</span>
    </div>
  )
}

function ControlButton({
  className = '',
  label,
  disabled,
  onPress,
  children,
}: {
  className?: string
  label: string
  disabled: boolean
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={['tetris-btn', className].filter(Boolean).join(' ')}
      onPointerDown={(event) => {
        event.preventDefault()
        onPress()
      }}
      aria-label={label}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function HouseguestAvatar({ participant }: { participant?: MinigameParticipant }) {
  const initials = participant?.name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return (
    <span className="tetris-houseguest-avatar" aria-hidden="true">
      {participant?.avatar ? (
        <img src={participant.avatar} alt="" draggable={false} />
      ) : (
        initials || '?'
      )}
    </span>
  )
}

function AvatarCell({ participant }: { participant?: MinigameParticipant }) {
  const initials = participant?.name
    ?.split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')

  return participant?.avatar ? (
    <img className="tetris-avatar-cell-image" src={participant.avatar} alt="" draggable={false} />
  ) : (
    <span className="tetris-avatar-cell-initials">{initials || '?'}</span>
  )
}

interface MiniPieceGridProps {
  piece: Piece | null
  dimmed?: boolean
}

function MiniPieceGrid({ piece, dimmed = false }: MiniPieceGridProps) {
  if (!piece) {
    return <div className="tetris-mini-grid tetris-mini-grid--empty" aria-hidden="true" />
  }

  const rows = piece.shape.length
  const columns = piece.shape[0]?.length ?? 0
  return (
    <div
      className={['tetris-mini-grid', dimmed ? 'tetris-mini-grid--dimmed' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ '--mini-rows': rows, '--mini-cols': columns } as CSSProperties}
      aria-hidden="true"
    >
      {piece.shape.map((row, rowIndex) =>
        row.map((cell, columnIndex) => (
          <div
            key={`${rowIndex}-${columnIndex}`}
            className={[
              'tetris-mini-cell',
              cell ? 'tetris-mini-cell--filled' : 'tetris-mini-cell--empty',
            ].join(' ')}
            style={cell ? ({ '--cell-color': piece.color } as CSSProperties) : undefined}
          />
        ))
      )}
    </div>
  )
}
