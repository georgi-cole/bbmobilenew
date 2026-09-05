/**
 * Authored fallout for the incoming-social scene bank.
 *
 * The variant bank owns how an interaction starts; this bank owns what the
 * chosen reply means afterward. Keeping them as data makes it straightforward
 * to add new scenes without falling back to generic "they read you differently"
 * narration.
 */

export type IncomingSceneOutcomeStance = 'positive' | 'neutral' | 'negative' | 'dismiss'

type OutcomeSet = Record<IncomingSceneOutcomeStance, readonly string[]>

export const INCOMING_SCENE_OUTCOME_BANK: Record<string, OutcomeSet> = {
  week_start_ally_check_in: {
    positive: [
      '{from} starts the week treating you as someone they can check in with before the house turns.',
      '{from} leaves the reset feeling that the two of you are still moving in the same direction.',
    ],
    neutral: [
      '{from} heard enough to stop guessing, but not enough to call the week settled.',
      '{from} files your answer as cautious and waits to see who you spend time with next.',
    ],
    negative: [
      '{from} stops assuming the old connection carries into this week and widens their options.',
      '{from} hears the distance in your answer and starts the week looking for a steadier partner.',
    ],
    dismiss: [
      '{from} is left to begin the week without a read on you, which makes a small doubt grow.',
      '{from} takes the brush-off as a sign not to build their week around you.',
    ],
  },
  week_start_enemy_gossip: {
    positive: [
      '{from} now sees you as a useful sounding board for the shifting house map.',
      '{from} shares a little more of what they have noticed, but keeps the source protected.',
    ],
    neutral: [
      '{from} cannot tell whether you believe the rumour, so they hold back the names behind it.',
      '{from} leaves knowing you listened, but not whether you will act on the information.',
    ],
    negative: [
      '{from} reads your pushback as protection for someone and becomes more selective with intel.',
      '{from} decides the lead is too risky to keep discussing with you.',
    ],
    dismiss: [
      '{from} takes the silence as a dead end and lets the next piece of gossip travel elsewhere.',
      '{from} leaves you out of the loop rather than chase a conversation you did not want.',
    ],
  },
  week_start_alliance_lock: {
    positive: [
      '{from} treats the agreement as a real working arrangement and starts weighing their choices with you in mind.',
      '{from} leaves with a concrete reason to protect the connection when names begin circulating.',
    ],
    neutral: [
      '{from} keeps the possibility alive, but does not change their wider game for it yet.',
      '{from} sees a potential alliance, not a commitment, and continues testing other paths.',
    ],
    negative: [
      '{from} accepts that the partnership is not happening and redirects the pitch elsewhere.',
      '{from} reads the hesitation as a strategic no and stops exposing their plan to you.',
    ],
    dismiss: [
      '{from} leaves the pact unformed and assumes they cannot count on you when the first decision arrives.',
      '{from} turns the unanswered offer into a reason to keep you outside their core plans.',
    ],
  },
  hoh_congratulations: {
    positive: [
      '{from} feels included in your LOH moment and is more likely to approach you openly while you hold power.',
      '{from} reads the warmth as permission to keep a line of communication open through nominations.',
    ],
    neutral: [
      '{from} congratulates you without assuming it buys them access to your LOH plans.',
      '{from} takes the polite answer at face value and watches where your real attention goes.',
    ],
    negative: [
      '{from} notices the chill and starts treating your LOH week as a potential problem, not an opportunity.',
      '{from} leaves the exchange wondering whether the win has changed how you see them.',
    ],
    dismiss: [
      '{from} feels shut out of your win and becomes less willing to give you the benefit of the doubt this week.',
      '{from} stops trying to turn the congratulations into a bridge toward your LOH room.',
    ],
  },
  safety_win_congratulations: {
    positive: [
      '{from} feels you shared the Safety moment with them rather than merely accepted praise.',
      '{from} reads your response as warmth, not a transaction, and carries that into the ceremony.',
    ],
    neutral: [
      '{from} understands that Safety is yours to manage and does not mistake courtesy for a promise.',
      '{from} leaves the celebration knowing you kept the decision separate from the compliment.',
    ],
    negative: [
      '{from} starts wondering whether the Safety win changed the balance between you.',
      '{from} takes the deflection as a cue that there may be an ask behind the praise after all.',
    ],
    dismiss: [
      '{from} is left outside the moment and becomes more guarded about what they say before the ceremony.',
      '{from} lets the compliment die and stops looking for warmth around your Safety decision.',
    ],
  },
  player_nominated_support: {
    positive: [
      '{from} feels trusted with the vulnerable part of your week and quietly becomes a more reliable check-in.',
      '{from} leaves knowing how to support you without making your situation more visible to the house.',
    ],
    neutral: [
      '{from} understands you are under pressure, but does not know what help you would actually accept.',
      '{from} gives you space while keeping an eye on whether your position gets worse.',
    ],
    negative: [
      '{from} backs away from the block drama and assumes you would rather handle it alone.',
      '{from} hears the boundary and stops offering themselves as a confidant this round.',
    ],
    dismiss: [
      '{from} leaves without knowing whether you needed support, and the chance to build trust on a hard day passes.',
      '{from} takes the exit as a sign to avoid being seen near your campaign.',
    ],
  },
  player_nominated_tension: {
    positive: [
      '{from} sees that you are willing to face the tension before it becomes public house material.',
      '{from} lowers the temperature for now, even if the nomination still changes how they see the week.',
    ],
    neutral: [
      '{from} gets a controlled answer but keeps their own theory about the nomination alive.',
      '{from} leaves the exchange calmer, not convinced.',
    ],
    negative: [
      '{from} now has a sharper version of the grievance and may take it to people who will validate it.',
      '{from} reads the pushback as confirmation that the tension was real.',
    ],
    dismiss: [
      '{from} is left to fill in the silence themselves, which makes the fallout easier to personalise.',
      '{from} leaves the room still angry and with no reason to keep the disagreement private.',
    ],
  },
  competition_low_finish_support: {
    positive: [
      '{from} feels trusted with your disappointment and keeps the moment between the two of you.',
      '{from} sees resilience rather than embarrassment, which makes them more willing to encourage you later.',
    ],
    neutral: [
      '{from} lets the result rest, but notices you did not want to dwell on it.',
      '{from} takes the light answer as a cue not to press the subject.',
    ],
    negative: [
      '{from} stops offering comfort and wonders whether you read their concern as strategy.',
      '{from} gives you room, but the small rejection makes future support less automatic.',
    ],
    dismiss: [
      '{from} lets the topic go and does not risk being seen as someone checking on you.',
      '{from} reads the exit as a preference for privacy, not an invitation to follow up.',
    ],
  },
  competition_low_finish_taunt: {
    positive: [
      '{from} does not get the reaction they wanted, and the taunt loses most of its value.',
      '{from} sees you refuse to turn one bad finish into a larger house moment.',
    ],
    neutral: [
      '{from} cannot tell whether the jab landed, so they keep watching instead of escalating immediately.',
      '{from} leaves with no clean opening to claim they rattled you.',
    ],
    negative: [
      '{from} gets the confrontation they invited and now knows the rivalry is active.',
      '{from} walks away with a sharper story about the two of you that can travel through the house.',
    ],
    dismiss: [
      '{from} is left talking to themself, but may reframe your exit as a win if others were watching.',
      '{from} loses the immediate fight and looks for a different moment to needle you.',
    ],
  },
  social_momentum_notice: {
    positive: [
      '{from} sees you as someone who will discuss the way the house is reading your game, not just deny it.',
      '{from} leaves with a more useful picture of your visibility and who might be reacting to it.',
    ],
    neutral: [
      '{from} knows you heard the warning, but cannot tell whether you will adjust your social game.',
      '{from} keeps watching your conversations to see if the read was right.',
    ],
    negative: [
      '{from} concludes you do not want feedback and stops offering the softer version of the warning.',
      '{from} becomes more suspicious of why you rejected the read so quickly.',
    ],
    dismiss: [
      '{from} keeps the observation to themself and lets the house form its own read of you.',
      '{from} treats the silence as a reason not to warn you before the next shift.',
    ],
  },
  hoh_safety_request: {
    positive: [
      '{from} leaves believing there is a path to shape the LOH/Safety decision with you, even if nothing is locked.',
      '{from} begins preparing for the version of the ceremony you made sound possible.',
    ],
    neutral: [
      '{from} understands that the door is not closed, but keeps another plan ready for the ceremony.',
      '{from} gets enough to keep lobbying, not enough to relax.',
    ],
    negative: [
      '{from} stops building around your decision and starts protecting themself from the outcome instead.',
      '{from} treats your answer as a warning that the ceremony will not go their way.',
    ],
    dismiss: [
      '{from} loses time they needed before the ceremony and has to work a different route fast.',
      '{from} leaves without leverage and assumes your decision is already made.',
    ],
  },
  nominee_hoh_plea: {
    positive: [
      '{from} leaves the LOH conversation with hope and will judge your word against the nomination board.',
      '{from} starts campaigning from a position of possibility rather than panic.',
    ],
    neutral: [
      '{from} has a clearer sense of your calculation, but no protection they can rely on.',
      '{from} keeps working the house because your answer did not change the risk enough.',
    ],
    negative: [
      '{from} understands they are not in your plan and shifts their campaign away from you.',
      '{from} leaves knowing the nomination risk is real and begins looking for votes instead of favours.',
    ],
    dismiss: [
      '{from} gets no hearing before a high-stakes decision and will remember who did not make time.',
      '{from} has to campaign blind rather than build around any assurance from you.',
    ],
  },
  nominee_veto_pitch: {
    positive: [
      '{from} treats your answer as a possible Safety lifeline and starts planning for the replacement fallout too.',
      '{from} feels heard in the one conversation that can immediately change their week.',
    ],
    neutral: [
      '{from} knows Safety is still possible, but cannot afford to stop working other people.',
      '{from} leaves with a conditional opening rather than the reassurance they came for.',
    ],
    negative: [
      '{from} stops counting on your Safety and focuses on surviving the block as it stands.',
      '{from} hears that your decision is not theirs to influence and redirects the campaign.',
    ],
    dismiss: [
      '{from} loses a crucial chance to make their case before Safety is used or declined.',
      '{from} has to read the ceremony without any signal from you.',
    ],
  },
  nominee_campaign: {
    positive: [
      '{from} leaves with a reason to keep campaigning and a better sense of what you need to see.',
      '{from} feels the door is open enough to come back with a stronger case.',
    ],
    neutral: [
      '{from} gets your temperature but not your vote, so the campaign continues elsewhere.',
      '{from} knows not to mistake a polite hearing for a number in their column.',
    ],
    negative: [
      '{from} takes the answer as a lost vote and spends their remaining time on softer targets.',
      '{from} stops selling you the same case and starts preparing for the other outcome.',
    ],
    dismiss: [
      '{from} leaves with less time to campaign and a new reason to question your social bond.',
      '{from} cannot tell whether you are avoiding the vote or simply already decided.',
    ],
  },
  nomination_aftershock: {
    positive: [
      '{from} does not like the nomination, but believes you saw the human cost of the move.',
      '{from} pauses before turning the fallout into a permanent grudge.',
    ],
    neutral: [
      '{from} understands your explanation without agreeing that it justified the nomination.',
      '{from} leaves with the facts, but still feels the personal sting of the decision.',
    ],
    negative: [
      '{from} takes the answer as you choosing strategy over the relationship and adjusts accordingly.',
      '{from} now has a clearer reason to keep distance after the nomination.',
    ],
    dismiss: [
      '{from} gets no closure after the nomination and is more likely to supply their own motive for it.',
      '{from} leaves the aftermath unresolved, which makes the hurt easier to carry into the vote.',
    ],
  },
  nominee_understands_loh: {
    positive: [
      '{from} accepts that your LOH decision had a game reason, even if they do not enjoy being part of it.',
      '{from} sees a route back to working with you after the block if your actions match the explanation.',
    ],
    neutral: [
      '{from} hears the strategic case but keeps emotional distance while they are nominated.',
      '{from} leaves with an explanation they can repeat, not necessarily one they believe.',
    ],
    negative: [
      '{from} concludes that your LOH move matters more to you than repairing the connection.',
      '{from} stops looking for empathy in the decision and starts playing strictly for survival.',
    ],
    dismiss: [
      '{from} is left without a reason for the nomination and becomes easier for others to pull into opposition.',
      '{from} walks away with the nomination still feeling personal because you would not discuss it.',
    ],
  },
  nominee_confronts_loh: {
    positive: [
      '{from} hears enough ownership to stop the confrontation from becoming a house-wide fight.',
      '{from} remains upset, but recognises you did not hide from the consequences of the LOH move.',
    ],
    neutral: [
      '{from} gets an explanation and keeps the argument contained for now.',
      '{from} leaves calmer on the surface while deciding whether the reasoning holds up.',
    ],
    negative: [
      '{from} now sees the nomination conflict as open and has little reason to shield you from it.',
      '{from} leaves with a sharper grievance and a stronger reason to rally support against you.',
    ],
    dismiss: [
      '{from} is left confronting the LOH move alone, which gives the anger more room to grow.',
      '{from} leaves the room without closure and may look for an audience that will take their side.',
    ],
  },
  replacement_nominee_reacts_to_loh: {
    positive: [
      '{from} understands the replacement logic, even though the sudden block still hurts.',
      '{from} sees that you are willing to own the backup plan rather than pretend it was nothing.',
    ],
    neutral: [
      '{from} gets the practical explanation but remains unsettled by how quickly the board changed.',
      '{from} leaves knowing why it happened, not feeling safe with you afterward.',
    ],
    negative: [
      '{from} reads the replacement as a line you are comfortable crossing and changes their read of you.',
      '{from} stops expecting a personal repair while they are dealing with the block.',
    ],
    dismiss: [
      '{from} absorbs the replacement nomination without a conversation and assumes the relationship was expendable.',
      '{from} leaves to campaign with the shock still fresh and no reason from you to soften it.',
    ],
  },
  post_veto_gratitude: {
    positive: [
      '{from} treats the Safety outcome as a shared moment and becomes more willing to protect the connection later.',
      '{from} feels the relief did not make you transactional, which strengthens the goodwill from the save.',
    ],
    neutral: [
      '{from} understands that appreciation does not automatically become a debt or an alliance.',
      '{from} leaves the exchange grateful but unsure how much the Safety outcome changed the bond.',
    ],
    negative: [
      '{from} starts wondering whether the Safety outcome created a debt you expect them to repay.',
      '{from} feels the moment narrow into strategy and becomes more careful about owing you anything.',
    ],
    dismiss: [
      '{from} does not get to share the relief and may decide the Safety outcome was purely transactional.',
      '{from} leaves the gratitude unsaid, which keeps the new goodwill from becoming a real connection.',
    ],
  },
  post_veto_campaign: {
    positive: [
      '{from} leaves with a revised campaign plan and a reason to believe you will hear it out.',
      '{from} understands how Safety changed the block and starts working from the new reality.',
    ],
    neutral: [
      '{from} knows the block shifted, but not whether you will be part of the solution.',
      '{from} keeps the new pitch alive without counting you as support yet.',
    ],
    negative: [
      '{from} stops expecting help after the Safety shake-up and adjusts their campaign around that.',
      '{from} takes the response as proof that the new block left them with fewer routes than they hoped.',
    ],
    dismiss: [
      '{from} loses time after the Safety change and has to rebuild the campaign without your read.',
      '{from} leaves the new block unresolved and turns to people who will give them an answer.',
    ],
  },
  live_vote_pitch: {
    positive: [
      '{from} leaves believing your vote is reachable and spends their final push reinforcing that case.',
      '{from} now knows which concern they need to answer before the live vote.',
    ],
    neutral: [
      '{from} gets a hearing but cannot put your vote on the board yet.',
      '{from} keeps campaigning because your careful answer did not move the count far enough.',
    ],
    negative: [
      '{from} marks your vote as unavailable and changes where they spend their last conversations.',
      '{from} stops trying to persuade you and begins protecting the relationships they may need after the vote.',
    ],
    dismiss: [
      '{from} leaves without a count from you and has to make the vote read with less certainty.',
      '{from} takes the avoided answer as a signal that you do not want to be tied to the outcome yet.',
    ],
  },
  survivor_gratitude: {
    positive: [
      '{from} treats surviving the vote as a moment the two of you can build on rather than merely celebrate.',
      '{from} leaves more inclined to repay the social support that carried through the vote.',
    ],
    neutral: [
      '{from} accepts the moment without assuming the survival story creates a lasting deal.',
      '{from} is grateful, but waits to see whether the connection survives the next power shift.',
    ],
    negative: [
      '{from} feels the celebration comes with strings and becomes cautious about what they owe you.',
      '{from} takes the response as a reminder that surviving did not erase the strategic distance.',
    ],
    dismiss: [
      '{from} has no chance to share the relief and the vote result remains emotionally unresolved between you.',
      '{from} lets the gratitude pass rather than risk being seen as indebted to you.',
    ],
  },
  betrayal_warning: {
    positive: [
      '{from} feels the warning landed and is more likely to bring you evidence before acting alone.',
      '{from} leaves knowing you will at least investigate the possible betrayal instead of dismissing it.',
    ],
    neutral: [
      '{from} sees that you heard the warning, but cannot tell whether you trust the source enough to act.',
      '{from} keeps watching the suspected betrayal while waiting for you to show your hand.',
    ],
    negative: [
      '{from} wonders whether you are protecting the person they warned you about and becomes guarded.',
      '{from} stops sharing the softer version of the warning and waits for the situation to expose itself.',
    ],
    dismiss: [
      '{from} takes the silence as a reason to keep future warnings away from you.',
      '{from} leaves the betrayal thread alone, even if it later becomes a problem you could have seen coming.',
    ],
  },
  ignored_warning: {
    positive: [
      '{from} feels you recognised the distance and is willing to give the connection another chance.',
      '{from} takes the acknowledgment as a first repair rather than a complete fix.',
    ],
    neutral: [
      '{from} sees that you noticed the change, but still waits for proof that you care enough to address it.',
      '{from} keeps the distance measured rather than turning it into an open split.',
    ],
    negative: [
      '{from} accepts that the distance is intentional and stops reaching for the old bond.',
      '{from} starts to treat the relationship as a liability instead of a place to look for support.',
    ],
    dismiss: [
      '{from} reads the lack of response as confirmation that the connection has cooled.',
      '{from} leaves the issue unresolved and may be easier for someone else to pull away from you.',
    ],
  },
  targeted_snark: {
    positive: [
      '{from} cannot turn the jab into a larger scene and loses some control of the exchange.',
      '{from} sees you refuse to give the comment more power than it deserved.',
    ],
    neutral: [
      '{from} gets no clean reaction to use and has to keep guessing whether the dig landed.',
      '{from} leaves the moment ambiguous instead of being able to claim they got under your skin.',
    ],
    negative: [
      '{from} gets the confrontation they were probing for and the tension becomes easier for others to notice.',
      '{from} leaves with a sharper rivalry story and may test it again later.',
    ],
    dismiss: [
      '{from} is denied the audience for the jab, but may use your exit to write their own version of it.',
      '{from} loses the immediate exchange and looks for a more public opening next time.',
    ],
  },
  alliance_reassurance: {
    positive: [
      '{from} leaves the check-in believing the alliance still has a working centre.',
      '{from} is more willing to protect the pact when another player tests its edges.',
    ],
    neutral: [
      '{from} hears that the alliance is not broken, but keeps looking for the fault line.',
      '{from} treats the reassurance as provisional and watches whether your next move matches it.',
    ],
    negative: [
      '{from} sees the alliance as weakened and begins building an insurance policy outside it.',
      '{from} takes the doubts seriously enough to stop sharing every strategic detail.',
    ],
    dismiss: [
      '{from} leaves the alliance question unanswered and assumes the pact may not survive pressure.',
      '{from} starts preparing for a world where the two of you no longer move as a pair.',
    ],
  },
  generic_gossip: {
    positive: [
      '{from} sees you as someone who can handle a rumour without immediately making it house news.',
      '{from} gives you a more useful thread to follow, while keeping the source protected.',
    ],
    neutral: [
      '{from} cannot tell whether you believe the rumour, so the next detail stays with them.',
      '{from} leaves knowing you heard the name, not whether you will use it.',
    ],
    negative: [
      '{from} decides you are too close to the target or too wary to be useful on this rumour.',
      '{from} pulls the gossip back before it becomes something they regret sharing.',
    ],
    dismiss: [
      '{from} lets the rumour travel through another route and keeps you out of the information chain.',
      '{from} learns that you will not entertain this kind of intel and adjusts future approaches.',
    ],
  },
  generic_check_in: {
    positive: [
      '{from} feels the directness gave the relationship something concrete to stand on.',
      '{from} leaves with a clearer read of you and more confidence in the next conversation.',
    ],
    neutral: [
      '{from} gets a real answer, but not enough certainty to stop watching the connection.',
      '{from} understands the immediate issue better and waits to see whether your actions repeat the answer.',
    ],
    negative: [
      '{from} hears the boundary and stops expecting the conversation to repair things on its own.',
      '{from} leaves knowing the connection needs more than another check-in to recover.',
    ],
    dismiss: [
      '{from} leaves without the clarity they came for and has to judge the relationship from your behaviour instead.',
      '{from} takes the cut-off as a reason to stop initiating until something changes.',
    ],
  },
}

export function getAuthoredIncomingSceneOutcome(
  scenarioKey: string | undefined,
  stance: IncomingSceneOutcomeStance,
  seed: number
): string | null {
  if (!scenarioKey) return null
  const outcomes = INCOMING_SCENE_OUTCOME_BANK[scenarioKey]?.[stance]
  if (!outcomes?.length) return null
  return outcomes[seed % outcomes.length] ?? null
}
