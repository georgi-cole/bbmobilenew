import { addTvEvent } from '../store/gameSlice'
import { getIncomingInteractionTone } from './incomingInteractionPresentation'
import {
  getIncomingResponseLogCopy,
  getIncomingResponseRelationshipDelta,
} from './incomingResponseEffects'
import type { AppDispatch, RootState } from '../store/store'
import { socialConfig } from './socialConfig'
import { logIncomingInteractionDecision } from './incomingInteractionLogging'
import {
  addSocialCommitment,
  applyDramaIncomingResponse,
  applyInfoDelta,
  dismissIncomingInteraction,
  resolveExpiredIncomingInteractionsForWeek,
  resolveIncomingInteraction,
  updateRelationship,
  updateSocialMemory,
} from './socialSlice'
import { createCommitmentFromInteraction } from './socialCommitments'
import { isIncomingInteractionInvalidated } from './incomingInteractionValidity'
import { buildSocialMemoryDeltaForResponse, buildSocialMemoryEvent } from './socialMemory'
import { ALLIANCE_TAG, MIN_ALLIANCE_AFFINITY } from './socialAlliance'
import { getInteractionSocialMode } from './socialMode'
import { getIncomingInteractionResponsePolicy } from './socialRuntimeConfig'
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  IncomingInteractionType,
} from './types'

const TYPE_LABELS: Record<IncomingInteractionType, string> = {
  compliment: 'compliment',
  gossip: 'gossip',
  warning: 'warning',
  alliance_proposal: 'alliance proposal',
  deal_offer: 'deal offer',
  nomination_plea: 'nomination plea',
  check_in: 'check-in',
  snide_remark: 'snide remark',
  other: 'message',
}

const RESPONSE_VERBS: Record<IncomingInteractionResponseType, string> = {
  positive: 'encouraged',
  neutral: 'acknowledged',
  negative: 'pushed back on',
  accept: 'accepted',
  decline: 'declined',
  dismiss: 'dismissed',
  ignore: 'ignored',
}

const IGNORED_INTERACTION_SUMMARY_LABELS: Record<
  IncomingInteractionType,
  { singular: string; plural: string }
> = {
  compliment: { singular: 'compliment', plural: 'compliments' },
  gossip: { singular: 'gossip drop', plural: 'gossip drops' },
  warning: { singular: 'warning', plural: 'warnings' },
  alliance_proposal: { singular: 'alliance proposal', plural: 'alliance proposals' },
  deal_offer: { singular: 'deal offer', plural: 'deal offers' },
  nomination_plea: { singular: 'nomination plea', plural: 'nomination pleas' },
  check_in: { singular: 'check-in', plural: 'check-ins' },
  snide_remark: { singular: 'snide remark', plural: 'snide remarks' },
  other: { singular: 'message', plural: 'messages' },
}

const IGNORED_INTERACTION_TYPE_PRIORITY: Record<IncomingInteractionType, number> = {
  deal_offer: 0,
  nomination_plea: 1,
  alliance_proposal: 2,
  warning: 3,
  check_in: 4,
  gossip: 5,
  compliment: 6,
  snide_remark: 7,
  other: 8,
}

const DEFAULT_IGNORED_INTERACTION_LABEL = 'messages'

type ResolutionSource = 'player' | 'expiry'

export function getIncomingInteractionTypeLabel(type: IncomingInteractionType): string {
  return TYPE_LABELS[type]
}

function formatList(items: string[]): string {
  if (items.length === 0) return DEFAULT_IGNORED_INTERACTION_LABEL
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function buildIgnoredIncomingInteractionsSummary(interactions: IncomingInteraction[]): string {
  const counts = new Map<IncomingInteractionType, number>()
  interactions.forEach((interaction) => {
    counts.set(interaction.type, (counts.get(interaction.type) ?? 0) + 1)
  })
  const uniqueSenderCount = new Set(interactions.map((interaction) => interaction.fromId)).size
  const typeFragments = Array.from(counts.entries())
    .sort(
      ([leftType], [rightType]) =>
        IGNORED_INTERACTION_TYPE_PRIORITY[leftType] - IGNORED_INTERACTION_TYPE_PRIORITY[rightType]
    )
    .map(([type, count]) => {
      const labels = IGNORED_INTERACTION_SUMMARY_LABELS[type]
      return count === 1 ? labels.singular : labels.plural
    })

  if (uniqueSenderCount === 1) {
    return `One player's ${formatList(typeFragments)} required an answer and went unanswered last week.`
  }

  return `Several players' ${formatList(typeFragments)} required answers and went unanswered last week.`
}

function getResponseDelta(
  responseType: IncomingInteractionResponseType,
  interaction: IncomingInteraction,
  dramaMode: boolean
): number {
  if (dramaMode && interaction.payload?.scenarioKey === 'safety_holder_consults_loh') {
    if (responseType === 'accept' || responseType === 'decline') return 3
    if (responseType === 'neutral') return 1
    if (responseType === 'dismiss' || responseType === 'ignore') return -2
  }
  return socialConfig.incomingInteractionAffinityDeltas[responseType] ?? 0
}

function buildResponseLogText(
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  fromName: string,
  dramaMode: boolean
): string {
  if (dramaMode) {
    return getIncomingResponseLogCopy(interaction.id, responseType, fromName)
  }
  const typeLabel = getIncomingInteractionTypeLabel(interaction.type)
  if (responseType === 'ignore') {
    return `You left ${fromName}'s ${typeLabel} unanswered.`
  }
  const verb = RESPONSE_VERBS[responseType] ?? 'responded to'
  return `You ${verb} ${fromName}'s ${typeLabel}.`
}

function buildResponseOutcomeText(
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  responseLabel: string | undefined,
  fromName: string,
  subjectName?: string
): string {
  const choiceLead = responseLabel ? `Your choice, “${responseLabel},” was clear. ` : ''
  if (interaction.type === 'alliance_proposal') {
    if (responseType === 'accept') {
      return `${choiceLead}The pact with ${fromName} is active now. Loyalty will be tested by votes, nominations and Safety decisions.`
    }
    if (responseType === 'neutral') {
      return `${choiceLead}${fromName} leaves without a deal and will decide whether your hesitation was caution or rejection.`
    }
    return `${choiceLead}${fromName} understands there is no alliance. That closed door may shape their next move.`
  }
  if (interaction.type === 'gossip' || interaction.type === 'warning') {
    if (responseType === 'positive') {
      return `${choiceLead}${fromName} trusts you with the full story: ${interaction.text}`
    }
    if (responseType === 'neutral') {
      return `${choiceLead}${fromName} leaves the information with you: ${interaction.text}`
    }
    if (subjectName) {
      return `${choiceLead}You challenge ${fromName}'s story about ${subjectName}. The claim remains unconfirmed.`
    }
    return `${choiceLead}You challenge ${fromName}'s story. The claim remains unconfirmed.`
  }
  if (interaction.type === 'nomination_plea') {
    if (responseType === 'positive' || responseType === 'accept') {
      return `${choiceLead}${fromName} leaves believing you may support them. The game will compare that expectation with what you actually do.`
    }
    if (responseType === 'neutral') {
      return `${choiceLead}${fromName} got a hearing but no promise, so they keep campaigning elsewhere.`
    }
    return `${choiceLead}${fromName} knows your support is unlikely and may redirect their campaign against you.`
  }
  if (responseType === 'positive' || responseType === 'accept') {
    return `${choiceLead}${fromName} takes your response as genuine, and the connection improves immediately.`
  }
  if (responseType === 'neutral') {
    return `${choiceLead}${fromName} accepts the measured response but leaves without assuming closeness or loyalty.`
  }
  return `${choiceLead}${fromName} takes your response as distance. The social cost has already reached your relationship.`
}

function canAwardIntel(interaction: IncomingInteraction): boolean {
  if (interaction.type !== 'gossip' && interaction.type !== 'warning') return false
  if (interaction.payload?.truth === 'false') return false
  if (interaction.payload?.evidence === 'none') return false
  return true
}

function applyIncomingChoiceConsequences({
  dispatch,
  state,
  interaction,
  responseType,
  responseLabel,
  source,
  resolvedAt,
}: {
  dispatch: AppDispatch
  state: RootState
  interaction: IncomingInteraction
  responseType: IncomingInteractionResponseType
  responseLabel?: string
  source: ResolutionSource
  resolvedAt: number
}): { outcomeText: string; logText: string } | null {
  const humanPlayer = state.game.players.find((player) => player.isUser)
  if (!humanPlayer) return null

  const dramaMode = getInteractionSocialMode(interaction, state) === 'drama'
  const currentWeek = state.game.week ?? 1
  const fromPlayer = state.game.players.find((player) => player.id === interaction.fromId)
  const fromName = fromPlayer?.name ?? interaction.fromId
  const subjectId =
    typeof interaction.payload?.subjectId === 'string' ? interaction.payload.subjectId : undefined
  const subjectName = subjectId
    ? state.game.players.find((player) => player.id === subjectId)?.name
    : undefined
  const outcomeText = buildResponseOutcomeText(
    interaction,
    responseType,
    responseLabel,
    fromName,
    subjectName
  )

  if (dramaMode) {
    dispatch(
      applyDramaIncomingResponse({
        holderId: interaction.fromId,
        subjectId: humanPlayer.id,
        responseType,
        interactionType: interaction.type,
        week: currentWeek,
      })
    )
  }

  // Promises are part of the premium causal simulation, not Normal Mode.
  if (dramaMode && source === 'player') {
    const commitment = createCommitmentFromInteraction({
      interaction,
      responseType,
      promisorId: humanPlayer.id,
      week: currentWeek,
    })
    if (commitment) dispatch(addSocialCommitment(commitment))
  }

  const baseDelta = getResponseDelta(responseType, interaction, dramaMode)
  const responseTone = dramaMode
    ? getIncomingInteractionTone({
        interaction,
        relationships: state.social.relationships,
        socialMemory: state.social.socialMemory,
        humanId: humanPlayer.id,
        isUrgent: interaction.expiresAtWeek <= currentWeek,
      })
    : undefined
  const delta =
    dramaMode && interaction.payload?.scenarioKey !== 'safety_holder_consults_loh'
      ? getIncomingResponseRelationshipDelta(interaction.type, responseType, responseTone)
      : baseDelta
  const acceptedAlliance = interaction.type === 'alliance_proposal' && responseType === 'accept'

  if (delta !== 0 && interaction.fromId !== humanPlayer.id) {
    const fromAffinity =
      state.social.relationships[interaction.fromId]?.[humanPlayer.id]?.affinity ?? 0
    const humanAffinity =
      state.social.relationships[humanPlayer.id]?.[interaction.fromId]?.affinity ?? 0
    const fromDelta = acceptedAlliance
      ? Math.max(delta, MIN_ALLIANCE_AFFINITY - fromAffinity)
      : delta
    const humanDelta = acceptedAlliance
      ? Math.max(delta, MIN_ALLIANCE_AFFINITY - humanAffinity)
      : delta
    dispatch(
      updateRelationship({
        source: interaction.fromId,
        target: humanPlayer.id,
        delta: fromDelta,
        tags: acceptedAlliance ? [ALLIANCE_TAG] : undefined,
        actionSource: source === 'player' ? 'manual' : 'system',
      })
    )
    if (acceptedAlliance) {
      dispatch(
        updateRelationship({
          source: humanPlayer.id,
          target: interaction.fromId,
          delta: humanDelta,
          tags: [ALLIANCE_TAG],
          actionSource: 'system',
        })
      )
    }
  }

  if (dramaMode && interaction.payload?.scenarioKey === 'safety_holder_consults_loh') {
    const advice = responseType === 'accept' ? 'use' : responseType === 'decline' ? 'hold' : 'free'
    dispatch({
      type: 'game/setLohSafetyAdvice',
      payload: {
        week: currentWeek,
        lohId: humanPlayer.id,
        holderId: interaction.fromId,
        advice,
      },
    })
  }

  if (interaction.fromId !== humanPlayer.id) {
    dispatch(
      updateSocialMemory({
        actorId: interaction.fromId,
        targetId: humanPlayer.id,
        deltas: buildSocialMemoryDeltaForResponse(responseType),
        event: buildSocialMemoryEvent(
          interaction,
          responseType,
          interaction.fromId,
          humanPlayer.id,
          currentWeek,
          resolvedAt
        ),
      })
    )
  }

  if (canAwardIntel(interaction) && (responseType === 'positive' || responseType === 'neutral')) {
    dispatch(applyInfoDelta({ playerId: humanPlayer.id, delta: 1 }))
  }

  return {
    outcomeText,
    logText: buildResponseLogText(interaction, responseType, fromName, dramaMode),
  }
}

export function respondToIncomingInteraction({
  interactionId,
  responseType,
  responseLabel,
}: {
  interactionId: string
  responseType: IncomingInteractionResponseType
  responseLabel?: string
}) {
  return (dispatch: AppDispatch, getState: () => RootState): void => {
    const state = getState()
    const interaction = state.social.incomingInteractions.find(
      (entry) => entry.id === interactionId
    )
    if (!interaction || interaction.resolved) return
    if (getIncomingInteractionResponsePolicy(interaction) === 'readOnly') return

    const currentWeek = state.game.week ?? 1
    const resolvedAt = Date.now()

    if (isIncomingInteractionInvalidated(interaction, state.game)) {
      dispatch(
        dismissIncomingInteraction({
          interactionId,
          resolvedAt,
          resolvedWeek: currentWeek,
        })
      )
      return
    }

    const result = applyIncomingChoiceConsequences({
      dispatch,
      state,
      interaction,
      responseType,
      responseLabel,
      source: 'player',
      resolvedAt,
    })
    if (!result) return

    dispatch(
      resolveIncomingInteraction({
        interactionId,
        resolvedWith: responseType,
        resolvedLabel: responseLabel,
        outcomeText: result.outcomeText,
        resolvedAt,
        resolvedWeek: currentWeek,
      })
    )
    dispatch(
      addTvEvent({
        text: `${result.logText} ${result.outcomeText}`,
        type: 'social',
        source: 'manual',
        channels: ['mainLog', 'dr'],
      })
    )
  }
}

/**
 * Resolve expired conversations. Only required decisions count as ignored;
 * optional conversations and read-only updates close quietly with no penalty.
 */
export function autoResolveExpiredIncomingInteractionsForWeek(week: number) {
  return (dispatch: AppDispatch, getState: () => RootState): void => {
    const state = getState()
    const interactions = state.social.incomingInteractions.filter(
      (entry) => !entry.resolved && entry.expiresAtWeek < week
    )
    if (interactions.length === 0) return

    const resolvedAt = Date.now()
    const required = interactions.filter(
      (interaction) => getIncomingInteractionResponsePolicy(interaction) === 'required'
    )

    for (const interaction of interactions) {
      const isRequired = required.includes(interaction)
      logIncomingInteractionDecision(dispatch, {
        stage: 'auto_resolution',
        reason: isRequired ? 'auto_resolved_ignored' : 'auto_resolved_no_response_required',
        interactionId: interaction.id,
        actorId: interaction.fromId,
        type: interaction.type,
        week,
        detail: 'week_end',
      })

      if (isRequired) {
        applyIncomingChoiceConsequences({
          dispatch,
          state,
          interaction,
          responseType: 'ignore',
          source: 'expiry',
          resolvedAt,
        })
      }
    }

    if (required.length > 0) {
      dispatch(
        addTvEvent({
          text: buildIgnoredIncomingInteractionsSummary(required),
          type: 'social',
          source: 'system',
          channels: ['tv', 'mainLog'],
        })
      )
    }

    dispatch(resolveExpiredIncomingInteractionsForWeek({ week, resolvedAt }))
  }
}
