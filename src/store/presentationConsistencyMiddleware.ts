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

let deferredBackdoorAdvance = false

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

  return outgoingIds.length > 1
    ? `As the outgoing LOH pair, ${displayNames} are sitting this competition out.`
    : `As outgoing LOH, ${displayNames} is sitting this competition out.`
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

  const replacementWasPending = before.game.replacementNeeded === true
  const result = next(action)

  const after = api.getState() as PresentationState
  consumePreviousDayBroadcasts(api, before.game, after.game)

  if (replacementWasPending && after.game.replacementNeeded !== true) {
    consumeResolvedReplacementPrompt(api)
  }

  decorateOutgoingLohBroadcast(api)
  return result
}
