import type { Middleware, MiddlewareAPI } from '@reduxjs/toolkit'
import { expandCupidIds } from '../features/twists/cupidArrow'
import type { GameState, TvEvent } from '../types'
import { consumeBroadcastEvent, updateTvEvent } from './gameSlice'

type PresentationState = {
  game: GameState
}

type GenericAction = {
  type?: string
}

type AddTvEventAction = GenericAction & {
  payload?: Partial<TvEvent>
}

const VOX_IMMUNITY_COMPETITION_COPY =
  'The Immunity Competition has begun! 🛡️ Who will secure safety today?'
const AUTHORIZE_VOX_AUDIENCE_VOTE_ACTION = 'presentation/authorizeVoxAudienceVoteResolution'
const COMMIT_VOX_AUDIENCE_VOTE_ACTION = 'game/commitVoxAudienceVote'

let deferredBackdoorAdvance = false
let voxAudienceVoteResolutionAuthorized = false

function currentTemplateEvent(
  game: GameState,
  templateId: string,
  options: { includeConsumed?: boolean } = {}
): TvEvent | undefined {
  return [...game.tvFeed].reverse().find((event) => {
    const eventWeek = event.meta?.week
    return (
      event.meta?.broadcastTemplateId === templateId &&
      (eventWeek == null || eventWeek === game.week) &&
      (options.includeConsumed === true || event.meta?.broadcastConsumed !== true)
    )
  })
}

function outgoingLohEligibilityCopy(game: GameState): string | null {
  if (!game.prevHohId || game.voxPopuli?.status === 'active') return null

  const human = game.players.find((player) => player.isUser)
  if (!human) return null

  const outgoingIds = expandCupidIds(game, [game.prevHohId])
  if (!outgoingIds.includes(human.id)) return null

  const outgoingNames = outgoingIds
    .map((id) => game.players.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  const displayNames = outgoingNames.length > 0 ? outgoingNames.join(' & ') : human.name

  if (outgoingIds.length > 1) {
    return `As the outgoing LOH pair, ${displayNames} are sitting this competition out.`
  }

  const verb = displayNames.trim().toLowerCase() === 'you' ? 'are' : 'is'
  return `As outgoing LOH, ${displayNames} ${verb} sitting this competition out.`
}

function decorateOutgoingLohBroadcast(api: MiddlewareAPI): void {
  const { game } = api.getState() as PresentationState
  const eligibilityCopy = outgoingLohEligibilityCopy(game)
  if (!eligibilityCopy) return

  if (game.phase === 'loh_comp_announcement') {
    const card = currentTemplateEvent(game, 'card.loh')
    if (card && !/outgoing LOH/i.test(card.text)) {
      api.dispatch(
        updateTvEvent({
          id: card.id,
          text: `${eligibilityCopy} Control is up for winning — who takes power next?`,
          type: card.type,
        })
      )
    }
    return
  }

  if (game.phase !== 'loh_comp') return
  const event = currentTemplateEvent(game, 'loh.competition-start')
  if (!event || /outgoing LOH/i.test(event.text)) return

  api.dispatch(
    updateTvEvent({
      id: event.id,
      text: `${event.text.trim()} ${eligibilityCopy}`,
      type: event.type,
    })
  )
}

function correctVoxCompetitionBroadcast(api: MiddlewareAPI): void {
  const { game } = api.getState() as PresentationState
  if (game.voxPopuli?.status !== 'active' || game.phase !== 'loh_comp') return

  const templated = currentTemplateEvent(game, 'loh.competition-start')
  const fallback = [...game.tvFeed].reverse().find((event) => {
    const eventWeek = event.meta?.week
    return (
      (eventWeek == null || eventWeek === game.week) &&
      event.meta?.broadcastConsumed !== true &&
      /leader of the (?:house|hub).*competition|power is up for grabs/i.test(event.text)
    )
  })
  const event = templated ?? fallback
  if (!event) return

  // The generic competition-start template is also used by Classic. In Vox,
  // this phase awards immunity rather than house leadership. Rewrite only copy
  // that still carries LOH/power language so a neutral/custom Vox-safe override
  // remains untouched.
  const stillUsesLohLanguage =
    /leader of the (?:house|hub)|\bLOH\b|power is up for grabs/i.test(event.text)
  if (!stillUsesLohLanguage || event.text === VOX_IMMUNITY_COMPETITION_COPY) return

  api.dispatch(
    updateTvEvent({
      id: event.id,
      text: VOX_IMMUNITY_COMPETITION_COPY,
      type: event.type,
    })
  )
}

function consumeResolvedReplacementPrompt(api: MiddlewareAPI): void {
  const { game } = api.getState() as PresentationState
  const stalePrompt = currentTemplateEvent(game, 'safety.replacement-needed')
  if (stalePrompt) api.dispatch(consumeBroadcastEvent(stalePrompt.id))
}

function consumePreviousDayBroadcasts(
  api: MiddlewareAPI,
  before: GameState,
  after: GameState
): void {
  if (after.week <= before.week) return

  // Anything that was still waiting at the instant the previous day ended is
  // historical context now. Keep it in the log, but never allow it to surface
  // as the new day's Faux TV "Now" item.
  for (const event of before.tvFeed) {
    if (event.meta?.broadcastConsumed !== true) {
      api.dispatch(consumeBroadcastEvent(event.id))
    }
  }
}

function shouldDeferBackdoorAdvance(state: GameState, action: unknown): boolean {
  const type = (action as GenericAction | null)?.type
  return Boolean(
    type === 'game/advance' &&
    state.phase === 'pos_ceremony_results' &&
    state.lohNominationPlan?.revealPending === true &&
    state.lohNominationPlan.revealed !== true
  )
}

function isPendingVoxEvictionAudienceVote(state: GameState): boolean {
  return Boolean(
    state.voxPopuli?.status === 'active' &&
      state.voxPopuli.awaitingPublicVote === true &&
      state.voxPopuli.publicVoteContext === 'eviction'
  )
}

function authorizeOrBlockLegacyVoxAutoResolution(state: GameState, action: unknown): boolean {
  const type = (action as GenericAction | null)?.type
  if (type === AUTHORIZE_VOX_AUDIENCE_VOTE_ACTION) {
    voxAudienceVoteResolutionAuthorized = true
    return false
  }

  if (type !== COMMIT_VOX_AUDIENCE_VOTE_ACTION || !isPendingVoxEvictionAudienceVote(state)) {
    return false
  }

  if (!voxAudienceVoteResolutionAuthorized) {
    // GameScreen historically scheduled this same commit after five seconds.
    // Ignore that un-authorized path so the vote cannot start itself. The
    // central Play button explicitly authorizes the next commit immediately
    // before emitting ui:playPressed.
    return true
  }

  voxAudienceVoteResolutionAuthorized = false
  return false
}

function normalizeImportantBroadcastAction(state: GameState, action: unknown): unknown {
  const typedAction = action as AddTvEventAction | null
  if (typedAction?.type !== 'game/addTvEvent' || !typedAction.payload) return action

  const meta = typedAction.payload.meta
  const isVoxNominationReveal = meta?.major === 'vox_nomination_reveal_unlocked'
  const explicitlyForcedToTv = meta?.forceOnTv === true
  if (!isVoxNominationReveal && !explicitlyForcedToTv) return action

  // Force-to-TV is an authoring contract: these events are supposed to win a
  // real Faux-TV slot. TvZone deliberately scopes foreground content to the
  // current day/phase so stale broadcasts cannot leak across transitions. A
  // handful of runtime producers (including social/intel/mission prompts) set
  // forceOnTv but historically omitted that scope, leaving them vulnerable to
  // being overtaken by the next feed item. Fill only missing scope here and
  // preserve any producer-authored phase/week values.
  //
  // The Vox secret-ballot unlock predates forceOnTv entirely, so promote that
  // one known gameplay-critical prompt into the same contract as well.
  return {
    ...typedAction,
    payload: {
      ...typedAction.payload,
      meta: {
        ...meta,
        phase: meta?.phase ?? state.phase,
        week: meta?.week ?? state.week,
        forceOnTv: true,
      },
    },
  }
}

function deferBackdoorAdvance(api: MiddlewareAPI, action: unknown): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  if (deferredBackdoorAdvance) return true

  deferredBackdoorAdvance = true
  let observer: MutationObserver | null = null
  let mountCheckTimer: number | null = null

  const resume = () => {
    if (!deferredBackdoorAdvance) return
    if (document.querySelector('.ceremony-overlay')) return

    deferredBackdoorAdvance = false
    observer?.disconnect()
    observer = null
    if (mountCheckTimer !== null) window.clearTimeout(mountCheckTimer)
    mountCheckTimer = null
    window.requestAnimationFrame(() => api.dispatch(action as { type: string }))
  }

  const watchForCompletion = () => {
    const overlay = document.querySelector('.ceremony-overlay')
    if (!overlay) {
      // Give React one more paint to mount the store-driven replacement
      // spotlight before deciding there is no visual ceremony to wait for.
      mountCheckTimer = window.setTimeout(resume, 50)
      return
    }

    observer = new MutationObserver(resume)
    observer.observe(document.body, { childList: true, subtree: true })
  }

  window.requestAnimationFrame(watchForCompletion)
  return true
}

/**
 * Presentation-only repairs for state that can resolve while GameScreen is unmounted
 * (most notably Confessional decisions). Gameplay reducers remain authoritative.
 */
export const presentationConsistencyMiddleware: Middleware = (api) => (next) => (action) => {
  const before = api.getState() as PresentationState

  // A successful backdoor reveal belongs immediately after the replacement
  // nominee spotlight, never underneath it. Queue the Play/advance until that
  // ceremony layer has unmounted, then resume the exact same action.
  if (shouldDeferBackdoorAdvance(before.game, action) && deferBackdoorAdvance(api, action)) {
    return action
  }

  // A normal Vox audience vote is an explicit ceremony step. The old
  // GameScreen timer and the Play path dispatch the same commit action, so use
  // a one-shot authorization from the central Play button to reject only the
  // timer-driven commit while preserving the existing vote calculation.
  if (authorizeOrBlockLegacyVoxAutoResolution(before.game, action)) {
    return action
  }

  const replacementWasPending = before.game.replacementNeeded === true
  const actionForNext = normalizeImportantBroadcastAction(before.game, action)
  const result = next(actionForNext)

  const after = api.getState() as PresentationState
  consumePreviousDayBroadcasts(api, before.game, after.game)

  if (!isPendingVoxEvictionAudienceVote(after.game)) {
    voxAudienceVoteResolutionAuthorized = false
  }

  if (replacementWasPending && after.game.replacementNeeded !== true) {
    consumeResolvedReplacementPrompt(api)
  }

  decorateOutgoingLohBroadcast(api)
  correctVoxCompetitionBroadcast(api)
  return result
}
