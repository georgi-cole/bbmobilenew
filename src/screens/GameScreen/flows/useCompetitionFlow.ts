import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from 'react-redux'
import { applyF3MinigameWinner, applyMinigameWinner, updateGamePRs } from '../../../store/gameSlice'
import {
  completeChallenge,
  selectPendingChallenge,
  startChallenge,
} from '../../../store/challengeSlice'
import { useAppSelector } from '../../../store/hooks'
import type { AppDispatch, RootState } from '../../../store/store'
import type { CeremonyTile } from '../../../components/CeremonyOverlay/CeremonyOverlay'
import type { ReactMinigameCompletion } from '../../../components/MinigameHost/MinigameHost'
import type { SpectatorVariant } from '../../../components/ui/SpectatorView'
import type { Player } from '../../../types'
import { computeScores } from '../../../minigames/scoring'
import { isPlacementRankingGame } from '../../../minigames/registry'
import { statusBadgeImageSrc } from '../../../utils/statusBadges'
import { expandCupidIds, isCupidArrowActive } from '../../../features/twists/cupidArrow'
import { rankPressurePlankResults } from '../../../components/PressurePlank/pressurePlankLogic'

const LOH_BADGE_SRC = statusBadgeImageSrc('loh')
const POS_BADGE_SRC = statusBadgeImageSrc('pos')
const EXITED_PLAYER_SORT_VALUE = Number.NEGATIVE_INFINITY

interface UseCompetitionFlowOptions {
  game: RootState['game']
  humanPlayer: Player | undefined
  aliveIds: string[]
  hohCompParticipants: string[]
  humanIsOutgoingHoh: boolean
  spectatorReactEnabled: boolean
  spectatorMode: boolean
  dispatch: AppDispatch
}

/**
 * Owns challenge startup, result normalization, winner ceremonies, and legacy
 * spectator routing. Feature reducers remain authoritative for game outcomes.
 */
export function useCompetitionFlow({
  game,
  humanPlayer,
  aliveIds,
  hohCompParticipants,
  humanIsOutgoingHoh,
  spectatorReactEnabled,
  spectatorMode,
  dispatch,
}: UseCompetitionFlowOptions) {
  const store = useStore<RootState>()
  const pendingChallenge = useAppSelector(selectPendingChallenge)
  // ── Lifted-tile reveal — deferred LOH / POS winner commit ────────────────
  // When MinigameHost reports a winner, the live roster tile is cloned into a
  // fixed animation layer, awarded its badge, and returned to its newly measured
  // roster position. Only then do we dispatch applyMinigameWinner. If the live
  // tile is unavailable (tests / headless), the store mutation continues safely.
  //
  // pendingWinnerDispatchRef stores the deferred thunk so handleCeremonyDone
  // can call it without stale-closure issues.
  const [pendingWinnerCeremony, setPendingWinnerCeremony] = useState<{
    winnerId: string
    targetIds: string[]
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

  // ── Auto-start challenge on competition phase transitions ─────────────────
  // The challenge system (startChallenge / MinigameHost) is the sole owner of
  // game selection for LOH and POS competitions. It picks a random game from
  // the registry, pre-computes AI scores appropriate for that game's metric kind,
  // and handles the rules modal → countdown → game → results flow.
  //
  // LOH eligibility rule: the outgoing LOH (prevHohId) cannot compete in the
  // next week's LOH competition. They are excluded from the participant list.
  // When the human player is the outgoing LOH, no challenge is started at all
  // (the winner is determined randomly via advance() instead).
  useEffect(() => {
    const democraciaOverridesLoh =
      game.phase === 'loh_comp' &&
      game.democracia?.active === true &&
      game.democracia.activatedDay === game.week
    const isCompPhase =
      (game.phase === 'loh_comp' || game.phase === 'pos_comp') && !democraciaOverridesLoh
    // Do not start a challenge when the human player is the outgoing LOH —
    // they are ineligible to compete; advance() will pick a winner randomly.
    // Also skip when a CeremonyOverlay is pending (challenge result already
    // captured; avoid launching a second challenge while the old one is animating).
    if (isCompPhase && !pendingChallenge && !humanIsOutgoingHoh && !pendingWinnerCeremony) {
      // Use the LOH-eligibility-filtered list only for LOH comps; POS is unrestricted.
      const participants = game.phase === 'loh_comp' ? hohCompParticipants : aliveIds
      const derivedPrizeType = game.phase === 'pos_comp' ? 'POS' : 'LOH'
      dispatch(startChallenge(game.seed, participants, { prizeType: derivedPrizeType }))
    }
  }, [
    game.phase,
    pendingChallenge,
    hohCompParticipants,
    aliveIds,
    game.seed,
    game.week,
    game.democracia?.active,
    game.democracia?.activatedDay,
    dispatch,
    humanIsOutgoingHoh,
    pendingWinnerCeremony,
  ])

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
  const spectatorModeRef = useRef(spectatorMode)
  useEffect(() => {
    spectatorModeRef.current = spectatorMode
  }, [spectatorMode])

  useEffect(() => {
    if (!spectatorReactEnabled) return
    function handleSpectatorShow(e: Event) {
      if (!spectatorModeRef.current) return
      const detail = (
        e as CustomEvent<{
          competitorIds?: string[]
          variant?: string
          minigameId?: string
          winnerId?: string
        }>
      ).detail
      const rawIds = detail?.competitorIds ?? []
      // Validate IDs against the current players list (via ref to avoid stale closure).
      const validIds = rawIds.filter((id) => playersRef.current.some((p) => p.id === id))
      if (!validIds.length) return
      const variant = (['holdwall', 'trivia', 'maze'] as SpectatorVariant[]).includes(
        detail?.variant as SpectatorVariant
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
  }, [spectatorReactEnabled]) // re-registers if the feature flag is toggled; players accessed via ref above

  const handleSpectatorLegacyDone = useCallback(() => {
    setSpectatorLegacyPayload(null)
  }, [])

  const handleChallengeDone = useCallback(
    (rawValue: number, partial?: boolean, reactCompletion?: ReactMinigameCompletion) => {
      if (!pendingChallenge) return

      // Capture challenge fields now — completeChallenge() will clear
      // pendingChallenge from Redux, but this closure still holds it.
      const capturedParticipants = pendingChallenge.participants
      const capturedGameKey = pendingChallenge.game.key
      const scheduledWinnerId = pendingChallenge.forcedWinnerId
      // prizeType was recorded at challenge-start and is reliable even
      // after the phase advances (feature thunks can transition
      // loh_comp → loh_results before this callback fires).
      // For backward compatibility with older saves where prizeType may be
      // missing, fall back to deriving from the current game.phase using
      // the same logic as MinigameHost gameOptions.
      const capturedPrizeType =
        pendingChallenge.prizeType ?? (game.phase === 'pos_comp' ? 'POS' : 'LOH')

      // Build raw results for all challenge participants using pre-computed
      // AI scores (appropriate for the selected game's metric kind).
      const rankingOnlyGame = isPlacementRankingGame(pendingChallenge.game)
      const rawResults =
        partial && rankingOnlyGame
          ? capturedParticipants
              .map((id) => ({
                playerId: id,
                sortValue:
                  id === humanPlayer?.id
                    ? EXITED_PLAYER_SORT_VALUE
                    : (pendingChallenge.aiScores[id] ?? 0),
              }))
              .sort((a, b) => b.sortValue - a.sortValue)
              .map((entry, index, ordered) => ({
                playerId: entry.playerId,
                rawValue: ordered.length - index,
              }))
          : capturedParticipants.map((id) => ({
              playerId: id,
              rawValue:
                reactCompletion?.rawResults?.[id] ??
                (id === humanPlayer?.id ? rawValue : (pendingChallenge.aiScores[id] ?? rawValue)),
              // Forward time-based tiebreaker: human's comes from the minigame
              // (via reactCompletion.tiebreakerMs); AI tiebreakers are pre-simulated
              // in startChallenge and stored alongside aiScores.
              ...(id === humanPlayer?.id
                ? reactCompletion?.tiebreakerMs != null
                  ? { tiebreaker: reactCompletion.tiebreakerMs }
                  : {}
                : pendingChallenge.aiTiebreakers?.[id] != null
                  ? { tiebreaker: pendingChallenge.aiTiebreakers[id] }
                  : {}),
            }))
      const reportedWinnerId =
        reactCompletion?.authoritativeWinnerId != null &&
        capturedParticipants.includes(reactCompletion.authoritativeWinnerId)
          ? reactCompletion.authoritativeWinnerId
          : null
      const reportedLastPlaceId =
        reactCompletion?.authoritativeLastPlaceId != null &&
        capturedParticipants.includes(reactCompletion.authoritativeLastPlaceId) &&
        reactCompletion.authoritativeLastPlaceId !== reportedWinnerId
          ? reactCompletion.authoritativeLastPlaceId
          : null
      const pressurePlankRanking =
        capturedGameKey === 'pressurePlank'
          ? rankPressurePlankResults(
              capturedParticipants,
              Object.fromEntries(rawResults.map((result) => [result.playerId, result.rawValue])),
              pendingChallenge.seed
            )
          : null
      const explicitWinnerId = pressurePlankRanking?.[0]?.playerId ?? reportedWinnerId
      const explicitLastPlaceId =
        pressurePlankRanking?.[pressurePlankRanking.length - 1]?.playerId ?? reportedLastPlaceId
      // An abandoned placement competition has no component-owned completion
      // payload because the game was unmounted. The pre-ranked partial results
      // are authoritative for that exit: the human is last and the best
      // remaining competitor wins. Never let the generic participant[0]
      // fallback turn an exit into a victory (especially in Final 3).
      const abandonedPlacementWinnerId =
        partial && rankingOnlyGame
          ? (rawResults.find((result) => result.playerId !== humanPlayer?.id)?.playerId ?? null)
          : null
      const authoritativeWinnerId = explicitWinnerId ?? abandonedPlacementWinnerId

      if (import.meta.env.DEV) {
        console.log('[LOH_CROWN] MinigameHost onDone — challenge completion', {
          capturedGameKey,
          capturedParticipants,
          rawValue: rawResults.find((r) => r.playerId === humanPlayer?.id)?.rawValue,
          rawResults,
          reactCompletion,
          explicitWinnerId,
          abandonedPlacementWinnerId,
          partial,
          pendingChallengeAiScores: pendingChallenge.aiScores,
        })
      }

      const scoreWinnerId = dispatch(
        completeChallenge(rawResults, {
          authoritativeWinnerId: scheduledWinnerId ?? authoritativeWinnerId,
          partial: partial === true,
        })
      ) as string | null

      if (import.meta.env.DEV) {
        console.log('[LOH_CROWN] completeChallenge returned scoreWinnerId', {
          scoreWinnerId,
          capturedGameKey,
        })
      }
      // Only record personal records for valid (non-early-exit) completions.
      // A partial=true exit uses rawValue=0 for the human and would
      // incorrectly set a "best" 0-score for lowerBetter games.
      if (!partial) {
        dispatch(
          updateGamePRs({
            gameKey: capturedGameKey,
            scores: Object.fromEntries(rawResults.map((r) => [r.playerId, Math.round(r.rawValue)])),
            lowerIsBetter: pendingChallenge.game.scoringAdapter === 'lowerBetter',
          })
        )
      }

      // ── Final 3 minigame completion ──────────────────────────────────
      // Apply the winner to the Final 3 part (no ceremony overlay for F3 parts).
      if (isF3MinigamePhase) {
        dispatch(applyF3MinigameWinner(scoreWinnerId ?? capturedParticipants[0]))
        return
      }

      // ── LOH / POS completion (ceremony overlay) ──────────────────────
      // Use prize type captured at challenge-start; game.phase may have
      // already advanced if a feature thunk (e.g. resolveHoldTheWallOutcome,
      // resolveGlassBridgeOutcome) applied the winner synchronously before
      // this callback fires.
      const isHohComp = capturedPrizeType === 'LOH'
      const isVoxComp = isHohComp && game.voxPopuli?.status === 'active'
      const isVoxFinalFourComp = isVoxComp && aliveIds.length === 4
      const isVoxImmunityComp = isVoxComp && !isVoxFinalFourComp
      const winSymbol = isVoxFinalFourComp
        ? '🏆'
        : isVoxImmunityComp
          ? '🛡️'
          : isHohComp
            ? '👑'
            : '🛡️'
      const winLabel = isVoxFinalFourComp
        ? 'the Final 4 Competition'
        : isVoxImmunityComp
          ? 'Immunity'
          : isHohComp
            ? 'Leader of the House'
            : 'Power of Safety'
      const winBadgeCode = isVoxFinalFourComp
        ? undefined
        : isVoxImmunityComp
          ? 'immune'
          : isHohComp
            ? 'loh'
            : 'pos'

      // Prefer the canonical winner already committed to the store by the
      // game's feature thunk.  storeRef gives the live Redux state — not
      // the React-render closure — so same-event dispatches (e.g. the
      // "Claim Prize" button that calls resolveCompetitionOutcome() and
      // onComplete() in the same handler) are also captured correctly.
      const liveState = store.getState()
      const featureAppliedWinner = isHohComp ? liveState.game.lohId : liveState.game.posWinnerId
      const finalWinnerId =
        scheduledWinnerId ??
        explicitWinnerId ??
        (featureAppliedWinner && capturedParticipants.includes(featureAppliedWinner)
          ? featureAppliedWinner
          : (scoreWinnerId ?? capturedParticipants[0]))

      if (import.meta.env.DEV) {
        console.log('[LOH_CROWN] winner resolution in GameScreen', {
          capturedGameKey,
          capturedPrizeType,
          capturedParticipants,
          rawResults,
          explicitWinnerId,
          featureAppliedWinner,
          scoreWinnerId,
          finalWinnerId,
          fallbackWasCapturedParticipants0:
            !explicitWinnerId && !featureAppliedWinner && !scoreWinnerId,
          liveHohId: liveState.game.lohId,
          livePhase: liveState.game.phase,
        })
      }

      // Compute the last-place finisher for this competition.
      // For LOH: also used by applyMinigameWinner for the third-nominee rule
      // (the worst LOH finisher becomes an eligible third nominee).
      // For POS: needed by adsMiddleware to detect competition_retry eligibility.
      // Note: for feature-managed games (holdTheWall, glassBridge, etc.)
      // the feature thunk has already called applyMinigameWinner with its own lastPlaceId,
      // so the idempotency guard will skip this call.
      const compLastPlaceId = (() => {
        if (partial && humanPlayer?.id && capturedParticipants.includes(humanPlayer.id)) {
          if (import.meta.env.DEV) {
            console.log('[ads] competition_retry last place forced to human due to early exit', {
              humanId: humanPlayer.id,
              capturedGameKey,
              capturedPrizeType,
            })
          }
          return humanPlayer.id
        }
        if (explicitLastPlaceId) return explicitLastPlaceId
        const ranked = computeScores(
          pendingChallenge.game.scoringAdapter,
          rawResults,
          pendingChallenge.game.scoringParams ?? {}
        )
        // ranked is sorted best → worst (highest canonical score first).
        // Reverse to find the last non-winner (worst finisher).
        const lastNonWinner = [...ranked].reverse().find((r) => r.playerId !== finalWinnerId)
        return lastNonWinner?.playerId ?? null
      })()

      if (partial) {
        dispatch(
          applyMinigameWinner({
            winnerId: finalWinnerId,
            lastPlaceId: compLastPlaceId,
            skipSeasonUpdate: true,
          })
        )
        return
      }

      const winnerIds = expandCupidIds(game, [finalWinnerId])
      const winnerPlayers = winnerIds
        .map((id) => game.players.find((player) => player.id === id))
        .filter((player): player is Player => Boolean(player))
      if (winnerPlayers.length === 0) {
        // Defensive fallback: an invalid winner cannot produce a ceremony.
        dispatch(
          applyMinigameWinner({
            winnerId: finalWinnerId,
            lastPlaceId: compLastPlaceId,
            skipSeasonUpdate: true,
          })
        )
        return
      }
      // Defer the store mutation until after the CeremonyOverlay completes.
      if (import.meta.env.DEV) {
        console.log('[LOH_CROWN] LOH_CROWN_ANIM_STARTED', {
          winnerId: finalWinnerId,
          label: winLabel,
          screen: 'GameScreen',
          storeHohId: liveState.game.lohId,
          phase: liveState.game.phase,
          capturedGameKey,
        })
      } else {
        console.log('LOH_CROWN_ANIM_STARTED', {
          winnerId: finalWinnerId,
          label: winLabel,
          screen: 'GameScreen',
        })
      }
      const winnerTileMetadata: CeremonyTile[] = winnerPlayers.map((winnerPlayer) => ({
        rect: null,
        badge: winSymbol,
        badgeImageSrc: !isVoxComp ? (isHohComp ? LOH_BADGE_SRC : POS_BADGE_SRC) : undefined,
        badgeCode: winBadgeCode,
        badgeVariant:
          !isVoxComp && isCupidArrowActive(game)
            ? isHohComp
              ? 'cupid-kiss'
              : 'cupid-hug'
            : undefined,
        badgeStart: 'center',
        badgeLabel: `${winnerPlayer.name} wins ${winLabel}`,
      }))
      const winnerNames = winnerPlayers.map((player) => player.name).join(' & ')
      pendingWinnerDispatchRef.current = () =>
        dispatch(
          applyMinigameWinner({
            winnerId: finalWinnerId,
            lastPlaceId: compLastPlaceId,
            skipSeasonUpdate: true,
          })
        )
      setPendingWinnerCeremony({
        winnerId: finalWinnerId,
        targetIds: winnerIds,
        // Geometry is deliberately absent: the lift animation resolves and
        // snapshots the live roster element after MinigameHost has unmounted.
        tiles: winnerTileMetadata,
        caption: `${winnerNames} ${isCupidArrowActive(game) ? 'win' : 'wins'} ${winLabel}!`,
        subtitle: winSymbol,
        ariaLabel: `${winnerNames} ${isCupidArrowActive(game) ? 'win' : 'wins'} ${winLabel}`,
      })
    },
    [aliveIds.length, dispatch, game, humanPlayer, isF3MinigamePhase, pendingChallenge, store]
  )

  return {
    pendingChallenge,
    isF3MinigamePhase,
    pendingWinnerCeremony,
    handleWinnerCeremonyDone,
    handleChallengeDone,
    spectatorLegacyPayload,
    spectatorLegacyActive,
    handleSpectatorLegacyDone,
  }
}
