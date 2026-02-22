import { useEffect, useMemo, useCallback } from 'react'
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
import TvZone from '../../components/ui/TvZone'
import HouseguestGrid from '../../components/HouseguestGrid/HouseguestGrid'
import TvDecisionModal from '../../components/TvDecisionModal/TvDecisionModal'
import TvMultiSelectModal from '../../components/TvDecisionModal/TvMultiSelectModal'
import TvBinaryDecisionModal from '../../components/TvBinaryDecisionModal/TvBinaryDecisionModal'
import TapRace from '../../components/TapRace/TapRace'
import MinigameHost from '../../components/MinigameHost/MinigameHost'
import type { MinigameParticipant } from '../../components/MinigameHost/MinigameHost'
import FloatingActionBar from '../../components/FloatingActionBar/FloatingActionBar'
import VoteResultsPopup from '../../components/VoteResultsPopup/VoteResultsPopup'
import EvictionSplash from '../../components/EvictionSplash/EvictionSplash'
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

  // ── Auto-start challenge on competition phase transitions ─────────────────
  // The challenge system (startChallenge / MinigameHost) is the sole owner of
  // game selection for HOH and POV competitions. It picks a random game from
  // the registry, pre-computes AI scores appropriate for that game's metric kind,
  // and handles the rules modal → countdown → game → results flow.
  const aliveIds = useMemo(() => alivePlayers.map((p) => p.id), [alivePlayers]);
  useEffect(() => {
    const isCompPhase = game.phase === 'hoh_comp' || game.phase === 'pov_comp'
    if (isCompPhase && !pendingChallenge) {
      dispatch(startChallenge(game.seed, aliveIds))
    }
  }, [game.phase, pendingChallenge, aliveIds, game.seed, dispatch])

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
  const replacementNeeded = game.replacementNeeded === true
  const humanPlayer = game.players.find((p) => p.isUser)
  const humanIsHoH = humanPlayer && game.hohId === humanPlayer.id
  const showReplacementModal = replacementNeeded && humanIsHoH

  const replacementOptions = alivePlayers.filter(
    (p) => p.id !== game.hohId && p.id !== game.povWinnerId && !game.nomineeIds.includes(p.id)
  )

  // ── Human HOH nomination flow (single multi-select modal) ────────────────
  // Shown when the human HOH must pick their two nominees simultaneously.
  const showNominationsModal =
    game.phase === 'nomination_results' &&
    Boolean(game.awaitingNominations) &&
    humanIsHoH

  const nomineeOptions = alivePlayers.filter((p) => p.id !== game.hohId)

  const handleCommitNominees = useCallback(
    (ids: string[]) => dispatch(commitNominees(ids)),
    [dispatch]
  )

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

  // ── Final 4 human POV holder vote ────────────────────────────────────────
  // Shown when phase is final4_eviction and the human player is the POV holder.
  const showFinal4Modal = game.phase === 'final4_eviction' && humanIsPovHolder

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

  // Hide Continue button while waiting for any human-only decision modal.
  // Also hide during VoteResultsPopup / EvictionSplash so the phase cannot
  // be advanced under those full-screen overlays.
  // Keep this in sync with the conditions that control human decision modals above.
  const awaitingHumanDecision =
    showReplacementModal ||
    showNominationsModal ||
    showPovDecisionModal ||
    showPovSaveModal ||
    showFinal4Modal ||
    showLiveVoteModal ||
    showTieBreakModal ||
    showFinal3Modal ||
    showVoteResults ||
    showEvictionSplash ||
    showMinigameHost ||
    showTapRace

  return (
    <div className="game-screen game-screen-shell">
      <TvZone />

      {/* ── Human HOH nomination ceremony (single multi-select modal) ───── */}
      {showNominationsModal && (
        <TvMultiSelectModal
          title="Nomination Ceremony"
          subtitle={`${humanPlayer?.name}, choose two houseguests to nominate for eviction.`}
          options={nomineeOptions}
          maxSelect={2}
          onConfirm={handleCommitNominees}
          stingerMessage="NOMINATIONS SET"
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
          onSelect={(id) => dispatch(setReplacementNominee(id))}
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
            // Advance game state: apply HOH/POV winner and transition phase.
            // Fall back to first participant if winner determination fails.
            dispatch(applyMinigameWinner(winnerId ?? pendingChallenge.participants[0]));
          }}
        />
      )}

      {/* ── TapRace minigame overlay ─────────────────────────────────────── */}
      {showTapRace && pendingMinigame && (
        <TapRace session={pendingMinigame} players={game.players} />
      )}

      {/* ── Vote Results Popup ───────────────────────────────────────────── */}
      {showVoteResults && (
        <VoteResultsPopup
          tallies={voteResultsTallies}
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
