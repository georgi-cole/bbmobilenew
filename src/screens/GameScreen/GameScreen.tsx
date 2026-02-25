import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  addTvEvent,
  applyMinigameWinner,
  updateGamePRs,
  finalizeFinal4Eviction,
  finalizeFinal3Eviction,
  selectAlivePlayers,
  commitNominees,
  submitPovDecision,
  submitPovSaveTarget,
  setReplacementNominee,
  submitHumanVote,
  submitTieBreak,
  dismissVoteResults,
  dismissEvictionSplash,
  advance,
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
import EvictionSplash from '../../components/EvictionSplash/EvictionSplash'
import CeremonyOverlay from '../../components/CeremonyOverlay/CeremonyOverlay'
import type { CeremonyTile } from '../../components/CeremonyOverlay/CeremonyOverlay'
import SocialPanel from '../../components/SocialPanel/SocialPanel'
import SocialPanelV2 from '../../components/SocialPanelV2/SocialPanelV2'
import { FEATURE_SOCIAL_V2 } from '../../config/featureFlags'
import SocialSummaryPopup from '../../components/SocialSummary/SocialSummaryPopup'
import { resolveAvatar } from '../../utils/avatar'
import type { Player } from '../../types'
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
  const pendingChallenge = useAppSelector(selectPendingChallenge)
  const lastSocialReport = useAppSelector(selectLastSocialReport)
  const socialSummaryOpen = useAppSelector(selectSocialSummaryOpen)

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
  } | null>(null)
  const pendingWinnerDispatchRef = useRef<(() => void) | null>(null)

  const handleWinnerCeremonyDone = useCallback(() => {
    pendingWinnerDispatchRef.current?.()
    pendingWinnerDispatchRef.current = null
    setPendingWinnerCeremony(null)
  }, [])

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
    // Also skip when a SpotlightAnimation is pending (challenge result already
    // captured; avoid launching a second challenge while the old one is animating).
    if (isCompPhase && !pendingChallenge && !humanIsOutgoingHoh && !pendingWinnerCeremony) {
      // Use the HOH-eligibility-filtered list only for HOH comps; POV is unrestricted.
      const participants = game.phase === 'hoh_comp' ? hohCompParticipants : aliveIds;
      dispatch(startChallenge(game.seed, participants))
    }
  }, [game.phase, pendingChallenge, hohCompParticipants, aliveIds, game.seed, dispatch, humanIsOutgoingHoh, pendingWinnerCeremony])

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
    if (Array.isArray(game.nomineeIds) && game.nomineeIds.includes(p.id)) parts.push('nominated')
    if (p.status === 'jury') parts.push('jury')
    const statuses = parts.length > 0 ? parts.join('+') : (p.status ?? 'active')
    return {
      id: p.id,
      name: p.name,
      avatarUrl: resolveAvatar(p),
      statuses,
      finalRank: (p.finalRank ?? null) as 1 | 2 | 3 | null,
      isEvicted,
      isYou: p.isUser,
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
    (p) => p.id !== game.hohId && p.id !== game.povWinnerId && !game.nomineeIds.includes(p.id)
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
  const showPovSaveModal =
    game.phase === 'pov_ceremony_results' &&
    Boolean(game.awaitingPovSaveTarget) &&
    humanIsPovHolder
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

    // Find the saved nominee (the one who was removed from nominations by POV)
    // — that's the nominee who is no longer in nomineeIds.
    // Since the POV save already happened, we can look at who the POV winner saved.
    const povHolderRect = game.povWinnerId ? getTileRect(game.povWinnerId) : null

    if (!replacementPlayer || !replacementRect) {
      // Headless fallback: commit immediately.
      dispatch(setReplacementNominee(id))
      return
    }

    const tiles: CeremonyTile[] = [{
      rect: replacementRect,
      badge: '❓',
      badgeStart: povHolderRect ?? 'center',
      badgeLabel: `${replacementPlayer.name} nominated as replacement`,
    }]

    pendingReplacementDispatchRef.current = () => dispatch(setReplacementNominee(id))
    setPendingReplacementCeremony({
      tiles,
      caption: `${replacementPlayer.name} is the replacement nominee!`,
      subtitle: '🎯 Nominations are set',
    })
  }, [dispatch, game.players, game.povWinnerId, getTileRect])

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
    // If the AI HOH handled it, nomineeIds was updated in the same advance() call
    // and no awaiting flags are set. Use a key based on week + nomineeIds.
    const hohPlayer = game.players.find((p) => p.id === game.hohId)
    if (hohPlayer?.isUser) return '' // human HOH handles this differently
    return `w${game.week}-repl-${[...game.nomineeIds].sort().join(',')}`
  }, [game.phase, game.week, game.nomineeIds, game.replacementNeeded, game.awaitingPovDecision, game.awaitingPovSaveTarget, game.hohId, game.players])

  const showAiReplacementAnim = aiReplacementKey !== '' && aiReplacementKey !== aiReplacementConsumedKey

  const aiReplacementTiles: CeremonyTile[] = useMemo(() => {
    if (!showAiReplacementAnim) return []
    return game.nomineeIds.map((id) => ({
      rect: getTileRect(id),
      badge: '❓',
      badgeStart: 'center' as const,
      badgeLabel: `${game.players.find((p) => p.id === id)?.name ?? id} nominated`,
    }))
  }, [showAiReplacementAnim, game.nomineeIds, game.players, getTileRect])

  const handleAiReplacementDone = useCallback(() => {
    setAiReplacementConsumedKey(aiReplacementKey)
  }, [aiReplacementKey])

  // ── Final 4 human POV holder vote ────────────────────────────────────────
  // Shown when phase is final4_eviction, the human player is the POV holder,
  // and awaitingPovDecision is set (meaning plea messages have been emitted).
  const showFinal4Modal = game.phase === 'final4_eviction' && humanIsPovHolder && game.awaitingPovDecision

  const final4Options = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── Human live eviction vote ──────────────────────────────────────────────
  // Shown when the human player is an eligible voter during live_vote.
  const showLiveVoteModal =
    game.phase === 'live_vote' && Boolean(game.awaitingHumanVote) && humanPlayer !== undefined
  const liveVoteOptions = alivePlayers.filter((p) => game.nomineeIds.includes(p.id))

  // ── Human HOH tie-break ───────────────────────────────────────────────────
  // Shown when the live vote ended in a tie and the human is HOH.
  const showTieBreakModal =
    game.phase === 'eviction_results' && Boolean(game.awaitingTieBreak) && humanIsHoH
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
  const showVoteResults = Boolean(game.voteResults) && !game.awaitingTieBreak
  const voteResultsTallies = showVoteResults
    ? game.players
        .filter((p) => game.voteResults && p.id in game.voteResults)
        .map((p) => ({ nominee: p, voteCount: game.voteResults![p.id] ?? 0 }))
    : []
  // After dismissing vote results: show the eviction splash if one is pending,
  // otherwise advance the game phase directly.
  const handleVoteResultsDone = useCallback(() => {
    dispatch(dismissVoteResults())
    // If no eviction splash is queued, advance the phase now.
    // (If evictionSplashId is set, EvictionSplash's onDone will advance instead.)
    if (!game.evictionSplashId) {
      dispatch(advance())
    }
  }, [dispatch, game.evictionSplashId])

  // ── Eviction Splash ───────────────────────────────────────────────────────
  const evictionSplashPlayer = game.evictionSplashId
    ? game.players.find((p) => p.id === game.evictionSplashId) ?? null
    : null
  const showEvictionSplash = !showVoteResults && evictionSplashPlayer !== null
  // After the eviction splash completes, dismiss it and advance the phase.
  const handleEvictionSplashDone = useCallback(() => {
    dispatch(dismissEvictionSplash())
    dispatch(advance())
  }, [dispatch])

  // Determine evictee for vote results.
  // Prefer the actual eviction decision (evictionSplashId) and fall back to
  // vote tallies, returning null if the tallies are tied.
  const voteResultsEvictee = useMemo(() => {
    if (!game.voteResults) return null

    // If we have an explicit eviction decision, use that as the source of truth.
    if (game.evictionSplashId) {
      return game.players.find((p) => p.id === game.evictionSplashId) ?? null
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
  }, [game.voteResults, game.evictionSplashId, game.players])

  // ── TapRace minigame ──────────────────────────────────────────────────────
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
  const awaitingHumanDecision =
    showOutgoingHohWarning ||
    showReplacementModal ||
    showNominationsModal ||
    showNomAnim ||
    showReplacementCeremony ||
    showPovDecisionModal ||
    showPovSaveModal ||
    showFinal4Modal ||
    showLiveVoteModal ||
    showTieBreakModal ||
    showFinal3Modal ||
    showVoteResults ||
    showEvictionSplash ||
    showMinigameHost ||
    showWinnerCeremony ||
    showTapRace

  return (
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
          onSelect={(id) => dispatch(submitPovSaveTarget(id))}
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
            // Determine the winner and show the CeremonyOverlay cutout before
            // committing to the store.  Fall back to first participant if winner
            // is undetermined.
            const finalWinnerId = winnerId ?? pendingChallenge.participants[0];
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
            });
          }}
        />
      )}

      {/* ── TapRace minigame overlay ─────────────────────────────────────── */}
      {showTapRace && pendingMinigame && (
        <TapRace session={pendingMinigame} players={game.players} />
      )}

      {/* ── CeremonyOverlay — HOH / POV winner reveal (spotlight cutout) ──── */}
      {showWinnerCeremony && pendingWinnerCeremony && (
        <CeremonyOverlay
          tiles={pendingWinnerCeremony.tiles}
          caption={pendingWinnerCeremony.caption}
          subtitle={pendingWinnerCeremony.subtitle}
          onDone={handleWinnerCeremonyDone}
          ariaLabel={pendingWinnerCeremony.ariaLabel}
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
      {showAiReplacementAnim && aiReplacementTiles.length > 0 && (
        <CeremonyOverlay
          tiles={aiReplacementTiles}
          caption="Replacement nominee named"
          subtitle="🎯 Nominations are set"
          onDone={handleAiReplacementDone}
          ariaLabel="Replacement nominee ceremony"
        />
      )}

      {/* ── Vote Results (animated sequential reveal) ────────────────────── */}
      {showVoteResults && (
        <AnimatedVoteResultsModal
          nominees={voteResultsTallies}
          evictee={voteResultsEvictee}
          onDone={handleVoteResultsDone}
        />
      )}

      {/* ── Eviction Splash (colour → B&W cinematic) ────────────────────── */}
      {showEvictionSplash && evictionSplashPlayer && (
        <EvictionSplash
          evictee={evictionSplashPlayer}
          onDone={handleEvictionSplashDone}
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
  )
}
