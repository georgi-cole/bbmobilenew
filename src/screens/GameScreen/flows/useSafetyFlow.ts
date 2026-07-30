import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  aiReplacementRendered,
  setReplacementNominee,
  submitDiamondReplacement,
  submitPovSaveTarget,
  submitVipSecondSaveTarget,
} from '../../../store/gameSlice'
import type { AppDispatch, RootState } from '../../../store/store'
import type { ActiveConfessionalDecision } from '../../../store/confessionalDecisionSelectors'
import type { CeremonyTile } from '../../../components/CeremonyOverlay/CeremonyOverlay'
import type { Player } from '../../../types'
import { statusBadgeImageSrc } from '../../../utils/statusBadges'
import { usePersistedGameScreenKey } from '../gameScreenPersistence'
import {
  expandCupidIds,
  getCupidPair,
  getCupidPartnerId,
  isCupidArrowActive,
} from '../../../features/twists/cupidArrow'

const NOMINATION_BADGE_SRC = statusBadgeImageSrc('nominated')

type GetTileRect = (playerId: string) => DOMRect | null

interface UseSafetyFlowOptions {
  game: RootState['game']
  alivePlayers: Player[]
  humanPlayer: Player | undefined
  humanIsHoH: boolean
  activeConfessionalDecision: ActiveConfessionalDecision | null
  getTileRect: GetTileRect
  dispatch: AppDispatch
}

/**
 * Owns the Power of Safety and replacement-nominee presentation flow.
 * Redux remains the gameplay authority; this hook only coordinates eligibility,
 * deferred ceremony commits, and the main-screen presentation seam.
 */
export function useSafetyFlow({
  game,
  alivePlayers,
  humanPlayer,
  humanIsHoH,
  activeConfessionalDecision,
  getTileRect,
  dispatch,
}: UseSafetyFlowOptions) {
  // ── Human LOH replacement picker ─────────────────────────────────────────
  // Shown when a nominee auto-saved themselves and the human LOH must pick a
  // replacement. The Continue button is hidden while this modal is open.
  // (showReplacementModal is defined below after pendingReplacementCeremony.)
  const replacementNeeded = game.replacementNeeded === true
  const replacementBaseOptions = (() => {
    const roleIds = new Set(
      expandCupidIds(
        game,
        [game.lohId, game.posWinnerId].filter((id): id is string => Boolean(id))
      )
    )
    const candidates = alivePlayers.filter((player) => {
      const unitIds = expandCupidIds(game, [player.id])
      return !roleIds.has(player.id) && unitIds.every((id) => !game.nomineeIds.includes(id))
    })
    if (!isCupidArrowActive(game)) return candidates
    const seen = new Set<string>()
    return candidates.filter((player) => {
      const key = getCupidPair(game, player.id)?.id ?? `solo:${player.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })()
  const replacementOptions = (() => {
    const protectedIds = new Set(game.povProtectedIds ?? [])
    const nonProtected = replacementBaseOptions.filter((player) =>
      expandCupidIds(game, [player.id]).every((id) => !protectedIds.has(id))
    )
    return nonProtected.length > 0 ? nonProtected : replacementBaseOptions
  })()

  // ── Human POS holder decision (use veto or not) ──────────────────────────
  const humanIsPosHolder = Boolean(
    humanPlayer &&
    (game.posWinnerId === humanPlayer.id ||
      getCupidPartnerId(game, game.posWinnerId) === humanPlayer.id)
  )
  const activeSpecialVeto = game.specialVeto?.activeType ?? null
  const specialVetoName =
    activeSpecialVeto === 'vip'
      ? 'Double Trouble'
      : activeSpecialVeto === 'diamond'
        ? 'Halo Exchange'
        : activeSpecialVeto === 'coup'
          ? 'Detox'
          : activeSpecialVeto === 'spotlight'
            ? 'Force Majeure'
            : null
  const showPovDecisionModal =
    game.phase === 'pos_ceremony_results' &&
    Boolean(game.awaitingPovDecision) &&
    humanIsPosHolder &&
    !activeConfessionalDecision

  // ── Human POS holder picks who to save ───────────────────────────────────
  // Defers submitPovSaveTarget dispatch until the save ceremony animation
  // plays, showing the 🛡️ badge landing on the saved nominee's tile.
  const [pendingSaveCeremony, setPendingSaveCeremony] = useState<{
    tiles: CeremonyTile[]
    resolveTiles: () => CeremonyTile[]
    caption: string
    subtitle?: string
    savedId: string
  } | null>(null)
  const pendingSaveDispatchRef = useRef<(() => void) | null>(null)

  const handleSaveCeremonyDone = useCallback(() => {
    pendingSaveDispatchRef.current?.()
    pendingSaveDispatchRef.current = null
    setPendingSaveCeremony(null)
  }, [])

  const handlePovSaveTarget = useCallback(
    (id: string) => {
      const savedPlayers = expandCupidIds(game, [id])
        .map((savedId) => game.players.find((player) => player.id === savedId))
        .filter((player): player is Player => Boolean(player))
      const savedPlayer = savedPlayers.find((player) => player.id === id) ?? savedPlayers[0]
      const savedRect = getTileRect(id)
      const holderRect = game.posWinnerId ? getTileRect(game.posWinnerId) : null
      const isVipSecondSave = Boolean(game.specialVeto?.awaitingVipSecondSaveTarget)
      const submitSaveAction = isVipSecondSave
        ? submitVipSecondSaveTarget(id)
        : submitPovSaveTarget(id)
      const saveSubtitle = isVipSecondSave
        ? '👑 Double Trouble used again'
        : activeSpecialVeto === 'diamond'
          ? '😇 Halo Exchange used'
          : activeSpecialVeto === 'spotlight'
            ? '✨ Force Majeure used'
            : activeSpecialVeto === 'vip'
              ? '👑 Double Trouble used'
              : '🛡️ Power used'

      if (!savedPlayer || !savedRect) {
        // Headless fallback: commit immediately.
        dispatch(submitSaveAction)
        return
      }

      console.log('POV_SAVE_ANIM_STARTED', { savedId: id, screen: 'GameScreen' })
      const sourceIsDistinctHolder =
        holderRect != null && game.posWinnerId != null && game.posWinnerId !== id
      const tiles: CeremonyTile[] = [
        ...(sourceIsDistinctHolder
          ? [
              {
                rect: holderRect,
                glowTone: 'gold' as const,
              },
            ]
          : []),
        ...savedPlayers.map((player) => ({
          rect: getTileRect(player.id),
          badge: '🛡️',
          badgeVariant: isCupidArrowActive(game) ? ('cupid-hug' as const) : undefined,
          badgeStart: sourceIsDistinctHolder ? holderRect : ('center' as const),
          badgeLabel: `${player.name} saved by veto`,
          glowTone: 'success' as const,
        })),
      ]
      const resolveTiles = (): CeremonyTile[] => {
        const currentHolderRect = game.posWinnerId ? getTileRect(game.posWinnerId) : null
        const currentSourceIsDistinctHolder =
          currentHolderRect != null && game.posWinnerId != null && game.posWinnerId !== id

        return [
          ...(currentSourceIsDistinctHolder
            ? [
                {
                  rect: currentHolderRect,
                  glowTone: 'gold' as const,
                },
              ]
            : []),
          ...savedPlayers.map((player) => ({
            rect: getTileRect(player.id),
            badge: '🛡️',
            badgeVariant: isCupidArrowActive(game) ? ('cupid-hug' as const) : undefined,
            badgeStart:
              currentSourceIsDistinctHolder && currentHolderRect
                ? currentHolderRect
                : ('center' as const),
            badgeLabel: `${player.name} saved by veto`,
            glowTone: 'success' as const,
          })),
        ]
      }

      const savedNames = savedPlayers.map((player) => player.name).join(' & ')
      pendingSaveDispatchRef.current = () => dispatch(submitSaveAction)
      setPendingSaveCeremony({
        tiles,
        resolveTiles,
        caption: `${savedNames} ${savedPlayers.length > 1 ? 'have' : 'has'} been saved!`,
        subtitle: saveSubtitle,
        savedId: id,
      })
    },
    [dispatch, game, activeSpecialVeto, getTileRect]
  )

  // Hide the save modal while the save ceremony is playing.
  const isAwaitingAnySave =
    Boolean(game.awaitingPovSaveTarget) || Boolean(game.specialVeto?.awaitingVipSecondSaveTarget)
  const showPovSaveModal =
    game.phase === 'pos_ceremony_results' &&
    isAwaitingAnySave &&
    humanIsPosHolder &&
    !pendingSaveCeremony &&
    !activeConfessionalDecision
  const povSaveOptions = (() => {
    const nominees = alivePlayers.filter((player) => game.nomineeIds.includes(player.id))
    if (!isCupidArrowActive(game)) return nominees
    const seenPairs = new Set<string>()
    return nominees.filter((player) => {
      const key = getCupidPair(game, player.id)?.id ?? `solo:${player.id}`
      if (seenPairs.has(key)) return false
      seenPairs.add(key)
      return true
    })
  })()

  const showVipSecondUseModal =
    game.phase === 'pos_ceremony_results' &&
    Boolean(game.specialVeto?.awaitingVipSecondUseDecision) &&
    humanIsPosHolder &&
    !activeConfessionalDecision

  const showDiamondReplacementModal =
    game.phase === 'pos_ceremony_results' &&
    Boolean(game.specialVeto?.awaitingHolderReplacement) &&
    humanIsPosHolder &&
    !activeConfessionalDecision

  const showCoupReplacementModal =
    game.phase === 'pos_ceremony_results' &&
    Boolean(
      game.specialVeto?.awaitingCoupReplacement1 || game.specialVeto?.awaitingCoupReplacement2
    ) &&
    humanIsPosHolder &&
    !activeConfessionalDecision

  // ── Replacement nominee ceremony animation ─────────────────────────────
  // When the human LOH picks a replacement nominee via TvDecisionModal,
  // we defer the setReplacementNominee dispatch until the CeremonyOverlay
  // animation completes.  The badge (❓) flies from the saved nominee's
  // tile to the replacement nominee's tile.
  const [pendingReplacementCeremony, setPendingReplacementCeremony] = useState<{
    tiles: CeremonyTile[]
    resolveTiles: () => CeremonyTile[]
    caption: string
    subtitle?: string
    replacementId: string
  } | null>(null)
  const pendingReplacementDispatchRef = useRef<(() => void) | null>(null)

  const handleReplacementCeremonyDone = useCallback(() => {
    pendingReplacementDispatchRef.current?.()
    pendingReplacementDispatchRef.current = null
    setPendingReplacementCeremony(null)
  }, [])

  const startReplacementCeremony = useCallback(
    (id: string, onCommit: () => void) => {
      const replacementPlayers = expandCupidIds(game, [id])
        .map((replacementId) => game.players.find((player) => player.id === replacementId))
        .filter((player): player is Player => Boolean(player))
      const replacementPlayer =
        replacementPlayers.find((player) => player.id === id) ?? replacementPlayers[0]
      const replacementRect = getTileRect(id)
      const sourceId = game.specialVeto?.activeType === 'diamond' ? game.posWinnerId : game.lohId
      const sourceRect = sourceId ? getTileRect(sourceId) : null
      const sourceIsDistinct = sourceRect != null && sourceId != null && sourceId !== id
      const replacementSubtitle =
        game.specialVeto?.activeType === 'diamond'
          ? '😇 Halo Exchange names the backup nominee'
          : activeSpecialVeto === 'spotlight'
            ? '✨ Force Majeure names the backup nominee'
            : activeSpecialVeto === 'vip'
              ? '👑 Double Trouble changes the block'
              : '🎯 Nominations are set'

      if (!replacementPlayer || !replacementRect) {
        onCommit()
        return
      }

      console.log('REPLACEMENT_NOM_ANIM_STARTED', {
        replacementId: id,
        sourceId,
        screen: 'GameScreen',
      })

      const tiles: CeremonyTile[] = [
        ...(sourceIsDistinct
          ? [
              {
                rect: sourceRect,
                glowTone: 'gold' as const,
              },
            ]
          : []),
        ...replacementPlayers.map((player) => ({
          rect: getTileRect(player.id),
          badge: '❓',
          badgeImageSrc: NOMINATION_BADGE_SRC,
          badgeStart: sourceIsDistinct ? sourceRect : ('center' as const),
          badgeLabel: `${player.name} named backup nominee`,
          glowTone: 'danger' as const,
        })),
      ]
      const resolveTiles = (): CeremonyTile[] => {
        const currentSourceRect = sourceId ? getTileRect(sourceId) : null
        const currentSourceIsDistinct =
          currentSourceRect != null && sourceId != null && sourceId !== id

        return [
          ...(currentSourceIsDistinct
            ? [
                {
                  rect: currentSourceRect,
                  glowTone: 'gold' as const,
                },
              ]
            : []),
          ...replacementPlayers.map((player) => ({
            rect: getTileRect(player.id),
            badge: '❓',
            badgeImageSrc: NOMINATION_BADGE_SRC,
            badgeStart:
              currentSourceIsDistinct && currentSourceRect
                ? currentSourceRect
                : ('center' as const),
            badgeLabel: `${player.name} named backup nominee`,
            glowTone: 'danger' as const,
          })),
        ]
      }

      const replacementNames = replacementPlayers.map((player) => player.name).join(' & ')
      pendingReplacementDispatchRef.current = onCommit
      setPendingReplacementCeremony({
        tiles,
        resolveTiles,
        caption: `${replacementNames} ${replacementPlayers.length > 1 ? 'are' : 'is'} the backup nominee${replacementPlayers.length > 1 ? 's' : ''}!`,
        subtitle: replacementSubtitle,
        replacementId: id,
      })
    },
    [game, getTileRect, activeSpecialVeto]
  )

  const handleReplacementNominee = useCallback(
    (id: string) => {
      // Only animate when the veto was actually used (povSavedId is set).
      // If not, commit immediately without animation.
      if (!game.povSavedId) {
        // Headless/no-veto fallback: commit immediately.
        dispatch(setReplacementNominee(id))
        return
      }
      startReplacementCeremony(id, () => dispatch(setReplacementNominee(id)))
    },
    [dispatch, game.povSavedId, startReplacementCeremony]
  )
  const handleDiamondReplacementNominee = useCallback(
    (id: string) => {
      startReplacementCeremony(id, () => dispatch(submitDiamondReplacement(id)))
    },
    [dispatch, startReplacementCeremony]
  )

  // Hide the replacement modal while the replacement animation is playing.
  // Also hidden when confessional routing is active.
  const showReplacementModal =
    replacementNeeded && humanIsHoH && !pendingReplacementCeremony && !activeConfessionalDecision
  const holderReplacementOptions = replacementOptions
  const coupBaseOptions = alivePlayers.filter(
    (p) =>
      p.id !== game.lohId &&
      p.id !== game.posWinnerId &&
      !game.nomineeIds.includes(p.id) &&
      p.id !== game.specialVeto?.coupReplacement1Id
  )
  const coupReplacementOptions = (() => {
    const protectedIds = new Set(game.povProtectedIds ?? [])
    const nonProtected = coupBaseOptions.filter((player) => !protectedIds.has(player.id))
    const neededCount = game.specialVeto?.awaitingCoupReplacement1 ? 2 : 1
    return nonProtected.length >= neededCount ? nonProtected : coupBaseOptions
  })()

  // ── AI replacement nominee animation ───────────────────────────────────
  // When an AI LOH picks a replacement nominee, the store already has the
  // replacement committed. We detect this and show an animation.
  const [aiReplacementConsumedKey, setAiReplacementConsumedKey] = usePersistedGameScreenKey(
    'ai-replacement-ceremony',
    game.gameId ?? `season-${game.season}`
  )

  const aiReplacementKey = useMemo(() => {
    // Only trigger on pos_ceremony_results phase when nominees just changed (replacement happened)
    // and no human decision is pending.
    if (game.phase !== 'pos_ceremony_results') return ''
    if (game.replacementNeeded) return '' // human LOH hasn't picked yet
    if (game.awaitingPovDecision || game.awaitingPovSaveTarget) return ''
    // Gate on the veto actually being used: if no player was saved, skip animation.
    if (!game.povSavedId) return ''
    // Wait until the staged replacement flow is complete (step 0 = replacement committed).
    if (game.aiReplacementStep) return ''
    // If the AI LOH handled it, nomineeIds was updated in the same advance() call
    // and no awaiting flags are set. Use a key based on week + nomineeIds.
    const lohPlayer = game.players.find((p) => p.id === game.lohId)
    if (lohPlayer?.isUser) return '' // human LOH handles this differently
    return `w${game.week}-repl-${[...game.nomineeIds].sort().join(',')}`
  }, [
    game.phase,
    game.week,
    game.nomineeIds,
    game.replacementNeeded,
    game.awaitingPovDecision,
    game.awaitingPovSaveTarget,
    game.lohId,
    game.players,
    game.povSavedId,
    game.aiReplacementStep,
  ])

  const showAiReplacementAnim =
    aiReplacementKey !== '' && aiReplacementKey !== aiReplacementConsumedKey
  const activeReplacementAnimationTargetId =
    showAiReplacementAnim && game.nomineeIds.length > 0
      ? game.nomineeIds[game.nomineeIds.length - 1]
      : null

  // Acknowledge the step-1 "LOH must name a replacement" announcement so advance() can
  // proceed to step 2. Fires when the step-1 handler has run (aiReplacementStep reaches 2).
  useEffect(() => {
    if (game.aiReplacementStep === 2) {
      dispatch(aiReplacementRendered())
    }
  }, [game.aiReplacementStep, dispatch])

  const handleAiReplacementDone = useCallback(() => {
    setAiReplacementConsumedKey(aiReplacementKey)
  }, [aiReplacementKey, setAiReplacementConsumedKey])

  return {
    replacementOptions,
    humanIsPosHolder,
    activeSpecialVeto,
    specialVetoName,
    showPovDecisionModal,
    pendingSaveCeremony,
    handleSaveCeremonyDone,
    handlePovSaveTarget,
    showPovSaveModal,
    povSaveOptions,
    showVipSecondUseModal,
    showDiamondReplacementModal,
    showCoupReplacementModal,
    pendingReplacementCeremony,
    handleReplacementCeremonyDone,
    handleReplacementNominee,
    handleDiamondReplacementNominee,
    showReplacementModal,
    holderReplacementOptions,
    coupReplacementOptions,
    showAiReplacementAnim,
    activeReplacementAnimationTargetId,
    handleAiReplacementDone,
  }
}
