import { acts, currentPressure, reciprocalCheckInPressure, says } from './incomingOutcomeMatrixUtils'
import type { ScenarioOutcomeMatrix } from './incomingOutcomeMatrixUtils'

export const RELATIONSHIP_OUTCOME_MATRIX: ScenarioOutcomeMatrix = {
generic_check_in: {
    'make them explain': says('they felt shut out and wanted a direct answer.'),
    'be honest': says('they appreciate the direct answer and give you their own read in return.'),
    'ask them back': reciprocalCheckInPressure,
    'keep some distance': says('they notice the distance and decide not to press for more.'),
    'wrap it up': acts('lets the check-in end before it becomes a deeper conversation.'),
    'let them in': says('they respond with a more candid read of where they stand with you.'),
    'keep it light': says('they match the lighter tone and avoid turning it into game talk.'),
    'set a boundary': says('they accept the limit and stop probing the relationship.'),
    'leave it there': acts('ends the check-in without asking for anything else.'),
  },
relationship_friendship_check_in: {
    'ask them back': says('they are still trying to read where they stand with you.'),
    'let them in': says('they feel the same closeness and trust you more than they expected.'),
    'ask how they are': currentPressure,
    'keep it friendly': says('they understand you value the friendship without making it deeper.'),
    'leave it for now': acts('lets the moment pass and does not push the friendship further.'),
  },
relationship_alliance_follow_up: {
    'work together': says('they want one shared target and a private check-in after the next ceremony.'),
    'ask for time': says('they will wait, but need an answer before the next power decision.'),
    'do not pitch me again': says('they stop treating you as a possible partner.'),
    'end the talk': acts('leaves without an alliance and starts planning independently.'),
  },
relationship_romance_check_in: {
    'see where this goes': says('they want to keep exploring the connection without making it public yet.'),
    'keep it light': says('they are happy to flirt without turning it into a commitment.'),
    'keep this platonic': says('they accept the boundary and will stop reading the connection romantically.'),
    'leave it for now': acts('backs off and gives the attraction room to cool.'),
  },
relationship_confidant_check_in: {
    'hear them out': says('they share something they have not been comfortable saying to the house.'),
    'ask for context': says('the issue has been building for days and they wanted one person they trust.'),
    'do not confide in me': says('they accept the boundary and stop treating you as their private sounding board.'),
    'change the subject': acts('keeps the private issue to themselves and moves on.'),
  },
relationship_frustration_follow_up: {
    'talk it through': says('they are frustrated by mixed signals more than by one specific move.'),
    'ask for time': says('they will give you space, but do not want the issue buried permanently.'),
    'do not push this': says('they stop pressing and read the tension as something you do not want repaired.'),
    'walk away': acts('lets the argument end without resolving what changed between you.'),
  },
relationship_repair_follow_up: {
    'try to repair it': says('they are willing to reset if both of you stop replaying the last conflict.'),
    'take some space': says('they agree a little distance may be better than forcing a repair.'),
    'keep your distance': says('they understand you are not ready to rebuild the relationship.'),
    'end the talk': acts('leaves knowing the repair attempt did not land.'),
  }
}
