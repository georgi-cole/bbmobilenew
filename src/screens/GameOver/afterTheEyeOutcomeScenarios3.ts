import type { ScenarioSpec } from './afterTheEyeOutcomeTypes'

interface DramaTemplate {
  id: string
  category: string
  tone: ScenarioSpec['tone']
  weight: number
  cooldownGroup: string
  badge: string
  eligibility: ScenarioSpec['eligibility']
  headlines: string[]
  setups: string[]
  escalations: string[]
  outcomes: string[]
  twists: string[]
}

const VARIANTS_PER_TEMPLATE = 5

const DRAMA_TEMPLATES: DramaTemplate[] = [
  {
    id: "fraud_investigation",
    category: "legal_trouble",
    tone: "tragic",
    weight: 1.0,
    cooldownGroup: "fraud",
    badge: "FINANCIAL SCANDAL",
    eligibility: { tagsAny: ['winner', 'fan_favorite', 'controversial'] },
    headlines: [
      "{name}'s Business Empire Faces a Fraud Probe",
      "From Fame to Financial Investigation",
      "Investors Turn on {name}",
      "The Contract Scandal That Could Cost Everything",
    ],
    setups: [
      "{name} becomes the public face of a fast-growing investment venture shortly after the season.",
      "A business launched around {name}'s fame raises money quickly and promises returns that sound almost impossible.",
      "{name} signs onto a company run by aggressive managers who use the housemate's image to attract investors.",
      "A lucrative post-show deal puts {name} on billboards before anyone explains where the money is coming from.",
    ],
    escalations: [
      "Regulators begin asking questions, former employees leak documents, and investors demand to know what {name} actually knew.",
      "Payments stop, executives disappear from interviews, and {name}'s name remains on every advertisement.",
      "An internal email suggests warnings were ignored while the company continued using {name} to reassure customers.",
      "Lawyers separate {name} from the founders publicly, but the distinction comes too late to stop the scandal.",
    ],
    outcomes: [
      "{name} faces a long legal fight to prove they were a spokesperson rather than an architect of the scheme.",
      "The company collapses, leaving {name} financially damaged and forced to rebuild credibility from zero.",
      "{name} cooperates with investigators and avoids the worst legal outcome, but the career built after the show is gone.",
      "The investigation continues for months and turns {name}'s success story into a cautionary headline.",
    ],
    twists: [
      "The contract gave {name} almost no control over the company despite using their face everywhere.",
      "A former assistant had saved the emails that become central to the case.",
      "The founder had approached three other housemates first.",
      "One of the loudest accusers had invested after being privately warned not to.",
    ],
  },
  {
    id: "wrongly_accused",
    category: "legal_trouble",
    tone: "good",
    weight: 1.0,
    cooldownGroup: "legal_clearance",
    badge: "CLEARED",
    eligibility: {},
    headlines: [
      "{name} Cleared After Months Under Suspicion",
      "The Case Against {name} Falls Apart",
      "Evidence Reverses the Scandal",
      "{name}'s Name Finally Cleared",
    ],
    setups: [
      "{name} is publicly linked to a criminal investigation through a leaked document that lacks crucial context.",
      "A former business associate accuses {name} of taking part in conduct that quickly becomes headline news.",
      "An anonymous complaint places {name} under scrutiny and triggers a wave of cancelled appearances.",
      "A legal dispute is reported as a criminal scandal before investigators have even interviewed {name}.",
    ],
    escalations: [
      "New records contradict the accusation, but corrections receive far less attention than the original story.",
      "A witness admits making assumptions, while digital records show {name} was elsewhere during a key event.",
      "The source of the allegation is challenged in court and several supposed facts collapse at once.",
      "Investigators obtain messages that support the account {name} gave from the beginning.",
    ],
    outcomes: [
      "{name} is formally cleared and begins rebuilding a career damaged by months of suspicion.",
      "The case closes without action against {name}, followed by a successful legal complaint over false reporting.",
      "Sponsors slowly return after an official statement confirms {name} was not involved.",
      "{name} uses the experience to step away from celebrity management and regain control of public life.",
    ],
    twists: [
      "The document that started the scandal had been cropped before publication.",
      "A rival outlet had the exculpatory evidence for weeks.",
      "The key witness apologizes privately before doing so publicly.",
      "The final correction becomes the most-read article on the same site that broke the accusation.",
    ],
  },
  {
    id: "car_crash",
    category: "accident_crisis",
    tone: "good",
    weight: 1.1,
    cooldownGroup: "accident",
    badge: "MIRACLE ESCAPE",
    eligibility: {},
    headlines: [
      "{name} Survives Terrifying Road Accident",
      "A Midnight Crash Changes Everything",
      "{name}'s Close Call Shocks the Cast",
      "The Accident That Ended the Party Circuit",
    ],
    setups: [
      "{name} is involved in a serious road accident while traveling home from a public appearance.",
      "A late-night trip ends with {name}'s vehicle badly damaged and emergency services called to the scene.",
      "News breaks before dawn that {name} has been taken to hospital after a traffic accident.",
      "A routine journey between appearances turns into the most frightening night of {name}'s post-show life.",
    ],
    escalations: [
      "Conflicting reports spread online while family members ask fans to stop calling the hospital.",
      "Former housemates arrive quietly as tabloids speculate far beyond the limited facts released.",
      "A photograph of the damaged vehicle circulates before doctors have finished evaluating {name}.",
      "The public story becomes chaotic when an anonymous witness gives an exaggerated account to television.",
    ],
    outcomes: [
      "{name} recovers and cancels months of appearances, saying the accident permanently changed their priorities.",
      "After a difficult recovery, {name} returns with a far quieter lifestyle and no interest in the old party circuit.",
      "{name} leaves hospital and later credits the accident with forcing a complete reset of life after fame.",
      "The recovery is slower than expected, but {name} eventually returns to public life on very different terms.",
    ],
    twists: [
      "The first person at the scene was a fan who recognized {name}.",
      "A widely repeated claim about the cause of the crash is later disproved.",
      "One former rival visits the hospital without telling the press.",
      "The damaged vehicle was not being driven by {name}.",
    ],
  },
  {
    id: "accident_driver_secret",
    category: "accident_crisis",
    tone: "bad",
    weight: 0.95,
    cooldownGroup: "accident_coverup",
    badge: "CRASH COVER-UP?",
    eligibility: { tagsAny: ['rivalry'], requiresRelation: 'rival' },
    headlines: [
      "Who Was Driving? {name}'s Crash Story Unravels",
      "{name} and {rivalName} Give Different Accounts of One Accident",
      "A Collision, Two Stories, No Easy Answer",
      "The Night {name}'s Timeline Fell Apart",
    ],
    setups: [
      "{name} is present at a minor but high-profile collision after a party also attended by {rivalName}.",
      "A vehicle connected to {name} is found damaged hours after {name} and {rivalName} leave the same event.",
      "An accident involving people from the season becomes controversial when nobody agrees who was behind the wheel.",
      "{name} gives a simple account of a late-night collision until another witness mentions {rivalName}.",
    ],
    escalations: [
      "{rivalName} publicly contradicts one detail, and investigators begin reconstructing the timeline.",
      "Deleted posts, ride receipts, and security footage become part of an increasingly public dispute.",
      "A witness says the group switched seats before police arrived, a claim everyone involved denies.",
      "The story becomes less about the collision and more about whether somebody tried to protect somebody else.",
    ],
    outcomes: [
      "{name} avoids serious charges but loses public trust after changing parts of the story.",
      "The investigation ends with penalties for a lesser offense and a permanent rupture between {name} and {rivalName}.",
      "No dramatic cover-up is proven, but the contradictory accounts leave both reputations damaged.",
      "{name} admits withholding part of the truth to protect another person and accepts the fallout.",
    ],
    twists: [
      "The decisive footage comes from a shop camera nobody noticed.",
      "{rivalName}'s first statement was technically true but deliberately incomplete.",
      "The person most blamed online was not inside the vehicle at all.",
      "A private apology happens long before the public dispute ends.",
    ],
  },
  {
    id: "rehab_recovery",
    category: "addiction_recovery",
    tone: "good",
    weight: 1.05,
    cooldownGroup: "recovery",
    badge: "FIGHTING BACK",
    eligibility: {},
    headlines: [
      "{name} Steps Away From Fame and Enters Treatment",
      "A Private Struggle Becomes {name}'s Public Turning Point",
      "{name} Chooses Recovery Over the Spotlight",
      "The Comeback Nobody Expected",
    ],
    setups: [
      "Months of relentless appearances and nightlife end when {name} abruptly cancels every public commitment.",
      "{name} disappears from social media after friends privately express concern about increasingly destructive behavior.",
      "A representative confirms that {name} has entered treatment for an addiction problem and will step away from work.",
      "After a chaotic period following the show, {name} acknowledges needing professional help and leaves the public circuit.",
    ],
    escalations: [
      "Tabloids chase details while former housemates ask the public to stop turning treatment into entertainment.",
      "A leaked photograph triggers a wave of speculation that forces {name}'s family to issue a boundary-setting statement.",
      "Several sponsors leave, but close friends continue visiting and refuse to discuss the situation publicly.",
      "An early rumor of a quick return is denied as {name} commits to a longer recovery plan.",
    ],
    outcomes: [
      "{name} returns months later, speaks carefully about recovery, and builds a much smaller but more stable life.",
      "The comeback is gradual, with {name} choosing limited work and openly prioritizing long-term recovery.",
      "{name} turns down a sensational interview and instead supports treatment organizations without making the story a brand.",
      "Recovery becomes the first post-show chapter in which {name} seems less interested in being watched.",
    ],
    twists: [
      "A former rival quietly pays for part of the treatment program.",
      "The most supportive person from the cast is someone {name} barely spoke to in the house.",
      "A tabloid offering the largest fee for an interview is refused first.",
      "The public response is far more compassionate than {name}'s management expected.",
    ],
  },
]

function pick(values: string[], templateIndex: number, variantIndex: number, salt: number): string {
  const index = (templateIndex * (salt + 3) + variantIndex * (salt * 2 + 1) + salt) % values.length
  return values[index]
}

function compileTemplate(template: DramaTemplate, templateIndex: number): ScenarioSpec[] {
  return Array.from({ length: VARIANTS_PER_TEMPLATE }, (_, variantIndex) => {
    const setup = pick(template.setups, templateIndex, variantIndex, 1)
    const escalation = pick(template.escalations, templateIndex, variantIndex, 2)
    const outcome = pick(template.outcomes, templateIndex, variantIndex, 3)

    return {
      id: `${template.id}_v${variantIndex + 1}`,
      category: template.category,
      tone: template.tone,
      weight: template.weight * (1 - variantIndex * 0.025),
      cooldownGroup: template.cooldownGroup,
      badge: template.badge,
      eligibility: { ...template.eligibility },
      headlines: [
        pick(template.headlines, templateIndex, variantIndex, 4),
        pick(template.headlines, templateIndex, variantIndex + 1, 5),
        pick(template.headlines, templateIndex, variantIndex + 2, 6),
      ],
      beats: [setup, escalation, outcome],
      twists: [
        pick(template.twists, templateIndex, variantIndex, 7),
        pick(template.twists, templateIndex, variantIndex + 1, 8),
        pick(template.twists, templateIndex, variantIndex + 2, 9),
      ],
    }
  })
}

export const AFTER_EYE_SCENARIOS_3: ScenarioSpec[] = DRAMA_TEMPLATES.flatMap(compileTemplate)
