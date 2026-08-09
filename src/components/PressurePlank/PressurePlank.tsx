/**
 * PressurePlank — native React minigame component.
 *
 * Modernized survival/endurance game. Players must keep a balance needle
 * inside a narrowing safe zone by tapping LEFT / RIGHT buttons, countering
 * natural drift and periodic surge events.
 *
 * Supports two rendering modes:
 *  1. LOH/POS path: receives `session` + `players`; dispatches `completeMinigame`
 *     with canonical survival standings and winner/last-place IDs.
 *  2. MinigameHost path: receives participant data and reports the same standings.
 *
 * Scoring semantics:
 *  - Score = survival time in seconds, preserved to millisecond precision.
 *  - Higher score = better (matches AI registry: scoreDirection = 'higher-is-better').
 *  - Last-place finisher = lowest score = shortest survival time.
 *  - The component derives lastPlaceId authoritatively and passes it to the store.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslate } from '../../i18n'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { completeMinigame } from '../../store/gameSlice'
import type { CompleteMinigamePayload, MinigameSession, Player } from '../../types'
import {
  PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE,
  PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH,
  PRESSURE_PLANK_ROUND_SECONDS,
  PRESSURE_PLANK_STABILITY_MAX,
  getPressurePlankGaugeSafeZoneBounds,
  getPressurePlankSafeZoneHalfWidth,
  getPressurePlankStabilityDamagePerSecond,
  hasPressurePlankRoundExpired,
  normalizePressurePlankSurvivalSeconds,
  rankPressurePlankResults,
} from './pressurePlankLogic'
import './PressurePlank.css'

// ── Constants ─────────────────────────────────────────────────────────────────

/** Countdown seconds before game starts. */
const READY_COUNT = 3

/** Balance range: -MAX_BALANCE to +MAX_BALANCE. */
const MAX_BALANCE = 100

/** Immediate fall threshold — game ends when |balance| exceeds this. */
const FALL_THRESHOLD = 92

/** Danger zone threshold — warning visual when |balance| exceeds this. */
const DANGER_THRESHOLD = 65

/** Safe zone half-width at the start of the game. */
const SAFE_ZONE_INITIAL = PRESSURE_PLANK_SAFE_ZONE_INITIAL_HALF_WIDTH

/** Weak restoring force: the plank no longer centres itself for an idle player. */
const SPRING_K = 0.16

/** Lower damping preserves momentum and makes over-correction meaningful. */
const DAMPING = 0.95

/** Natural drift added to velocity per second (increases with difficulty). */
const BASE_DRIFT_ACCEL = 8

/** Edge pressure accelerates an already-leaning plank toward a fall. */
const EDGE_PULL_ACCEL = 18

/** How frequently the persistent directional bias mutates. */
const BIAS_CHANGE_RATE = 0.7

/** Each tap shifts velocity by this amount. */
const TAP_IMPULSE = 16

/** Surge event definition. */
interface SurgeEvent {
  /** Direction multiplier: -1 = left, +1 = right. */
  direction: number
  /** Acceleration applied during the surge (units/s²). */
  strength: number
  /** Seconds from game start when surge begins. */
  startsAt: number
  /** Duration in seconds. */
  duration: number
  /** Label shown in UI. */
  label: string
}

/** Fixed surge schedule — becomes more intense over time. */
const SURGE_EVENTS: SurgeEvent[] = [
  { direction: 1, strength: 14, startsAt: 8, duration: 1.8, label: '💨 GUST!' },
  { direction: -1, strength: 16, startsAt: 18, duration: 2.0, label: '🌊 WAVE!' },
  { direction: 1, strength: 20, startsAt: 30, duration: 1.5, label: '⚡ SURGE!' },
  { direction: -1, strength: 18, startsAt: 42, duration: 2.2, label: '💨 GUST!' },
  { direction: 1, strength: 24, startsAt: 55, duration: 1.6, label: '🌊 WAVE!' },
  { direction: -1, strength: 28, startsAt: 68, duration: 1.8, label: '⚡ SURGE!' },
  { direction: 1, strength: 32, startsAt: 80, duration: 2.0, label: '🔥 STORM!' },
  { direction: -1, strength: 36, startsAt: 95, duration: 2.0, label: '🔥 STORM!' },
  { direction: 1, strength: 40, startsAt: 108, duration: 2.4, label: '🌪️ TORNADO!' },
]

// ── Types ─────────────────────────────────────────────────────────────────────

type GamePhase = 'ready' | 'playing' | 'results'

interface ScoreEntry {
  id: string
  name: string
  /** Survival time in seconds. */
  survivalSeconds: number
  /** Native survival time in seconds. */
  score: number
  isHuman: boolean
  eliminated: boolean
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** LOH/POS minigame path: full session data. */
  session?: MinigameSession
  /** LOH/POS minigame path: all game players (for name lookup). */
  players?: Player[]
  /** MinigameHost path: called with the human result plus canonical standings. */
  onFinish?: (
    value: number,
    tiebreakerMs?: number,
    completion?: {
      authoritativeWinnerId?: string | null
      authoritativeLastPlaceId?: string | null
      rawValue?: number
      rawResults?: Record<string, number>
    }
  ) => void
  /** MinigameHost path: competition seed (reserved). */
  seed?: number
  /** MinigameHost path: when true, skip the start countdown delay. */
  autoStart?: boolean
  participantIds?: string[]
  participants?: Array<{
    id: string
    name: string
    isHuman: boolean
    precomputedScore: number
  }>
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PressurePlank({
  session,
  players = [],
  onFinish,
  seed = 0,
  autoStart = false,
  participantIds = [],
  participants = [],
}: Props) {
  const t = useTranslate()
  const dispatch = useAppDispatch()
  const humanId = useAppSelector((s) => s.game.players.find((p) => p.isUser)?.id)

  // ── Phase & countdown ──────────────────────────────────────────────────────

  const [gamePhase, setGamePhase] = useState<GamePhase>('ready')
  const [countdown, setCountdown] = useState(READY_COUNT)

  // ── Rendered game state (updated from RAF loop) ────────────────────────────

  const [balance, setBalance] = useState(0) // -100 to +100
  const [survivalMs, setSurvivalMs] = useState(0)
  const [safeZone, setSafeZone] = useState(SAFE_ZONE_INITIAL)
  const [stability, setStability] = useState(PRESSURE_PLANK_STABILITY_MAX)
  const [activeSurge, setActiveSurge] = useState<SurgeEvent | null>(null)
  const [results, setResults] = useState<ScoreEntry[]>([])
  const [completedRound, setCompletedRound] = useState(false)

  // ── Refs for game loop (avoid stale closures) ──────────────────────────────

  const balanceRef = useRef(0)
  const velocityRef = useRef(0)
  const stabilityRef = useRef(PRESSURE_PLANK_STABILITY_MAX)
  const driftBiasRef = useRef(0)
  const startTimeRef = useRef(0)
  const lastFrameRef = useRef(0)
  const activeSurgeRef = useRef<SurgeEvent | null>(null)
  const rafRef = useRef<number | null>(null)
  const surgeTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const endedRef = useRef(false)

  /**
   * Keep stable refs for props that are read inside the RAF loop.
   * Props are guaranteed stable for one competition session but using refs
   * avoids any stale-closure lint concern and eliminates eslint suppressions.
   */
  const sessionRef = useRef(session)
  const humanIdRef = useRef(humanId)
  const playersRef = useRef(players)
  const onFinishRef = useRef(onFinish)
  const participantIdsRef = useRef(participantIds)
  const participantsRef = useRef(participants)
  useEffect(() => {
    sessionRef.current = session
  })
  useEffect(() => {
    humanIdRef.current = humanId
  })
  useEffect(() => {
    playersRef.current = players
  })
  useEffect(() => {
    onFinishRef.current = onFinish
  })
  useEffect(() => {
    participantIdsRef.current = participantIds
  })
  useEffect(() => {
    participantsRef.current = participants
  })

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      surgeTimeoutsRef.current.forEach(clearTimeout)
    }
  }, [])

  // ── Ready countdown ────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'ready') return
    const timeoutMs = countdown <= 0 || (autoStart && countdown === READY_COUNT) ? 0 : 1000
    const t = setTimeout(() => {
      if (autoStart && countdown === READY_COUNT) {
        setCountdown(0)
        return
      }
      if (countdown <= 0) {
        setGamePhase('playing')
        return
      }
      setCountdown((c) => c - 1)
    }, timeoutMs)
    return () => clearTimeout(t)
  }, [gamePhase, countdown, autoStart])

  // ── Surge scheduling (on play start) ──────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return

    const timeouts: ReturnType<typeof setTimeout>[] = []

    SURGE_EVENTS.forEach((surge) => {
      // Activate surge
      timeouts.push(
        setTimeout(() => {
          activeSurgeRef.current = surge
          setActiveSurge(surge)
        }, surge.startsAt * 1000)
      )
      // Deactivate surge
      timeouts.push(
        setTimeout(
          () => {
            activeSurgeRef.current = null
            setActiveSurge(null)
          },
          (surge.startsAt + surge.duration) * 1000
        )
      )
    })

    surgeTimeoutsRef.current = timeouts
    return () => timeouts.forEach(clearTimeout)
  }, [gamePhase])

  // ── Game over handler ──────────────────────────────────────────────────────

  const endGame = useCallback(
    (finalStartTime: number, completed: boolean) => {
      if (endedRef.current) return
      endedRef.current = true
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      surgeTimeoutsRef.current.forEach(clearTimeout)
      surgeTimeoutsRef.current = []

      const survivalSec = normalizePressurePlankSurvivalSeconds(
        completed ? PRESSURE_PLANK_ROUND_SECONDS : (Date.now() - finalStartTime) / 1000
      )

      const currentSession = sessionRef.current
      const hostedParticipants = participantsRef.current
      const currentHumanId =
        humanIdRef.current ?? hostedParticipants.find((participant) => participant.isHuman)?.id
      const currentPlayers = playersRef.current
      const currentParticipantIds = currentSession?.participants ?? participantIdsRef.current
      const allScores: Record<string, number> = currentSession
        ? { ...currentSession.aiScores }
        : Object.fromEntries(
            hostedParticipants
              .filter((participant) => !participant.isHuman)
              .map((participant) => [participant.id, participant.precomputedScore])
          )
      if (currentHumanId && currentParticipantIds.includes(currentHumanId)) {
        allScores[currentHumanId] = survivalSec
      }

      const ordered = rankPressurePlankResults(
        currentParticipantIds,
        allScores,
        currentSession?.seed ?? seed
      )
      const entries: ScoreEntry[] = ordered.map((result) => {
        const gamePlayer = currentPlayers.find((player) => player.id === result.playerId)
        const hostedPlayer = hostedParticipants.find(
          (participant) => participant.id === result.playerId
        )
        return {
          id: result.playerId,
          name: gamePlayer?.name ?? hostedPlayer?.name ?? result.playerId,
          survivalSeconds: result.survivalSeconds,
          score: result.survivalSeconds,
          isHuman: result.playerId === currentHumanId,
          eliminated: result.survivalSeconds < PRESSURE_PLANK_ROUND_SECONDS,
        }
      })
      setSurvivalMs(survivalSec * 1000)
      setCompletedRound(completed)
      setResults(entries)
      setGamePhase('results')
    },
    // Only refs and stable setters — no prop dependencies needed.
    [seed]
  )

  // ── RAF game loop ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (gamePhase !== 'playing') return

    // Initialise refs
    balanceRef.current = 0
    velocityRef.current = 0
    stabilityRef.current = PRESSURE_PLANK_STABILITY_MAX
    endedRef.current = false
    driftBiasRef.current = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4)
    const startTime = Date.now()
    const startPerf = performance.now()
    startTimeRef.current = startTime
    lastFrameRef.current = startPerf

    // Track when we last updated React state (throttle to ~20 fps for renders)
    let lastReactUpdate = 0

    const loop = (now: number) => {
      const dtMs = now - lastFrameRef.current
      lastFrameRef.current = now
      const dt = Math.min(dtMs / 1000, 0.05) // cap delta to 50ms (handles tab blur)

      const elapsed = (now - startPerf) / 1000

      // Difficulty ramp: drift and edge pressure increase throughout the run.
      const difficultyMult = 1 + elapsed / 45
      const driftAccel = BASE_DRIFT_ACCEL * difficultyMult

      if (Math.random() < BIAS_CHANGE_RATE * dt) {
        driftBiasRef.current = Math.max(
          -14,
          Math.min(14, driftBiasRef.current + (Math.random() - 0.5) * 8)
        )
        if (Math.abs(driftBiasRef.current) < 2.5) {
          driftBiasRef.current = (Math.random() < 0.5 ? -1 : 1) * 3
        }
      }

      const spring = -balanceRef.current * SPRING_K
      const damp = -velocityRef.current * DAMPING
      const surge = activeSurgeRef.current
      const surgeForce = surge ? surge.direction * surge.strength : 0
      const perturbation = (Math.random() - 0.5) * driftAccel * 2
      const edgePull =
        Math.sign(balanceRef.current) *
        Math.pow(Math.abs(balanceRef.current) / MAX_BALANCE, 2) *
        EDGE_PULL_ACCEL *
        difficultyMult

      const acceleration =
        spring + damp + surgeForce + perturbation + driftBiasRef.current + edgePull
      velocityRef.current += acceleration * dt
      balanceRef.current = Math.max(
        -MAX_BALANCE,
        Math.min(MAX_BALANCE, balanceRef.current + velocityRef.current * dt)
      )

      const elapsedSeconds = (Date.now() - startTime) / 1000
      const currentSafeZone = getPressurePlankSafeZoneHalfWidth(elapsedSeconds)
      const damagePerSecond = getPressurePlankStabilityDamagePerSecond(
        balanceRef.current,
        currentSafeZone,
        FALL_THRESHOLD
      )
      if (damagePerSecond > 0) {
        stabilityRef.current = Math.max(0, stabilityRef.current - damagePerSecond * dt)
      }

      // Throttle React state updates to ~20 fps
      if (now - lastReactUpdate >= 50) {
        lastReactUpdate = now
        setBalance(Math.round(balanceRef.current))
        setSurvivalMs(Date.now() - startTime)
        setSafeZone(Number(currentSafeZone.toFixed(2)))
        setStability(Number(stabilityRef.current.toFixed(1)))
      }

      if (hasPressurePlankRoundExpired(elapsed)) {
        endGame(startTime, true)
        return
      }

      // Game over: the physical edge is instant death; stability reaching zero also ends the run.
      if (Math.abs(balanceRef.current) >= FALL_THRESHOLD || stabilityRef.current <= 0) {
        setBalance(balanceRef.current > 0 ? FALL_THRESHOLD : -FALL_THRESHOLD)
        setSurvivalMs(Date.now() - startTime)
        endGame(startTime, false)
        return
      }

      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [gamePhase, endGame])

  // ── Tap handlers ───────────────────────────────────────────────────────────

  const handleTapLeft = useCallback(() => {
    if (gamePhase !== 'playing') return
    velocityRef.current -= TAP_IMPULSE
  }, [gamePhase])

  const handleTapRight = useCallback(() => {
    if (gamePhase !== 'playing') return
    velocityRef.current += TAP_IMPULSE
  }, [gamePhase])

  // ── Done handler (LOH path: dispatches to store) ───────────────────────────

  const handleDone = useCallback(() => {
    const humanScore = results.find((e) => e.isHuman)?.score ?? 0
    const winnerId = results[0]?.id
    const lastPlaceId = results.length > 0 ? results[results.length - 1].id : undefined
    const rawResults = Object.fromEntries(results.map((result) => [result.id, result.score]))
    if (session) {
      const payload: CompleteMinigamePayload = { humanScore, winnerId, lastPlaceId }
      dispatch(completeMinigame(payload))
      return
    }
    onFinishRef.current?.(humanScore, undefined, {
      authoritativeWinnerId: winnerId,
      authoritativeLastPlaceId: lastPlaceId,
      rawValue: humanScore,
      rawResults,
    })
  }, [dispatch, results, session])

  // ── Derived UI values ──────────────────────────────────────────────────────

  const absBalance = Math.abs(balance)
  const outsideSafeZone = absBalance > safeZone + PRESSURE_PLANK_SAFE_ZONE_DAMAGE_GRACE
  const isDanger = absBalance > DANGER_THRESHOLD || stability <= 35
  const isWarning = outsideSafeZone && !isDanger
  const survivalSeconds = (survivalMs / 1000).toFixed(1)
  /** Needle and safe-zone positions share the same -MAX_BALANCE..+MAX_BALANCE scale. */
  const needlePct = ((balance + MAX_BALANCE) / (2 * MAX_BALANCE)) * 100
  const safeZoneBounds = getPressurePlankGaugeSafeZoneBounds(safeZone, MAX_BALANCE)
  const safeLeft = safeZoneBounds.leftPercent
  const safeRight = safeLeft + safeZoneBounds.widthPercent

  const medals = ['🥇', '🥈', '🥉']

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        'pp',
        isDanger ? 'pp--danger' : isWarning ? 'pp--warning' : '',
        gamePhase === 'playing' ? 'pp--playing' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-modal="true"
      aria-label="Pressure Plank Competition"
    >
      <div className="pp__card">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <header className="pp__header">
          <h2 className="pp__title">⚖️ Pressure Plank</h2>
          <p className="pp__subtitle">Stay centred. Lost stability never returns.</p>
        </header>

        {/* ── Ready phase ───────────────────────────────────────────────── */}
        {gamePhase === 'ready' && (
          <div className="pp__ready">
            <div className="pp__countdown" aria-live="polite" aria-atomic="true">
              {countdown > 0 ? countdown : '🏁'}
            </div>
            <p className="pp__hint">
              Tap <strong>◀ LEFT</strong> or <strong>RIGHT ▶</strong>. Leaving the green zone drains
              stability.
            </p>
          </div>
        )}

        {/* ── Playing phase ─────────────────────────────────────────────── */}
        {gamePhase === 'playing' && (
          <div className="pp__game">
            {/* Surge banner */}
            {activeSurge && (
              <div className="pp__surge" aria-live="assertive" aria-atomic="true">
                {activeSurge.label}
              </div>
            )}

            {/* Timer */}
            <div className="pp__timer" aria-label={`Survival time: ${survivalSeconds} seconds`}>
              <span className="pp__timer-value">{survivalSeconds}s</span>
              <span className="pp__timer-label">survived</span>
            </div>

            <div
              className={`pp__stability${stability <= 35 ? ' pp__stability--danger' : ''}`}
              role="progressbar"
              aria-label="Remaining stability"
              aria-valuemin={0}
              aria-valuemax={PRESSURE_PLANK_STABILITY_MAX}
              aria-valuenow={Math.round(stability)}
            >
              <div className="pp__stability-head">
                <span>Stability</span>
                <strong>{Math.ceil(stability)}%</strong>
              </div>
              <div className="pp__stability-track">
                <div className="pp__stability-fill" style={{ width: `${stability}%` }} />
              </div>
            </div>

            {/* Balance gauge */}
            <div
              className="pp__gauge"
              role="meter"
              aria-valuemin={-MAX_BALANCE}
              aria-valuemax={MAX_BALANCE}
              aria-valuenow={balance}
              aria-label="Balance gauge"
            >
              {/* Safe zone band */}
              <div
                className="pp__safe-zone"
                style={{
                  left: `${safeLeft}%`,
                  width: `${safeRight - safeLeft}%`,
                }}
              />

              {/* Danger markers */}
              <div className="pp__danger-left" />
              <div className="pp__danger-right" />

              {/* Needle */}
              <div
                className={[
                  'pp__needle',
                  isDanger ? 'pp__needle--danger' : isWarning ? 'pp__needle--warning' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: `${needlePct}%` }}
              />

              {/* Centre line */}
              <div className="pp__centre-line" />
            </div>

            {/* Balance zone label */}
            <div
              className={[
                'pp__zone-label',
                isDanger
                  ? 'pp__zone-label--danger'
                  : isWarning
                    ? 'pp__zone-label--warning'
                    : 'pp__zone-label--safe',
              ].join(' ')}
              aria-live="polite"
              aria-atomic="true"
            >
              {isDanger ? '⚠️ CRITICAL!' : isWarning ? '⚠ LOSING STABILITY' : '✓ BALANCED'}
            </div>

            {/* Control buttons */}
            <div className="pp__controls">
              <button
                className="pp__btn pp__btn--left"
                onPointerDown={(event) => {
                  event.preventDefault()
                  handleTapLeft()
                }}
                onClick={(event) => {
                  if (event.detail === 0) handleTapLeft()
                }}
                aria-label="Tap left to shift balance left"
                type="button"
              >
                ◀ LEFT
              </button>
              <button
                className="pp__btn pp__btn--right"
                onPointerDown={(event) => {
                  event.preventDefault()
                  handleTapRight()
                }}
                onClick={(event) => {
                  if (event.detail === 0) handleTapRight()
                }}
                aria-label="Tap right to shift balance right"
                type="button"
              >
                RIGHT ▶
              </button>
            </div>

            {/* Safe zone width indicator */}
            <div className="pp__safe-hint">
              {t('pressurePlank.safeZone')}{' '}
              <strong>{safeZoneBounds.widthPercent.toFixed(0)}%</strong>
            </div>
          </div>
        )}

        {/* ── Results phase ─────────────────────────────────────────────── */}
        {gamePhase === 'results' && (
          <div className="pp__results">
            <div className="pp__results-fell">
              {completedRound ? '🏁 You survived the full round!' : '🫸 You fell off!'}
            </div>
            <div className="pp__results-time">Survived: {survivalSeconds}s</div>

            <ol className="pp__leaderboard" aria-label="Competition results">
              {results.map((entry, idx) => (
                <li
                  key={entry.id}
                  className={[
                    'pp__leaderboard-row',
                    entry.isHuman ? 'pp__leaderboard-row--human' : '',
                    idx === results.length - 1 ? 'pp__leaderboard-row--last' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="pp__rank">
                    {idx < medals.length ? medals[idx] : `#${idx + 1}`}
                  </span>
                  <span className="pp__player-name">
                    {entry.name}
                    {entry.isHuman ? ' (you)' : ''}
                  </span>
                  <span className="pp__player-score">{entry.survivalSeconds.toFixed(1)}s</span>
                </li>
              ))}
            </ol>

            {(session || onFinish) && (
              <button className="pp__continue" onClick={handleDone} type="button">
                Continue ▶
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
