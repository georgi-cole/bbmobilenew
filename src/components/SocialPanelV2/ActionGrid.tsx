import { useRef } from 'react'
import { SOCIAL_ACTIONS } from '../../social/socialActions'
import { isHumanSocialActionVisible } from '../../social/socialActionCatalog'
import { normalizeActionCosts } from '../../social/smExecNormalize'
import { evaluateSocialActionEligibility } from '../../social/socialActionEligibility'
import ActionCard from './ActionCard'
import type { Player, PlayerStatus } from '../../types'
import type { DramaSocialNetwork, RelationshipsMap } from '../../social/types'

export interface ActionGridProps {
  onActionClick?: (actionId: string) => void
  onPreview?: (actionId: string) => void
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
 * Stable action catalogue. Normal Mode exposes the compact core toolkit; Drama
 * Mode exposes the complete non-AI catalogue. Affordability changes styling and
 * feedback rather than card position, preserving muscle memory.
 */
export default function ActionGrid({
  onActionClick,
  onPreview,
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

  function isContextEligible(action: (typeof SOCIAL_ACTIONS)[number]): boolean {
    return (
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

  const visibleActions = SOCIAL_ACTIONS.filter(isContextEligible)

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
        const costs = getActionCosts(action)
        const availabilityReason = getAvailabilityReason(costs)
        const isDisabled = disabledIds.has(action.id)
        const isAvailable = actorEnergy !== undefined && isActionAffordable(costs)
        return (
          <ActionCard
            key={action.id}
            action={action}
            costs={costs}
            selected={selectedId === action.id}
            disabled={isDisabled}
            availabilityReason={availabilityReason}
            available={actorEnergy !== undefined ? isAvailable : undefined}
            onClick={onActionClick}
            onPreview={onPreview}
            costOverride={costs}
          />
        )
      })}
    </div>
  )
}
