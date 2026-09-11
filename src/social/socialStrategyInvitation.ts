import type { Player } from '../types'
import { addTvEvent } from '../store/gameSlice'
import { selectIntelFactForActor } from './intelligenceSystem'
import {
  activeStrategyPlayers,
  strategyAffinity,
  strategyHumanPlayer,
  type DayEndPlan,
  type StrategyApi,
  type StrategyState,
} from './socialStrategyShared'

interface SocialInvitation {
  player: Player
  actionId: string
  text: string
}

function hasConcreteWhisperIntel(
  state: StrategyState,
  sourceId: string,
  humanId: string
): boolean {
  return Boolean(
    selectIntelFactForActor(state.social.reality, sourceId, humanId, state.game.week)
  )
}

function chooseInvitation(
  state: StrategyState,
  plan: DayEndPlan,
  humanId: string
): SocialInvitation | null {
  const byId = new Map(activeStrategyPlayers(state).map((player) => [player.id, player]))

  const misinformationListener = plan.misinformationListenerIds
    .map((id) => byId.get(id))
    .find((player): player is Player => Boolean(player))
  if (misinformationListener) {
    return {
      player: misinformationListener,
      actionId: 'reassure',
      text: `${misinformationListener.name} has been keeping their distance tonight. Something has shifted. Better check in before the day ends.`,
    }
  }

  const observer = plan.observerIds
    .map((id) => byId.get(id))
    .find((player): player is Player => Boolean(player))
  if (observer) {
    return {
      player: observer,
      actionId: 'reassure',
      text: `${observer.name} has been watching your game more closely than usual. They are alone in the kitchen now. Better check in before the day ends.`,
    }
  }

  const intelSource = activeStrategyPlayers(state)
    .filter((player) => player.id !== humanId && !player.isUser)
    .filter((player) => strategyAffinity(state, player.id, humanId) >= -20)
    .filter((player) => hasConcreteWhisperIntel(state, player.id, humanId))
    .sort((left, right) => {
      const affinityDelta =
        strategyAffinity(state, right.id, humanId) - strategyAffinity(state, left.id, humanId)
      return affinityDelta || left.id.localeCompare(right.id)
    })[0]

  if (!intelSource) return null
  return {
    player: intelSource,
    actionId: 'whisper',
    text: `${intelSource.name} is lingering in the kitchen after everyone else drifted away. They may know something. Try a private word before the day ends.`,
  }
}

export function queueSocialStrategyInvitation(
  api: StrategyApi,
  state: StrategyState,
  plan: DayEndPlan | null
): void {
  if (!plan || state.game.phase !== 'week_end') return
  const human = strategyHumanPlayer(state)
  if (!human) return

  const alreadyQueued = state.game.tvFeed.some(
    (event) => event.meta?.socialInvitation === true && event.meta?.week === state.game.week
  )
  if (alreadyQueued) return

  const invitation = chooseInvitation(state, plan, human.id)
  if (!invitation) return

  api.dispatch(
    addTvEvent({
      text: invitation.text,
      type: 'social',
      source: 'system',
      channels: ['tv', 'mainLog'],
      meta: {
        forceOnTv: true,
        broadcastLevel: 'minor',
        // Built-in week-end messages start at order 100. Order 50 puts this
        // optional invitation directly before the normal Day End card.
        broadcastOrder: 50,
        socialInvitation: true,
        suggestedActionId: invitation.actionId,
        suggestedTargetId: invitation.player.id,
        week: state.game.week,
      },
    })
  )
}
