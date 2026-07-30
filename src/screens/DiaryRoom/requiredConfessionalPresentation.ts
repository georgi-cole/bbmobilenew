import { calculateRequiredDoubleEvictionSlots } from '../../features/twists/doubleEvictionTieUtils'
import type { ActiveConfessionalDecision } from '../../store/confessionalDecisionSelectors'
import type { GameState } from '../../types'
import { getConfessionalPowerName } from './confessionalDecisionPresentation'
import { isCupidArrowActive } from '../../features/twists/cupidArrow'

export type RequiredConfessionalTone = 'private' | 'strategic' | 'danger' | 'power'

export interface RequiredConfessionalPresentation {
  key: string
  eyebrow: string
  title: string
  prompt: string
  consequence: string
  confirmLabel: string
  confirmation: string
  stepLabel?: string
  tone: RequiredConfessionalTone
  returnCue: string
}

function buildKey(decision: ActiveConfessionalDecision, game: GameState): string {
  return [
    decision.type,
    decision.week,
    decision.phase,
    game.nomineeIds.join(','),
    game.tiedNomineeIds?.join(',') ?? '',
    game.specialVeto?.activeType ?? 'standard',
  ].join(':')
}

export function getRequiredConfessionalPresentation(
  decision: ActiveConfessionalDecision,
  game: GameState
): RequiredConfessionalPresentation {
  const survival = game.mode === 'survival'
  const dayLabel = survival
    ? `SURVIVAL PROTOCOL · DAY ${decision.week}`
    : `PRIVATE CEREMONY · DAY ${decision.week}`
  const powerName = getConfessionalPowerName(game)
  const tiedIds = game.tiedNomineeIds ?? game.nomineeIds
  const key = buildKey(decision, game)

  switch (decision.type) {
    case 'nominations': {
      const required = game.doubleEviction?.weekActive ? 3 : 2
      return {
        key,
        eyebrow: dayLabel,
        title: survival ? 'Nomination Protocol' : 'Nomination Decision',
        prompt: survival
          ? `Select ${required} contestants for elimination consideration.`
          : `As Leader, you must nominate ${required} housemates. Your choices remain private until you return to the house.`,
        consequence: survival
          ? 'The selected contestants will enter the next elimination cycle.'
          : 'Your nominations will be revealed publicly after you leave the Confessional.',
        confirmLabel: 'Confirm nominations',
        confirmation: 'Your nominations are locked.',
        tone: 'strategic',
        returnCue: 'nomination_ceremony',
      }
    }
    case 'eviction_vote':
      return {
        key,
        eyebrow: dayLabel,
        title: isCupidArrowActive(game)
          ? 'Joint Pair Vote'
          : survival
            ? 'Elimination Vote'
            : 'Live Eviction Vote',
        prompt: isCupidArrowActive(game)
          ? 'Choose one nominated pair. You and your partner cast this decision together, and the ballot counts as two votes.'
          : survival
          ? 'Select the contestant you want removed from the current run.'
          : 'Cast your private vote for the nominee whose game you want to end tonight.',
        consequence: 'Once confirmed, this vote cannot be changed.',
        confirmLabel: 'Seal eviction vote',
        confirmation: 'Your eviction vote is sealed.',
        tone: 'danger',
        returnCue: 'live_vote',
      }
    case 'double_vote_offer':
      return {
        key,
        eyebrow: dayLabel,
        title: 'Double Vote Available',
        prompt: 'You have a stored Double Vote. Decide whether to activate it for this eviction.',
        consequence: 'Using it now spends the power and gives you two votes in the next step.',
        confirmLabel: 'Confirm power decision',
        confirmation: 'Your Double Vote decision is recorded.',
        stepLabel: 'Power decision · Step 1 of 2',
        tone: 'power',
        returnCue: 'double_vote',
      }
    case 'double_vote':
      return {
        key,
        eyebrow: dayLabel,
        title: 'Cast Two Eviction Votes',
        prompt: 'Choose both votes. You may place both votes on one nominee or split them.',
        consequence: 'Both votes will be submitted together and cannot be changed afterward.',
        confirmLabel: 'Seal both votes',
        confirmation: 'Both eviction votes are sealed.',
        stepLabel: 'Power decision · Step 2 of 2',
        tone: 'danger',
        returnCue: 'live_vote',
      }
    case 'mission_immunity_offer': {
      const duration = game.secretMission?.reward?.durationDays ?? 1
      return {
        key,
        eyebrow: dayLabel,
        title: 'Secret Immunity',
        prompt: `You hold ${duration}-day secret immunity. Decide whether to activate it now.`,
        consequence:
          'Activating it changes the Safety Ceremony immediately. Saving it keeps the reward available until expiry.',
        confirmLabel: 'Confirm immunity decision',
        confirmation: 'Your immunity decision is recorded.',
        tone: 'power',
        returnCue: 'safety_ceremony',
      }
    }
    case 'pos_decision':
      return {
        key,
        eyebrow: dayLabel,
        title: `${powerName} Decision`,
        prompt: `Decide whether to use ${powerName} during this ceremony.`,
        consequence:
          'If you activate the power, you will continue directly to the required target selections.',
        confirmLabel: 'Confirm power decision',
        confirmation: `${powerName} decision recorded.`,
        stepLabel: 'Safety decision · Step 1',
        tone: 'power',
        returnCue: 'safety_ceremony',
      }
    case 'vip_second_use':
      return {
        key,
        eyebrow: dayLabel,
        title: 'Double Trouble · Second Use',
        prompt: 'Decide whether to activate Double Trouble a second time in this ceremony.',
        consequence:
          'Activating it will require you to save another nominee before the ceremony can continue.',
        confirmLabel: 'Confirm second-use decision',
        confirmation: 'Your second-use decision is recorded.',
        stepLabel: 'Safety decision · Continue',
        tone: 'power',
        returnCue: 'safety_ceremony',
      }
    case 'pos_save_target':
      return {
        key,
        eyebrow: dayLabel,
        title: game.specialVeto?.awaitingVipSecondSaveTarget
          ? 'Choose the Second Save'
          : 'Choose Who to Save',
        prompt: game.specialVeto?.awaitingVipSecondSaveTarget
          ? 'Select the second nominee you want to remove from danger.'
          : `Select the nominee you want to save with ${powerName}.`,
        consequence: 'This player will be removed from the block when the ceremony resumes.',
        confirmLabel: 'Confirm save target',
        confirmation: 'Your save target is locked.',
        stepLabel: 'Safety decision · Target selection',
        tone: 'strategic',
        returnCue: 'safety_save_ceremony',
      }
    case 'replacement_nominee':
      return {
        key,
        eyebrow: dayLabel,
        title: game.specialVeto?.awaitingCoupReplacement1
          ? 'Name the First Replacement'
          : game.specialVeto?.awaitingCoupReplacement2
            ? 'Name the Second Replacement'
            : 'Name a Replacement Nominee',
        prompt: 'Select the eligible housemate who will take the open place on the block.',
        consequence: 'The replacement will be revealed publicly when you return to the house.',
        confirmLabel: 'Confirm replacement',
        confirmation: 'Your replacement nominee is locked.',
        stepLabel: 'Safety decision · Replacement',
        tone: 'danger',
        returnCue: 'replacement_ceremony',
      }
    case 'tie_break': {
      const required = game.doubleEviction?.weekActive
        ? calculateRequiredDoubleEvictionSlots(tiedIds.length, Boolean(game.pendingEviction))
        : 1
      return {
        key,
        eyebrow: dayLabel,
        title: required > 1 ? 'Break the Elimination Tie' : 'Cast the Deciding Vote',
        prompt:
          required > 1
            ? `The vote is tied. Select the ${required} players you want eliminated.`
            : game.awaitingPosTieBreak
              ? 'As the Power of Safety holder, you must break the tie and choose who is eliminated.'
              : 'The house vote is tied. Choose the nominee whose game will end.',
        consequence:
          'Your decision directly determines the elimination result and cannot be changed.',
        confirmLabel: required > 1 ? 'Confirm eliminations' : 'Seal deciding vote',
        confirmation: 'The tie-break decision is sealed.',
        tone: 'danger',
        returnCue: 'eviction_results',
      }
    }
    case 'twin_shock':
      return {
        key,
        eyebrow: dayLabel,
        title: 'Private Story Session',
        prompt: 'The Big Eye has called you in for a private conversation.',
        consequence: 'Respond to the Big Eye to continue the story.',
        confirmLabel: 'Continue',
        confirmation: 'Your answer is recorded.',
        tone: 'private',
        returnCue: 'story_session',
      }
    default:
      return {
        key,
        eyebrow: dayLabel,
        title: 'Private Decision',
        prompt: 'The Big Eye is waiting for your decision.',
        consequence: 'Complete the decision before returning to the game.',
        confirmLabel: 'Confirm decision',
        confirmation: 'Your decision is recorded.',
        tone: 'private',
        returnCue: 'game',
      }
  }
}
