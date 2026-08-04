import { useRef } from 'react'
import { isRealityExclusiveAction, SOCIAL_ACTIONS } from '../../social/socialActions'
import { isHumanSocialActionVisible } from '../../social/socialActionCatalog'
import { normalizeActionCosts } from '../../social/smExecNormalize'
import { evaluateSocialActionEligibility } from '../../social/socialActionEligibility'
import ActionCard from './ActionCard'
import type { Player, PlayerStatus } from '../../types'
import type { DramaSocialNetwork, RelationshipsMap } from '../../social/types'
import { useAppSelector } from '../../store/hooks'
import { getCupidPartnerId } from '../../features/twists/cupidArrow'

const ADULT_REALITY_ACTION_IDS = new Set([
  'kiss_under_covers',
  'pool_makeout',
  'spend_night',
  'skinny_dip',
])

export interface ActionGridProps {
  onActionClick?: (actionId: string) => void
  onPreview?: (actionId: string) => void
  onPremiumLockedClick?: (actionId: string) => void
  disabledIds?: ReadonlySet<string>
  selectedId?: string | null
  selectedTargetIds?: ReadonlySet<string>
  players?: readonly Player[]
  actorId?: string
  actorEnergy?: number
  actorInfluence?: number
  actorInfo?: number
  relationships?: RelationshipsMap
  primaryTargetStatus?: PlayerStatus | null
  dramaMode?: boolean
  currentPhase?: string
  dramaNetwork?: DramaSocialNetwork
  hiddenActionIds?: ReadonlySet<string>
  energyCostOverrides?: Readonly<Record<string, number>>
}

/**
 * Stable action catalogue. Normal Mode exposes the complete strategy toolkit;
 * Reality Mode adds its higher-density story actions. Affordability changes
 * styling and feedback rather than card position, preserving muscle memory.
 */
export default function ActionGrid({
  onActionClick,
  onPreview,
  onPremiumLockedClick,
  disabledIds = new Set(),
  selectedId = null,
  selectedTargetIds,
  players,
  actorId = '',
  actorEnergy,
  actorInfluence,
  actorInfo,
  relationships,
  primaryTargetStatus,
  dramaMode = false,
  currentPhase,
  dramaNetwork,
  hiddenActionIds = new Set(),
  energyCostOverrides,
}: ActionGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const game = useAppSelector((state) => state.game)
  const realityModePreset = useAppSelector((state) => state.settings.gameUX.realityModePreset)

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const cards = Array.from(
      containerRef.current?.querySelectorAll<HTMLElement>('[data-action-id][tabindex="0"]') ?? []
    )
    if (cards.length === 0) return
    const activeCard = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
      '[data-action-id]'
    )
    const index = activeCard ? cards.indexOf(activeCard) : -1
    const next =
      index === -1
        ? event.key === 'ArrowRight'
          ? 0
          : cards.length - 1
        : event.key === 'ArrowRight'
          ? Math.min(index + 1, cards.length - 1)
          : Math.max(index - 1, 0)
    cards[next]?.focus()
  }

  const actorResources = {
    energy: actorEnergy ?? 0,
    influence: actorInfluence ?? Infinity,
    info: actorInfo ?? Infinity,
  }

  function isActionAffordable(costs: { energy: number; influence: number; info: number }): boolean {
    return (
      costs.energy <= actorResources.energy &&
      costs.influence <= actorResources.influence &&
      costs.info <= actorResources.info
    )
  }

  function getActionCosts(action: (typeof SOCIAL_ACTIONS)[number]) {
    const costs = normalizeActionCosts(action, selectedTargetIds?.size, dramaMode)
    const energyOverride = energyCostOverrides?.[action.id]
    return energyOverride === undefined ? costs : { ...costs, energy: energyOverride }
  }

  function isAdultActionAllowed(actionId: string): boolean {
    return !ADULT_REALITY_ACTION_IDS.has(actionId) || realityModePreset === 'adult'
  }

  function isContextEligible(action: (typeof SOCIAL_ACTIONS)[number]): boolean {
    return (
      isAdultActionAllowed(action.id) &&
      isHumanSocialActionVisible(action, dramaMode ? 'drama' : 'normal') &&
      !hiddenActionIds.has(action.id) &&
      evaluateSocialActionEligibility({
        action,
        actorId,
        targetIds: selectedTargetIds ? Array.from(selectedTargetIds) : [],
        phase: currentPhase,
        players,
        primaryTargetStatus,
        relationships,
        dramaNetwork,
        dramaMode,
      }).eligible
    )
  }

  function isRelevantRealityPreview(action: (typeof SOCIAL_ACTIONS)[number]): boolean {
    return (
      !dramaMode &&
      !ADULT_REALITY_ACTION_IDS.has(action.id) &&
      isRealityExclusiveAction(action) &&
      !action.aiOnly &&
      !hiddenActionIds.has(action.id) &&
      evaluateSocialActionEligibility({
        action,
        actorId,
        targetIds: selectedTargetIds ? Array.from(selectedTargetIds) : [],
        phase: currentPhase,
        players,
        primaryTargetStatus,
        relationships,
        dramaNetwork,
        dramaMode: false,
        ignoreRealityModeGate: true,
      }).eligible
    )
  }

  // The Social panel passes the non-human roster into ActionGrid, so looking up
  // the actor in `players` misses the human POS holder. Read the authoritative
  // winner from game state instead, including Cupid's shared-holder rule.
  const actorHasSafety = Boolean(
    actorId &&
      (game.posWinnerId === actorId || getCupidPartnerId(game, game.posWinnerId) === actorId)
  )
  const safetyConsultationOpen =
    actorHasSafety && (currentPhase === 'pos_results' || currentPhase === 'pos_ceremony')

  function contextualizeAction(action: (typeof SOCIAL_ACTIONS)[number]) {
    if (action.id !== 'ask_loh_target') return action
    if (safetyConsultationOpen) {
      return {
        ...action,
        title: 'Ask LOH for POS Advice',
        description:
          'Ask the LOH whether to leave the block alone or use Safety to open a backdoor target.',
      }
    }
    if (
      currentPhase &&
      [
        'nomination_results',
        'pre_veto_public_save',
        'pos_comp_announcement',
        'pos_comp',
        'pos_ceremony_results',
        'social_2',
        'live_vote',
      ].includes(currentPhase)
    ) {
      return {
        ...action,
        title: 'Ask Who Goes Now',
        description:
          'Ask which locked nominee the LOH currently wants eliminated from the final block.',
      }
    }
    return {
      ...action,
      title: 'Ask LOH Plan',
      description: 'Ask who the LOH is considering before nominations are locked.',
    }
  }

  const isRealityPreview = (action: (typeof SOCIAL_ACTIONS)[number]) =>
    isRelevantRealityPreview(action)

  const visibleActions = SOCIAL_ACTIONS.filter(
    (action) => isRealityPreview(action) || isContextEligible(action)
  ).sort((left, right) => {
    const leftPreview = isRealityPreview(left)
    const rightPreview = isRealityPreview(right)
    if (leftPreview !== rightPreview) return leftPreview ? 1 : -1
    if (!safetyConsultationOpen) return 0
    if (left.id === 'ask_loh_target') return -1
    if (right.id === 'ask_loh_target') return 1
    return 0
  })

  function getAvailabilityReason(costs: {
    energy: number
    influence: number
    info: number
  }): string {
    if (actorEnergy === undefined) return ''
    if (costs.energy > actorResources.energy) {
      return `Need ⚡${costs.energy} (have ${actorResources.energy})`
    }
    if (costs.influence > actorResources.influence) {
      return `Need 🤝${costs.influence} (have ${actorResources.influence})`
    }
    if (costs.info > actorResources.info) {
      return `Need 💡${costs.info} (have ${actorResources.info})`
    }
    return ''
  }

  return (
    <div ref={containerRef} className="sp2-action-grid" role="group" onKeyDown={handleKeyDown}>
      {visibleActions.map((action) => {
        const contextualAction = contextualizeAction(action)
        const costs = getActionCosts(action)
        const availabilityReason = getAvailabilityReason(costs)
        const premiumLocked = isRealityPreview(action)
        const isDisabled = !premiumLocked && disabledIds.has(action.id)
        const isAvailable = actorEnergy !== undefined && isActionAffordable(costs)
        return (
          <ActionCard
            key={action.id}
            action={contextualAction}
            costs={costs}
            selected={selectedId === action.id}
            disabled={isDisabled}
            premiumLocked={premiumLocked}
            availabilityReason={availabilityReason}
            available={actorEnergy !== undefined ? isAvailable : undefined}
            onClick={onActionClick}
            onPremiumLockedClick={onPremiumLockedClick}
            onPreview={onPreview}
            costOverride={costs}
          />
        )
      })}
    </div>
  )
}
