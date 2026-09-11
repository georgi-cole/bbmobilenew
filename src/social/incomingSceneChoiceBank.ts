export type ChoiceLabels = readonly [string, string, string, string]

export const SCENE_CHOICES: Record<string, readonly ChoiceLabels[]> = {
  week_start_ally_check_in: [
    ['Share your read', 'Ask what changed', 'Keep your cards close', 'Leave it for later'],
    ['Reassure them', 'Talk through the week', 'Set a little distance', 'Change the subject'],
  ],
  week_start_enemy_gossip: [
    ['Compare notes', 'Hear them out', 'Call it fishing', 'Do not bite'],
    ['Ask who is talking', 'Keep it vague', 'Challenge the angle', 'End the chat'],
  ],
  week_start_alliance_lock: [
    ['Make it official', 'Ask for their plan', 'Keep it informal', 'Play it off'],
    ['Offer a real pact', 'Test the details', 'Say it is too soon', 'Leave it hanging'],
  ],
  hoh_congratulations: [
    ['Thank them warmly', 'Keep it light', 'Question the timing', 'Move on'],
    ['Share the moment', 'Accept the compliment', 'Call it strategy', 'Cut it short'],
  ],
  safety_win_congratulations: [
    ['Thank them genuinely', 'Keep it casual', 'Deflect the praise', 'Get back to the game'],
    ['Celebrate together', 'Nod and listen', 'Ask what they want', 'Change the subject'],
  ],
  player_nominated_support: [
    ['Let them in', 'Ask what they need', 'Keep your guard up', 'End the talk'],
    ['Thank them for checking', 'Talk it through', 'Say you are fine', 'Step away'],
  ],
  player_nominated_tension: [
    ['Ask for honesty', 'Keep it controlled', 'Call out the tension', 'Walk away'],
    ['Try to reset', 'Hear their read', 'Draw a boundary', 'Leave it there'],
  ],
  competition_low_finish_support: [
    ['Accept the support', 'Laugh it off', 'Say you do not need it', 'Move on'],
    ['Be honest about it', 'Keep it breezy', 'Question the concern', 'End the chat'],
  ],
  competition_low_finish_taunt: [
    ['Defuse it', 'Give them nothing', 'Fire back', 'Walk away'],
    ['Laugh without agreeing', 'Hold your composure', 'Name the cheap shot', 'Leave them talking'],
  ],
  social_momentum_notice: [
    ['Compare what they saw', 'Listen carefully', 'Reject the read', 'Keep it private'],
    ['Ask for specifics', 'Play it cool', 'Say they are overreaching', 'End the chat'],
  ],
  hoh_safety_request: [
    [
      'Give them a real opening',
      'Ask what they are offering',
      'Set a clear limit',
      'End the pitch',
    ],
    ['Promise consideration', 'Keep it noncommittal', 'Tell them it is unlikely', 'Send them away'],
  ],
  nominee_hoh_plea: [
    ['Offer safety', 'Ask for their case', 'Explain the risk', 'Close the meeting'],
    ['Give them your word', 'Listen without promising', 'State your reasons', 'End the talk'],
  ],
  nominee_veto_pitch: [
    ['Back their Safety', 'Ask what changes', 'Refuse to commit', 'End the conversation'],
    ['Promise the power', 'Hear their plan', 'Keep your move private', 'Walk away'],
  ],
  nominee_campaign: [
    ['Give them hope', 'Hear the campaign', 'Tell them where you stand', 'Leave it there'],
    ['Ask what they need', 'Keep your options open', 'Say you cannot help', 'End the chat'],
  ],
  nomination_aftershock: [
    ['Acknowledge the hurt', 'Explain carefully', 'Stand by the move', 'End the talk'],
    ['Offer a path back', 'Hear their anger', 'Keep it strategic', 'Walk away'],
  ],
  nominee_understands_loh: [
    ['Explain the decision', 'Hear them out', 'Keep it strictly strategic', 'End the talk'],
    ['Own the move', 'Ask what they need', 'Refuse to apologize', 'Give them space'],
  ],
  nominee_confronts_loh: [
    ['Meet the anger honestly', 'Explain the calculation', 'Push back too', 'Walk away'],
    ['Own the fallout', 'Keep your voice calm', 'Refuse the accusation', 'End the confrontation'],
  ],
  replacement_nominee_reacts_to_loh: [
    ['Explain the backup plan', 'Hear their reaction', 'Stand by the choice', 'End the talk'],
    ['Acknowledge the blow', 'Keep it factual', 'Refuse to justify it', 'Give them space'],
  ],
  post_veto_gratitude: [
    ['Share the relief', 'Accept their thanks', 'Call in the favor', 'Change the subject'],
    ['Celebrate together', 'Say it was nothing', 'Keep score', 'Move on'],
  ],
  post_veto_campaign: [
    ['Hear their new plan', 'Keep it measured', 'Tell them you cannot help', 'End the campaign'],
    ['Offer a little hope', 'Ask what changed', 'Keep your distance', 'Close the talk'],
  ],
  live_vote_pitch: [
    ['Promise your vote', 'Ask for their case', 'Tell them no', 'Avoid an answer'],
    ['Commit to keep them', 'Keep your options open', 'Choose the other side', 'End the pitch'],
  ],
  survivor_gratitude: [
    ['Share the moment', 'Accept the thanks', 'Remind them who helped', 'Move on'],
    ['Strengthen the bond', 'Keep it modest', 'Call in a favor', 'Change the subject'],
  ],
  betrayal_warning: [
    ['Compare notes', 'Ask for proof', 'Question their motive', 'Bury it for now'],
    ['Take it seriously', 'Watch quietly', 'Defend your ally', 'Refuse the drama'],
  ],
  ignored_warning: [
    ['Give them time', 'Ask what they need', 'Set a boundary', 'End the chat'],
    [
      'Acknowledge the distance',
      'Keep it brief',
      'Say they are reading too much in',
      'Leave it there',
    ],
  ],
  targeted_snark: [
    ['Ask what they mean', 'Stay unreadable', 'Call it out', 'Walk away'],
    ['Defuse the jab', 'Keep your cool', 'Push back directly', 'Let it die'],
  ],
  alliance_reassurance: [
    ['Reassure them fully', 'Compare your plans', 'Admit your doubts', 'Avoid the subject'],
    ['Renew the pact', 'Ask what changed', 'Set new terms', 'End the check-in'],
  ],
  generic_gossip: [
    ['Ask for the source', 'Listen only', 'Protect the target', 'Stop the rumour'],
    ['Trade a little intel', 'Ask who else knows', 'Challenge the story', 'Change the subject'],
  ],
  generic_check_in: [
    ['Be honest', 'Ask them back', 'Keep some distance', 'Wrap it up'],
    ['Let them in', 'Keep it light', 'Set a boundary', 'Leave it there'],
  ],
  relationship_friendship_check_in: [
    ['Let them in', 'Ask how they are', 'Keep it friendly', 'Leave it for now'],
  ],
  relationship_alliance_follow_up: [
    ['Work together', 'Ask for time', 'Do not pitch me again', 'End the talk'],
  ],
  relationship_romance_check_in: [
    ['See where this goes', 'Keep it light', 'Keep this platonic', 'Leave it for now'],
  ],
  relationship_confidant_check_in: [
    ['Hear them out', 'Ask for context', 'Do not confide in me', 'Change the subject'],
  ],
  relationship_frustration_follow_up: [
    ['Talk it through', 'Ask for time', 'Do not push this', 'Walk away'],
  ],
  relationship_repair_follow_up: [
    ['Try to repair it', 'Take some space', 'Keep your distance', 'End the talk'],
  ],
}
