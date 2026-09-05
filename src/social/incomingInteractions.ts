import { getIncomingInteractionTone } from './incomingInteractionPresentation'
import {
  getIncomingResponseLogCopy,
  getIncomingResponseRelationshipDelta,
} from './incomingResponseEffects'
import { resolveIncomingResponse } from './incomingInteractionResolution'
import type { AppDispatch, RootState } from '../store/store'
import { socialConfig } from './socialConfig'
import { logIncomingInteractionDecision } from './incomingInteractionLogging'
import {
  addSocialCommitment,
  applyDramaIncomingResponse,
  applyInfoDelta,
  dismissIncomingInteraction,
  replaceRealityDomain,
  resolveIncomingInteractionsByDeadline,
  resolveIncomingInteraction,
  updateRelationship,
  updateSocialMemory,
  learnRealityKnowledge,
  recordIntelligenceDelivery,
} from './socialSlice'
import { resolvePendingHumanRealityInteraction } from './reality'
import { isIncomingInteractionOverdue } from './incomingInteractionDeadline'
import {
  createCommitmentFromInteraction,
  getCommitmentKindForInteraction,
} from './socialCommitments'
import { isIncomingInteractionInvalidated } from './incomingInteractionValidity'
import { buildSocialMemoryDeltaForResponse, buildSocialMemoryEvent } from './socialMemory'
import type { SocialMemoryDelta } from './socialMemory'
import { ALLIANCE_TAG, MIN_ALLIANCE_AFFINITY } from './socialAlliance'
import { getInteractionSocialMode } from './socialMode'
import { getIncomingInteractionResponsePolicy } from './socialRuntimeConfig'
import { getCupidPartnerId } from '../features/twists/cupidArrow'
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  IncomingInteractionType,
} from './types'
import { makeIntelMemory } from './intelligenceSystem'

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

type ResolutionSource = 'player' | 'expiry'

function resolveRealityIncomingInteraction(
  dispatch: AppDispatch,
  getState: () => RootState,
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  day: number,
  phase: string,
  baseDomain = getState().social.reality
): void {
  const realityInteractionId =
    typeof interaction.payload?.realityInteractionId === 'string'
      ? interaction.payload.realityInteractionId
      : undefined
  if (!realityInteractionId) return
  const state = getState()
  const humanId = state.game.players.find((player) => player.isUser)?.id
  if (!humanId) return
  const resolved = resolvePendingHumanRealityInteraction({
    domain: baseDomain,
    interactionId: realityInteractionId,
    humanId,
    responseType,
    day,
    phase,
    subjectId:
      typeof interaction.payload?.subjectId === 'string'
        ? interaction.payload.subjectId
        : undefined,
  })
  if (resolved.event) dispatch(replaceRealityDomain(resolved.domain))
}

export function getIncomingInteractionTypeLabel(type: IncomingInteractionType): string {
  return TYPE_LABELS[type]
}

function getResponseDelta(
  responseType: IncomingInteractionResponseType,
  interaction: IncomingInteraction,
  responseLabel?: string
): number {
  const scenarioKey = interaction.payload?.scenarioKey
  if (
    scenarioKey === 'safety_holder_consults_loh' ||
    scenarioKey === 'loh_consults_safety_holder'
  ) {
    if (scenarioKey === 'loh_consults_safety_holder') {
      const choice = getDeclaredSafetyChoice(interaction, responseLabel)
      if (choice.kind === 'advice') return 2
      const preferredAdvice = interaction.payload?.preferredSafetyAdvice
      const preferredTargetId = interaction.payload?.preferredSafetyTargetId
      const aligned =
        (choice.kind === 'none' && preferredAdvice === 'hold') ||
        (choice.kind === 'save' &&
          preferredAdvice === 'save' &&
          choice.targetId === preferredTargetId)
      if (choice.kind === 'save' || choice.kind === 'none') return aligned ? 3 : 0
    }
    // These four buttons describe a plan, not moral approval. Any concrete
    // answer builds a little trust; uncertainty is neutral and dismissal hurts.
    if (responseType === 'accept' || responseType === 'decline' || responseType === 'negative') {
      return 2
    }
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

function getDeclaredSafetyChoice(
  interaction: IncomingInteraction,
  responseLabel?: string
): {
  targetName?: string
  targetId?: string
  kind: 'save' | 'none' | 'advice' | 'undecided'
} {
  const label = responseLabel ?? ''
  if (/save nobody/i.test(label)) return { kind: 'none' }
  if (/your advice/i.test(label)) return { kind: 'advice' }
  if (/not decided|your call/i.test(label)) return { kind: 'undecided' }
  const match = label.match(/^Save (.+)$/i)
  if (!match) return { kind: 'undecided' }
  const targetName = match[1]
  const names = Array.isArray(interaction.payload?.nomineeNames)
    ? interaction.payload.nomineeNames
    : []
  const ids = Array.isArray(interaction.payload?.nomineeIds) ? interaction.payload.nomineeIds : []
  const index = names.findIndex((name) => name === targetName)
  return {
    kind: 'save',
    targetName,
    targetId: index >= 0 && typeof ids[index] === 'string' ? ids[index] : undefined,
  }
}

function describeLohSafetyPreference(interaction: IncomingInteraction, fromName: string): string {
  if (interaction.payload?.preferredSafetyAdvice === 'save') {
    const target = interaction.payload?.preferredSafetyTargetName
    const replacement = interaction.payload?.preferredReplacementName
    return `${fromName} prefers Safety used on ${
      typeof target === 'string' ? target : 'one nominee'
    }${typeof replacement === 'string' ? ` so ${replacement} can become the replacement` : ''}.`
  }
  return `${fromName} wants the nominations left unchanged.`
}

function buildOrdinaryResponseOutcome(
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  fromName: string,
  responseLabel?: string
): string {
  const honestAnswer = /truth|honest|open up|let them in/i.test(responseLabel ?? '')
  if (interaction.type === 'check_in') {
    if (responseType === 'positive' || responseType === 'accept') {
      if (/public save/i.test(interaction.text) && honestAnswer) {
        return `${fromName} took your honesty seriously. They now understand that the public save left you feeling exposed.`
      }
      return `${fromName} appreciated the openness, and the conversation left them feeling closer to you.`
    }
    if (responseType === 'neutral') {
      return `${fromName} accepted the careful answer, but still does not know exactly where you stand.`
    }
    if (responseType === 'negative' || responseType === 'decline') {
      return `${fromName} noticed you pulling away, and the conversation ended with more distance between you.`
    }
    return `${fromName} let the conversation end, but the abrupt exit did not go unnoticed.`
  }
  if (interaction.type === 'compliment') {
    if (responseType === 'positive' || responseType === 'accept')
      return `${fromName} felt the warmth was returned.`
    if (responseType === 'neutral') return `${fromName} took the restrained reaction in stride.`
    return `${fromName} left feeling that the compliment had not landed.`
  }
  if (interaction.type === 'snide_remark') {
    if (responseType === 'positive')
      return `You defused the jab, leaving ${fromName} with little room to escalate.`
    if (responseType === 'neutral')
      return `${fromName} got no visible reaction and backed off for now.`
    if (responseType === 'negative')
      return `The exchange with ${fromName} sharpened into open tension.`
    return `You walked away, and ${fromName} was left to decide whether silence meant restraint or contempt.`
  }
  if (interaction.type === 'deal_offer') {
    if (responseType === 'neutral') {
      if (/ask for terms|demand proof|counteroffer|buy some time/i.test(responseLabel ?? '')) {
        return `${fromName} laid out what they need before making any promise. The conversation is still open.`
      }
      return `${fromName} heard the hesitation and left the offer on the table for now.`
    }
    if (responseType === 'negative' || responseType === 'decline')
      return `${fromName} heard your answer and withdrew the offer without pretending it was fine.`
    if (responseType === 'dismiss')
      return `${fromName} left the conversation frustrated that their pitch never got a real hearing.`
  }
  if (interaction.type === 'nomination_plea') {
    if (responseType === 'neutral')
      return `${fromName} left without a guarantee and will keep looking for certainty elsewhere.`
    if (responseType === 'negative' || responseType === 'decline')
      return `${fromName} understood that they could not count on you.`
    if (responseType === 'dismiss')
      return `${fromName} left the conversation frustrated by the lack of an answer.`
  }
  return `${fromName} registered your response, and the exchange changed how they read you.`
}

function buildResponseOutcomeText(
  interaction: IncomingInteraction,
  responseType: IncomingInteractionResponseType,
  fromName: string,
  subjectName?: string,
  responseLabel?: string
): string | undefined {
  if (interaction.type === 'alliance_proposal' && responseType === 'accept') {
    return `The alliance with ${fromName} is now active. Later votes and nominations will show whether it holds.`
  }

  const scenarioKey = interaction.payload?.scenarioKey
  if (scenarioKey === 'safety_holder_consults_loh') {
    const choice = getDeclaredSafetyChoice(interaction, responseLabel)
    if (choice.kind === 'save')
      return `${fromName} now knows you prefer Safety used on ${choice.targetName}.`
    if (choice.kind === 'none')
      return `${fromName} now knows you prefer the nominations left unchanged.`
    return `You told ${fromName} that the final Safety decision is theirs.`
  }
  if (scenarioKey === 'loh_consults_safety_holder') {
    const choice = getDeclaredSafetyChoice(interaction, responseLabel)
    if (choice.kind === 'advice') return describeLohSafetyPreference(interaction, fromName)
    const aligned =
      (choice.kind === 'none' && interaction.payload?.preferredSafetyAdvice === 'hold') ||
      (choice.kind === 'save' &&
        interaction.payload?.preferredSafetyAdvice === 'save' &&
        choice.targetId === interaction.payload?.preferredSafetyTargetId)
    if (choice.kind === 'save' || choice.kind === 'none') {
      if (!aligned) {
        return `${fromName} asked you to reconsider. ${describeLohSafetyPreference(
          interaction,
          fromName
        )}`
      }
      return choice.kind === 'save'
        ? `${fromName} agrees with saving ${choice.targetName} and will prepare the replacement.`
        : `${fromName} agrees that the nominations should remain unchanged.`
    }
    return `${fromName} knows you have not committed to a Safety plan yet.`
  }

  const commitmentKind = getCommitmentKindForInteraction(interaction)
  if (commitmentKind && (responseType === 'positive' || responseType === 'accept')) {
    return `You made a promise to ${fromName}. The related game decision will judge whether you keep it.`
  }

  if (interaction.type === 'gossip' || interaction.type === 'warning') {
    if (responseType === 'positive' || responseType === 'neutral') {
      return subjectName
        ? `You now have an unconfirmed lead involving ${subjectName}.`
        : 'You chose to keep the claim in mind, but it remains unconfirmed.'
    }
  }

  // New interactions all carry an authored scenario key and resolve through
  // the contextual outcome bank. Keep this compatibility fallback for old
  // saves and externally-created interactions that do not have one yet.
  return typeof interaction.payload?.scenarioKey === 'string'
    ? undefined
    : buildOrdinaryResponseOutcome(interaction, responseType, fromName, responseLabel)
}

function mergeSocialMemoryDeltas(
  base: SocialMemoryDelta,
  contextual: SocialMemoryDelta
): SocialMemoryDelta {
  return {
    gratitude: (base.gratitude ?? 0) + (contextual.gratitude ?? 0),
    resentment: (base.resentment ?? 0) + (contextual.resentment ?? 0),
    neglect: (base.neglect ?? 0) + (contextual.neglect ?? 0),
    trustMomentum: (base.trustMomentum ?? 0) + (contextual.trustMomentum ?? 0),
  }
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
}): { outcomeText?: string; logText: string } | null {
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

  const baseDelta = getResponseDelta(responseType, interaction, responseLabel)
  const responseTone = dramaMode
    ? getIncomingInteractionTone({
        interaction,
        relationships: state.social.relationships,
        socialMemory: state.social.socialMemory,
        humanId: humanPlayer.id,
        isUrgent: interaction.expiresAtWeek <= currentWeek,
      })
    : undefined
  const consultationScenario =
    interaction.payload?.scenarioKey === 'safety_holder_consults_loh' ||
    interaction.payload?.scenarioKey === 'loh_consults_safety_holder'
  const hasContextualScenario = typeof interaction.payload?.scenarioKey === 'string'
  const contextualResolution = resolveIncomingResponse({
    interaction,
    responseType,
    fromName,
    phase: state.game.phase,
    actorAffinity: state.social.relationships[interaction.fromId]?.[humanPlayer.id]?.affinity ?? 0,
    playerAffinity: state.social.relationships[humanPlayer.id]?.[interaction.fromId]?.affinity ?? 0,
    subjectName,
    responseLabel,
  })
  const actorDelta =
    hasContextualScenario && !consultationScenario
      ? contextualResolution.actorDelta
      : dramaMode && !consultationScenario
        ? getIncomingResponseRelationshipDelta(interaction.type, responseType, responseTone)
        : baseDelta
  const playerDelta =
    hasContextualScenario && !consultationScenario ? contextualResolution.playerDelta : 0
  const outcomeText =
    buildResponseOutcomeText(interaction, responseType, fromName, subjectName, responseLabel) ??
    contextualResolution.outcomeText
  const acceptedAlliance = interaction.type === 'alliance_proposal' && responseType === 'accept'

  if (
    (actorDelta !== 0 || playerDelta !== 0 || acceptedAlliance) &&
    interaction.fromId !== humanPlayer.id
  ) {
    const fromAffinity =
      state.social.relationships[interaction.fromId]?.[humanPlayer.id]?.affinity ?? 0
    const humanAffinity =
      state.social.relationships[humanPlayer.id]?.[interaction.fromId]?.affinity ?? 0
    const fromDelta = acceptedAlliance
      ? Math.max(actorDelta, MIN_ALLIANCE_AFFINITY - fromAffinity)
      : actorDelta
    const humanDelta = acceptedAlliance
      ? Math.max(playerDelta, MIN_ALLIANCE_AFFINITY - humanAffinity)
      : playerDelta
    if (fromDelta !== 0 || acceptedAlliance) {
      dispatch(
        updateRelationship({
          source: interaction.fromId,
          target: humanPlayer.id,
          delta: fromDelta,
          tags: acceptedAlliance ? [ALLIANCE_TAG] : undefined,
          actionSource: source === 'player' ? 'manual' : 'system',
        })
      )
    }
    // An incoming conversation changes how both people read the connection.
    // The contextual resolver deliberately makes this reciprocal effect smaller
    // and personality-sensitive, rather than pretending every feeling is equal.
    if (humanDelta !== 0 || acceptedAlliance) {
      dispatch(
        updateRelationship({
          source: humanPlayer.id,
          target: interaction.fromId,
          delta: humanDelta,
          tags: acceptedAlliance ? [ALLIANCE_TAG] : undefined,
          actionSource: source === 'player' ? 'manual' : 'system',
        })
      )
    }
  }

  // Cupid partners are separate players, but an active pair tends to compare
  // a meaningful conversation. Give the other half of the pair a small,
  // reciprocal read on the human without making the relationships identical.
  const cupidPartnerId = getCupidPartnerId(state.game, interaction.fromId)
  const shouldRippleCupidConversation =
    cupidPartnerId !== null &&
    cupidPartnerId !== humanPlayer.id &&
    interaction.fromId !== humanPlayer.id &&
    (actorDelta !== 0 || playerDelta !== 0)
  if (shouldRippleCupidConversation && cupidPartnerId) {
    const cupidRippleDelta =
      Math.sign(actorDelta || playerDelta) *
      Math.max(1, Math.round(Math.max(Math.abs(actorDelta), Math.abs(playerDelta)) * 0.35))
    dispatch(
      updateRelationship({
        source: cupidPartnerId,
        target: humanPlayer.id,
        delta: cupidRippleDelta,
        tags: ['cupid_ripple'],
        actionSource: source === 'player' ? 'manual' : 'system',
      })
    )
    dispatch(
      updateRelationship({
        source: humanPlayer.id,
        target: cupidPartnerId,
        delta:
          Math.sign(cupidRippleDelta) * Math.max(1, Math.round(Math.abs(cupidRippleDelta) * 0.5)),
        tags: ['cupid_ripple'],
        actionSource: source === 'player' ? 'manual' : 'system',
      })
    )
  }

  if (interaction.payload?.scenarioKey === 'safety_holder_consults_loh') {
    const choice = getDeclaredSafetyChoice(interaction, responseLabel)
    dispatch({
      type: 'game/setLohSafetyAdvice',
      payload: {
        week: currentWeek,
        lohId: humanPlayer.id,
        holderId: interaction.fromId,
        advice: choice.kind === 'save' ? 'use' : choice.kind === 'none' ? 'hold' : 'free',
        targetId: choice.targetId,
      },
    })
  }

  if (interaction.fromId !== humanPlayer.id) {
    dispatch(
      updateSocialMemory({
        actorId: interaction.fromId,
        targetId: humanPlayer.id,
        deltas: hasContextualScenario
          ? mergeSocialMemoryDeltas(
              buildSocialMemoryDeltaForResponse(responseType),
              contextualResolution.memoryDelta
            )
          : buildSocialMemoryDeltaForResponse(responseType),
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

  if (
    dramaMode &&
    canAwardIntel(interaction) &&
    (responseType === 'positive' || responseType === 'neutral')
  ) {
    dispatch(applyInfoDelta({ playerId: humanPlayer.id, delta: 1 }))
  }

  const intelFactId =
    typeof interaction.payload?.intelFactId === 'string'
      ? interaction.payload.intelFactId
      : undefined
  const intelFact = intelFactId ? state.social.reality.facts[intelFactId] : undefined
  if (
    intelFact &&
    source === 'player' &&
    (responseType === 'positive' || responseType === 'neutral')
  ) {
    const senderBelief =
      state.social.reality.beliefsByOwner[interaction.fromId]?.[
        `belief:${interaction.fromId}:${intelFact.id}`
      ]
    const authoredConfidence = Number(interaction.payload?.intelConfidence)
    const senderConfidence = Number.isFinite(authoredConfidence)
      ? authoredConfidence
      : (senderBelief?.confidence ?? 0.52)
    const confidence = Math.max(
      0.2,
      Math.min(0.88, senderConfidence * (responseType === 'positive' ? 0.9 : 0.72))
    )
    const authoredChain = Array.isArray(interaction.payload?.intelSourceChain)
      ? interaction.payload.intelSourceChain.filter(
          (entry): entry is string => typeof entry === 'string'
        )
      : []
    dispatch(
      learnRealityKnowledge({
        ownerId: humanPlayer.id,
        factId: intelFact.id,
        confidence,
        memory: makeIntelMemory({
          ownerId: humanPlayer.id,
          fact: intelFact,
          sourceType: 'HEARSAY',
          sourceChain: [...authoredChain, interaction.fromId],
          confidence,
          day: currentWeek,
          phase: state.game.phase,
        }),
      })
    )
    dispatch(
      recordIntelligenceDelivery({
        id: `intel-delivery:incoming:${humanPlayer.id}:${intelFact.id}:${currentWeek}`,
        factId: intelFact.id,
        channel: 'incoming',
        day: currentWeek,
        recipientId: humanPlayer.id,
      })
    )
  }

  return {
    outcomeText: `${outcomeText}${
      shouldRippleCupidConversation && cupidPartnerId
        ? ` Their Cupid partner, ${
            state.game.players.find((player) => player.id === cupidPartnerId)?.name ??
            'their partner'
          }, is likely to hear their version of it.`
        : ''
    }`,
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
    const realityBeforeResponse = state.social.reality

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

    resolveRealityIncomingInteraction(
      dispatch,
      getState,
      interaction,
      responseType,
      currentWeek,
      state.game.phase,
      realityBeforeResponse
    )

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
    // The answered card remains visible with its outcome. Do not repeat the same
    // panel interaction through faux TV or a second broadcast log.
  }
}

/**
 * Resolve expired conversations. Only required decisions count as ignored;
 * optional conversations and read-only updates close quietly with no penalty.
 */
export function autoResolveExpiredIncomingInteractionsForWeek(week: number) {
  return autoResolveExpiredIncomingInteractionsForClock(week, 'week_start')
}

export function autoResolveExpiredIncomingInteractionsForClock(day: number, phase: string) {
  return (dispatch: AppDispatch, getState: () => RootState): void => {
    const state = getState()
    const interactions = state.social.incomingInteractions.filter((entry) =>
      isIncomingInteractionOverdue(entry, { day, phase })
    )
    if (interactions.length === 0) return

    const resolvedAt = Date.now()
    const required = interactions.filter(
      (interaction) => getIncomingInteractionResponsePolicy(interaction) === 'required'
    )

    for (const interaction of interactions) {
      const realityBeforeResponse = getState().social.reality
      const isRequired = required.includes(interaction)
      logIncomingInteractionDecision(dispatch, {
        stage: 'auto_resolution',
        reason: isRequired ? 'auto_resolved_ignored' : 'auto_resolved_no_response_required',
        interactionId: interaction.id,
        actorId: interaction.fromId,
        type: interaction.type,
        week: day,
        phase,
        detail: 'phase_deadline',
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
      resolveRealityIncomingInteraction(
        dispatch,
        getState,
        interaction,
        'ignore',
        day,
        phase,
        realityBeforeResponse
      )
    }

    dispatch(
      resolveIncomingInteractionsByDeadline({
        interactionIds: interactions.map((interaction) => interaction.id),
        day,
        phase,
        resolvedAt,
      })
    )
  }
}
