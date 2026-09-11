import { acts, says, subject } from './incomingOutcomeMatrixUtils'
import type { ScenarioOutcomeMatrix } from './incomingOutcomeMatrixUtils'

export const CONFLICT_OUTCOME_MATRIX: ScenarioOutcomeMatrix = {
  betrayal_warning: {
    'compare notes': says('the same suspicious move appears in both of your versions of the week.'),
    'ask for proof': (context) =>
      `${context.fromName} says they have a pattern around ${subject(context)}, not hard proof.`,
    'question their motive': says('they brought it to you because the risk affects both of you.'),
    'bury it for now': acts('agrees to sit on the warning until something else confirms it.'),
    'take it seriously': says(
      'they will keep watching quietly and tell you if the pattern repeats.'
    ),
    'watch quietly': acts('agrees not to confront anyone before there is stronger evidence.'),
    'defend your ally': says('they hear your defense, but are not convinced the warning is wrong.'),
    'refuse the drama': acts('drops the warning with you and keeps the suspicion to themselves.'),
  },
  ignored_warning: {
    'give them time': says('they will wait, but need some sign the relationship still matters.'),
    'ask what they need': says(
      'they need you to initiate sometimes instead of making them chase every conversation.'
    ),
    'set a boundary': says('they will stop pushing and match the distance you asked for.'),
    'end the chat': acts('leaves feeling the distance is now intentional.'),
    'acknowledge the distance': says(
      'they mainly wanted confirmation that they were not imagining it.'
    ),
    'keep it brief': says('they accept the short answer, but still read you as withdrawn.'),
    'say they are reading too much in': says(
      'they disagree and point to how rarely you have checked in.'
    ),
    'leave it there': acts('stops asking and lets your future actions answer instead.'),
  },
  targeted_snark: {
    'ask what they mean': says(
      'your name keeps appearing whenever people discuss who is overconnected.'
    ),
    'stay unreadable': says('they cannot tell whether the comment hit, which ruins the test.'),
    'call it out': says('the jab was deliberate and they wanted to see your reaction.'),
    'walk away': acts('gets no argument and is left with the comment hanging.'),
    'defuse the jab': says('they have little room to escalate once you treat it lightly.'),
    'keep your cool': says('they were looking for irritation and did not get it.'),
    'push back directly': says(
      'they now know you will answer the pressure instead of absorbing it.'
    ),
    'let it die': acts('stops pushing once the remark fails to grow into a fight.'),
  },
  alliance_reassurance: {
    'reassure them fully': says('they believe the alliance is still your first strategic home.'),
    'compare your plans': says(
      'their priority is keeping the alliance off the block and aligned on one target.'
    ),
    'admit your doubts': says(
      'they want one concrete move this week to prove the alliance still works.'
    ),
    'avoid the subject': acts('reads the dodge as a warning that the alliance may be slipping.'),
    'renew the pact': says('they are ready to treat the alliance as active again immediately.'),
    'ask what changed': says(
      'your recent distance made them unsure whether the pact still mattered.'
    ),
    'set new terms': says('they will accept clearer boundaries if both sides follow them.'),
    'end the check-in': acts('leaves without the reassurance they were looking for.'),
  },
  generic_gossip: {
    'ask source': says('the story came up twice, but will not name anyone yet.'),
    'ask for the source': (context) =>
      `${context.fromName} says the claim about ${subject(context)} came from two separate conversations.`,
    'listen only': (context) =>
      `${context.fromName} says ${subject(context)} is being discussed, but the story is still incomplete.`,
    'protect the target': (context) =>
      `${context.fromName} agrees not to repeat the claim to ${subject(context)} yet.`,
    'stop the rumour': acts('agrees to stop carrying the story through you.'),
    'trade a little intel': (context) =>
      `${context.fromName} says ${subject(context)} has been testing the same idea with more than one person.`,
    'ask who else knows': (context) =>
      `${context.fromName} says two other people have heard the same story about ${subject(context)}.`,
    'challenge the story': (context) =>
      `${context.fromName} admits the claim about ${subject(context)} is still unverified.`,
    'change the subject': acts('drops the rumour without giving you another name.'),
  },
}
