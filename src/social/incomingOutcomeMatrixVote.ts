import { acts, says } from './incomingOutcomeMatrixUtils'
import type { ScenarioOutcomeMatrix } from './incomingOutcomeMatrixUtils'

export const VOTE_OUTCOME_MATRIX: ScenarioOutcomeMatrix = {
  replacement_nominee_reacts_to_loh: {
    'explain the backup plan': says(
      'they understand why a replacement was needed, but not why it had to be them.'
    ),
    'hear their reaction': says(
      'they feel blindsided because they were safe until the last decision.'
    ),
    'stand by the choice': says(
      'they accept that you are not reconsidering and start campaigning against the move.'
    ),
    'end the talk': acts('leaves angry and starts working the vote without you.'),
    'acknowledge the blow': says(
      'they wanted recognition that the replacement hit harder than an initial nomination.'
    ),
    'keep it factual': says('they hear the mechanics, but say the trust damage is still real.'),
    'refuse to justify it': says(
      'they stop asking and assume they were always your backup target.'
    ),
    'give them space': acts('steps away to cool off before campaigning.'),
  },
  post_veto_gratitude: {
    'share the relief': says('they finally feel able to think beyond surviving this week.'),
    'accept their thanks': says('they will remember exactly who helped when they were vulnerable.'),
    'call in the favor': says('they understand the save creates a debt they will have to repay.'),
    'change the subject': acts('lets the gratitude stand without turning it into a deal.'),
    'celebrate together': says('they want one quiet moment before strategy starts again.'),
    'say it was nothing': says(
      'they do not buy that it was nothing and still count it as a favor.'
    ),
    'keep score': says('they accept that the save comes with expectations attached.'),
    'move on': acts('ends the thank-you and turns attention back to the vote.'),
  },
  post_veto_campaign: {
    'hear their new plan': says(
      'they are rebuilding around the voters least committed to the new block.'
    ),
    'keep it measured': says('they know you are not committed and will not count your vote yet.'),
    'tell them you cannot help': says('they remove you from the path and focus on softer votes.'),
    'end the campaign': acts('stops pitching you and moves to the next voter.'),
    'offer a little hope': says('they think the changed block gives them one real opening.'),
    'ask what changed': says('the Safety move broke an old voting plan and reopened two people.'),
    'keep your distance': says('they understand you do not want to be seen inside their campaign.'),
    'close the talk': acts('leaves without your vote and keeps campaigning elsewhere.'),
  },
  live_vote_pitch: {
    'promise your vote': says('they lock your support into their count and stop chasing you.'),
    'ask for their case': says('keeping them gives you a vote that is still open.'),
    'tell them no': says('they stop counting you and focus on the last undecided voter.'),
    'avoid an answer': says('they know time is running out and cannot treat you as a vote.'),
    'commit to keep them': says(
      'they believe the vote is real and will remember it if they survive.'
    ),
    'keep your options open': says(
      'they need an answer before the vote and will not wait much longer.'
    ),
    'choose the other side': says('they know your vote is gone and shift fully to survival mode.'),
    'end the pitch': acts('leaves to make one final case to somebody else.'),
  },
  survivor_gratitude: {
    'share the moment': says('surviving showed them exactly who stayed steady under pressure.'),
    'accept the thanks': says('they will remember your role when the next vote forms.'),
    'remind them who helped': says('they know the survival came with debts attached.'),
    'move on': acts('lets the thank-you end without turning it into a promise.'),
    'strengthen the bond': says(
      'they want to turn surviving together into a real working relationship.'
    ),
    'keep it modest': says('they still count your support even if you do not want credit.'),
    'call in a favor': says('they agree you earned consideration on their next decision.'),
    'change the subject': acts('drops the gratitude talk and returns to the new week.'),
  },
}
