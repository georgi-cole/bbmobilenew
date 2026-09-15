/**
 * SpectatorView — fullscreen spectator mode overlay.
 *
 * Authoritative-first: subscribes to Redux game.lohId, the 'minigame:end'
 * CustomEvent, and window.game.__authoritativeWinner as fallbacks.
 *
 * Props:
 *   competitorIds   — player IDs competing (1–N)
 *   minigameId      — optional identifier for the competition
 *   variant         — visual style ('holdwall' | 'trivia' | 'maze')
 *   onDone          — called once the reveal animation completes
 *   showImmediately — skip the entry animation (default false)
 *   roundLabel      — e.g. "Final 3 · Part 3" shown in the HUD
 *   expectedWinnerId — pre-computed authoritative winner ID; the reveal always
 *                      matches this player (pass before opening the spectator).
 *   placement       — 'fullscreen' renders via portal to document.body (default);
 *                     'embed' renders inline in the current DOM node.
 */

import { useEffect, useCallback, useRef, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAppDispatch, useAppSelector } from '../../../store/hooks'
import { openSpectator, closeSpectator } from '../../../store/gameSlice'
import { resolveAvatar, getDicebear } from '../../../utils/avatar'
import { resolvePresentationAvatar } from '../../../utils/presentationAvatar'
import FullSizeCutoutImage from '../../FullSizeCutoutImage/FullSizeCutoutImage'
import FinalPowerHolderReveal from '../../FinalPowerBattle/FinalPowerHolderReveal'
import type { Player } from '../../../types'
import { useSpectatorSimulation } from './progressEngine'
import { trackProductEvent } from '../../../services/liveOps/productTelemetry'
import HoldWallVariant from './HoldWallVariant'
import TriviaVariant from './TriviaVariant'
import MazeVariant from './MazeVariant'
import './styles.css'

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpectatorVariant = 'holdwall' | 'trivia' | 'maze'

export interface SpectatorViewProps {
  competitorIds: string[]
  minigameId?: string
  variant?: SpectatorVariant
  onDone?: () => void
  showImmediately?: boolean
  roundLabel?: string
  /** Pre-known authoritative winner (e.g. from legacy adapter's winnerId). */
  initialWinnerId?: string
  /**
   * Pre-computed authoritative winner ID resolved before the spectator opens.
   * Takes priority over initialWinnerId.  The reveal always matches this player.
   */
  expectedWinnerId?: string
  /**
   * Render placement.  'fullscreen' (default) renders the overlay via portal
   * to document.body.  'embed' renders the overlay inline in the current DOM
   * node, suitable for the minigame panel in Final-3 parts.
   */
  placement?: 'fullscreen' | 'embed'
  /** Short, viewer-specific explanation of why this round matters. */
  viewerMessage?: string
  /** The outcome at stake, shown above the competition visualization. */
  stakesLabel?: string
  /** Applies a distinct Final Three presentation without changing simulation logic. */
  presentation?: 'standard' | 'final-three-part1' | 'final-three-part2' | 'final-three-part3'
  onPlayAvailabilityChange?: (available: boolean) => void
}

// ── Window type augmentation ──────────────────────────────────────────────────

declare global {
  interface Window {
    game?: {
      __authoritativeWinner?: string
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VARIANT_LABELS: Record<SpectatorVariant, string> = {
  holdwall: 'Hold the Wall',
  trivia: 'Trivia Challenge',
  maze: 'Maze Run',
}

const VARIANT_ICONS: Record<SpectatorVariant, string> = {
  holdwall: '🧱',
  trivia: '❓',
  maze: '🌀',
}

// ── Live narration lines shown during the simulation phase ────────────────────

const NARRATION_LINES: Record<SpectatorVariant, string[]> = {
  holdwall: [
    'Competitors holding on for dear life! 💪',
    'Every second counts in this endurance battle! ⏱️',
    'The physical toll is starting to show… 😤',
    'Who will be the last one standing? 🧱',
    'Can they hold on just a little longer? 🤞',
    'This is what The Big Eye is all about! 🔥',
    'The crowd is going wild! 🎉',
    'Pure determination on display right now! ⚡',
  ],
  trivia: [
    'The questions keep coming — do they know their BB history? 📚',
    'A wrong answer could cost everything! 😬',
    'Buzzing in with total confidence! ⚡',
    'Every correct answer brings them closer to glory! ✨',
    'The competition is heating up fast! 🔥',
    'One slip-up could flip the whole game! 😰',
    'They are laser-focused right now! 🎯',
    'Knowledge is power in The Big Eye house! 🏠',
  ],
  maze: [
    'Navigating through the twists and turns! 🌀',
    'One wrong turn could cost them the game! ⚠️',
    'Racing through the labyrinth at full speed! 🏃',
    'The path to victory is winding… 🗺️',
    'Who will find the exit first? 🚪',
    'The maze is getting trickier by the second! 😰',
    'They can almost see the finish line! 🏁',
    'Every step matters in this critical moment! 👣',
  ],
}

// ── Floating emoji elements for backdrop ambiance ─────────────────────────────

const FLOATER_EMOJIS = ['🏆', '⭐', '🔥', '✨', '🎯', '💫', '🌟', '👑', '🎉', '❤️‍🔥']
const FLOATER_CONFIG = [
  { left: '8%', delay: '0s', dur: '5.2s' },
  { left: '18%', delay: '1.4s', dur: '4.8s' },
  { left: '30%', delay: '0.6s', dur: '6.1s' },
  { left: '45%', delay: '2.2s', dur: '5.5s' },
  { left: '58%', delay: '0.9s', dur: '4.6s' },
  { left: '70%', delay: '1.8s', dur: '5.9s' },
  { left: '82%', delay: '3.1s', dur: '5.3s' },
  { left: '92%', delay: '0.3s', dur: '6.4s' },
]

function FinalPowerBattleArena({
  competitors,
  players,
  phase,
  simPct,
  simulationStarted,
  resolveAvatarForId,
  getPlayerName,
}: {
  competitors: { id: string; score: number }[]
  players: Player[]
  phase: 'simulating' | 'reconciling'
  simPct: number
  simulationStarted: boolean
  resolveAvatarForId: (id: string) => string
  getPlayerName: (id: string | undefined) => string
}) {
  const leader = [...competitors].sort((left, right) => right.score - left.score)[0]
  const runnerUp = [...competitors].sort((left, right) => left.score - right.score)[0]
  const moment =
    phase === 'reconciling'
      ? 'The final result is being confirmed.'
      : simPct < 24
        ? 'Two paths remain. One decision changes everything.'
        : simPct < 53
          ? `${getPlayerName(leader?.id)} finds an opening. The other finalist is still in reach.`
          : simPct < 78
            ? 'Momentum shifts. Neither finalist is giving ground.'
            : simPct < 94
              ? 'One last surge will decide who holds the power.'
              : 'The arena falls quiet. The final result is moments away.'

  return (
    <div className="fpb-duel" data-phase={phase}>
      <div className="fpb-duel__stage" role="group" aria-label="Final Power Battle faceoff">
        <div
          className="fpb-duel__light"
          style={{ left: `${16 + simPct * 0.68}%` }}
          aria-hidden="true"
        />
        {competitors.map((competitor, index) => {
          const player = players.find((candidate) => candidate.id === competitor.id)
          return (
            <div
              className={`fpb-duel__contender fpb-duel__contender--${index === 0 ? 'left' : 'right'}${leader?.id === competitor.id && phase === 'simulating' ? ' is-surging' : ''}`}
              key={competitor.id}
              style={{ opacity: 0.76 + Math.min(competitor.score, 100) / 420 }}
            >
              <div className="fpb-duel__portrait">
                {player ? (
                  <FullSizeCutoutImage player={player} attire="informal" alt="" />
                ) : (
                  <img src={resolveAvatarForId(competitor.id)} alt="" />
                )}
              </div>
              <div className="fpb-duel__nameplate">
                <span>{index === 0 ? 'PART 1 ADVANCER' : 'PART 2 QUALIFIER'}</span>
                <strong>{getPlayerName(competitor.id)}</strong>
              </div>
            </div>
          )
        })}
        <div className="fpb-duel__versus" aria-hidden="true">
          VS
        </div>
        <div className="fpb-duel__floor" aria-hidden="true" />
      </div>
      <div className="fpb-duel__live" aria-label="Live battle progress">
        <div className="fpb-duel__live-heading">
          <span className={simulationStarted ? 'is-on-air' : ''} aria-hidden="true" />
          {simulationStarted
            ? phase === 'reconciling'
              ? 'RESULT UNDER REVIEW'
              : 'LIVE BATTLE'
            : 'AWAITING PLAY'}
          {simulationStarted && <span className="fpb-duel__clock">{Math.min(simPct, 99)}%</span>}
        </div>
        {competitors.map((competitor) => (
          <div className="fpb-duel__progress" key={competitor.id}>
            <span>{getPlayerName(competitor.id)}</span>
            <div className="fpb-duel__progress-track" aria-hidden="true">
              <span
                className={leader?.id === competitor.id ? 'is-leading' : ''}
                style={{ width: `${simulationStarted ? Math.max(3, competitor.score) : 3}%` }}
              />
            </div>
            <strong>{simulationStarted ? Math.round(competitor.score) : '—'}</strong>
          </div>
        ))}
      </div>
      <p className="fpb-duel__moment" aria-live="polite" aria-atomic="true">
        {moment}
      </p>
      <span className="fpb-duel__sr-only">
        {getPlayerName(leader?.id)} has the current simulated lead over{' '}
        {getPlayerName(runnerUp?.id)}.
      </span>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract a player ID string from window.game.__authoritativeWinner.
 * The value may be a plain string or an object with a `playerId` field (e.g.
 * the shape written by legacy hold-wall.js code).  Returns null for any
 * unrecognised shape.
 */
function extractAuthoritativeWinnerId(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'playerId' in value) {
    const id = (value as { playerId: unknown }).playerId
    return typeof id === 'string' ? id : null
  }
  return null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SpectatorView({
  competitorIds,
  minigameId,
  variant = 'holdwall',
  onDone,
  showImmediately = false,
  roundLabel = 'Final 3 · Part 3',
  initialWinnerId: propInitialWinnerId,
  expectedWinnerId: propExpectedWinnerId,
  placement = 'fullscreen',
  viewerMessage,
  stakesLabel,
  presentation = 'standard',
  onPlayAvailabilityChange,
}: SpectatorViewProps) {
  const dispatch = useAppDispatch()
  const players = useAppSelector((s) => s.game.players)
  const lohId = useAppSelector((s) => s.game.lohId)
  const isVoxPopuli = useAppSelector((s) => s.game.voxPopuli?.status === 'active')
  const isFinalThreePresentation = presentation !== 'standard'

  // Sync onDone into a ref via effect (not during render) to satisfy the
  // react-hooks/refs lint rule while still keeping the callback fresh.
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  // ── Open / close spectator in Redux store ─────────────────────────────────
  // openSpectator blocks advance() while the overlay is mounted; closeSpectator
  // unblocks it.  closedRef tracks whether closeSpectator was already dispatched
  // via onReconciled so the cleanup does not issue a redundant second dispatch.
  // The parent (GameScreen) uses a `key` prop tied to competitorIds/minigameId,
  // so prop changes trigger a full remount — these values are stable per mount.

  const closedRef = useRef(false)
  const finaleContinuedRef = useRef(false)
  const [finaleResultReady, setFinaleResultReady] = useState(false)

  useEffect(() => {
    closedRef.current = false
    trackProductEvent('final3_spectator_started', {
      minigame_id: minigameId ?? null,
      variant,
      presentation,
      placement,
    })
    if (import.meta.env.DEV) {
      console.log('[SpectatorView] mount — openSpectator', {
        competitorIds,
        minigameId,
        variant,
        placement,
      })
    }
    dispatch(
      openSpectator({
        competitorIds,
        minigameId,
        variant,
        expectedWinnerId: propExpectedWinnerId ?? propInitialWinnerId ?? undefined,
        placement,
        startedAt: Date.now(),
      })
    )
    return () => {
      if (!closedRef.current) {
        if (import.meta.env.DEV) {
          console.log('[SpectatorView] unmount — closeSpectator (cleanup)')
        }
        dispatch(closeSpectator())
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once — openSpectator records the mount-time snapshot

  // ── Resolve authoritative winner from multiple sources ────────────────────

  // Synchronous check at mount time only — window.game.__authoritativeWinner
  // is a legacy, optional mutable global from older builds/integrations. It may
  // be an object with a `playerId` field (Hold the Wall) or a plain string.
  // Validated against competitorIds so a stale or unrelated winner ID is ignored.
  const windowAuthWinner = useMemo<string | null>(() => {
    if (typeof window === 'undefined') return null
    const w = window.game?.__authoritativeWinner
    const winnerId = extractAuthoritativeWinnerId(w)
    return winnerId && competitorIds.includes(winnerId) ? winnerId : null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally runs once at mount — this is synchronous detection only

  // lohId from Redux store — may be set before or after mount
  const reduxWinner = lohId && competitorIds.includes(lohId) ? lohId : null

  // expectedWinnerId (highest priority — pre-computed before the overlay opens);
  // falls back to initialWinnerId, then window global, then Redux lohId.
  const resolvedExpectedWinner =
    propExpectedWinnerId && competitorIds.includes(propExpectedWinnerId)
      ? propExpectedWinnerId
      : propInitialWinnerId && competitorIds.includes(propInitialWinnerId)
        ? propInitialWinnerId
        : null

  const initialWinner = resolvedExpectedWinner ?? windowAuthWinner ?? reduxWinner ?? null

  // ── Simulation hook ───────────────────────────────────────────────────────

  const {
    state: simState,
    setAuthoritativeWinner,
    start: startSimulation,
    hasStarted: simulationStarted,
    skip,
  } = useSpectatorSimulation({
    competitorIds,
    initialWinnerId: initialWinner ?? undefined,
    onReconciled: useCallback(
      (winnerId: string) => {
        if (import.meta.env.DEV) {
          console.log('[SpectatorView] reveal complete — closeSpectator, onDone', { winnerId })
        }
        trackProductEvent('final3_spectator_completed', { winner_known: Boolean(winnerId) })
        if (presentation !== 'standard') {
          closedRef.current = true
          dispatch(closeSpectator())
          setFinaleResultReady(true)
          return
        }
        closedRef.current = true
        dispatch(closeSpectator())
        onDoneRef.current?.()
      },
      [dispatch, presentation]
    ),
    startOnMount: presentation === 'standard',
    simulationDurationMs: presentation === 'standard' ? undefined : 6000,
  })

  const skipRef = useRef(skip)
  useEffect(() => {
    skipRef.current = skip
  }, [skip])

  // Fast-path: skip the simulation immediately when animations are disabled.
  useEffect(() => {
    if (isFinalThreePresentation && !simulationStarted) return
    if (document.body.classList.contains('no-animations')) {
      skipRef.current?.()
    }
  }, [isFinalThreePresentation, simulationStarted])

  useEffect(() => {
    if (!isFinalThreePresentation) return undefined
    const handleFinalePlay = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (simState.phase === 'revealed' && finaleResultReady) {
        if (finaleContinuedRef.current) return
        finaleContinuedRef.current = true
        onDoneRef.current?.()
        return
      }
      if (simState.phase === 'reconciling') return
      if (!simulationStarted) {
        startSimulation()
        return
      }
      skip()
    }
    window.addEventListener('ui:playPressed', handleFinalePlay)
    return () => window.removeEventListener('ui:playPressed', handleFinalePlay)
  }, [
    finaleResultReady,
    isFinalThreePresentation,
    simState.phase,
    simulationStarted,
    skip,
    startSimulation,
  ])

  useEffect(() => {
    onPlayAvailabilityChange?.(!isFinalThreePresentation || simState.phase !== 'reconciling')
  }, [isFinalThreePresentation, onPlayAvailabilityChange, simState.phase])

  // Capture competitorIds in a ref so event handlers always see the current
  // list without needing to re-register on every render.
  const competitorIdsRef = useRef(competitorIds)
  useEffect(() => {
    competitorIdsRef.current = competitorIds
  }, [competitorIds])

  // ── Listen for Redux lohId arriving after mount ───────────────────────────

  useEffect(() => {
    if (reduxWinner) {
      setAuthoritativeWinner(reduxWinner)
    }
  }, [reduxWinner, setAuthoritativeWinner])

  // ── Listen for 'minigame:end' CustomEvent ─────────────────────────────────
  // setAuthoritativeWinner is idempotent (no-op if already locked), so no
  // need to gate on simState.phase — removing the phase dependency avoids
  // the listener being torn down and re-registered on every phase transition.

  useEffect(() => {
    function handleMinigameEnd(e: Event) {
      const detail = (e as CustomEvent<{ winnerId?: string; winner?: string }>).detail
      const wid = detail?.winnerId ?? detail?.winner
      // Only accept a winner that is one of the known competitors.
      if (!wid || !competitorIdsRef.current.includes(wid)) return
      setAuthoritativeWinner(wid)
    }
    window.addEventListener('minigame:end', handleMinigameEnd)
    return () => window.removeEventListener('minigame:end', handleMinigameEnd)
  }, [setAuthoritativeWinner]) // setAuthoritativeWinner is stable

  // ── Listen for legacy 'spectator:show' (optional winnerId in detail) ──────

  useEffect(() => {
    function handleSpectatorShow(e: Event) {
      const detail = (e as CustomEvent<{ winnerId?: string }>).detail
      const wid = detail?.winnerId
      if (!wid || !competitorIdsRef.current.includes(wid)) return
      setAuthoritativeWinner(wid)
    }
    window.addEventListener('spectator:show', handleSpectatorShow)
    return () => window.removeEventListener('spectator:show', handleSpectatorShow)
  }, [setAuthoritativeWinner]) // setAuthoritativeWinner is stable

  // ── Keyboard support — Space / Enter to skip to results ──────────────────
  // Available immediately; delegates to skip() which is now always active.

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[SpectatorView] runPhase start', { variant, placement })
    }
    function handleKey(e: KeyboardEvent) {
      if (e.code !== 'Space' && e.code !== 'Enter') return
      // Finale scenes are controlled through the shared Play button. A global
      // key handler here would steal the focused dock button's Space/Enter key.
      if (isFinalThreePresentation) return
      e.preventDefault()
      if (import.meta.env.DEV) {
        console.log('[SpectatorView] skip via keyboard', e.code)
      }
      skip()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isFinalThreePresentation, variant, placement, skip])

  // ── Avatar + name helpers ─────────────────────────────────────────────────

  const getPlayerName = useCallback(
    (id: string | undefined) => {
      if (!id) return 'Unknown'
      return players.find((p) => p.id === id)?.name ?? id
    },
    [players]
  )

  const resolveAvatarForId = useCallback(
    (id: string) => {
      const player = players.find((p) => p.id === id)
      if (player) return resolvePresentationAvatar(resolveAvatar(player))
      return getDicebear(id)
    },
    [players]
  )

  // ── Rotating live narration during simulation ─────────────────────────────

  const [narrationIdx, setNarrationIdx] = useState(0)
  useEffect(() => {
    if (simState.phase !== 'simulating') return
    const lines = NARRATION_LINES[variant]
    const id = setInterval(() => {
      setNarrationIdx((i) => (i + 1) % lines.length)
    }, 2200)
    return () => clearInterval(id)
  }, [simState.phase, variant])

  // ── Determine status label ────────────────────────────────────────────────

  const winnerName = simState.authoritativeWinnerId
    ? getPlayerName(simState.authoritativeWinnerId)
    : 'Winner'
  const finalPowerWinner =
    presentation === 'final-three-part3' && simState.phase === 'revealed'
      ? (players.find((player) => player.id === simState.authoritativeWinnerId) ?? null)
      : null

  const statusLabel =
    simState.phase === 'revealed'
      ? `${winnerName} wins! 🏆`
      : simState.phase === 'reconciling'
        ? 'Revealing winner…'
        : NARRATION_LINES[variant][narrationIdx % NARRATION_LINES[variant].length]

  // ── HUD timer text ────────────────────────────────────────────────────────

  const hudTimerText =
    simState.phase === 'simulating'
      ? simState.simPct >= 90
        ? 'Reveal soon…'
        : `${simState.simPct}%`
      : simState.phase === 'reconciling'
        ? 'Revealing…'
        : ''

  const hudPillLabel =
    simState.phase === 'simulating'
      ? 'Playing'
      : simState.phase === 'reconciling'
        ? 'Reveal'
        : 'Result'

  const finaleTitle =
    presentation === 'final-three-part1'
      ? 'THE ADVANCEMENT'
      : presentation === 'final-three-part2'
        ? 'THE QUALIFIER'
        : 'THE FINAL POWER BATTLE'
  const finaleCopy =
    presentation === 'final-three-part1'
      ? !simulationStarted
        ? 'Three finalists begin the battle. The winner advances directly to Part 3. Press Play when you are ready to watch.'
        : simState.phase === 'revealed'
          ? `${winnerName} wins Part 1 and advances directly to Part 3.`
          : 'All three finalists are fighting for a direct place in Part 3.'
      : presentation === 'final-three-part2'
        ? !simulationStarted
          ? 'The Part 1 winner is safely through. Press Play to watch the other two finalists battle for the last place in the final.'
          : simState.phase === 'revealed'
            ? `${winnerName} takes the final place in the Final Power Battle.`
            : 'One finalist waits in the final. These two are fighting for the only remaining place.'
        : !simulationStarted
          ? isVoxPopuli
            ? 'The winner will earn final immunity. The audience will decide who claims the remaining place in the Final Two. Press Play when you are ready to watch the battle.'
            : 'Two finalists remain. One last contest will decide who controls the Final Two.'
          : simState.phase === 'revealed'
            ? isVoxPopuli
              ? `${winnerName} wins final immunity. The audience vote will decide the other Final Two place.`
              : `${winnerName} takes the final power.`
            : isVoxPopuli
              ? 'The finalists are battling for immunity. Their result sets up the audience vote for the remaining Final Two place.'
              : 'The player on the block can only watch. This battle decides who controls the Final Two.'

  // ── Render via portal ─────────────────────────────────────────────────────

  const overlay = (
    <div
      className={`spectator-overlay${showImmediately ? ' spectator-overlay--immediate' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Spectator Mode: ${VARIANT_LABELS[variant]}`}
      data-phase={simState.phase}
      data-minigame-id={minigameId}
      data-presentation={presentation}
    >
      {/* Animated backdrop */}
      <div className="spectator-overlay__backdrop" aria-hidden="true" />

      {/* Flying emoji floaters — ambient background effect during simulation */}
      {simState.phase === 'simulating' && !isFinalThreePresentation && (
        <div className="spectator-overlay__floaters" aria-hidden="true">
          {FLOATER_CONFIG.map((cfg, i) => (
            <span
              key={i}
              className="sv-floater"
              style={{
                left: cfg.left,
                animationDelay: cfg.delay,
                animationDuration: cfg.dur,
              }}
            >
              {FLOATER_EMOJIS[i % FLOATER_EMOJIS.length]}
            </span>
          ))}
        </div>
      )}

      {!isFinalThreePresentation && (
        <div className="spectator-hud" aria-hidden="true">
          <div className="spectator-hud__left">
            <span className="spectator-hud__icon">{VARIANT_ICONS[variant]}</span>
            <div>
              <div className="spectator-hud__now-playing">Now Playing</div>
              <div className="spectator-hud__round">{roundLabel}</div>
            </div>
          </div>
          <div className="spectator-hud__right">
            <span className={`spectator-hud__pill spectator-hud__pill--${simState.phase}`}>
              <span className="spectator-hud__pill-dot" />
              {hudPillLabel}
            </span>
            {hudTimerText && <span className="spectator-hud__timer">{hudTimerText}</span>}
          </div>
        </div>
      )}

      {isFinalThreePresentation ? (
        finalPowerWinner ? (
          <FinalPowerHolderReveal
            player={finalPowerWinner}
            mode={isVoxPopuli ? 'vox_populi' : 'classic'}
            continueCopy="Press Play when you are ready to continue."
            modal={false}
          />
        ) : (
          <section className="spectator-finale" aria-live="polite">
            <p className="spectator-finale__network">THE BIG EYE · FINALE NIGHT</p>
            <div className="spectator-finale__title-wrap">
              <p>
                {presentation === 'final-three-part1'
                  ? 'PART 1'
                  : presentation === 'final-three-part2'
                    ? 'PART 2'
                    : 'PART 3'}
              </p>
              <h2>{finaleTitle}</h2>
            </div>
            {presentation !== 'final-three-part3' && (
              <div className="spectator-finale__cast" aria-label="Competitors">
                {simState.competitors.map((competitor, index) => (
                  <div
                    className={`spectator-finale__player${competitor.isWinner ? ' is-winner' : ''}`}
                    key={competitor.id}
                  >
                    <img
                      src={resolveAvatarForId(competitor.id)}
                      alt={getPlayerName(competitor.id)}
                      onError={(event) => {
                        const image = event.currentTarget
                        const fallback = getDicebear(getPlayerName(competitor.id))
                        if (image.src !== fallback) image.src = fallback
                      }}
                    />
                    <strong>{getPlayerName(competitor.id)}</strong>
                    {index === 0 && simState.competitors.length === 2 && <span>VS</span>}
                  </div>
                ))}
              </div>
            )}
            {presentation !== 'final-three-part3' && (
              <p className="spectator-finale__copy">{finaleCopy}</p>
            )}
            <div className="spectator-finale__arena">
              {presentation === 'final-three-part3' ? (
                <FinalPowerBattleArena
                  competitors={simState.competitors}
                  players={players}
                  phase={simState.phase === 'reconciling' ? 'reconciling' : 'simulating'}
                  simPct={simState.simPct}
                  simulationStarted={simulationStarted}
                  resolveAvatarForId={resolveAvatarForId}
                  getPlayerName={getPlayerName}
                />
              ) : variant === 'holdwall' ? (
                <HoldWallVariant
                  competitors={simState.competitors}
                  phase={simState.phase}
                  resolveAvatar={resolveAvatarForId}
                  getPlayerName={getPlayerName}
                />
              ) : variant === 'trivia' ? (
                <TriviaVariant
                  competitors={simState.competitors}
                  phase={simState.phase}
                  simPct={simState.simPct}
                  resolveAvatar={resolveAvatarForId}
                  getPlayerName={getPlayerName}
                />
              ) : variant === 'maze' ? (
                <MazeVariant
                  competitors={simState.competitors}
                  phase={simState.phase}
                  resolveAvatar={resolveAvatarForId}
                  getPlayerName={getPlayerName}
                />
              ) : null}
            </div>
            <p className="spectator-finale__play-cue">
              {finaleResultReady
                ? 'Winner revealed. Press Play when you are ready to continue.'
                : simState.phase === 'reconciling'
                  ? 'The result is being confirmed. The broadcast will continue in a moment.'
                  : simState.phase === 'revealed'
                    ? 'The winner is confirmed. Press Play when you are ready to continue.'
                    : simulationStarted
                      ? 'Press Play to reveal the result now, or stay and watch the battle.'
                      : 'Press Play to begin the broadcast.'}
            </p>
          </section>
        )
      ) : (
        <div className="spectator-overlay__card">
          {/* Header */}
          <header className="spectator-overlay__header">
            <div className="spectator-overlay__header-row">
              <h2 className="spectator-overlay__title">
                {VARIANT_ICONS[variant]} {VARIANT_LABELS[variant]}
              </h2>
              <span
                className={`spectator-overlay__status-chip spectator-overlay__status-chip--${simState.phase}`}
              >
                {hudPillLabel}
              </span>
            </div>
            <p className="spectator-overlay__status" aria-live="polite" aria-atomic="true">
              {statusLabel}
            </p>
            {(viewerMessage || stakesLabel) && (
              <div className="spectator-overlay__stakes" aria-live="polite">
                {viewerMessage && (
                  <p className="spectator-overlay__viewer-message">{viewerMessage}</p>
                )}
                {stakesLabel && <p className="spectator-overlay__stakes-label">{stakesLabel}</p>}
              </div>
            )}
          </header>

          {/* Competitor chips (cast row) */}
          <div className="spectator-overlay__competitors" aria-label="Competitors">
            {simState.competitors.map((c) => (
              <div
                key={c.id}
                className={`spectator-overlay__chip${c.isWinner ? ' spectator-overlay__chip--winner' : ''}`}
              >
                <img
                  src={resolveAvatarForId(c.id)}
                  alt={getPlayerName(c.id)}
                  className="spectator-overlay__chip-avatar"
                  onError={(e) => {
                    const img = e.currentTarget as HTMLImageElement
                    const name = getPlayerName(c.id)
                    const fb = getDicebear(name)
                    if (img.src !== fb) {
                      img.src = fb
                    } else {
                      img.style.display = 'none'
                    }
                  }}
                />
                <span className="spectator-overlay__chip-name">{getPlayerName(c.id)}</span>
                {c.isWinner && (
                  <span className="spectator-overlay__chip-crown" aria-label="winner">
                    👑
                  </span>
                )}
                {simState.phase === 'simulating' && !c.isWinner && (
                  <span className="sv-thinking-dots" aria-hidden="true">
                    <span className="sv-thinking-dot" />
                    <span className="sv-thinking-dot" />
                    <span className="sv-thinking-dot" />
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Variant-specific visualization */}
          {variant === 'holdwall' && (
            <HoldWallVariant
              competitors={simState.competitors}
              phase={simState.phase}
              resolveAvatar={resolveAvatarForId}
              getPlayerName={getPlayerName}
            />
          )}
          {variant === 'trivia' && (
            <TriviaVariant
              competitors={simState.competitors}
              phase={simState.phase}
              simPct={simState.simPct}
              resolveAvatar={resolveAvatarForId}
              getPlayerName={getPlayerName}
            />
          )}
          {variant === 'maze' && (
            <MazeVariant
              competitors={simState.competitors}
              phase={simState.phase}
              resolveAvatar={resolveAvatarForId}
              getPlayerName={getPlayerName}
            />
          )}

          {/* Skip button — always enabled (skip is available immediately) */}
          <div className="spectator-overlay__skip-row">
            <button
              className="spectator-overlay__skip-btn"
              onClick={() => {
                if (import.meta.env.DEV) {
                  console.log('[SpectatorView] skip via button click')
                }
                skip()
              }}
              aria-label="Skip to results"
              type="button"
            >
              Skip to Results
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // For embed placement, render inline (no portal).
  if (placement === 'embed') {
    return overlay
  }

  return createPortal(overlay, document.body)
}
