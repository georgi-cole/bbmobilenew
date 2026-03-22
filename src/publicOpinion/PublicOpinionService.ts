import { publicOpinionConfig } from './publicOpinionConfig';

export interface CycleEventInput {
  type:
    | 'hoh_win'
    | 'pov_win'
    | 'nominated'
    | 'evicted_vote'
    | 'survived_block'
    | 'positive_social'
    | 'negative_social'
    | 'betrayal'
    | 'bold_nomination'
    | 'direction_success'
    | 'direction_partial'
    | 'direction_fail'
    | 'direction_counter';
  playerId: string;
  week: number;
}

export interface ApprovalDelta {
  playerId: string;
  delta: number;
  reason: string;
  week: number;
}

function getEventDelta(type: CycleEventInput['type']): { delta: number; reason: string } {
  const { competitionImpact, socialImpact, strategyImpact, directionRewards } = publicOpinionConfig;
  switch (type) {
    case 'hoh_win':
      return { delta: competitionImpact.hohWin, reason: 'Won Head of Household' };
    case 'pov_win':
      return { delta: competitionImpact.povWin, reason: 'Won Power of Veto' };
    case 'nominated':
      return { delta: competitionImpact.nominated, reason: 'Was nominated for eviction' };
    case 'evicted_vote':
      return { delta: competitionImpact.evictionVotedOut, reason: 'Was evicted by the house' };
    case 'survived_block':
      return { delta: 1, reason: 'Survived being on the block' };
    case 'positive_social':
      return { delta: socialImpact.positiveInteraction, reason: 'Had positive social interactions' };
    case 'negative_social':
      return { delta: socialImpact.negativeInteraction, reason: 'Had negative social interactions' };
    case 'betrayal':
      return { delta: socialImpact.betrayal, reason: 'Betrayed an ally' };
    case 'bold_nomination':
      return { delta: strategyImpact.boldNomination, reason: 'Made a bold nomination' };
    case 'direction_success':
      return { delta: directionRewards.success, reason: 'Completed a public direction' };
    case 'direction_partial':
      return { delta: directionRewards.partial, reason: 'Partially completed a public direction' };
    case 'direction_fail':
      return { delta: directionRewards.fail, reason: 'Failed a public direction' };
    case 'direction_counter':
      return { delta: directionRewards.counter, reason: 'Acted against the public direction' };
    default:
      return { delta: 0, reason: 'Unknown event' };
  }
}

export function computeCycleDeltas(events: CycleEventInput[]): ApprovalDelta[] {
  const byPlayer: Record<string, { totalDelta: number; reasons: string[]; week: number }> = {};

  for (const event of events) {
    const { delta, reason } = getEventDelta(event.type);
    if (!byPlayer[event.playerId]) {
      byPlayer[event.playerId] = { totalDelta: 0, reasons: [], week: event.week };
    }
    byPlayer[event.playerId].totalDelta += delta;
    byPlayer[event.playerId].reasons.push(reason);
    byPlayer[event.playerId].week = event.week;
  }

  const { MAX_CYCLE_DELTA } = publicOpinionConfig;
  return Object.entries(byPlayer).map(([playerId, { totalDelta, reasons, week }]) => ({
    playerId,
    delta: Math.max(-MAX_CYCLE_DELTA, Math.min(MAX_CYCLE_DELTA, totalDelta)),
    reason: reasons.join('; '),
    week,
  }));
}
