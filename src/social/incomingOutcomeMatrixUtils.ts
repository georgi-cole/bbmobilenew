export interface IncomingOutcomeContext {
  fromName: string
  subjectName?: string
  phase: string
  senderIsNominated: boolean
}

export type OutcomeWriter = (context: IncomingOutcomeContext) => string
export type ScenarioOutcomeMatrix = Record<string, Record<string, OutcomeWriter>>

export const says =
  (text: string): OutcomeWriter =>
  ({ fromName }) =>
    `${fromName} says ${text}`

export const acts =
  (text: string): OutcomeWriter =>
  ({ fromName }) =>
    `${fromName} ${text}`

export function subject(context: IncomingOutcomeContext): string {
  return context.subjectName ?? 'that player'
}

export function currentPressure(context: IncomingOutcomeContext): string {
  const { fromName, phase, senderIsNominated } = context
  if (
    senderIsNominated &&
    ['pos_comp', 'pos_results', 'pos_ceremony', 'pos_ceremony_results'].includes(phase)
  ) {
    return `${fromName} says they are worried they are being kept as the pawn.`
  }
  if (senderIsNominated && ['social_2', 'live_vote'].includes(phase)) {
    return `${fromName} says they feel the house is against them.`
  }
  if (['week_start', 'loh_comp', 'loh_results', 'social_1', 'nominations'].includes(phase)) {
    return `${fromName} says they are worried about the upcoming nominations.`
  }
  if (
    [
      'nomination_results',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
      'pos_ceremony_results',
    ].includes(phase)
  ) {
    return `${fromName} says they are worried the Safety move could make them the replacement pawn.`
  }
  if (['social_2', 'live_vote', 'eviction'].includes(phase)) {
    return `${fromName} says they are uneasy about where the vote is settling.`
  }
  return `${fromName} says they are watching who they can still trust.`
}

export function reciprocalCheckInPressure(context: IncomingOutcomeContext): string {
  const { fromName, phase, senderIsNominated } = context
  if (senderIsNominated && ['social_2', 'live_vote'].includes(phase)) {
    return `${fromName} says the vote is making them question who is really with them.`
  }
  if (['week_start', 'loh_comp', 'loh_results', 'social_1', 'nominations'].includes(phase)) {
    return `${fromName} says nominations are the main thing on their mind right now.`
  }
  if (
    [
      'nomination_results',
      'pos_comp',
      'pos_results',
      'pos_ceremony',
      'pos_ceremony_results',
    ].includes(phase)
  ) {
    return `${fromName} says the Safety decision is what worries them most right now.`
  }
  if (['social_2', 'live_vote', 'eviction'].includes(phase)) {
    return `${fromName} says they are trying to work out where the votes actually are.`
  }
  return `${fromName} says they are still working out who feels solid this week.`
}
