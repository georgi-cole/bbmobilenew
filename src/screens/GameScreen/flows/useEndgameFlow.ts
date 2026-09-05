import { useCallback, useEffect, useRef, useState } from 'react'
import { advance, finalizePendingEviction } from '../../../store/gameSlice'
import type { AppDispatch, RootState } from '../../../store/store'
import type { ChatLine } from '../../../components/ChatOverlay/ChatOverlay'
import type { Player } from '../../../types'
import { NOMINEE_PLEA_TEMPLATES, pickPhrase } from '../../../utils/juryUtils'

export type Final4Stage = 'idle' | 'pleas' | 'decision' | 'announcement' | 'splash' | 'done'

interface UseEndgameFlowOptions {
  game: RootState['game']
  alivePlayers: Player[]
  humanPlayer: Player | undefined
  humanIsPosHolder: boolean
  isDebugMode: boolean
  spectatorReactEnabled: boolean
  spectatorMode: boolean
  dispatch: AppDispatch
}

/**
 * Owns Final 4, Final 3, spectator, and jury presentation state machines.
 * Store actions continue to own all placements and authoritative outcomes.
 */
export function useEndgameFlow({
  game,
  alivePlayers,
  humanPlayer,
  humanIsPosHolder,
  isDebugMode,
  spectatorReactEnabled,
  spectatorMode,
  dispatch,
}: UseEndgameFlowOptions) {
  // ── Final 3 Part 3 Spectator Mode ─────────────────────────────────────────
  // When the human is NOT the Part-1 or Part-2 finalist, they watch the final
  // battle as a spectator. SpectatorView mounts and plays through the cinematic
  // sequence; advance() is dispatched only after onDone fires so the game engine
  // computes the winner (sets game.lohId) after the spectacle completes.
  const [spectatorF3Active, setSpectatorF3Active] = useState(false)
  const [spectatorF3CompetitorIds, setSpectatorF3CompetitorIds] = useState<string[]>([])
  const spectatorF3AdvancedRef = useRef(false)

  const isF3Part3SpectatorPhase =
    game.phase === 'final3_comp3' &&
    !!humanPlayer &&
    (game.voxPopuli?.status !== 'active' ||
      game.voxPopuli.finalThreePacingSeen?.includes('part3_spectator_ready') === true) &&
    humanPlayer.id !== game.f3Part1WinnerId &&
    humanPlayer.id !== game.f3Part2WinnerId

  // Enter spectator mode on phase arrival. The ref is checked FIRST to prevent
  // a race where a rapid re-render could activate the overlay a second time.
  // advance() is NOT dispatched here; SpectatorView.onDone drives it instead.
  useEffect(() => {
    if (
      isF3Part3SpectatorPhase &&
      !spectatorF3AdvancedRef.current &&
      spectatorReactEnabled &&
      spectatorMode
    ) {
      spectatorF3AdvancedRef.current = true
      const finalists = [game.f3Part1WinnerId, game.f3Part2WinnerId].filter(Boolean) as string[]
      setSpectatorF3CompetitorIds(finalists)
      setSpectatorF3Active(true)
      // DO NOT call advance() here; SpectatorView will call onDone which dispatches advance()
    }
    // `spectatorF3AdvancedRef` is a ref (not reactive) used for deduplication.
    // `dispatch` and `advance` are stable. `spectatorReactEnabled` and
    // `spectatorMode` are included so that if either flag flips
    // while already at final3_comp3 the effect can re-evaluate and activate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isF3Part3SpectatorPhase, spectatorReactEnabled, spectatorMode])

  const handleSpectatorF3Done = useCallback(() => {
    setSpectatorF3Active(false)
    spectatorF3AdvancedRef.current = false
    dispatch(advance())
  }, [dispatch])

  // ── Final 3 Part 2 Spectator Mode ─────────────────────────────────────────
  // Part 2 is played by the two Part-1 losers. SpectatorView must take over
  // whenever the human is not one of those active competitors — including a
  // human who won Part 1 and sits out, or a human who was already eliminated.
  // `advance()` is deferred to onDone so the engine picks the Part-2 winner
  // only after the spectator cinematic finishes.
  const [spectatorF3Part2Active, setSpectatorF3Part2Active] = useState(false)
  const [spectatorF3Part2CompetitorIds, setSpectatorF3Part2CompetitorIds] = useState<string[]>([])
  const spectatorF3Part2AdvancedRef = useRef(false)

  const final3Part2HasActiveHumanCompetitor = game.players.some(
    (player) =>
      player.isUser &&
      player.id !== game.f3Part1WinnerId &&
      player.status !== 'evicted' &&
      player.status !== 'jury'
  )
  const isF3Part2SpectatorPhase =
    game.phase === 'final3_comp2' &&
    !!humanPlayer &&
    (game.voxPopuli?.status !== 'active' ||
      game.voxPopuli.finalThreePacingSeen?.includes('part2_spectator_ready') === true) &&
    !final3Part2HasActiveHumanCompetitor

  useEffect(() => {
    if (
      isF3Part2SpectatorPhase &&
      !spectatorF3Part2AdvancedRef.current &&
      spectatorReactEnabled &&
      spectatorMode
    ) {
      spectatorF3Part2AdvancedRef.current = true
      const alive = game.players.filter((p) => p.status !== 'evicted' && p.status !== 'jury')
      const losers = alive.filter((p) => p.id !== game.f3Part1WinnerId).map((p) => p.id)
      setSpectatorF3Part2CompetitorIds(losers)
      setSpectatorF3Part2Active(true)
    }
    // `spectatorF3Part2AdvancedRef` is a ref used for deduplication — not reactive.
    // `game.players` and `game.f3Part1WinnerId` are guaranteed stable at the moment
    // `isF3Part2SpectatorPhase` becomes true (they're the values that caused it to
    // flip). The dedup ref ensures the body only runs once per phase entry, so
    // there is no staleness risk. `spectatorReactEnabled` and
    // `spectatorMode` are included so re-evaluation happens if
    // either flag is toggled while the phase is already active.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isF3Part2SpectatorPhase, spectatorReactEnabled, spectatorMode])

  const handleSpectatorF3Part2Done = useCallback(() => {
    setSpectatorF3Part2Active(false)
    spectatorF3Part2AdvancedRef.current = false
    dispatch(advance())
  }, [dispatch])

  // ── Final 4 cinematic flow ───────────────────────────────────────────────────
  // Stage machine drives the full Final 4 eviction sequence:
  //   idle         → not yet started (or reset after leaving final4/final3)
  //   pleas        → plea ChatOverlay (all players; blocks FAB)
  //   decision     → TvDecisionModal (human POS only; blocks FAB)
  //   announcement → eviction announcement ChatOverlay (blocks FAB)
  //   splash       → EvictionSplash animation (blocks FAB)
  //   done         → complete; FAB visible so user can advance to final3 comps
  const [final4Stage, setFinal4Stage] = useState<Final4Stage>('idle')
  const [final4PleaLines, setFinal4PleaLines] = useState<ChatLine[]>([])
  const [final4AnnounceLines, setFinal4AnnounceLines] = useState<ChatLine[]>([])
  const [final4DecisionReady, setFinal4DecisionReady] = useState(false)
  const final4DecisionTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  // Reset all Final 4 state when the game leaves the final4/final3 region
  // (e.g. game reset, debug jump to a different phase).
  useEffect(() => {
    if (game.phase === 'final4_eviction' || game.phase === 'final3') return
    if (final4Stage === 'idle') return
    const id = window.setTimeout(() => {
      setFinal4Stage('idle')
      setFinal4PleaLines([])
      setFinal4AnnounceLines([])
    }, 0)
    return () => window.clearTimeout(id)
  }, [game.phase, final4Stage])

  // Enter final4_eviction → build enriched plea lines and start the overlay.
  // For human POS: also dispatch advance() now so plea events are emitted to
  // tvFeed and awaitingPovDecision is set before the decision modal appears.
  // In debug mode the plea cinematic is skipped; advance() is called by the FAB.
  useEffect(() => {
    if (isDebugMode) return
    if (game.phase !== 'final4_eviction' || final4Stage !== 'idle') return
    const povHolder = alivePlayers.find((p) => p.id === game.posWinnerId)
    const nominees = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))
    if (!povHolder || nominees.length === 0) return
    const lines: ChatLine[] = [
      {
        id: 'f4-intro',
        role: 'host',
        text: `${povHolder.name} holds the sole vote to eliminate. Nominees, it's time to make your pleas. 🎤`,
      },
      ...nominees.flatMap((nominee, idx): ChatLine[] => [
        {
          id: `f4-prompt-${nominee.id}`,
          role: 'pos',
          player: povHolder,
          text: `${nominee.name}, the floor is yours. Make your case.`,
        },
        {
          id: `f4-plea-${nominee.id}`,
          role: 'nominee',
          player: nominee,
          text: pickPhrase(NOMINEE_PLEA_TEMPLATES, game.seed, idx),
        },
        {
          id: `f4-thanks-${nominee.id}`,
          role: 'pos',
          player: povHolder,
          text:
            idx < nominees.length - 1
              ? `Thank you, ${nominee.name}.`
              : `Thank you both. I'll take a moment to think. 🤔`,
        },
      ]),
      {
        id: 'f4-thinking',
        role: 'pov-thinking',
        player: povHolder,
        text: '• • •',
      },
    ]
    setFinal4PleaLines(lines)
    setFinal4Stage('pleas')
    if (humanIsPosHolder) {
      dispatch(advance())
    }
  }, [
    isDebugMode,
    game.phase,
    final4Stage,
    alivePlayers,
    game.posWinnerId,
    game.nomineeIds,
    game.seed,
    humanIsPosHolder,
    dispatch,
  ])

  // Plea overlay complete:
  //   human POS → show decision modal
  //   AI POS    → dispatch advance() (AI evicts; phase transitions to final3)
  const handleFinal4PleaComplete = useCallback(() => {
    if (humanIsPosHolder) {
      setFinal4Stage('decision')
    } else {
      dispatch(advance())
      // Stage transitions to 'announcement' via effect below once phase === 'final3'
    }
  }, [humanIsPosHolder, dispatch])

  // Debug mode: auto-commit pendingEviction when in final4_eviction phase and
  // final4Stage is still 'idle' (plea cinematic was skipped). This replaces the
  // eviction-splash flow and transitions the game directly to final3.
  useEffect(() => {
    if (!isDebugMode) return
    if (game.phase !== 'final4_eviction') return
    if (final4Stage !== 'idle') return
    if (!game.pendingEviction?.evicteeId) return
    dispatch(finalizePendingEviction(game.pendingEviction.evicteeId))
  }, [isDebugMode, game.phase, game.pendingEviction?.evicteeId, final4Stage, dispatch])

  // Detect eviction: pendingEviction was set while in pleas/decision stage.
  // With the deferred-commit approach, the phase stays at final4_eviction until
  // finalizePendingEviction runs (after the overlay). Build eviction announcement
  // lines from pendingEviction and move to the announcement stage.
  useEffect(() => {
    if (!game.pendingEviction) return
    if (game.phase !== 'final4_eviction') return
    if (final4Stage !== 'pleas' && final4Stage !== 'decision') return
    const evicted = game.players.find((p) => p.id === game.pendingEviction?.evicteeId)
    if (!evicted) {
      setFinal4Stage('done')
      return
    }
    const povHolder = game.players.find((p) => p.id === game.posWinnerId)
    setFinal4AnnounceLines([
      {
        id: 'f4-evict-decision',
        role: 'pos',
        player: povHolder,
        text: `I vote to evict… ${evicted.name}. 🗳️`,
      },
      {
        id: 'f4-evict-bb',
        role: 'host',
        text: `${evicted.name}, by a vote of 1 to 0, you have been eliminated from The Big Eye house. Please take a moment to say your goodbyes. 👋`,
      },
    ])
    setFinal4Stage('announcement')
  }, [game.pendingEviction, game.phase, final4Stage, game.players, game.posWinnerId])

  const handleFinal4AnnounceComplete = useCallback(() => {
    setFinal4Stage('splash')
  }, [])

  // Orchestrate 3-second delay before the Final-4 decision modal appears for
  // the human POS holder after the plea ChatOverlay completes. Clears and resets
  // when the phase or stage conditions are no longer met.
  useEffect(() => {
    const conditionsMet =
      game.phase === 'final4_eviction' &&
      Boolean(humanIsPosHolder) &&
      Boolean(game.awaitingPovDecision) &&
      final4Stage === 'decision'

    if (!conditionsMet) {
      if (final4DecisionTimerRef.current !== null) {
        window.clearTimeout(final4DecisionTimerRef.current)
        final4DecisionTimerRef.current = null
      }
      setFinal4DecisionReady(false)
      return
    }

    if (final4DecisionTimerRef.current !== null) return

    final4DecisionTimerRef.current = window.setTimeout(() => {
      setFinal4DecisionReady(true)
    }, 3000)
  }, [game.phase, humanIsPosHolder, game.awaitingPovDecision, final4Stage])

  // If the FAB center button is pressed while the 3-second delay is running,
  // cancel the timer and open the decision modal immediately.
  useEffect(() => {
    const handlePlayPressed = () => {
      if (final4DecisionTimerRef.current !== null) {
        window.clearTimeout(final4DecisionTimerRef.current)
        final4DecisionTimerRef.current = null
        setFinal4DecisionReady(true)
      }
    }
    window.addEventListener('ui:playPressed', handlePlayPressed)
    return () => window.removeEventListener('ui:playPressed', handlePlayPressed)
  }, [])

  const showFinal4Chat = game.phase === 'final4_eviction' && final4Stage === 'pleas'
  const showFinal4Modal =
    game.phase === 'final4_eviction' &&
    Boolean(game.awaitingPovDecision) &&
    Boolean(humanIsPosHolder) &&
    ((final4Stage === 'decision' && final4DecisionReady) || (isDebugMode && final4Stage === 'idle'))
  // Announcement: show during final4_eviction (pending commit) OR after final3 transition.
  const showFinal4AnnounceChat =
    (game.phase === 'final4_eviction' || game.phase === 'final3') && final4Stage === 'announcement'
  // Splash is driven by showEvictionSplash (pendingEviction + final4Stage === 'splash')
  // defined in the Eviction Splash section below.

  const final4Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── Final 3 human Final LOH eviction ─────────────────────────────────────
  // Shown when phase is final3_decision and the human player is the Final LOH.
  const humanIsFinalHoh = Boolean(humanPlayer && game.lohId === humanPlayer.id)
  const showFinal3Modal =
    game.awaitingFinal3Eviction === true && game.phase === 'final3_decision' && humanIsFinalHoh

  const final3Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── Jury reveal overlay ───────────────────────────────────────────────────
  // JuryPhaseRevealOverlay handles its own animation sequence (no-animations
  // and prefers-reduced-motion fast-paths are handled inside the component).
  // The no-animations fast-path below advances both jury_announcement and
  // jury_cinematic directly — bypassing the overlay — when body.no-animations
  // is set, and also guards jury_cinematic if it is entered directly (e.g.
  // after a store rehydration).
  useEffect(() => {
    const noAnimations =
      typeof document !== 'undefined' &&
      !!document.body &&
      document.body.classList.contains('no-animations')
    if (!noAnimations) return
    if (game.phase === 'jury_announcement' || game.phase === 'jury_cinematic') {
      dispatch(advance())
    }
  }, [game.phase, dispatch])

  /** Advance jury_announcement → jury_cinematic → jury in one step. No-op in any other phase. */
  const handleEnterJuryVote = useCallback(() => {
    if (game.phase !== 'jury_announcement' && game.phase !== 'jury_cinematic') return
    if (game.phase === 'jury_announcement') {
      dispatch(advance()) // jury_announcement → jury_cinematic
    }
    dispatch(advance()) // jury_cinematic → jury
  }, [dispatch, game.phase])

  const handleSpyJury = useCallback(() => {
    if (import.meta.env.DEV) {
      console.log('[jury-phase] Spy Jury tapped — Jury House module coming soon')
    }
  }, [])

  return {
    spectatorF3Active,
    spectatorF3CompetitorIds,
    handleSpectatorF3Done,
    spectatorF3Part2Active,
    spectatorF3Part2CompetitorIds,
    handleSpectatorF3Part2Done,
    final4Stage,
    setFinal4Stage,
    final4PleaLines,
    final4AnnounceLines,
    showFinal4Chat,
    showFinal4Modal,
    showFinal4AnnounceChat,
    final4Options,
    handleFinal4PleaComplete,
    handleFinal4AnnounceComplete,
    humanIsFinalHoh,
    showFinal3Modal,
    final3Options,
    handleEnterJuryVote,
    handleSpyJury,
  }
}
