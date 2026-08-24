import type { LinkedScenarioSpec } from './afterTheEyeOutcomeTypes'

interface LinkedDramaTemplate {
  id: string
  relation: LinkedScenarioSpec['relation']
  category: string
  tone: LinkedScenarioSpec['tone']
  weight: number
  badge: string
  headlines: string[]
  setups: string[]
  escalations: string[]
  outcomes: string[]
  twists: string[]
}

const VARIANTS_PER_TEMPLATE = 3

const LINKED_DRAMA_TEMPLATES: LinkedDramaTemplate[] = [
  {
    id: 'linked_expectation',
    relation: 'romantic',
    category: 'pregnancy_parenthood',
    tone: 'good',
    weight: 1.25,
    badge: 'BABY NEWS',
    headlines: [
      '{name} and {partnerName} Announce a Baby',
      'HOUSE ROMANCE BECOMES A FAMILY',
      'THE SECRET THEY KEPT FOR MONTHS',
    ],
    setups: [
      '{name} and {partnerName} keep a pregnancy private while breakup rumors spread around them.',
      'The couple quietly steps away from public events without explaining why.',
      'A family dinner brings both sides together months after the finale.',
    ],
    escalations: [
      'A misplaced gift bag reveals the news before the couple is ready.',
      'A false breakup story lands on the same day they planned to tell their families.',
      'Management pushes for a paid exclusive and the couple refuses.',
    ],
    outcomes: [
      'They confirm they are expecting and ask for the rest of the pregnancy to remain private.',
      "The announcement transforms the showmance into one of the season's most stable post-show relationships.",
      'They turn down a reality special and choose a quieter family life.',
    ],
    twists: [
      'The entire cast had known for weeks and kept the secret.',
      'Their fiercest former critic sends the first public congratulations.',
      'The announcement is posted without a sponsor despite multiple offers.',
    ],
  },
  {
    id: 'linked_secret_wedding_drama',
    relation: 'romantic',
    category: 'romance',
    tone: 'excellent',
    weight: 1.1,
    badge: 'SECRET VOWS',
    headlines: [
      '{name} and {partnerName} Secretly Marry',
      'THE WEDDING NOBODY WAS INVITED TO',
      'A COURTHOUSE RECORD BLOWS THE SECRET',
    ],
    setups: [
      '{name} and {partnerName} tell friends they are taking a short trip and quietly get married instead.',
      'Months of breakup rumors conceal the fact that the couple has already exchanged vows.',
      'The pair rejects a televised wedding and chooses a ceremony with almost no guests.',
    ],
    escalations: [
      'A legal record exposes the marriage before either person announces it.',
      'Matching rings are spotted during an unrelated livestream.',
      'A hotel accidentally uses a shared surname in public.',
    ],
    outcomes: [
      'The couple confirms the marriage and says secrecy was the only way to protect it.',
      'The marriage survives the sudden attention and improves both reputations.',
      'They refuse to reenact the ceremony for television and return to private life.',
    ],
    twists: [
      'A former rival served as a witness.',
      'The marriage happened before the reunion special.',
      'Their families met for the first time at the ceremony.',
    ],
  },
  {
    id: 'linked_affair',
    relation: 'romantic',
    category: 'cheating_scandal',
    tone: 'bad',
    weight: 1.35,
    badge: 'AFFAIR BOMBSHELL',
    headlines: [
      '{name} and {partnerName} Torn Apart by Affair Claims',
      'SECRET PHOTOS END THE SHOWMANCE',
      'A THIRD PERSON ENTERS THE STORY',
    ],
    setups: [
      '{name} and {partnerName} are publicly together when photographs place one of them with somebody else overnight.',
      'A private message exchange with a third person leaks while the couple is discussing moving in together.',
      'An afterparty creates a timeline neither partner can explain the same way.',
    ],
    escalations: [
      'One partner deletes every couple photo while the other insists the images are misleading.',
      "The third person gives an interview that contradicts the couple's public statement.",
      'Former housemates take sides and the relationship crisis becomes a cast-wide feud.',
    ],
    outcomes: [
      'The relationship ends and both sides issue statements that disagree on almost every important detail.',
      'A reconciliation attempt fails when a second batch of messages appears.',
      'The couple separates while insisting the public still does not know the whole story.',
    ],
    twists: [
      'The third person had previously dated another housemate.',
      'One damaging image was taken weeks earlier than reported.',
      "The leak came from somebody inside one partner's management team.",
    ],
  },
  {
    id: 'linked_altar',
    relation: 'romantic',
    category: 'marriage_breakup',
    tone: 'tragic',
    weight: 1.05,
    badge: 'WEDDING COLLAPSE',
    headlines: [
      '{name} and {partnerName}: Wedding Cancelled at the Last Minute',
      'ONE NOTE ENDS THE CEREMONY',
      'THE VOWS THAT NEVER HAPPENED',
    ],
    setups: [
      '{name} and {partnerName} gather family and former housemates for a heavily guarded wedding.',
      'The most public romance of the season reaches the altar after months of instability.',
      'Guests arrive for a ceremony the couple has repeatedly insisted is definitely happening.',
    ],
    escalations: [
      'One partner disappears before the vows and leaves only a short handwritten note.',
      'A private argument empties half the wedding party before the ceremony begins.',
      'A message received that morning changes the entire plan within minutes.',
    ],
    outcomes: [
      'The wedding is cancelled and the relationship ends without a joint explanation.',
      'Both disappear from public view while lawyers unwind contracts around the event.',
      'The couple never reaches the altar and never fully agrees on why.',
    ],
    twists: [
      'Someone in the wedding party knew the ceremony would collapse.',
      'The venue had already been paid for by a television network.',
      'The missing partner had packed a suitcase the night before.',
    ],
  },
  {
    id: 'linked_blackmail',
    relation: 'betrayal',
    category: 'crime_scandal',
    tone: 'tragic',
    weight: 1.2,
    badge: 'BLACKMAIL WAR',
    headlines: [
      '{name} Accuses {partnerName} of Blackmail',
      'PRIVATE AUDIO DESTROYS THE ALLIANCE',
      'MONEY DEMAND TURNS FRIENDS INTO ENEMIES',
    ],
    setups: [
      '{name} receives a demand for money tied to private material once shared only with {partnerName}.',
      "A recording from the alliance's private post-show meetings is offered to tabloids.",
      'Messages appear to show somebody threatening to release personal information unless paid.',
    ],
    escalations: [
      '{partnerName} denies involvement while lawyers and police begin examining the messages.',
      'Fragments of the material leak anyway, turning suspicion into a public crisis.',
      "A payment trail points toward somebody in the former alliance's wider circle.",
    ],
    outcomes: [
      'The friendship is destroyed even after investigators identify a third party.',
      '{name} and {partnerName} stop speaking and allow lawyers to handle every remaining contact.',
      'The criminal investigation outlives the alliance and permanently changes both reputations.',
    ],
    twists: [
      '{partnerName} ultimately provides evidence that helps {name}.',
      'The person demanding money had copied material from an old shared device.',
      'The most damaging clip was heavily edited.',
    ],
  },
  {
    id: 'linked_money_betrayal',
    relation: 'betrayal',
    category: 'financial_ruin',
    tone: 'bad',
    weight: 1.0,
    badge: 'MONEY MISSING',
    headlines: [
      '{name} Says {partnerName} Drained Their Joint Business',
      'THE ALLIANCE ENDS OVER MISSING MONEY',
      'FROM FRIENDSHIP TO FORENSIC ACCOUNTING',
    ],
    setups: [
      '{name} and {partnerName} turn their post-show alliance into a joint business.',
      'The pair combines sponsorship income in a company meant to fund future projects.',
      'A shared venture grows quickly while neither former housemate watches the accounts closely.',
    ],
    escalations: [
      'Payments stop matching the books and both sides accuse the other of authorizing transfers.',
      'An accountant resigns and leaves behind a spreadsheet neither partner can explain.',
      'The dispute goes public after staff members are not paid on time.',
    ],
    outcomes: [
      'The company closes and the friendship ends in competing legal claims.',
      'A settlement divides the remaining assets but never restores trust.',
      'Investigators find sloppy controls rather than a simple theft, leaving both sides damaged.',
    ],
    twists: [
      'The largest unexplained payment went to a manager neither partner now trusts.',
      'A former rival warned them not to mix friendship and money.',
      'The business name becomes more valuable than the business itself.',
    ],
  },
  {
    id: 'linked_defamation',
    relation: 'rival',
    category: 'public_feud',
    tone: 'bad',
    weight: 1.25,
    badge: 'COURTROOM FEUD',
    headlines: [
      '{name} and {partnerName} Take Their Feud to Court',
      'ONE LIVESTREAM TOO FAR',
      'THE RIVALRY BECOMES A LAWSUIT',
    ],
    setups: [
      '{name} and {partnerName} continue attacking each other in interviews long after the season ends.',
      'A livestream accusation pushes the old rivalry beyond entertainment.',
      'Months of subtweets become explicit when both former housemates start naming each other.',
    ],
    escalations: [
      'A legal notice is posted online and immediately becomes part of the feud.',
      'Both sides release screenshots while their lawyers ask them to stop talking.',
      'Sponsors withdraw from a planned joint debate after threats of legal action.',
    ],
    outcomes: [
      'The dispute settles privately and the two never reconcile.',
      'Each retracts specific claims without giving fans the courtroom spectacle they expected.',
      'A limited legal win clarifies one accusation but leaves the wider rivalry alive.',
    ],
    twists: [
      'The settlement forbids either side from discussing the settlement.',
      'A third housemate supplied the screenshot that triggered the lawsuit.',
      'The host of the original livestream later apologizes.',
    ],
  },
  {
    id: 'linked_crash',
    relation: 'rival',
    category: 'accident_crisis',
    tone: 'neutral',
    weight: 0.9,
    badge: 'ONE CRASH, TWO STORIES',
    headlines: [
      '{name} and {partnerName} Give Different Accounts of a Crash',
      'WHO WAS DRIVING?',
      'A LATE-NIGHT COLLISION REIGNITES THE RIVALRY',
    ],
    setups: [
      '{name} and {partnerName} leave the same event before a vehicle connected to the group is involved in a collision.',
      'A minor accident becomes major news because both former rivals were nearby.',
      'Police ask questions after a late-night collision involving a car seen at the cast afterparty.',
    ],
    escalations: [
      'The two give conflicting timelines and internet detectives begin reconstructing the night.',
      'A witness claims people changed seats before authorities arrived.',
      'Security footage contradicts one detail from both public statements.',
    ],
    outcomes: [
      'No dramatic conspiracy is proven, but the contradictory accounts deepen the feud.',
      'A lesser traffic matter is resolved while the reputational argument continues.',
      'Both eventually admit they withheld details to protect another person.',
    ],
    twists: [
      'The decisive footage comes from a shop camera.',
      'The person most blamed online was not in the car.',
      'A private apology happens months before the public feud ends.',
    ],
  },
  {
    id: 'linked_recovery',
    relation: 'ally',
    category: 'addiction_recovery',
    tone: 'good',
    weight: 1.05,
    badge: 'RECOVERY PACT',
    headlines: [
      '{name} Credits {partnerName} With Helping Save Their Recovery',
      'THE ALLIANCE THAT MATTERED AFTER THE SHOW',
      'A PRIVATE CRISIS REBUILDS A FRIENDSHIP',
    ],
    setups: [
      '{name} withdraws from public life during a period of addiction treatment and {partnerName} stays close.',
      'A difficult post-show spiral brings {name} back into contact with former ally {partnerName}.',
      '{partnerName} quietly helps {name} step away from a destructive celebrity routine.',
    ],
    escalations: [
      'Tabloids try to turn the treatment period into content, and both refuse interviews.',
      'A leaked photograph reveals the friendship before {name} is ready to discuss recovery.',
      'Management pressures {name} to return quickly while {partnerName} argues for more time away.',
    ],
    outcomes: [
      '{name} returns gradually and credits the friendship with making recovery feel possible.',
      'The pair rebuilds an alliance based on life outside the game rather than strategy.',
      'Both become far more private and decline a reality special about the recovery.',
    ],
    twists: [
      '{partnerName} had been the last person {name} expected to call.',
      'A former rival quietly helps with logistics too.',
      'The highest-paying interview offer is rejected.',
    ],
  },
  {
    id: 'linked_family_secret',
    relation: 'ally',
    category: 'family_secret',
    tone: 'neutral',
    weight: 0.9,
    badge: 'SECRET KEPT',
    headlines: [
      "{partnerName} Knew {name}'s Family Secret for Months",
      'THE ALLIANCE KEPT ONE THING OFF CAMERA',
      'A PRIVATE CONFESSION SURFACES AFTER THE SHOW',
    ],
    setups: [
      '{name} tells {partnerName} about a complicated family secret while both are adjusting to life after the house.',
      'A newly discovered relative contacts {name}, and {partnerName} becomes the only former housemate told.',
      "Questions about {name}'s family history intensify while {partnerName} quietly helps handle the situation.",
    ],
    escalations: [
      'A tabloid learns part of the story and assumes {partnerName} must be the source.',
      'Family members disagree about whether the truth should be acknowledged publicly.',
      'A private meeting is photographed, making secrecy almost impossible.',
    ],
    outcomes: [
      '{name} confirms only the basic facts and publicly clears {partnerName} of leaking them.',
      'The friendship survives the pressure and becomes stronger away from the game.',
      'The family issue remains private, but the alliance finally earns real trust.',
    ],
    twists: [
      'The leak came from a legal filing, not a person.',
      '{partnerName} had turned down money for the story.',
      'A supposed insider had invented most of the sensational details.',
    ],
  },
]

function pick(values: string[], templateIndex: number, variantIndex: number, salt: number): string {
  const index = (templateIndex * (salt + 5) + variantIndex * (salt * 3 + 1) + salt) % values.length
  return values[index]
}

function compileTemplate(
  template: LinkedDramaTemplate,
  templateIndex: number
): LinkedScenarioSpec[] {
  return Array.from({ length: VARIANTS_PER_TEMPLATE }, (_, variantIndex) => ({
    id: `${template.id}_v${variantIndex + 1}`,
    relation: template.relation,
    category: template.category,
    tone: template.tone,
    weight: template.weight * (1 - variantIndex * 0.04),
    badge: template.badge,
    headlines: [
      pick(template.headlines, templateIndex, variantIndex, 1),
      pick(template.headlines, templateIndex, variantIndex + 1, 2),
    ],
    beats: [
      pick(template.setups, templateIndex, variantIndex, 3),
      pick(template.escalations, templateIndex, variantIndex, 4),
      pick(template.outcomes, templateIndex, variantIndex, 5),
    ],
    twists: [
      pick(template.twists, templateIndex, variantIndex, 6),
      pick(template.twists, templateIndex, variantIndex + 1, 7),
    ],
  }))
}

export const AFTER_EYE_LINKED_SCENARIOS: LinkedScenarioSpec[] =
  LINKED_DRAMA_TEMPLATES.flatMap(compileTemplate)
