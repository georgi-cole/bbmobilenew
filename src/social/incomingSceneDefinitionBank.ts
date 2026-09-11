export interface SceneDefinition {
  topic: string
  stakes: 'quiet' | 'meaningful' | 'high'
  kind: 'bond' | 'intel' | 'pressure' | 'celebration' | 'conflict' | 'strategy'
}

export const SCENE_DEFINITIONS: Record<string, SceneDefinition> = {
  week_start_ally_check_in: {
    topic: 'where the two of you stand this week',
    stakes: 'meaningful',
    kind: 'bond',
  },
  week_start_enemy_gossip: {
    topic: 'the new week’s shifting alliances',
    stakes: 'meaningful',
    kind: 'intel',
  },
  week_start_alliance_lock: { topic: 'a possible alliance', stakes: 'high', kind: 'strategy' },
  hoh_congratulations: { topic: 'your LOH win', stakes: 'quiet', kind: 'celebration' },
  safety_win_congratulations: { topic: 'your Safety win', stakes: 'quiet', kind: 'celebration' },
  player_nominated_support: { topic: 'being on the block', stakes: 'high', kind: 'bond' },
  player_nominated_tension: { topic: 'the nomination fallout', stakes: 'high', kind: 'conflict' },
  competition_low_finish_support: {
    topic: 'the competition result',
    stakes: 'quiet',
    kind: 'bond',
  },
  competition_low_finish_taunt: {
    topic: 'the competition result',
    stakes: 'meaningful',
    kind: 'conflict',
  },
  social_momentum_notice: {
    topic: 'how visible your game has become',
    stakes: 'meaningful',
    kind: 'intel',
  },
  hoh_safety_request: { topic: 'your LOH decision', stakes: 'high', kind: 'strategy' },
  nominee_hoh_plea: { topic: 'keeping them off the block', stakes: 'high', kind: 'pressure' },
  nominee_veto_pitch: { topic: 'using Safety', stakes: 'high', kind: 'pressure' },
  nominee_campaign: { topic: 'their campaign to stay', stakes: 'high', kind: 'pressure' },
  nomination_aftershock: { topic: 'the nomination decision', stakes: 'high', kind: 'conflict' },
  nominee_understands_loh: {
    topic: 'why you nominated them as LOH',
    stakes: 'high',
    kind: 'conflict',
  },
  nominee_confronts_loh: {
    topic: 'the nomination confrontation',
    stakes: 'high',
    kind: 'conflict',
  },
  replacement_nominee_reacts_to_loh: {
    topic: 'the replacement nomination',
    stakes: 'high',
    kind: 'conflict',
  },
  post_veto_gratitude: { topic: 'the Safety decision', stakes: 'meaningful', kind: 'celebration' },
  post_veto_campaign: { topic: 'the new block after Safety', stakes: 'high', kind: 'pressure' },
  live_vote_pitch: { topic: 'the live vote', stakes: 'high', kind: 'pressure' },
  survivor_gratitude: { topic: 'surviving the vote', stakes: 'meaningful', kind: 'celebration' },
  betrayal_warning: { topic: 'a possible betrayal', stakes: 'high', kind: 'intel' },
  ignored_warning: { topic: 'the distance between you', stakes: 'meaningful', kind: 'bond' },
  targeted_snark: { topic: 'their read on your game', stakes: 'meaningful', kind: 'conflict' },
  alliance_reassurance: { topic: 'the state of your alliance', stakes: 'meaningful', kind: 'bond' },
  generic_gossip: { topic: 'a house rumour', stakes: 'meaningful', kind: 'intel' },
  generic_check_in: { topic: 'where things stand', stakes: 'quiet', kind: 'bond' },
  relationship_friendship_check_in: {
    topic: 'the connection that has been building between you',
    stakes: 'meaningful',
    kind: 'bond',
  },
  relationship_alliance_follow_up: {
    topic: 'whether the two of you are actually working together',
    stakes: 'meaningful',
    kind: 'strategy',
  },
  relationship_romance_check_in: {
    topic: 'whether there may be something more between you',
    stakes: 'meaningful',
    kind: 'bond',
  },
  relationship_confidant_check_in: {
    topic: 'whether they can trust you with something personal',
    stakes: 'meaningful',
    kind: 'bond',
  },
  relationship_frustration_follow_up: {
    topic: 'the unresolved tension between you',
    stakes: 'high',
    kind: 'conflict',
  },
  relationship_repair_follow_up: {
    topic: 'repairing what went wrong between you',
    stakes: 'meaningful',
    kind: 'bond',
  },
}

export const FALLBACK_SCENE: SceneDefinition = {
  topic: 'the conversation',
  stakes: 'meaningful',
  kind: 'bond',
}
