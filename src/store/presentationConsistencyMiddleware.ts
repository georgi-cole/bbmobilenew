import type { Middleware, MiddlewareAPI } from '@reduxjs/toolkit'
import { expandCupidIds } from '../features/twists/cupidArrow'
import type { GameState, TvEvent } from '../types'
import { consumeBroadcastEvent, updateTvEvent } from './gameSlice'

type PresentationState = {
  game: GameState
}

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

function decorateOutgoingLohBroadcast(api: MiddlewareAPI): void {
  const { game } = api.getState() as PresentationState
  if (game.phase !== 'loh_comp' || !game.prevHohId || game.voxPopuli?.status === 'active') return

  const human = game.players.find((player) => player.isUser)
  if (!human) return

  const outgoingIds = expandCupidIds(game, [game.prevHohId])
  if (!outgoingIds.includes(human.id)) return

  const event = currentTemplateEvent(game, 'loh.competition-start')
  if (!event || /not eligible to compete today/i.test(event.text)) return

  const outgoingNames = outgoingIds
    .map((id) => game.players.find((player) => player.id === id)?.name)
    .filter((name): name is string => Boolean(name))
  const displayNames = outgoingNames.length > 0 ? outgoingNames.join(' & ') : human.name
  const eligibilityCopy =
    outgoingIds.length > 1
      ? `As the outgoing LOH pair, ${displayNames} are not eligible to compete today.`
      : `As outgoing LOH, ${displayNames} is not eligible to compete today.`

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

/**
 * Presentation-only repairs for state that can resolve while GameScreen is unmounted
 * (most notably Confessional decisions). Gameplay reducers remain authoritative.
 */
export const presentationConsistencyMiddleware: Middleware = (api) => (next) => (action) => {
  const before = api.getState() as PresentationState
  const replacementWasPending = before.game.replacementNeeded === true

  const result = next(action)

  const after = api.getState() as PresentationState
  if (replacementWasPending && after.game.replacementNeeded !== true) {
    consumeResolvedReplacementPrompt(api)
  }

  decorateOutgoingLohBroadcast(api)
  return result
}
