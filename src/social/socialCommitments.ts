import { addTvEvent } from '../store/gameSlice'
import { updateApproval } from '../publicOpinion/publicOpinionSlice'
import { socialConfig } from './socialConfig'
import {
  applyInfluenceDelta,
  pushIncomingInteraction,
  resolveSocialCommitment,
  updateRelationship,
  updateSocialMemory,
} from './socialSlice'
import type {
  IncomingInteraction,
  IncomingInteractionResponseType,
  RelationshipsMap,
  SocialCommitment,
  SocialCommitmentKind,
} from './types'

interface CommitmentPlayer {
  id: string
  name?: string
  isUser?: boolean
  status?: string
}

interface CommitmentState {
  game: {
    week?: number
    nomineeIds?: string[]
    povSavedId?: string | null
    votes?: Record<string, string>
    players?: CommitmentPlayer[]
  }
  social: {
    commitments?: SocialCommitment[]
    relationships?: RelationshipsMap
    influenceBank?: Record<string, number>
  }
}

export interface CommitmentStore {
  dispatch: (action: unknown) => unknown
  getState: () => CommitmentState
}

const KIND_LABELS: Record<SocialCommitmentKind, string> = {
  protect_from_nomination: 'Keep them off the block',
  use_safety_on_player: 'Use safety on them',
  vote_to_keep: 'Vote to keep them',
}

const KIND_DUE_COPY: Record<SocialCommitmentKind, string> = {
  protect_from_nomination: 'Checked when nominations lock',
  use_safety_on_player: 'Checked when the safety decision locks',
  vote_to_keep: 'Checked when your eviction vote locks',
}

const BROKEN_PROMISE_REACTION_COPY: Record<SocialCommitmentKind, string> = {
  protect_from_nomination:
    'You promised to keep me off the block, then put me in danger. I need to know why your word meant so little.',
  use_safety_on_player:
    'You promised to use Safety on me and chose not to. Do not expect me to pretend that did not happen.',
  vote_to_keep:
    'You promised me your vote. Something about tonight does not add up, and I am going to remember it.',
}

function scenarioKey(interaction: IncomingInteraction): string {
  const value = interaction.payload?.scenarioKey
  return typeof value === 'string' ? value : ''
}

/** Determine whether an interaction can create an objectively testable promise. */
export function getCommitmentKindForInteraction(
  interaction: IncomingInteraction
): SocialCommitmentKind | null {
  const scenario = scenarioKey(interaction)
  if (interaction.type === 'nomination_plea' || scenario === 'hoh_safety_request') {
    return 'protect_from_nomination'
  }
  if (interaction.type === 'deal_offer' && scenario === 'nominee_veto_pitch') {
    return 'use_safety_on_player'
  }
  if (interaction.type === 'deal_offer' && scenario === 'live_vote_pitch') {
    return 'vote_to_keep'
  }
  return null
}

export function getSocialCommitmentLabel(kind: SocialCommitmentKind): string {
  return KIND_LABELS[kind]
}

export function getSocialCommitmentDueCopy(kind: SocialCommitmentKind): string {
  return KIND_DUE_COPY[kind]
}

export function createCommitmentFromInteraction({
  interaction,
  responseType,
  promisorId,
  week,
}: {
  interaction: IncomingInteraction
  responseType: IncomingInteractionResponseType
  promisorId: string
  week: number
}): SocialCommitment | null {
  if (responseType !== 'accept' && responseType !== 'positive') return null
  const kind = getCommitmentKindForInteraction(interaction)
  if (!kind) return null
  return {
    id: `commitment-${interaction.id}`,
    interactionId: interaction.id,
    kind,
    promisorId,
    beneficiaryId: interaction.fromId,
    createdWeek: week,
    dueWeek: week,
    status: 'pending',
  }
}

export function getSocialCredibility(commitments: SocialCommitment[]): {
  score: number
  label: 'Unproven' | 'Early read' | 'Questioned' | 'Shaky' | 'Credible' | 'Trusted'
  kept: number
  broken: number
  judged: number
  confidence: number
} {
  // House credibility can only use promises whose outcome other housemates
  // can observe directly. Private eviction votes belong to Public Approval.
  const observableCommitments = commitments.filter((entry) => entry.kind !== 'vote_to_keep')
  const kept = observableCommitments.filter((entry) => entry.status === 'kept').length
  const broken = observableCommitments.filter((entry) => entry.status === 'broken').length
  const judged = kept + broken
  // A Beta(2,2) prior prevents one decision from turning reliability into 0 or 100.
  const score = Math.round(((kept + 2) / (judged + 4)) * 100)
  const confidence = Math.min(1, judged / 5)
  const label =
    judged === 0
      ? 'Unproven'
      : judged === 1
        ? 'Early read'
        : score >= 75
          ? 'Trusted'
          : score >= 55
            ? 'Credible'
            : score >= 40
              ? 'Shaky'
              : 'Questioned'
  return { score, label, kept, broken, judged, confidence }
}

function playerName(state: CommitmentState, playerId: string): string {
  return state.game.players?.find((player) => player.id === playerId)?.name ?? playerId
}

function queueBrokenPromiseReaction(
  store: CommitmentStore,
  state: CommitmentState,
  commitment: SocialCommitment,
  week: number,
  now: number
): void {
  const promisor = state.game.players?.find((player) => player.id === commitment.promisorId)
  const beneficiary = state.game.players?.find((player) => player.id === commitment.beneficiaryId)
  if (
    promisor?.isUser !== true ||
    !beneficiary ||
    beneficiary.status === 'evicted' ||
    beneficiary.status === 'jury'
  ) {
    return
  }

  store.dispatch(
    pushIncomingInteraction({
      id: `broken-promise-reaction-${commitment.id}`,
      fromId: commitment.beneficiaryId,
      type: 'warning',
      text: BROKEN_PROMISE_REACTION_COPY[commitment.kind],
      payload: {
        source: 'broken_promise',
        commitmentId: commitment.id,
        commitmentKind: commitment.kind,
      },
      createdAt: now,
      createdWeek: week,
      expiresAtWeek: week + 1,
      read: false,
      requiresResponse: true,
      resolved: false,
    })
  )
}

function resolvePromise(
  store: CommitmentStore,
  commitment: SocialCommitment,
  kept: boolean,
  reason: string,
  options: { privateVote?: boolean; suppressPublicReaction?: boolean } = {}
): void {
  const state = store.getState()
  const week = state.game.week ?? commitment.dueWeek
  const now = Date.now()
  const outcome = kept ? 'kept' : 'broken'
  const tuning = socialConfig.socialCommitmentConfig

  store.dispatch(
    resolveSocialCommitment({
      commitmentId: commitment.id,
      status: outcome,
      resolvedAt: now,
      resolvedWeek: week,
      resolutionReason: reason,
    })
  )
  if (!options.privateVote) {
    store.dispatch(
      updateRelationship({
        source: commitment.beneficiaryId,
        target: commitment.promisorId,
        delta: tuning.affinityDelta[outcome],
        tags: kept ? undefined : ['broken_promise'],
        actionSource: 'system',
      })
    )
    store.dispatch(
      updateSocialMemory({
        actorId: commitment.beneficiaryId,
        targetId: commitment.promisorId,
        deltas: tuning.memoryDelta[outcome],
        event: {
          type: `${outcome}_promise_${commitment.kind}`,
          actorId: commitment.beneficiaryId,
          targetId: commitment.promisorId,
          week,
          timestamp: now,
        },
      })
    )

    const currentInfluence = state.social.influenceBank?.[commitment.promisorId] ?? 0
    const desiredInfluenceDelta = tuning.influenceDelta[outcome]
    const influenceDelta =
      desiredInfluenceDelta < 0
        ? Math.max(desiredInfluenceDelta, -currentInfluence)
        : desiredInfluenceDelta
    if (influenceDelta !== 0) {
      store.dispatch(
        applyInfluenceDelta({ playerId: commitment.promisorId, delta: influenceDelta })
      )
    }
    if (!kept) queueBrokenPromiseReaction(store, state, commitment, week, now)
  } else if (!options.suppressPublicReaction) {
    store.dispatch(
      updateApproval({
        playerId: commitment.promisorId,
        delta: kept ? 1 : -1,
        reason: kept ? 'vote_promise_kept' : 'vote_promise_broken',
        week,
        addToFeed: true,
      })
    )
  }

  if (!options.privateVote) {
    const beneficiary = playerName(state, commitment.beneficiaryId)
    store.dispatch(
      addTvEvent({
        text: kept
          ? `${beneficiary} saw you keep your word.`
          : `${beneficiary} saw you break your promise and will remember it.`,
        type: 'social',
        source: 'system',
        channels: ['mainLog', 'dr'],
      })
    )
  }
}

function pendingForAction(state: CommitmentState, kind: SocialCommitmentKind): SocialCommitment[] {
  const week = state.game.week ?? 1
  return (state.social.commitments ?? []).filter(
    (entry) => entry.status === 'pending' && entry.kind === kind && entry.dueWeek <= week
  )
}

/** Verify promises immediately after the corresponding player decision succeeds. */
export function evaluateSocialCommitmentsForAction(
  store: CommitmentStore,
  actionType: string,
  payload?: unknown
): void {
  const state = store.getState()
  if (actionType === 'game/finalizeNominations' || actionType === 'game/commitNominees') {
    const nominees = state.game.nomineeIds ?? []
    for (const commitment of pendingForAction(state, 'protect_from_nomination')) {
      const kept = !nominees.includes(commitment.beneficiaryId)
      resolvePromise(
        store,
        commitment,
        kept,
        kept ? 'protected_at_nominations' : 'nominated_after_promise'
      )
    }
    return
  }

  if (actionType === 'game/submitPovDecision') {
    for (const commitment of pendingForAction(state, 'use_safety_on_player')) {
      if (payload === false) {
        resolvePromise(store, commitment, false, 'declined_to_use_safety')
      } else if (!(state.game.nomineeIds ?? []).includes(commitment.beneficiaryId)) {
        resolvePromise(store, commitment, true, 'protected_by_multi_save')
      }
    }
    return
  }

  if (actionType === 'game/submitPovSaveTarget' && typeof payload === 'string') {
    if (state.game.povSavedId !== payload) return
    for (const commitment of pendingForAction(state, 'use_safety_on_player')) {
      const kept = payload === commitment.beneficiaryId
      resolvePromise(store, commitment, kept, kept ? 'saved_with_safety' : 'saved_someone_else')
    }
    return
  }

  if (actionType === 'game/submitHumanVote' && typeof payload === 'string') {
    const votePromises = pendingForAction(state, 'vote_to_keep')
    const conflicting = new Set(votePromises.map((entry) => entry.beneficiaryId)).size > 1
    for (const commitment of votePromises) {
      const kept = payload !== commitment.beneficiaryId
      resolvePromise(store, commitment, kept, kept ? 'voted_to_keep' : 'voted_against_promise', {
        privateVote: true,
        suppressPublicReaction: conflicting,
      })
    }
    if (conflicting && votePromises[0]) {
      store.dispatch(
        updateApproval({
          playerId: votePromises[0].promisorId,
          delta: -3,
          reason: 'conflicting_vote_promises',
          week: state.game.week ?? votePromises[0].dueWeek,
          addToFeed: true,
        })
      )
    }
    return
  }

  if (actionType === 'game/submitHumanDoubleVote' && Array.isArray(payload)) {
    for (const commitment of pendingForAction(state, 'vote_to_keep')) {
      const kept = !payload.includes(commitment.beneficiaryId)
      resolvePromise(
        store,
        commitment,
        kept,
        kept ? 'double_vote_kept_them_safe' : 'double_vote_targeted_them',
        { privateVote: true }
      )
    }
  }
}

/** Void promises whose decision window disappeared because of a twist or skipped phase. */
export function voidOverdueSocialCommitments(store: CommitmentStore): void {
  const state = store.getState()
  const week = state.game.week ?? 1
  for (const commitment of state.social.commitments ?? []) {
    if (commitment.status !== 'pending' || commitment.dueWeek >= week) continue
    store.dispatch(
      resolveSocialCommitment({
        commitmentId: commitment.id,
        status: 'void',
        resolvedWeek: week,
        resolutionReason: 'decision_window_passed',
      })
    )
  }
}
