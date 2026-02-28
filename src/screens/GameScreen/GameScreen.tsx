import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { LayoutGroup, AnimatePresence } from 'framer-motion'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  addTvEvent,
  applyMinigameWinner,
  applyF3MinigameWinner,
  updateGamePRs,
  finalizeFinal4Eviction,
  finalizeFinal3Eviction,
  finalizePendingEviction,
  selectAlivePlayers,
  selectF3Part3PredictedWinnerId,
  commitNominees,
  submitPovDecision,
  submitPovSaveTarget,
  setReplacementNominee,
  submitHumanVote,
  submitTieBreak,
  dismissVoteResults,
  aiReplacementRendered,
  advance,
  completeBattleBack,
  tryActivateBattleBack,
} from '../../store/gameSlice'
import { startChallenge, selectPendingChallenge, completeChallenge } from '../../store/challengeSlice'
import { selectLastSocialReport } from '../../social/socialSlice'
import { selectSocialSummaryOpen } from '../../store/uiSlice'
import TvZone from '../../components/ui/TvZone'
import HouseguestGrid from '../../components/HouseguestGrid/HouseguestGrid'
import TvDecisionModal from '../../components/TvDecisionModal/TvDecisionModal'
import TvMultiSelectModal from '../../components/TvDecisionModal/TvMultiSelectModal'
import TvBinaryDecisionModal from '../../components/TvBinaryDecisionModal/TvBinaryDecisionModal'
import TapRace from '../../components/TapRace/TapRace'
import MinigameHost from '../../components/MinigameHost/MinigameHost'
import type { MinigameParticipant } from '../../components/MinigameHost/MinigameHost'
import FloatingActionBar from '../../components/FloatingActionBar/FloatingActionBar'
import AnimatedVoteResultsModal from '../../components/AnimatedVoteResultsModal/AnimatedVoteResultsModal'
import SpotlightEvictionOverlay from '../../components/Eviction/SpotlightEvictionOverlay'
import CeremonyOverlay from '../../components/CeremonyOverlay/CeremonyOverlay'
import type { CeremonyTile } from '../../components/CeremonyOverlay/CeremonyOverlay'
import SpotlightAnimation from '../../components/SpotlightAnimation/spotlight-animation'
import ChatOverlay from '../../components/ChatOverlay/ChatOverlay'
import type { ChatLine } from '../../components/ChatOverlay/ChatOverlay'
import SocialPanel from '../../components/SocialPanel/SocialPanel'
import SocialPanelV2 from '../../components/SocialPanelV2/SocialPanelV2'
import { FEATURE_SOCIAL_V2, FEATURE_SPECTATOR_REACT } from '../../config/featureFlags'
import SocialSummaryPopup from '../../components/SocialSummary/SocialSummaryPopup'
import SpectatorView from '../../components/ui/SpectatorView'
import type { SpectatorVariant } from '../../components/ui/SpectatorView'
import { resolveAvatar } from '../../utils/avatar'
import { pickPhrase, NOMINEE_PLEA_TEMPLATES } from '../../utils/juryUtils'
import type { Player } from '../../types'
import BattleBackOverlay from '../../components/BattleBackOverlay/BattleBackOverlay'
import { selectSettings } from '../../store/settingsSlice'
import './GameScreen.css'

/**
 * GameScreen — main gameplay view.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │  TvZone (TV action area) │
 *   ├─────────────────────────┤
 *   │  HouseguestGrid          │
 *   │  (alive + evicted tiles) │
 *   └─────────────────────────┘
 *
 * Interactions:
 *   - Tap avatar → logs diary event for the human player
 *   - Evicted houseguests remain in grid with grayscale + red cross overlay
 *
 * To extend: add new sections between TvZone and the roster,
 * or add action buttons by dispatching events via useAppDispatch().
 */
export default function GameScreen() {
  const dispatch = useAppDispatch()
  const alivePlayers = useAppSelector(selectAlivePlayers)
  const game = useAppSelector((s) => s.game)
  const settings = useAppSelector(selectSettings)
  const pendingChallenge = useAppSelector(selectPendingChallenge)
  const lastSocialReport = useAppSelector(selectLastSocialReport)
  const socialSummaryOpen = useAppSelector(selectSocialSummaryOpen)
  const f3Part3PredictedWinnerId = useAppSelector(selectF3Part3PredictedWinnerId)

  const humanPlayer = game.players.find((p) => p.isUser)

  // ── Tile position lookup for CeremonyOverlay ──────────────────────────────
  // Queries a `data-player-id` attribute on the houseguest grid's <li> items so
  // we can get a bounding rect without needing to pass refs through render.
  const getTileRect = useCallback((playerId: string): DOMRect | null => {
    // CSS.escape may be unavailable in some environments (jsdom); fall back to
    // a simple attribute selector when it isn't defined.
    const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(playerId) : playerId
    const el = document.querySelector<HTMLElement>(`[data-player-id="${escaped}"]`)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return rect.width > 0 || rect.height > 0 ? rect : null
  }, [])

  // ── CeremonyOverlay — deferred HOH / POV winner commit ─────────────────
  // When MinigameHost reports a winner, we show the CeremonyOverlay with a
  // spotlight cutout over the winner's tile and a badge (👑/🛡️) that
  // flies from screen centre to the tile.  Only after the animation completes
  // do we dispatch applyMinigameWinner.  When DOMRects are unavailable
  // (tests / headless) the overlay fires onDone immediately so the store
  // mutation still happens — just without the visual.
  //
  // pendingWinnerDispatchRef stores the deferred thunk so handleCeremonyDone
  // can call it without stale-closure issues.
  const [pendingWinnerCeremony, setPendingWinnerCeremony] = useState<{
    tiles: CeremonyTile[]
    caption: string
    subtitle?: string
    ariaLabel: string
    /** Optional live-measure callback for viewport-tracking during zoom/scroll. */
    measureA?: () => DOMRect | null
  } | null>(null)
  const pendingWinnerDispatchRef = useRef<(() => void) | null>(null)

  const handleWinnerCeremonyDone = useCallback(() => {
    pendingWinnerDispatchRef.current?.()
    pendingWinnerDispatchRef.current = null
    setPendingWinnerCeremony(null)
  }, [])

  // ── Advance-picked HOH winner ceremony (outgoing HOH bypass) ──────────
  // When the human is the outgoing HOH, no MinigameHost challenge runs.
  // advance() picks the winner randomly → phase becomes hoh_results with
  // hohId set, but no CeremonyOverlay was shown.  Detect this and fire
  // a spotlight ceremony so the winner reveal is still animated.
  const [advanceHohConsumedKey, setAdvanceHohConsumedKey] = useState<string>('')

  const advanceHohKey = useMemo(() => {
    if (game.phase !== 'hoh_results' || !game.hohId) return ''
    // Only trigger when the human was the outgoing HOH (prevHohId === human id)
    // and the winner ceremony was NOT already shown by MinigameHost.
    if (!game.prevHohId || game.prevHohId !== humanPlayer?.id) return ''
    return `w${game.week}-hoh-${game.hohId}`
  }, [game.phase, game.hohId, game.week, game.prevHohId, humanPlayer?.id])

  const showAdvanceHohCeremony = advanceHohKey !== '' && advanceHohKey !== advanceHohConsumedKey && !pendingWinnerCeremony

  const handleAdvanceHohCeremonyDone = useCallback(() => {
    setAdvanceHohConsumedKey(advanceHohKey)
  }, [advanceHohKey])

  // ── Track last report ID so re-renders don't trigger duplicate effects ────
  // Social summaries are posted exclusively to the Diary Room via
  // SocialSummaryBridge.dispatchSocialSummary → game/addSocialSummary (type 'diary').
  // We do NOT post a TV feed event here; social summaries remain DR-only.
  const prevReportIdRef = useRef<string | null>(lastSocialReport?.id ?? null)
  useEffect(() => {
    if (lastSocialReport && lastSocialReport.id !== prevReportIdRef.current) {
      prevReportIdRef.current = lastSocialReport.id
    }
  }, [lastSocialReport])

  // ── Auto-start challenge on competition phase transitions ─────────────────
  // The challenge system (startChallenge / MinigameHost) is the sole owner of
  // game selection for HOH and POV competitions. It picks a random game from
  // the registry, pre-computes AI scores appropriate for that game's metric kind,
  // and handles the rules modal → countdown → game → results flow.
  //
  // HOH eligibility rule: the outgoing HOH (prevHohId) cannot compete in the
  // next week's HOH competition. They are excluded from the participant list.
  // When the human player is the outgoing HOH, no challenge is started at all
  // (the winner is determined randomly via advance() instead).
  const aliveIds = useMemo(() => alivePlayers.map((p) => p.id), [alivePlayers]);
  const hohCompParticipants = useMemo(() => {
    if (game.phase !== 'hoh_comp' || !game.prevHohId) return aliveIds;
    return aliveIds.filter((id) => id !== game.prevHohId);
  }, [game.phase, game.prevHohId, aliveIds]);

  const humanIsOutgoingHoh = game.phase === 'hoh_comp' && !!game.prevHohId && game.prevHohId === humanPlayer?.id;

  // Warning modal state: shown once per week when the human is the outgoing HOH.
  // Tracks which week the warning was dismissed so it resets automatically each week.
  const [outgoingHohWarningDismissedWeek, setOutgoingHohWarningDismissedWeek] = useState<number | null>(null);
  const showOutgoingHohWarning = humanIsOutgoingHoh && outgoingHohWarningDismissedWeek !== game.week;

  useEffect(() => {
    const isCompPhase = game.phase === 'hoh_comp' || game.phase === 'pov_comp'
    // Do not start a challenge when the human player is the outgoing HOH —
    // they are ineligible to compete; advance() will pick a winner randomly.
    // Also skip when a CeremonyOverlay is pending (challenge result already
    // captured; avoid launching a second challenge while the old one is animating).
    if (isCompPhase && !pendingChallenge && !humanIsOutgoingHoh && !pendingWinnerCeremony) {
      // Use the HOH-eligibility-filtered list only for HOH comps; POV is unrestricted.
      const participants = game.phase === 'hoh_comp' ? hohCompParticipants : aliveIds;
      dispatch(startChallenge(game.seed, participants))
    }
  }, [game.phase, pendingChallenge, hohCompParticipants, aliveIds, game.seed, dispatch, humanIsOutgoingHoh, pendingWinnerCeremony])

  // ── Auto-start challenge for Final 3 minigame phases ─────────────────────
  // When advance() sets phase to final3_comp*_minigame (because a human is
  // participating), start the challenge system so MinigameHost renders.
  const isF3MinigamePhase =
    game.phase === 'final3_comp1_minigame' ||
    game.phase === 'final3_comp2_minigame' ||
    game.phase === 'final3_comp3_minigame'

  useEffect(() => {
    const inF3Minigame =
      game.phase === 'final3_comp1_minigame' ||
      game.phase === 'final3_comp2_minigame' ||
      game.phase === 'final3_comp3_minigame'
    if (inF3Minigame && !pendingChallenge && game.minigameContext) {
      dispatch(startChallenge(game.minigameContext.seed, game.minigameContext.participants))
    }
  }, [game.phase, pendingChallenge, game.minigameContext, dispatch])

  // ── Final 3 Part 3 Spectator Mode ─────────────────────────────────────────
  // When the human is NOT the Part-1 or Part-2 finalist, they watch the final
  // battle as a spectator. SpectatorView mounts and plays through the cinematic
  // sequence; advance() is dispatched only after onDone fires so the game engine
  // computes the winner (sets game.hohId) after the spectacle completes.
  const [spectatorF3Active, setSpectatorF3Active] = useState(false)
  const [spectatorF3CompetitorIds, setSpectatorF3CompetitorIds] = useState<string[]>([])
  const spectatorF3AdvancedRef = useRef(false)

  const isF3Part3SpectatorPhase =
    game.phase === 'final3_comp3' &&
    !!humanPlayer &&
    humanPlayer.id !== game.f3Part1WinnerId &&
    humanPlayer.id !== game.f3Part2WinnerId

  // Enter spectator mode on phase arrival. The ref is checked FIRST to prevent
  // a race where a rapid re-render could activate the overlay a second time.
  // advance() is NOT dispatched here; SpectatorView.onDone drives it instead.
  useEffect(() => {
    if (isF3Part3SpectatorPhase && !spectatorF3AdvancedRef.current && FEATURE_SPECTATOR_REACT && settings.gameUX.spectatorMode) {
      spectatorF3AdvancedRef.current = true
      const finalists = [game.f3Part1WinnerId, game.f3Part2WinnerId].filter(Boolean) as string[]
      setSpectatorF3CompetitorIds(finalists)
      setSpectatorF3Active(true)
      // DO NOT call advance() here; SpectatorView will call onDone which dispatches advance()
    }
  // Intentionally depend only on `isF3Part3SpectatorPhase`. `dispatch` is
  // stable from useAppDispatch and `advance` is a constant action creator, so
  // including them would not change behavior. `spectatorF3AdvancedRef` is a
  // ref (not reactive); if its usage changes, update this dep list.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isF3Part3SpectatorPhase])

  const handleSpectatorF3Done = useCallback(() => {
    setSpectatorF3Active(false)
    spectatorF3AdvancedRef.current = false
    dispatch(advance())
  }, [dispatch])

  // ── Legacy 'spectator:show' event listener ─────────────────────────────────
  // The legacySpectatorAdapter dispatches this event when window.Spectator.show()
  // is called by legacy minigame code. The full event payload (variant, minigameId,
  // winnerId) is stored in state so repeated events update the mounted overlay.
  const [spectatorLegacyPayload, setSpectatorLegacyPayload] = useState<{
    competitorIds: string[]
    variant?: SpectatorVariant
    minigameId?: string
    winnerId?: string
  } | null>(null)
  const spectatorLegacyActive = spectatorLegacyPayload !== null

  // Keep a ref to the current players list so the event handler always validates
  // against up-to-date player IDs without needing to re-register on every change.
  const playersRef = useRef(game.players)
  useEffect(() => {
    playersRef.current = game.players
  }, [game.players])

  // Keep a ref to spectatorMode so the event handler reads the current value
  // without needing to re-register on every settings change.
  const spectatorModeRef = useRef(settings.gameUX.spectatorMode)
  useEffect(() => {
    spectatorModeRef.current = settings.gameUX.spectatorMode
  }, [settings.gameUX.spectatorMode])

  useEffect(() => {
    if (!FEATURE_SPECTATOR_REACT) return
    function handleSpectatorShow(e: Event) {
      if (!spectatorModeRef.current) return
      const detail = (e as CustomEvent<{
        competitorIds?: string[]
        variant?: string
        minigameId?: string
        winnerId?: string
      }>).detail
      const rawIds = detail?.competitorIds ?? []
      // Validate IDs against the current players list (via ref to avoid stale closure).
      const validIds = rawIds.filter((id) => playersRef.current.some((p) => p.id === id))
      if (!validIds.length) return
      const variant = (['holdwall', 'trivia', 'maze'] as SpectatorVariant[]).includes(
        detail?.variant as SpectatorVariant,
      )
        ? (detail.variant as SpectatorVariant)
        : undefined
      setSpectatorLegacyPayload({
        competitorIds: validIds,
        variant,
        minigameId: detail?.minigameId ?? undefined,
        winnerId: detail?.winnerId ?? undefined,
      })
    }
    window.addEventListener('spectator:show', handleSpectatorShow)
    return () => window.removeEventListener('spectator:show', handleSpectatorShow)
  }, []) // registered once; players accessed via ref above

  const handleSpectatorLegacyDone = useCallback(() => {
    setSpectatorLegacyPayload(null)
  }, [])

  function handleAvatarSelect(player: Player) {
    // Demo: log selection to TV feed when you tap your own avatar
    if (player.isUser) {
      dispatch(
        addTvEvent({ text: `${player.name} checks their alliance status 🤫`, type: 'diary' })
      )
    }
  }

  function playerToHouseguest(p: Player) {
    const isEvicted = p.status === 'evicted' || p.status === 'jury'
    const parts: string[] = []
    if (game.hohId === p.id) parts.push('hoh')
    if (game.povWinnerId === p.id) parts.push('pov')
    // Suppress permanent nomination badge while the nomination animation is
    // playing — otherwise AI-HOH nominees (already in game.nomineeIds) would
    // show the permanent ❓ badge before the animated badge lands.
    const isAnimatingNominee = showNomAnim && nomAnimPlayers.some((n) => n.id === p.id)
    if (Array.isArray(game.nomineeIds) && game.nomineeIds.includes(p.id) && !isAnimatingNominee) parts.push('nominated')
    if (p.status === 'jury') parts.push('jury')
    // When suppressing the nominated badge, also guard the p.status fallback so
    // that players whose p.status is already 'nominated' (AI-committed nominees)
    // don't have that status leak through when parts is empty.
    const statuses = parts.length > 0 ? parts.join('+') : (isAnimatingNominee ? 'active' : (p.status ?? 'active'))
    return {
      id: p.id,
      name: p.name,
      avatarUrl: resolveAvatar(p),
      statuses,
      finalRank: (p.finalRank ?? null) as 1 | 2 | 3 | null,
      isEvicted,
      isYou: p.isUser,
      showPermanentBadge: !isAnimatingNominee,
      layoutId: `avatar-tile-${p.id}`,
      isEvicting: showEvictionSplash && pendingEvictionPlayer?.id === p.id,
      onClick: () => handleAvatarSelect(p),
    }
  }

  // ── Human HOH replacement picker ─────────────────────────────────────────
  // Shown when a nominee auto-saved themselves and the human HOH must pick a
  // replacement. The Continue button is hidden while this modal is open.
  // (showReplacementModal is defined below after pendingReplacementCeremony.)
  const replacementNeeded = game.replacementNeeded === true
  const humanIsHoH = humanPlayer && game.hohId === humanPlayer.id

  const replacementOptions = alivePlayers.filter(
    (p) =>
      p.id !== game.hohId &&
      p.id !== game.povWinnerId &&
      !game.nomineeIds.includes(p.id) &&
      p.id !== game.povSavedId
  )

  // ── Nomination animation state ────────────────────────────────────────────
  // pendingNominees holds the player IDs while the animation plays.
  //
  // This state is driven by TWO sources:
  //   1. Human HOH: handleCommitNominees() is called from TvMultiSelectModal's
  //      onConfirm after the stinger finishes.  commitNominees is dispatched in
  //      handleNomAnimDone — AFTER the animation completes.
  //   2. AI HOH: a useEffect detects when nomination_results commits nominees to
  //      the store without awaitingNominations (AI flow) and triggers the same
  //      animation.  commitNominees is a no-op in this path (already committed).
  //
  // A ref mirrors the state so handleNomAnimDone always reads the current IDs
  // regardless of stale closures after several seconds of animation.
  //
  // Two animation sources are unified here:
  //   • Human HOH  — pendingNominees is set by handleCommitNominees; store
  //     mutation is deferred to handleNomAnimDone.
  //   • AI HOH     — nominees are already in game.nomineeIds; the animation
  //     is gated by showAiNomAnim (computed, no setState-in-effect).
  //     handleAiNomAnimDone just marks the key as consumed (no store dispatch).
  //
  // aiNomAnimConsumedKey tracks which "week-nominee-key" was most recently
  // consumed by the AI animation path so it doesn't replay.  It is also
  // pre-set by handleCommitNominees to prevent double-animation when the
  // human HOH's commitNominees call lands and nomineeIds becomes non-empty.
  const [pendingNominees, setPendingNominees] = useState<string[]>([])
  const pendingNomineesRef = useRef<string[]>([])
  const [aiNomAnimConsumedKey, setAiNomAnimConsumedKey] = useState<string>('')
  useEffect(() => {
    pendingNomineesRef.current = pendingNominees
  }, [pendingNominees])

  // AI HOH animation: computed directly from game state — no setState-in-effect.
  const aiNomKey =
    game.phase === 'nomination_results' &&
    game.nomineeIds.length > 0 &&
    !game.awaitingNominations
      ? `w${game.week}-${[...game.nomineeIds].sort().join(',')}`
      : ''

  const showHumanNomAnim = pendingNominees.length > 0
  const showAiNomAnim = aiNomKey !== '' && aiNomKey !== aiNomAnimConsumedKey && !showHumanNomAnim
  const showNomAnim = showHumanNomAnim || showAiNomAnim

  const nomAnimPlayers = (
    showHumanNomAnim
      ? pendingNominees.map((id) => game.players.find((p) => p.id === id))
      : game.nomineeIds.map((id) => game.players.find((p) => p.id === id))
  ).filter(Boolean) as Player[]

  // Build CeremonyOverlay tiles for nominations: ❓ badges fly to nominee tiles.
  // Tile rects are resolved lazily by the CeremonyOverlay via getTileRect
  // so we pass a resolver function rather than pre-computed rects (avoids
  // calling document.querySelector during the render phase before DOM is committed).
  const nomCeremonyTileIds = showNomAnim ? nomAnimPlayers.map((p) => p.id) : []

  // ── Human HOH nomination flow (single multi-select modal) ────────────────
  // Shown when the human HOH must pick their two nominees simultaneously.
  // Hidden while the nomination animation is playing to prevent stacking.
  const showNominationsModal =
    game.phase === 'nomination_results' &&
    Boolean(game.awaitingNominations) &&
    humanIsHoH &&
    !showNomAnim

  const nomineeOptions = alivePlayers.filter((p) => p.id !== game.hohId)

  // Human HOH confirmed nominees: pre-consume the AI key so the AI animation
  // path does not fire a second animation once commitNominees lands.
  const handleCommitNominees = useCallback(
    (ids: string[]) => {
      const currentUserIsHoh = !!humanIsHoH
      console.log('NOMINATION_TRIGGERED', ids, { currentUserIsHoh, screen: 'GameScreen' })
      setAiNomAnimConsumedKey(`w${game.week}-${[...ids].sort().join(',')}`)
      setPendingNominees(ids)
    },
    [humanIsHoH, game.week]
  )

  const handleNomAnimDone = useCallback(() => {
    const ids = pendingNomineesRef.current
    setPendingNominees([])
    // commitNominees is a no-op when awaitingNominations is false (AI HOH path).
    dispatch(commitNominees(ids))
  }, [dispatch])

  // AI HOH onDone: mark this key consumed so the animation doesn't replay.
  const handleAiNomAnimDone = useCallback(() => {
    setAiNomAnimConsumedKey(aiNomKey)
  }, [aiNomKey])

  // ── Dev: manually trigger nomination animation ────────────────────────────
  // Only visible in development builds for easy QA verification.
  const isDev = import.meta.env.DEV
  const handleDevPlayNomAnim = useCallback(() => {
    const eligible = alivePlayers.filter((p) => !p.isUser)
    const devNominees = eligible.slice(0, 2).map((p) => p.id)
    if (devNominees.length === 2) {
      console.log('DEV: Play Nomination Animation', devNominees)
      setPendingNominees(devNominees)
    }
  }, [alivePlayers, setPendingNominees])

  // ── Human POV holder decision (use veto or not) ──────────────────────────
  const humanIsPovHolder = humanPlayer && game.povWinnerId === humanPlayer.id
  const showPovDecisionModal =
    game.phase === 'pov_ceremony_results' &&
    Boolean(game.awaitingPovDecision) &&
    humanIsPovHolder

  // ── Human POV holder picks who to save ───────────────────────────────────
  // Defers submitPovSaveTarget dispatch until the save ceremony animation
  // plays, showing the 🛡️ badge landing on the saved nominee's tile.
  const [pendingSaveCeremony, setPendingSaveCeremony] = useState<{
    tiles: CeremonyTile[]
    caption: string
    subtitle?: string
  } | null>(null)
  const pendingSaveDispatchRef = useRef<(() => void) | null>(null)

  const handleSaveCeremonyDone = useCallback(() => {
    pendingSaveDispatchRef.current?.()
    pendingSaveDispatchRef.current = null
    setPendingSaveCeremony(null)
  }, [])

  const handlePovSaveTarget = useCallback((id: string) => {
    const savedPlayer = game.players.find((p) => p.id === id)
    const savedRect = getTileRect(id)

    if (!savedPlayer || !savedRect) {
      // Headless fallback: commit immediately.
      dispatch(submitPovSaveTarget(id))
      return
    }

    console.log('POV_SAVE_ANIM_STARTED', { savedId: id, screen: 'GameScreen' })
    const tiles: CeremonyTile[] = [{
      rect: savedRect,
      badge: '🛡️',
      badgeStart: 'center',
      badgeLabel: `${savedPlayer.name} saved by veto`,
    }]

    pendingSaveDispatchRef.current = () => dispatch(submitPovSaveTarget(id))
    setPendingSaveCeremony({
      tiles,
      caption: `${savedPlayer.name} has been saved!`,
      subtitle: '🛡️ Power of Veto used',
    })
  }, [dispatch, game.players, getTileRect])

  // Hide the save modal while the save ceremony is playing.
  const showPovSaveModal =
    game.phase === 'pov_ceremony_results' &&
    Boolean(game.awaitingPovSaveTarget) &&
    humanIsPovHolder &&
    !pendingSaveCeremony
  const povSaveOptions = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── Replacement nominee ceremony animation ─────────────────────────────
  // When the human HOH picks a replacement nominee via TvDecisionModal,
  // we defer the setReplacementNominee dispatch until the CeremonyOverlay
  // animation completes.  The badge (❓) flies from the saved nominee's
  // tile to the replacement nominee's tile.
  const [pendingReplacementCeremony, setPendingReplacementCeremony] = useState<{
    tiles: CeremonyTile[]
    caption: string
    subtitle?: string
  } | null>(null)
  const pendingReplacementDispatchRef = useRef<(() => void) | null>(null)

  const handleReplacementCeremonyDone = useCallback(() => {
    pendingReplacementDispatchRef.current?.()
    pendingReplacementDispatchRef.current = null
    setPendingReplacementCeremony(null)
  }, [])

  const handleReplacementNominee = useCallback((id: string) => {
    const replacementPlayer = game.players.find((p) => p.id === id)
    const replacementRect = getTileRect(id)

    // Only animate when the veto was actually used (povSavedId is set).
    // If not, commit immediately without animation.
    if (!game.povSavedId || !replacementPlayer || !replacementRect) {
      // Headless/no-veto fallback: commit immediately.
      dispatch(setReplacementNominee(id))
      return
    }

    // Badge flies from HOH tile → replacement tile (HOH is naming the replacement).
    const hohRect = game.hohId ? getTileRect(game.hohId) : null

    console.log('REPLACEMENT_NOM_ANIM_STARTED', { replacementId: id, hohId: game.hohId, screen: 'GameScreen' })

    const tiles: CeremonyTile[] = [{
      rect: replacementRect,
      badge: '❓',
      badgeStart: hohRect ?? 'center',
      badgeLabel: `${replacementPlayer.name} nominated as replacement`,
    }]

    pendingReplacementDispatchRef.current = () => dispatch(setReplacementNominee(id))
    setPendingReplacementCeremony({
      tiles,
      caption: `${replacementPlayer.name} is the replacement nominee!`,
      subtitle: '🎯 Nominations are set',
    })
  }, [dispatch, game.players, game.povSavedId, game.hohId, getTileRect])

  // Hide the replacement modal while the replacement animation is playing.
  const showReplacementModal = replacementNeeded && humanIsHoH && !pendingReplacementCeremony

  // ── AI replacement nominee animation ───────────────────────────────────
  // When an AI HOH picks a replacement nominee, the store already has the
  // replacement committed. We detect this and show an animation.
  const [aiReplacementConsumedKey, setAiReplacementConsumedKey] = useState<string>('')

  const aiReplacementKey = useMemo(() => {
    // Only trigger on pov_ceremony_results phase when nominees just changed (replacement happened)
    // and no human decision is pending.
    if (game.phase !== 'pov_ceremony_results') return ''
    if (game.replacementNeeded) return '' // human HOH hasn't picked yet
    if (game.awaitingPovDecision || game.awaitingPovSaveTarget) return ''
    // Gate on the veto actually being used: if no player was saved, skip animation.
    if (!game.povSavedId) return ''
    // Wait until the staged replacement flow is complete (step 0 = replacement committed).
    if (game.aiReplacementStep) return ''
    // If the AI HOH handled it, nomineeIds was updated in the same advance() call
    // and no awaiting flags are set. Use a key based on week + nomineeIds.
    const hohPlayer = game.players.find((p) => p.id === game.hohId)
    if (hohPlayer?.isUser) return '' // human HOH handles this differently
    return `w${game.week}-repl-${[...game.nomineeIds].sort().join(',')}`
  }, [game.phase, game.week, game.nomineeIds, game.replacementNeeded, game.awaitingPovDecision, game.awaitingPovSaveTarget, game.hohId, game.players, game.povSavedId, game.aiReplacementStep])

  const showAiReplacementAnim = aiReplacementKey !== '' && aiReplacementKey !== aiReplacementConsumedKey

  // Acknowledge the step-1 "HOH must name a replacement" announcement so advance() can
  // proceed to step 2. Fires when the step-1 handler has run (aiReplacementStep reaches 2).
  useEffect(() => {
    if (game.aiReplacementStep === 2) {
      dispatch(aiReplacementRendered())
    }
  }, [game.aiReplacementStep, dispatch])

  const handleAiReplacementDone = useCallback(() => {
    setAiReplacementConsumedKey(aiReplacementKey)
  }, [aiReplacementKey])

  // ── Final 4 cinematic flow ───────────────────────────────────────────────────
  // Stage machine drives the full Final 4 eviction sequence:
  //   idle         → not yet started (or reset after leaving final4/final3)
  //   pleas        → plea ChatOverlay (all players; blocks FAB)
  //   decision     → TvDecisionModal (human POV only; blocks FAB)
  //   announcement → eviction announcement ChatOverlay (blocks FAB)
  //   splash       → EvictionSplash animation (blocks FAB)
  //   done         → complete; FAB visible so user can advance to final3 comps
  type Final4Stage = 'idle' | 'pleas' | 'decision' | 'announcement' | 'splash' | 'done'
  const [final4Stage, setFinal4Stage] = useState<Final4Stage>('idle')
  const [final4PleaLines, setFinal4PleaLines] = useState<ChatLine[]>([])
  const [final4AnnounceLines, setFinal4AnnounceLines] = useState<ChatLine[]>([])
  // Holds the nominee IDs captured when the overlay opens so we can identify
  // the evicted player after advance() transitions to final3.
  const final4NomineesRef = useRef<string[]>([])

  // Reset all Final 4 state when the game leaves the final4/final3 region
  // (e.g. game reset, debug jump to a different phase).
  useEffect(() => {
    if (game.phase === 'final4_eviction' || game.phase === 'final3') return
    if (final4Stage === 'idle') return
    const id = window.setTimeout(() => {
      setFinal4Stage('idle')
      setFinal4PleaLines([])
      setFinal4AnnounceLines([])
      final4NomineesRef.current = []
    }, 0)
    return () => window.clearTimeout(id)
  }, [game.phase, final4Stage])

  // Enter final4_eviction → build enriched plea lines and start the overlay.
  // For human POV: also dispatch advance() now so plea events are emitted to
  // tvFeed and awaitingPovDecision is set before the decision modal appears.
  useEffect(() => {
    if (game.phase !== 'final4_eviction' || final4Stage !== 'idle') return
    const povHolder = alivePlayers.find((p) => p.id === game.povWinnerId)
    const nominees = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))
    if (!povHolder || nominees.length === 0) return
    final4NomineesRef.current = nominees.map((n) => n.id)
    const lines: ChatLine[] = [
      {
        id: 'f4-intro',
        role: 'host',
        text: `${povHolder.name} holds the sole vote to evict. Nominees, it's time to make your pleas. 🎤`,
      },
      ...nominees.flatMap((nominee, idx): ChatLine[] => [
        {
          id: `f4-prompt-${nominee.id}`,
          role: 'pov',
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
          role: 'pov',
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
    if (humanIsPovHolder) {
      dispatch(advance())
    }
  }, [game.phase, final4Stage, alivePlayers, game.povWinnerId, game.nomineeIds, game.seed, humanIsPovHolder, dispatch])

  // Plea overlay complete:
  //   human POV → show decision modal
  //   AI POV    → dispatch advance() (AI evicts; phase transitions to final3)
  const handleFinal4PleaComplete = useCallback(() => {
    if (humanIsPovHolder) {
      setFinal4Stage('decision')
    } else {
      dispatch(advance())
      // Stage transitions to 'announcement' via effect below once phase === 'final3'
    }
  }, [humanIsPovHolder, dispatch])

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
    const povHolder = game.players.find((p) => p.id === game.povWinnerId)
    setFinal4AnnounceLines([
      {
        id: 'f4-evict-decision',
        role: 'pov',
        player: povHolder,
        text: `I vote to evict… ${evicted.name}. 🗳️`,
      },
      {
        id: 'f4-evict-bb',
        role: 'host',
        text: `${evicted.name}, by a vote of 1 to 0, you have been evicted from the Big Brother house. Please take a moment to say your goodbyes. 👋`,
      },
    ])
    setFinal4Stage('announcement')
    final4NomineesRef.current = []
  }, [game.pendingEviction, game.phase, final4Stage, game.players, game.povWinnerId])

  const handleFinal4AnnounceComplete = useCallback(() => {
    setFinal4Stage('splash')
  }, [])

  const showFinal4Chat = game.phase === 'final4_eviction' && final4Stage === 'pleas'
  const showFinal4Modal = game.phase === 'final4_eviction' && final4Stage === 'decision'
  // Announcement: show during final4_eviction (pending commit) OR after final3 transition.
  const showFinal4AnnounceChat =
    (game.phase === 'final4_eviction' || game.phase === 'final3') && final4Stage === 'announcement'
  // Splash is driven by showEvictionSplash (pendingEviction + final4Stage === 'splash')
  // defined in the Eviction Splash section below.

  const final4Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))


  // ── Human live eviction vote ──────────────────────────────────────────────
  // Shown when the human player is an eligible voter during live_vote.
  const showLiveVoteModal =
    game.phase === 'live_vote' && Boolean(game.awaitingHumanVote) && humanPlayer !== undefined
  const liveVoteOptions = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── Human HOH tie-break ───────────────────────────────────────────────────
  // Shown when the live vote ended in a tie and the human is HOH.
  // Only shown after the vote results modal has been dismissed (voteResults cleared),
  // so the house votes are always seen before the HOH is asked to break the tie.
  const showTieBreakModal =
    game.phase === 'eviction_results' && Boolean(game.awaitingTieBreak) && humanIsHoH && !game.voteResults
  const tieBreakOptions = alivePlayers.filter((p) =>
    (game.tiedNomineeIds ?? game.nomineeIds).includes(p.id)
  )

  // ── Final 3 human Final HOH eviction ─────────────────────────────────────
  // Shown when phase is final3_decision and the human player is the Final HOH.
  const humanIsFinalHoh = humanPlayer && game.hohId === humanPlayer.id
  const showFinal3Modal =
    game.awaitingFinal3Eviction === true && game.phase === 'final3_decision' && humanIsFinalHoh

  const final3Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── Vote Results Popup ────────────────────────────────────────────────────
  // Show vote results whenever they are available, including during a tie-break
  // wait so the house votes are always revealed before the HOH is prompted.
  const showVoteResults = Boolean(game.voteResults)
  const voteResultsTallies = showVoteResults
    ? game.players
        .filter((p) => game.voteResults && p.id in game.voteResults)
        .map((p) => ({ nominee: p, voteCount: game.voteResults![p.id] ?? 0 }))
    : []
  // After dismissing vote results: show the eviction splash if one is pending,
  // otherwise advance the game phase directly.
  // When a tie-break is still pending (awaitingTieBreak), do not advance — the
  // tie-break modal will appear once voteResults has been cleared.
  const handleVoteResultsDone = useCallback(() => {
    dispatch(dismissVoteResults())
    // If no eviction is pending AND no tie-break is pending, advance the phase now.
    // (If pendingEviction is set, the overlay's onDone will commit and advance instead.)
    // (If awaitingTieBreak is true, the tie-break modal will take over after this.)
    if (!game.pendingEviction && !game.awaitingTieBreak) {
      dispatch(advance())
    }
  }, [dispatch, game.pendingEviction, game.awaitingTieBreak])

  // ── AI HOH tiebreak choreography ─────────────────────────────────────────
  // When AnimatedVoteResultsModal detects a tie and calls onTiebreakerRequired:
  //   • Human HOH: dismiss the modal → showTieBreakModal appears (existing path).
  //   • AI HOH:    pendingEviction is set (AI already picked). Show a short
  //                "HOH is deciding…" overlay for 3 s, then dismiss to let the
  //                eviction cinematic play.  No additional dispatch needed.
  const [aiTiebreakerPending, setAiTiebreakerPending] = useState(false)

  // For AI tiebreak: pass evictee=null to the modal so it surfaces the tie banner
  // and calls onTiebreakerRequired, giving us the hook to run choreography.
  // Condition: vote tallies have equal max counts AND AI already picked (pendingEviction set)
  // AND the human is NOT the HOH.
  const voteResultsEvictee = useMemo(() => {
    if (!game.voteResults) return null

    // If we have an explicit eviction decision, use that as the source of truth
    // — UNLESS this is an AI tiebreak where we want the modal to show the tie
    // banner first and call onTiebreakerRequired.
    if (game.pendingEviction) {
      if (!humanIsHoH) {
        // Check whether the tallies are actually tied (AI tiebreak case).
        let maxVotes = -1
        let topCount = 0
        for (const count of Object.values(game.voteResults)) {
          if (count > maxVotes) { maxVotes = count; topCount = 1 }
          else if (count === maxVotes) topCount++
        }
        if (topCount > 1) {
          // AI tiebreak — pass null so the modal shows the tie banner.
          return null
        }
      }
      return game.players.find((p) => p.id === game.pendingEviction?.evicteeId) ?? null
    }

    let maxVotes = -1
    let evicteeIds: string[] = []
    for (const [id, count] of Object.entries(game.voteResults)) {
      if (count > maxVotes) {
        maxVotes = count
        evicteeIds = [id]
      } else if (count === maxVotes) {
        evicteeIds.push(id)
      }
    }

    // If there's a tie for max votes, we can't determine a single evictee from tallies alone.
    if (evicteeIds.length !== 1) return null

    return game.players.find((p) => p.id === evicteeIds[0]) ?? null
  }, [game.voteResults, game.pendingEviction, game.players, humanIsHoH])

  const handleTiebreakerRequired = useCallback((tiedIds: string[]) => {
    console.log('TIE_BREAK_STARTED', { tiedIds, hohIsHuman: !!humanIsHoH, screen: 'GameScreen' })
    if (!humanIsHoH) {
      // AI HOH already decided; run a short choreography then proceed.
      setAiTiebreakerPending(true)
    } else {
      // Human HOH: dismiss the vote results modal — showTieBreakModal will appear.
      handleVoteResultsDone()
    }
  }, [humanIsHoH, handleVoteResultsDone])

  // After 3 s of "thinking" choreography, dismiss vote results for AI tiebreak.
  useEffect(() => {
    if (!aiTiebreakerPending) return
    const id = window.setTimeout(() => {
      setAiTiebreakerPending(false)
      handleVoteResultsDone()
    }, 3000)
    return () => window.clearTimeout(id)
  }, [aiTiebreakerPending, handleVoteResultsDone])

  // ── Eviction cinematic (pendingEviction-driven) ───────────────────────────
  // Normal evictions: triggered by pendingEviction being set in advance().
  // Final-4 evictions: also driven by pendingEviction (set by finalizeFinal4Eviction
  // or the AI path in advance()), but only shown after the announcement ChatOverlay.
  const pendingEvictionPlayer = game.pendingEviction
    ? game.players.find((p) => p.id === game.pendingEviction?.evicteeId) ?? null
    : null
  // For normal evictions (not Final-4), show whenever pendingEviction is set.
  // For Final-4, show only during the 'splash' stage (after the announcement).
  const showEvictionSplash =
    !showVoteResults &&
    !!game.pendingEviction &&
    (game.phase !== 'final4_eviction' || final4Stage === 'splash')

  // After the eviction cinematic completes, commit the pending eviction then
  // attempt Battle Back activation (normal evictions only) or advance the Final-4
  // local state machine.
  const handleEvictionSplashDone = useCallback(() => {
    const evicteeId = game.pendingEviction?.evicteeId
    if (!evicteeId) return
    // Capture the phase before dispatch since finalizePendingEviction may change it.
    const isFinal4 = game.phase === 'final4_eviction'
    dispatch(finalizePendingEviction(evicteeId))
    if (isFinal4) {
      // Final-4: advance the local stage machine; no battle back check needed.
      setFinal4Stage('done')
    } else {
      const activated = dispatch(tryActivateBattleBack()) as unknown as boolean
      if (!activated) {
        dispatch(advance())
      }
    }
  }, [dispatch, game.pendingEviction, game.phase, setFinal4Stage])


  const battleBack = game.battleBack
  const showBattleBack = battleBack?.active === true
  const battleBackCandidates = showBattleBack
    ? game.players.filter((p) => (battleBack?.candidates ?? []).includes(p.id))
    : []

  const handleBattleBackComplete = useCallback((winnerId: string) => {
    dispatch(completeBattleBack(winnerId))
    dispatch(advance())
  }, [dispatch])
  // Shown when a HOH or POV competition is in progress and the human player
  // is a participant. The Continue button is hidden while the overlay is active.
  const pendingMinigame = game.pendingMinigame
  const humanIsParticipant =
    !!pendingMinigame && !!humanPlayer && pendingMinigame.participants.includes(humanPlayer.id)
  // MinigameHost takes priority over legacy TapRace when a challenge is pending
  // and the human player is a participant in that challenge.
  const humanIsChallengeParticipant =
    !!pendingChallenge && !!humanPlayer && pendingChallenge.participants.includes(humanPlayer.id)
  const showMinigameHost = humanIsChallengeParticipant
  const showTapRace = !showMinigameHost && humanIsParticipant

  // ── Social phase panel ────────────────────────────────────────────────────
  // Show the SocialPanel for the human player during social_1 and social_2.
  const isSocialPhase = game.phase === 'social_1' || game.phase === 'social_2'
  const showSocialPanel = isSocialPhase && !!humanPlayer

  // Hide Continue button while waiting for any human-only decision modal.
  // Also hide during VoteResultsPopup / EvictionSplash so the phase cannot
  // be advanced under those full-screen overlays.
  // Keep this in sync with the conditions that control human decision modals above.
  const showWinnerCeremony = pendingWinnerCeremony !== null
  const showReplacementCeremony = pendingReplacementCeremony !== null || showAiReplacementAnim
  const showSaveCeremony = pendingSaveCeremony !== null
  const awaitingHumanDecision =
    showOutgoingHohWarning ||
    showReplacementModal ||
    showNominationsModal ||
    showNomAnim ||
    showReplacementCeremony ||
    showSaveCeremony ||
    showPovDecisionModal ||
    showPovSaveModal ||
    showFinal4Chat ||
    showFinal4Modal ||
    showFinal4AnnounceChat ||
    showLiveVoteModal ||
    showTieBreakModal ||
    showFinal3Modal ||
    showVoteResults ||
    showEvictionSplash ||
    showBattleBack ||
    showMinigameHost ||
    showWinnerCeremony ||
    showAdvanceHohCeremony ||
    showTapRace ||
    aiTiebreakerPending ||
    spectatorF3Active ||
    spectatorLegacyActive

  return (
    <LayoutGroup id="game-layout">
    <div className="game-screen game-screen-shell">
      <TvZone />

      {/* ── Outgoing HOH ineligibility warning ──────────────────────────── */}
      {showOutgoingHohWarning && (
        <div
          className="tv-binary-modal"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="outgoing-hoh-title"
        >
          <div className="tv-binary-modal__card">
            <header className="tv-binary-modal__header">
              <h2 className="tv-binary-modal__title" id="outgoing-hoh-title">
                👑 HOH Competition
              </h2>
              <p className="tv-binary-modal__subtitle">
                As outgoing HOH, you are not eligible to compete.
              </p>
            </header>
            <div className="tv-binary-modal__body">
              <button
                className="tv-binary-modal__option tv-binary-modal__option--yes"
                onClick={() => setOutgoingHohWarningDismissedWeek(game.week)}
                type="button"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Human HOH nomination modal (single multi-select step) ──────── */}
      {showNominationsModal && (
        <TvMultiSelectModal
          title="Nomination Ceremony"
          subtitle={`${humanPlayer?.name}, choose two houseguests to nominate for eviction.`}
          options={nomineeOptions}
          onConfirm={handleCommitNominees}
        />
      )}

      {/* ── Nomination ceremony — spotlight cutout with ❓ badges ─────────── */}
      {/* Shown for BOTH human HOH (deferred commit) and AI HOH (already committed). */}
      {showNomAnim && nomCeremonyTileIds.length > 0 && (
        <CeremonyOverlay
          tiles={[]}
          resolveTiles={() => nomAnimPlayers.map((p) => ({
            rect: getTileRect(p.id),
            badge: '❓',
            badgeStart: 'center' as const,
            badgeLabel: `${p.name} nominated`,
          }))}
          caption={
            nomAnimPlayers.length === 1
              ? `${nomAnimPlayers[0].name} has been nominated`
              : `${nomAnimPlayers.map((n) => n.name).join(' & ')} have been nominated`
          }
          subtitle="🎯 Nominations are set"
          onDone={showHumanNomAnim ? handleNomAnimDone : handleAiNomAnimDone}
          ariaLabel={`Nomination ceremony: ${nomAnimPlayers.map((n) => n.name).join(' and ')}`}
        />
      )}

      {/* ── Human POV holder Yes/No decision ────────────────────────────── */}
      {showPovDecisionModal && (
        <TvBinaryDecisionModal
          title="Power of Veto Ceremony"
          subtitle={`${humanPlayer?.name}, will you use the Power of Veto?`}
          yesLabel="✅ Yes — use the Power of Veto"
          noLabel="❌ No — keep nominations the same"
          onYes={() => dispatch(submitPovDecision(true))}
          onNo={() => dispatch(submitPovDecision(false))}
        />
      )}

      {/* ── Human POV holder picks who to save ──────────────────────────── */}
      {showPovSaveModal && (
        <TvDecisionModal
          title="Power of Veto — Save a Nominee"
          subtitle={`${humanPlayer?.name}, choose which nominee to save with the veto.`}
          options={povSaveOptions}
          onSelect={handlePovSaveTarget}
          stingerMessage="VETO USED"
        />
      )}

      {/* ── Human HOH replacement picker ────────────────────────────────── */}
      {showReplacementModal && (
        <TvDecisionModal
          title="Name a Replacement Nominee"
          subtitle={`${humanPlayer?.name}, you must name a replacement nominee.`}
          options={replacementOptions}
          onSelect={handleReplacementNominee}
          stingerMessage="NOMINATIONS SET"
        />
      )}

      {/* ── Human live eviction vote ─────────────────────────────────────── */}
      {showLiveVoteModal && (
        <TvDecisionModal
          title="Live Eviction Vote"
          subtitle={`${humanPlayer?.name}, cast your vote to evict one of the nominees.`}
          options={liveVoteOptions}
          onSelect={(id) => dispatch(submitHumanVote(id))}
          danger
          stingerMessage="VOTE RECORDED"
        />
      )}

      {/* ── Human HOH tie-break ──────────────────────────────────────────── */}
      {showTieBreakModal && (
        <TvDecisionModal
          title="Tie-Break — HOH Casts the Deciding Vote"
          subtitle={`${humanPlayer?.name}, the vote is tied! As HOH, you must break the tie.`}
          options={tieBreakOptions}
          onSelect={(id) => dispatch(submitTieBreak(id))}
          danger
          stingerMessage="TIE BREAKER CAST"
        />
      )}

      {/* ── Final 4 plea chat overlay (all players) ─────────────────────── */}
      {showFinal4Chat && (
        <ChatOverlay
          lines={final4PleaLines}
          skippable
          header={{ title: 'Final 4 🏡', subtitle: 'Hear from the nominees before the vote.' }}
          onComplete={handleFinal4PleaComplete}
          ariaLabel="Final 4 plea chat"
        />
      )}

      {/* ── Final 4 eviction vote (human POV holder) ────────────────────── */}
      {showFinal4Modal && (
        <TvDecisionModal
          title="Final 4 — Cast Your Vote"
          subtitle={`${humanPlayer?.name}, you hold the sole vote to evict. Choose wisely.`}
          options={final4Options}
          onSelect={(id) => dispatch(finalizeFinal4Eviction(id))}
          danger
          stingerMessage="VOTE RECORDED"
        />
      )}

      {/* ── Final 4 eviction announcement overlay ────────────────────────── */}
      {showFinal4AnnounceChat && (
        <ChatOverlay
          lines={final4AnnounceLines}
          skippable
          header={{ title: 'Final 4 🚪', subtitle: 'The decision has been made.' }}
          onComplete={handleFinal4AnnounceComplete}
          ariaLabel="Final 4 eviction announcement"
        />
      )}

      {/* ── Final 3 eviction (human Final HOH evicts directly) ──────────── */}
      {showFinal3Modal && (
        <TvDecisionModal
          title="Final HOH — Evict a Houseguest"
          subtitle={`${humanPlayer?.name}, as Final HOH you must directly evict one of the remaining houseguests.`}
          options={final3Options}
          onSelect={(id) => dispatch(finalizeFinal3Eviction(id))}
          danger
          stingerMessage="VOTE RECORDED"
        />
      )}

      {/* ── MinigameHost (challenge flow) ────────────────────────────────── */}
      {showMinigameHost && pendingChallenge && (
        <MinigameHost
          game={pendingChallenge.game}
          gameOptions={{ seed: pendingChallenge.seed }}
          participants={pendingChallenge.participants.map((id): MinigameParticipant => {
            const player = game.players.find((p) => p.id === id);
            const aiScore = pendingChallenge.aiScores[id] ?? 0;
            return {
              id,
              name: player?.name ?? id,
              isHuman: !!player?.isUser,
              precomputedScore: aiScore,
              previousPR: player?.stats?.gamePRs?.[pendingChallenge.game.key] ?? null,
            };
          })}
          onDone={(rawValue) => {
            // Build raw results for all challenge participants using pre-computed
            // AI scores (appropriate for the selected game's metric kind).
            const rawResults = pendingChallenge.participants.map((id) => ({
              playerId: id,
              rawValue:
                id === humanPlayer?.id
                  ? rawValue
                  : (pendingChallenge.aiScores[id] ?? rawValue),
            }));
            const winnerId = dispatch(completeChallenge(rawResults)) as string | null;
            // Record per-game personal records for all participants.
            dispatch(updateGamePRs({
              gameKey: pendingChallenge.game.key,
              scores: Object.fromEntries(
                rawResults.map((r) => [r.playerId, Math.round(r.rawValue)]),
              ),
              lowerIsBetter: pendingChallenge.game.scoringAdapter === 'lowerBetter',
            }));
            const finalWinnerId = winnerId ?? pendingChallenge.participants[0];

            // ── Final 3 minigame completion ──────────────────────────────────
            // Apply the winner to the Final 3 part (no ceremony overlay for F3 parts).
            if (isF3MinigamePhase) {
              dispatch(applyF3MinigameWinner(finalWinnerId));
              return;
            }

            // ── HOH / POV completion (ceremony overlay) ──────────────────────
            // Show the CeremonyOverlay cutout before committing the winner to the store.
            const winnerPlayer = game.players.find((p) => p.id === finalWinnerId) ?? null;
            const sourceDomRect = getTileRect(finalWinnerId);
            const isHohComp = game.phase === 'hoh_comp';
            const winSymbol = isHohComp ? '👑' : '🛡️';
            const winLabel = isHohComp ? 'Head of Household' : 'Power of Veto';
            if (!winnerPlayer || !sourceDomRect) {
              // Defensive fallback: no DOMRect available (headless / test) — commit immediately.
              dispatch(applyMinigameWinner(finalWinnerId));
              return;
            }
            // Defer the store mutation until after the CeremonyOverlay completes.
            console.log('HOH_CROWN_ANIM_STARTED', { winnerId: finalWinnerId, label: winLabel, screen: 'GameScreen' })
            const tiles: CeremonyTile[] = [{
              rect: sourceDomRect,
              badge: winSymbol,
              badgeStart: 'center',
              badgeLabel: `${winnerPlayer.name} wins ${winLabel}`,
            }];
            pendingWinnerDispatchRef.current = () => dispatch(applyMinigameWinner(finalWinnerId));
            setPendingWinnerCeremony({
              tiles,
              caption: `${winnerPlayer.name} wins ${winLabel}!`,
              subtitle: winSymbol,
              ariaLabel: `${winnerPlayer.name} wins ${winLabel}`,
              measureA: () => getTileRect(finalWinnerId),
            });
          }}
        />
      )}

      {/* ── TapRace minigame overlay ─────────────────────────────────────── */}
      {showTapRace && pendingMinigame && (
        <TapRace session={pendingMinigame} players={game.players} />
      )}

      {/* ── SpotlightAnimation — HOH / POV winner reveal (viewport-tracking) ── */}
      {showWinnerCeremony && pendingWinnerCeremony && (
        <SpotlightAnimation
          tiles={pendingWinnerCeremony.tiles}
          caption={pendingWinnerCeremony.caption}
          subtitle={pendingWinnerCeremony.subtitle}
          onDone={handleWinnerCeremonyDone}
          ariaLabel={pendingWinnerCeremony.ariaLabel}
          measureA={pendingWinnerCeremony.measureA}
        />
      )}

      {/* ── CeremonyOverlay — advance()-picked HOH winner (outgoing HOH) ──── */}
      {/* When the human was outgoing HOH and skipped the minigame, advance()    */}
      {/* picks the winner directly. This overlay shows the 👑 ceremony.         */}
      {showAdvanceHohCeremony && game.hohId && (
        <CeremonyOverlay
          tiles={[]}
          resolveTiles={() => {
            const winnerId = game.hohId!
            const winnerPlayer = game.players.find((p) => p.id === winnerId)
            return [{
              rect: getTileRect(winnerId),
              badge: '👑',
              badgeStart: 'center' as const,
              badgeLabel: `${winnerPlayer?.name ?? winnerId} wins Head of Household`,
            }]
          }}
          caption={`${game.players.find((p) => p.id === game.hohId)?.name ?? 'A houseguest'} wins Head of Household!`}
          subtitle="👑"
          onDone={handleAdvanceHohCeremonyDone}
          ariaLabel={`${game.players.find((p) => p.id === game.hohId)?.name ?? 'A houseguest'} wins Head of Household`}
        />
      )}

      {/* ── CeremonyOverlay — Replacement nominee (human HOH deferred) ──── */}
      {pendingReplacementCeremony && (
        <CeremonyOverlay
          tiles={pendingReplacementCeremony.tiles}
          caption={pendingReplacementCeremony.caption}
          subtitle={pendingReplacementCeremony.subtitle}
          onDone={handleReplacementCeremonyDone}
          ariaLabel={pendingReplacementCeremony.caption}
        />
      )}

      {/* ── CeremonyOverlay — AI replacement nominee animation ─────────── */}
      {/* Only the replacement nominee (last in nomineeIds, pushed by store) gets */}
      {/* a badge. The badge flies from the HOH tile → replacement tile.          */}
      {showAiReplacementAnim && game.nomineeIds.length > 0 && (
        <CeremonyOverlay
          tiles={[]}
          resolveTiles={() => {
            const replacementId = game.nomineeIds[game.nomineeIds.length - 1]
            const hohRect = game.hohId ? getTileRect(game.hohId) : null
            const replacementPlayer = game.players.find((p) => p.id === replacementId)
            return [{
              rect: getTileRect(replacementId),
              badge: '❓',
              badgeStart: hohRect ?? 'center' as const,
              badgeLabel: `${replacementPlayer?.name ?? replacementId} nominated as replacement`,
            }]
          }}
          caption="Replacement nominee named"
          subtitle="🎯 Nominations are set"
          onDone={handleAiReplacementDone}
          ariaLabel="Replacement nominee ceremony"
        />
      )}

      {/* ── CeremonyOverlay — POV save ceremony (human POV holder) ────── */}
      {showSaveCeremony && pendingSaveCeremony && (
        <CeremonyOverlay
          tiles={pendingSaveCeremony.tiles}
          caption={pendingSaveCeremony.caption}
          subtitle={pendingSaveCeremony.subtitle}
          onDone={handleSaveCeremonyDone}
          ariaLabel={pendingSaveCeremony.caption}
        />
      )}

      {/* ── Vote Results (animated sequential reveal) ────────────────────── */}
      {showVoteResults && (
        <AnimatedVoteResultsModal
          nominees={voteResultsTallies}
          evictee={voteResultsEvictee}
          onTiebreakerRequired={handleTiebreakerRequired}
          onDone={handleVoteResultsDone}
        />
      )}

      {/* ── AI HOH tiebreak choreography overlay ─────────────────────────── */}
      {/* Shown for 3 s while the "AI HOH is deciding" suspense plays.        */}
      {/* onTiebreakerRequired triggers this; handleVoteResultsDone fires after */}
      {aiTiebreakerPending && (
        <div
          className="tv-binary-modal"
          style={{ zIndex: 8600 }}
          role="status"
          aria-live="assertive"
          aria-label="HOH is breaking the tie"
        >
          <div className="tv-binary-modal__card">
            <header className="tv-binary-modal__header">
              <h2 className="tv-binary-modal__title">⚖️ It&rsquo;s a Tie!</h2>
              <p className="tv-binary-modal__subtitle">
                👑 HOH is breaking the tie&hellip;
              </p>
            </header>
          </div>
        </div>
      )}

      {/* ── Eviction cinematic (pendingEviction-driven, shared layout match-cut) ── */}
      <AnimatePresence>
        {showEvictionSplash && pendingEvictionPlayer && (
          <SpotlightEvictionOverlay
            key={pendingEvictionPlayer.id}
            evictee={pendingEvictionPlayer}
            onDone={handleEvictionSplashDone}
            layoutId={`avatar-tile-${pendingEvictionPlayer.id}`}
          />
        )}
      </AnimatePresence>

      {/* ── Battle Back / Jury Return twist overlay ──────────────────────── */}
      {showBattleBack && battleBackCandidates.length > 0 && (
        <BattleBackOverlay
          candidates={battleBackCandidates}
          seed={game.seed}
          onComplete={handleBattleBackComplete}
        />
      )}

      {/* ── Social Phase Panel (human player actions) ────────────────────── */}
      {!FEATURE_SOCIAL_V2 && showSocialPanel && humanPlayer && (
        <SocialPanel actorId={humanPlayer.id} />
      )}

      {/* ── Social Phase Panel V2 (modal overlay skeleton) ───────────────── */}
      <SocialPanelV2 />

      {/* ── Social Summary Popup (shown after social phase ends) ─────────── */}
      {socialSummaryOpen && <SocialSummaryPopup />}

      {/* ── SpectatorView — Final 3 Part 3 (human is spectator) ─────────── */}
      {/* Pass initialWinnerId so the overlay can reveal the correct winner      */}
      {/* without waiting for advance() (which fires only after onDone).         */}
      {spectatorF3Active && FEATURE_SPECTATOR_REACT && (
        <SpectatorView
          key={spectatorF3CompetitorIds.join('-')}
          competitorIds={spectatorF3CompetitorIds}
          variant="holdwall"
          initialWinnerId={f3Part3PredictedWinnerId ?? undefined}
          onDone={handleSpectatorF3Done}
        />
      )}

      {/* ── SpectatorView — legacy spectator:show event ───────────────────── */}
      {/* key forces a full remount when the competitor list or minigame changes,
          because useSpectatorSimulation initialises once per mount (see progressEngine). */}
      {spectatorLegacyPayload && FEATURE_SPECTATOR_REACT && (
        <SpectatorView
          key={`${spectatorLegacyPayload.competitorIds.join('-')}-${spectatorLegacyPayload.minigameId ?? ''}`}
          competitorIds={spectatorLegacyPayload.competitorIds}
          variant={spectatorLegacyPayload.variant}
          minigameId={spectatorLegacyPayload.minigameId}
          initialWinnerId={spectatorLegacyPayload.winnerId}
          onDone={handleSpectatorLegacyDone}
        />
      )}

      {/* ── Dev: trigger nomination animation (dev builds only) ──────────── */}
      {isDev && !awaitingHumanDecision && (
        <button
          className="dev-nom-anim-btn"
          onClick={handleDevPlayNomAnim}
          type="button"
          aria-label="Dev: Play Nomination Animation"
        >
          🎬 Dev: Play Nomination Animation
        </button>
      )}

      {/* ── Floating Action Bar ───────────────────────────────────────────── */}
      {!awaitingHumanDecision && <FloatingActionBar />}

      {/* ── Houseguest grid (alive + evicted in one grid) ────────────────── */}
      <HouseguestGrid
        houseguests={game.players.map(playerToHouseguest)}
        headerSelector=".tv-zone"
        footerSelector=".nav-bar"
      />
    </div>
    </LayoutGroup>
  )
}
