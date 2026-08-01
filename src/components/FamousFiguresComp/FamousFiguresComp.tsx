/**
 * FamousFiguresComp â€” React UI for the "Famous Figures" competition.
 *
 * UI states:
 *   round_active  â€” Base clue + revealed hints. Guess input, Request Hint button, timer, scoreboard.
 *   round_reveal  â€” Correct answer shown with who got it right. Auto-advances after 3s.
 *   complete      â€” Winner announcement. Fires onComplete after 4s.
 */
import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import type { RootState } from '../../store/store'
import {
  startFamousFigures,
  revealNextHint,
  advanceTimer,
  submitPlayerGuess,
  advancePlayerCursor,
  endRound,
  nextRound,
  resetFamousFigures,
  finishAllRounds,
  fastForwardCurrentRound,
  FAMOUS_FIGURES,
  setAiSubmissionsForRound,
  buildAiSubmissionsForRound,
  getFamousFiguresAiPlan,
  getPlayerFigureIndex,
} from '../../features/famousFigures/famousFiguresSlice'
import type {
  FamousFiguresState,
  FamousFiguresPrizeType,
} from '../../features/famousFigures/famousFiguresSlice'
import { resolveFamousFiguresOutcome } from '../../features/famousFigures/thunks'
import { mulberry32 } from '../../store/rng'
import { getDicebear, resolveAvatar } from '../../utils/avatar'
import { isAcceptedGuess, normalizeForMatching } from '../../games/famous-figures/fuzzy'
import { getFinalNameHintText, getHintText } from '../../games/famous-figures/hints'
import { MAX_VISIBLE_HINTS, VISIBLE_HINT_INDICES } from '../../games/famous-figures/model'
import MinigameCompleteWrapper from '../MinigameHost/MinigameCompleteWrapper'
import './FamousFiguresComp.css'

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Duration (ms) to display the round-reveal screen before advancing to the
 * next round. Short but non-zero to avoid visual jank; can be overridden via
 * the `revealPauseMs` prop.
 */
const DEFAULT_REVEAL_PAUSE_MS = 1500

/**
 * Duration (ms) to show the success confirmation overlay after a correct
 * human guess. Must be between 600 and 900 ms per spec.
 */
const CONFIRM_MS = 700

const WINNER_SCREEN_DURATION_MS = 4000

// Timer durations per phase (milliseconds).
// Every visible clue receives 10 seconds. There is no extra overtime window
// after the final visible hint.
const PHASE_DURATIONS: Record<string, number> = {
  clue: 10000,
  hint_1: 10000,
  hint_3: 10000,
  hint_4: 10000,
  hint_5: 10000,
  hint_6: 10000,
  done: 0,
}

// â”€â”€â”€ Narration â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const NARRATION = {
  roundStart: [
    'A mysterious figure from history awaits â€” who could it be? ðŸ•µï¸',
    'Can you name this famous face from the past? Put your knowledge to the test! ðŸ“œ',
    'History is full of legends. Do you know this one? ðŸ›ï¸',
    'Time to prove your historical knowledge! Who is hiding in these clues? ðŸ”',
  ],
  correct: [
    'Correct! You clearly paid attention in history class! ðŸ“š',
    "Nailed it! You're a true history buff! â­",
    'Right on! Your knowledge of the past is impressive! ðŸ†',
    "That's correct! A legendary answer for a legendary figure! ðŸŽ–ï¸",
  ],
  wrong: [
    'Not quite â€” brush up on your history! ðŸ“–',
    'Incorrect! More hints might help reveal the truth! ðŸ’¡',
    "That's not right â€” keep thinking! The answer is in the clues! ðŸ§©",
    'Wrong answer â€” history has a way of surprising us! ðŸ˜¬',
  ],
  reveal: [
    "Time's up! Let's see who our mystery figure was! ðŸŽ­",
    'The reveal moment has arrived! Was your guess right? ðŸŽª',
    'Mystery solved! Here is your famous figure! âœ¨',
    'And the historical figure is... drum roll please! ðŸ¥',
  ],
}

function pickLine(lines: string[], index: number): string {
  return lines[index % lines.length]
}

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ParticipantProp {
  id: string
  name: string
  isHuman: boolean
  avatar?: string
}

/**
 * Metadata attached to each pending AI submission timeout so the cleanup
 * handler can cancel stale timeouts on round advance or unmount.
 */
type PendingAiTimeout = {
  /** The underlying setTimeout handle. */
  id: ReturnType<typeof setTimeout>
  /** The AI player id to submit a guess for. */
  aiId: string
  /** Global round index the submission belongs to. */
  round: number
}

interface Props {
  participantIds: string[]
  participants?: ParticipantProp[]
  prizeType: FamousFiguresPrizeType
  seed: number
  onComplete?: () => void
  /**
   * When true (default), skip the winner animation on match completion and
   * show the final scoreboard immediately instead. The `onComplete` callback
   * still fires after `WINNER_SCREEN_DURATION_MS` so players can read the
   * results. Set to false to restore the animated winner card.
   */
  skipWinnerAnimation?: boolean
  /**
   * Duration (ms) to hold the round-reveal screen before advancing to the
   * next round. Must be non-zero to avoid visual jank. Defaults to
   * `DEFAULT_REVEAL_PAUSE_MS` (1500 ms).
   */
  revealPauseMs?: number
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function FamousFiguresComp({
  participantIds,
  participants: participantsProp,
  prizeType,
  seed,
  onComplete,
  skipWinnerAnimation = true,
  revealPauseMs = DEFAULT_REVEAL_PAUSE_MS,
}: Props) {
  // Guard: the reveal pause must always be positive to prevent visual jank.
  const safeRevealPauseMs = revealPauseMs > 0 ? revealPauseMs : DEFAULT_REVEAL_PAUSE_MS
  const dispatch = useAppDispatch()
  const ff = useAppSelector(
    (s: RootState) => (s as RootState & { famousFigures: FamousFiguresState }).famousFigures
  )
  const storePlayers = useAppSelector(
    (s: RootState) =>
      (
        s as RootState & {
          game: { players: Array<{ id: string; name: string; avatar?: string; isUser?: boolean }> }
        }
      ).game?.players ?? []
  )

  // â”€â”€ Build player map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const playerMap: Record<string, { name: string; isHuman: boolean; avatar: string }> = {}
  if (participantsProp) {
    for (const p of participantsProp) {
      playerMap[p.id] = {
        name: p.name,
        isHuman: p.isHuman,
        avatar: p.avatar ?? getDicebear(p.name),
      }
    }
  }
  for (const p of storePlayers) {
    if (participantIds.includes(p.id)) {
      playerMap[p.id] = {
        name: p.name,
        isHuman: !!p.isUser,
        avatar: resolveAvatar({ id: p.id, name: p.name, avatar: p.avatar ?? '' }),
      }
    }
  }

  const humanId: string | null = Object.entries(playerMap).find(([, v]) => v.isHuman)?.[0] ?? null

  function displayName(id: string): string {
    return playerMap[id]?.name ?? id
  }

  function playerAvatar(id: string): string {
    return playerMap[id]?.avatar ?? getDicebear(displayName(id))
  }

  // â”€â”€ Effective seed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // When no explicit seed is provided (seed === 0), use Date.now() so each
  // production match gets fresh randomisation. Test pages can pass a non-zero
  // seed for fully deterministic behaviour.
  const effectiveSeed = useMemo(() => (seed !== 0 ? seed : Math.floor(Date.now())), [seed])

  // â”€â”€ Local UI state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [guessInput, setGuessInput] = useState('')
  const [inputState, setInputState] = useState<'idle' | 'wrong' | 'duplicate'>('idle')
  const [timerSecs, setTimerSecs] = useState(10)
  /**
   * Success confirmation overlay shown for CONFIRM_MS after a correct human
   * guess. Non-modal, non-blocking for other players.
   */
  const [successOverlay, setSuccessOverlay] = useState<{
    figureName: string
    points: number
  } | null>(null)
  /** Ref to the pending confirm-overlay timeout so it can be cancelled on unmount. */
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * Local hint counter for rounds where the human is playing ahead of the
   * global round. Reset to 0 whenever the human's cursor advances.
   */
  const [humanAheadHints, setHumanAheadHints] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const ffRef = useRef(ff)
  ffRef.current = ff
  const completeFiredRef = useRef(false)
  const cooldownUntilRef = useRef<number>(0)
  /**
   * Explicit ref to the currently active phase interval + timeout.
   *
   * Double-timer fix: React guarantees the effect cleanup function runs before
   * the effect re-executes when `[ff.timerPhase, ff.currentRound, ff.status]`
   * changes, so a stale interval/timeout is always cleared first.  This ref
   * provides an additional explicit cancel so that any late-firing stale
   * callback that slipped past the closure guards cannot start a second timer.
   */
  const activeTimerRef = useRef<{
    interval: ReturnType<typeof setInterval>
    timeout: ReturnType<typeof setTimeout>
  } | null>(null)
  // â”€â”€ AI submission tracking â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Tracks each AI already scheduled in the current round. Different AIs can
  // begin on different clues without duplicate timeouts.
  const aiSubmissionKeysRef = useRef<Set<string>>(new Set())
  // Pending AI submission timeouts â€” cleared on round advance or unmount.
  const pendingAiTimeoutsRef = useRef<PendingAiTimeout[]>([])
  // 300 ms debounce for the hint button â€” prevents rapid clicking from
  // advancing multiple hint stages in one gesture.
  const hintCooldownUntilRef = useRef<number>(0)

  // â”€â”€ Initialise on mount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    dispatch(
      startFamousFigures({ participantIds, competitionType: prizeType, seed: effectiveSeed })
    )
    return () => {
      dispatch(resetFamousFigures())
      // Cancel any pending success-overlay timer to prevent state updates after unmount.
      if (confirmTimerRef.current !== null) {
        clearTimeout(confirmTimerRef.current)
        confirmTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // â”€â”€ Timer per phase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Double-timer fix: React runs the previous effect's cleanup (clearInterval +
  // clearTimeout) before re-executing this effect whenever the dependency array
  // [ff.timerPhase, ff.currentRound, ff.status] changes â€” this guarantees stale
  // timers are cancelled before the new phase timer starts.  The `activeTimerRef`
  // below provides an extra explicit cancel layer so that any late-firing stale
  // callback that survived the closure guards cannot accidentally start a second
  // concurrent timer.
  useEffect(() => {
    if (ff.status !== 'round_active') return

    // Cancel any previously active timers before starting new ones.
    if (activeTimerRef.current) {
      clearInterval(activeTimerRef.current.interval)
      clearTimeout(activeTimerRef.current.timeout)
      activeTimerRef.current = null
    }

    const phase = ff.timerPhase
    const capturedRound = ff.currentRound
    const duration = PHASE_DURATIONS[phase] ?? 15000
    if (duration === 0) return

    setTimerSecs(Math.round(duration / 1000))

    const interval = setInterval(() => {
      setTimerSecs((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    const timeout = setTimeout(() => {
      const current = ffRef.current
      if (current.status !== 'round_active') return
      if (current.timerPhase !== phase) return
      // Stale-timer guard: discard callbacks that belong to a previous round.
      if (current.currentRound !== capturedRound) return

      if (phase === 'done' || phase === 'hint_6') {
        dispatch(endRound())
      } else {
        // Advance timer phase through the final name-start clue.
        dispatch(advanceTimer())
      }
    }, duration)

    activeTimerRef.current = { interval, timeout }

    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
      activeTimerRef.current = null
    }
    // Re-run when the phase changes or the round changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ff.timerPhase, ff.currentRound, ff.status])

  // â”€â”€ AI submissions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (ff.status !== 'round_active') return
    const round = ff.currentRound
    if (ff.aiSubmissions[round]) return // already generated

    const aiIds = participantIds.filter((id) => id !== humanId)
    if (aiIds.length === 0) return

    const rng = mulberry32(effectiveSeed ^ (round * 0x9e3779b9))
    // Build per-AI submissions using each AI's own figure for this round.
    const submissions: Record<string, boolean> = {}
    for (const aiId of aiIds) {
      const aiFigIdx = getPlayerFigureIndex(ff, aiId, round)
      const aiResult = buildAiSubmissionsForRound([aiId], aiFigIdx, ff.hintsRevealed, rng)
      submissions[aiId] = aiResult[aiId] ?? false
    }
    dispatch(setAiSubmissionsForRound({ round, submissions }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ff.status, ff.currentRound, ff.hintsRevealed])

  // Cancel any pending AI submission timeouts when the round advances (or on
  // unmount). This prevents stale submissions from firing after the round ends.
  useEffect(() => {
    const submissionKeys = aiSubmissionKeysRef.current
    return () => {
      pendingAiTimeoutsRef.current.forEach((entry) => clearTimeout(entry.id))
      pendingAiTimeoutsRef.current = []
      submissionKeys.clear()
    }
  }, [ff.currentRound])

  // Schedule each AI on its planned clue. Figure recognizability, individual
  // knowledge, and hesitation determine whether they answer early or need all hints.
  useEffect(() => {
    if (ff.status !== 'round_active') return
    const round = ff.currentRound
    const aiSubs = ff.aiSubmissions[round]
    if (!aiSubs) return

    const clueByPhase: Record<string, number> = {
      clue: 1,
      hint_1: 2,
      hint_3: 3,
      hint_4: 4,
      hint_5: 5,
      hint_6: 6,
    }
    const visibleClue = clueByPhase[ff.timerPhase] ?? MAX_VISIBLE_HINTS + 1

    for (const [aiId, correct] of Object.entries(aiSubs)) {
      if (!correct) continue
      if (ff.playerCorrect[aiId]) continue
      const key = `${round}:${aiId}`
      if (aiSubmissionKeysRef.current.has(key)) continue
      const aiFigIdx = getPlayerFigureIndex(ff, aiId, round)
      const aiFigure = FAMOUS_FIGURES[aiFigIdx]
      if (!aiFigure) continue
      const plan = getFamousFiguresAiPlan(effectiveSeed, round, aiId, aiFigure.difficulty)
      if (visibleClue < plan.clueNumber) continue
      aiSubmissionKeysRef.current.add(key)
      const t…2553 tokens truncated…€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // The human's active personal round is their cursor position.  With the
  // shared matchFigureOrder all players see the same figure per global round,
  // but the human can advance ahead of the global round immediately after
  // answering correctly.
  // Do not show the next personal figure while the shared round timer and AI
  // are still resolving the current one.
  const humanIsAhead = false
  // Resolve the human's current figure from the shared matchFigureOrder.
  const humanFigureIdx =
    humanId !== null && ff.matchFigureOrder.length > ff.currentRound
      ? ff.matchFigureOrder[ff.currentRound]
      : humanId !== null
        ? getPlayerFigureIndex(ff, humanId, ff.currentRound)
        : ff.currentFigureIndex
  // Always show the human's own figure â€” on round_reveal this is the figure
  // they were actually being tested on. When there is no local human player,
  // fall back to the global currentFigureIndex.
  const figure = FAMOUS_FIGURES[humanFigureIdx] ?? null
  // For hints: when ahead of the global round use the local counter so we
  // don't mutate the global hintsRevealed for the ongoing AI round.
  const effectiveHintsRevealed = ff.hintsRevealed
  // humanCorrect: true only if the human has already answered their CURRENT
  // personal round. When the human is ahead, they are on a fresh round (cursor
  // has already moved) so correct = false until they answer the new figure.
  let humanCorrect = false
  if (humanId) {
    if (humanIsAhead) {
      // Cursor has advanced â€” human is on a new round not yet answered.
      humanCorrect = false
    } else {
      humanCorrect = ff.playerCorrect[humanId] ?? false
    }
  }
  const hintsAllRevealed = effectiveHintsRevealed >= MAX_VISIBLE_HINTS
  const canRequestHint =
    ff.status === 'round_active' &&
    humanCursor < ff.totalRounds &&
    !humanCorrect &&
    !hintsAllRevealed &&
    (humanIsAhead || ff.timerPhase !== 'done')

  // True when the local human player has solved all their personal rounds but
  // the global match has not yet transitioned to 'complete' (the timer for the
  // last round is still running for other players).
  // (humanIsAhead is already derived above; mid-round advance shows next figure
  // immediately, no mid-match waiting screen needed.)
  const humanAllDone = humanId !== null && humanCursor >= ff.totalRounds && ff.status !== 'complete'

  // True when the global match has exhausted all rounds and is no longer active.
  const matchRoundsExhausted = ff.currentRound >= ff.totalRounds - 1 && ff.status !== 'round_active'

  // Number of participants who haven't yet finished all their personal rounds.
  const remainingPlayersCount = matchRoundsExhausted
    ? 0
    : participantIds.filter((id) => (ff.playerRoundCursor[id] ?? 0) < ff.totalRounds).length

  const timerPct = (() => {
    const dur = PHASE_DURATIONS[ff.timerPhase] ?? 15000
    if (dur === 0) return 0
    return Math.max(0, Math.min(100, (timerSecs / (dur / 1000)) * 100))
  })()

  const timerClass =
    timerPct > 50
      ? 'ff-timer-fill'
      : timerPct > 25
        ? 'ff-timer-fill ff-timer-fill--warning'
        : 'ff-timer-fill ff-timer-fill--danger'

  // â”€â”€ Render: loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (ff.status === 'idle') {
    return (
      <div className="ff-container ff-container--loading" aria-live="polite">
        <p>Loading Famous Figuresâ€¦</p>
      </div>
    )
  }

  // â”€â”€ Render: personal waiting screen (all personal rounds done) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Shown only when the human has finished ALL their personal rounds and the
  // global match hasn't yet completed.  Mid-round advancement is handled by
  // showing the next figure immediately in the round_active render below.
  if (humanAllDone) {
    const humanTotal = humanId ? (ff.playerScores[humanId] ?? 0) : 0
    const personalScores = humanId ? (ff.playerPersonalRoundScores[humanId] ?? []) : []
    const allRoundScores = Array.from({ length: ff.totalRounds }, (_, i) => personalScores[i] ?? 0)
    return (
      <div className="ff-container ff-container--waiting">
        <div className="ff-header">
          <span className="ff-comp-badge">{prizeType}</span>
          <span className="ff-title">Famous Figures</span>
          <span className="ff-round-badge">Your Rounds Done!</span>
        </div>

        <div className="ff-personal-results">
          <div className="ff-personal-results-title">Your Results</div>
          <div className="ff-personal-results-score">{humanTotal} pts</div>
          <div className="ff-personal-results-rounds">[{allRoundScores.join(', ')}]</div>
        </div>

        <div className="ff-waiting-banner" aria-live="polite">
          â³ Waiting for other players to finishâ€¦
          {remainingPlayersCount > 0 && (
            <span className="ff-waiting-banner-sub">
              {remainingPlayersCount} player{remainingPlayersCount !== 1 ? 's' : ''} still playing
            </span>
          )}
        </div>

        <button
          className="ff-fastforward-btn ff-fastforward-btn--finish"
          onClick={handleFinishMatch}
          type="button"
          aria-label="Finish match and see results"
        >
          ðŸ Finish Match
        </button>

        {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}
      </div>
    )
  }

  // â”€â”€ Render: complete â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (ff.status === 'complete') {
    const winnerId = ff.winnerId ?? ''
    const winnerName = displayName(winnerId)
    const isHumanWinner = winnerId === humanId

    if (skipWinnerAnimation) {
      // Show the final scoreboard immediately â€” no trophy animation.
      return (
        <div
          className="ff-container ff-container--complete ff-container--final-scores"
          aria-live="assertive"
        >
          <div className="ff-header">
            <span className="ff-comp-badge">{prizeType}</span>
            <span className="ff-title">Famous Figures</span>
            <span className="ff-round-badge">Final Results</span>
          </div>
          <MinigameCompleteWrapper
            onContinue={() => onComplete?.()}
            continueLabel="Continue â€º"
            continueButtonClassName="ff-continue-btn"
            placementsNode={renderScoreboard(
              ff,
              participantIds,
              humanId,
              displayName,
              playerAvatar
            )}
          >
            <div className="ff-winner-banner" role="status">
              ðŸ†&nbsp;{winnerName}
              {isHumanWinner && <span className="ff-you-badge"> (You!)</span>}
              &nbsp;wins!&nbsp;
              <span className="ff-winner-banner-sub">
                {prizeType} Winner â€” {ff.playerScores[winnerId] ?? 0} pts
              </span>
            </div>
          </MinigameCompleteWrapper>
        </div>
      )
    }

    // Original animated winner card (skipWinnerAnimation === false)
    return (
      <div className="ff-container ff-container--complete" aria-live="assertive">
        <MinigameCompleteWrapper
          onContinue={() => onComplete?.()}
          continueLabel="Continue â€º"
          continueButtonClassName="ff-continue-btn"
        >
          <div className="ff-winner-card">
            <div className="ff-winner-trophy" aria-hidden="true">
              ðŸ†
            </div>
            <h2 className="ff-winner-title">Famous Figures Champion!</h2>
            <div className="ff-winner-avatar">
              <img
                src={playerAvatar(winnerId)}
                alt={winnerName}
                onError={(e) => {
                  e.currentTarget.src = getDicebear(winnerName)
                }}
              />
            </div>
            <p className="ff-winner-name">
              {winnerName}
              {isHumanWinner && <span className="ff-you-badge"> (You!)</span>}
            </p>
            <p className="ff-winner-subtitle">
              {prizeType} Winner â€” Total Score: {ff.playerScores[winnerId] ?? 0}
            </p>
          </div>
        </MinigameCompleteWrapper>
      </div>
    )
  }

  // â”€â”€ Render: reveal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (ff.status === 'round_reveal') {
    const winnersThisRound = ff.correctPlayers
    return (
      <div className="ff-container" data-status="round_reveal">
        <div className="ff-header">
          <span className="ff-comp-badge">{prizeType}</span>
          <span className="ff-title">Famous Figures</span>
          <span className="ff-round-badge">
            Round {ff.currentRound + 1} of {ff.totalRounds}
          </span>
        </div>

        <p className="ff-narration" aria-live="polite">
          {pickLine(NARRATION.reveal, ff.currentRound)}
        </p>

        <div className="ff-reveal-card" aria-live="assertive">
          <div className="ff-reveal-label">The Answer Was</div>
          <div className="ff-reveal-name">{figure?.canonicalName ?? 'â€”'}</div>
          {winnersThisRound.length > 0 ? (
            <div className="ff-reveal-winners">
              âœ… Correct: {winnersThisRound.map((id) => displayName(id)).join(', ')}
            </div>
          ) : (
            <div className="ff-reveal-no-winner">No one guessed correctly this round!</div>
          )}
        </div>

        {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}

        <p style={{ fontSize: '0.75rem', color: '#557799', margin: 0 }}>Next round loadingâ€¦</p>
      </div>
    )
  }

  // â”€â”€ Render: round_active â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const inputFieldClass = ['ff-input-field', inputState === 'wrong' ? 'ff-input-field--shake' : '']
    .filter(Boolean)
    .join(' ')

  const feedbackMsg =
    inputState === 'wrong'
      ? 'âŒ Not quite, try again!'
      : inputState === 'duplicate'
        ? 'Already guessed that.'
        : ''

  const feedbackClass =
    inputState === 'wrong'
      ? 'ff-input-feedback ff-input-feedback--wrong'
      : inputState === 'duplicate'
        ? 'ff-input-feedback ff-input-feedback--duplicate'
        : 'ff-input-feedback'

  // Show the human's personal round number (cursor + 1) when they are ahead,
  // otherwise show the global round number.
  const displayRound = ff.currentRound + 1

  return (
    <div className="ff-container" data-status="round_active">
      {/* Header */}
      <div className="ff-header">
        <span className="ff-comp-badge">{prizeType}</span>
        <span className="ff-title">Famous Figures</span>
        <span className="ff-round-badge">
          Round {displayRound} of {ff.totalRounds}
        </span>
      </div>

      {/* Narration */}
      <p className="ff-narration" aria-live="polite">
        {humanCorrect
          ? 'Correct â€” waiting for the other housemates.'
          : pickLine(NARRATION.roundStart, ff.currentRound)}
      </p>

      {/* Timer â€” stay visible during active rounds, including ahead-play. */}
      {ff.status === 'round_active' && !humanAllDone && (
        <div className="ff-timer" aria-label={`Timer: ${timerSecs} seconds remaining`} role="timer">
          <div className="ff-timer-bar">
            <div className={timerClass} style={{ width: `${timerPct}%` }} aria-hidden="true" />
          </div>
          <span className="ff-timer-label">{timerSecs}s</span>
        </div>
      )}

      {/* Clue card */}
      {figure && (
        <div className="ff-clue-card" role="region" aria-label="Current clue">
          <div className="ff-clue-label">Clue</div>
          <p className="ff-base-clue">{figure.baseClueFact}</p>
          {effectiveHintsRevealed > 0 && (
            <ul className="ff-hint-list" aria-label="Revealed hints">
              {Array.from({ length: effectiveHintsRevealed }, (_, i) => (
                <li key={i} className="ff-hint-item">
                  <span className="ff-hint-num">#{i + 1}</span>
                  <span>{
                    i === VISIBLE_HINT_INDICES.length
                      ? getFinalNameHintText(figure)
                      : getHintText(figure, VISIBLE_HINT_INDICES[i])
                  }</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Request hint button */}
      <button
        className="ff-hint-btn"
        onClick={handleRequestHint}
        disabled={!canRequestHint}
        aria-label={`Request hint (${MAX_VISIBLE_HINTS - effectiveHintsRevealed} remaining)`}
      >
        ðŸ’¡ Request Hint ({effectiveHintsRevealed}/{MAX_VISIBLE_HINTS} used)
      </button>

      {/* Success confirmation overlay â€” shown for CONFIRM_MS after a correct guess */}
      {successOverlay && (
        <div
          className="ff-success-overlay"
          role="status"
          aria-live="assertive"
          data-testid="ff-success-overlay"
        >
          <div className="ff-success-overlay-inner">
            <div className="ff-success-checkmark" aria-hidden="true">
              âœ…
            </div>
            <div className="ff-success-title">Correct!</div>
            <div className="ff-success-figure">{successOverlay.figureName}</div>
            <div className="ff-success-points">+{successOverlay.points} points</div>
          </div>
        </div>
      )}

      {humanCorrect && successOverlay === null && ff.status === 'round_active' && (
        <button className="ff-fastforward-btn" onClick={handleFastForwardRound} type="button">
          {ff.currentRound + 1 >= ff.totalRounds ? 'Finish Round' : 'Next Round'}
        </button>
      )}

      {/* Guess input */}
      <div className="ff-input-area">
        <div className="ff-input-row">
          <input
            ref={inputRef}
            className={inputFieldClass}
            type="text"
            value={guessInput}
            onChange={(e) => setGuessInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your guessâ€¦"
            aria-label="Guess the famous figure"
            disabled={
              ff.status !== 'round_active' ||
              successOverlay !== null ||
              humanCorrect ||
              humanId === null ||
              humanCursor >= ff.totalRounds
            }
          />
          <button
            className="ff-submit-btn"
            onClick={handleSubmitGuess}
            disabled={
              ff.status !== 'round_active' ||
              successOverlay !== null ||
              humanCorrect ||
              humanId === null ||
              guessInput.trim().length === 0 ||
              humanCursor >= ff.totalRounds
            }
            aria-label="Submit guess"
          >
            Submit
          </button>
        </div>
        <div className={feedbackClass} aria-live="assertive">
          {feedbackMsg}
        </div>
      </div>

      {/* Scoreboard */}
      {renderScoreboard(ff, participantIds, humanId, displayName, playerAvatar)}
    </div>
  )
}

// â”€â”€â”€ Scoreboard helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function renderScoreboard(
  ff: FamousFiguresState,
  participantIds: string[],
  humanId: string | null,
  displayName: (id: string) => string,
  playerAvatar: (id: string) => string
) {
  const sorted = [...participantIds].sort(
    (a, b) => (ff.playerScores[b] ?? 0) - (ff.playerScores[a] ?? 0)
  )

  return (
    <div className="ff-scoreboard" aria-label="Scoreboard">
      <div className="ff-scoreboard-title">Scoreboard</div>
      <div className="ff-scoreboard-list">
        {sorted.map((id) => {
          const isHuman = id === humanId
          const name = displayName(id)
          const total = ff.playerScores[id] ?? 0
          const roundScores = ff.playerRoundScores[id] ?? []
          const correct = ff.playerCorrect[id]
          return (
            <div key={id} className="ff-scoreboard-row">
              <span className="ff-scoreboard-avatar-wrap">
                <img
                  className="ff-scoreboard-avatar"
                  src={playerAvatar(id)}
                  alt=""
                  aria-hidden="true"
                  onError={(e) => {
                    const img = e.currentTarget
                    // one-shot fallback to Dicebear to avoid infinite onError loop
                    img.onerror = null
                    img.src = `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(name)}`
                  }}
                />
              </span>
              <span className={`ff-scoreboard-name${isHuman ? ' ff-scoreboard-name--you' : ''}`}>
                {isHuman ? 'You' : name}
              </span>
              <span className="ff-scoreboard-round">[{roundScores.join(', ')}]</span>
              <span className="ff-scoreboard-total">{total}</span>
              {correct && (
                <span className="ff-scoreboard-correct" aria-label="Correct this round">
                  âœ“
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

