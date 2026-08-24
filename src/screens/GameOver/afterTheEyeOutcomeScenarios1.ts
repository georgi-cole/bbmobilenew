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
    id: "pregnancy_claim",
    category: "pregnancy_parenthood",
    tone: "bad",
    weight: 1.35,
    cooldownGroup: "pregnancy_claim",
    badge: "PREGNANCY BOMBSHELL",
    eligibility: {},
    headlines: [
      "{name} Hit by a Pregnancy Bombshell",
      "A Former Partner Names {name} in Shocking Pregnancy Reveal",
      "The Timeline That Put {name} at the Center of a Baby Scandal",
      "{name}'s Post-Show Romance Takes an Unexpected Turn",
    ],
    setups: [
      "Weeks after the finale, a former partner announces a pregnancy and says {name} is the other parent.",
      "A private pregnancy announcement involving {name} leaks before either side is ready to speak.",
      "A clinic appointment photographed by tabloids triggers rumors that {name} is about to become a parent.",
      "An ex from before the show returns with news that instantly changes {name}'s post-season plans.",
    ],
    escalations: [
      "Conflicting timelines spread online, and people close to both sides begin giving contradictory interviews.",
      "A leaked message suggests the truth was known before the reunion, turning a private situation into a public scandal.",
      "Family members enter the dispute and accuse management teams of turning the pregnancy into publicity.",
      "The story intensifies when a second person claims to have seen documents that contradict the first public statement.",
    ],
    outcomes: [
      "{name} confirms involvement but asks the public to stop treating a family matter like a vote.",
      "The parties release a joint statement, refuse further details, and disappear from public view for several months.",
      "A later update settles the central question and forces {name} to rebuild several damaged relationships.",
      "The scandal cools only after {name} chooses a quieter life and begins preparing for an unexpected new role.",
    ],
    twists: [
      "The first leak came from a relative, not a tabloid.",
      "The reunion producers had footage hinting at the story but chose not to air it.",
      "A person loudly claiming insider knowledge turns out to have invented the entire middle chapter.",
      "The announcement becomes the one subject every former housemate refuses to discuss.",
    ],
  },
  {
    id: "expecting_together",
    category: "pregnancy_parenthood",
    tone: "good",
    weight: 1.2,
    cooldownGroup: "pregnancy_parenthood",
    badge: "NEW CHAPTER",
    eligibility: { tagsAny: ['romance'], requiresRelation: 'romantic' },
    headlines: [
      "{name} and {romanticName} Are Expecting",
      "House Romance Becomes a Family",
      "{name}'s Biggest Post-Show Surprise Is Personal",
      "From Finale Night to Baby News",
    ],
    setups: [
      "{name} and {romanticName} keep a pregnancy private for months after leaving the house.",
      "A routine interview takes an emotional turn when {name} reveals that the relationship with {romanticName} has entered a new chapter.",
      "Fans notice {name} and {romanticName} quietly stepping away from nightlife and public events without explanation.",
      "The couple disappears from social media just as rumors begin that they are preparing for a baby.",
    ],
    escalations: [
      "Speculation becomes intense after former housemates are seen arriving at a private family dinner.",
      "A gift bag accidentally visible in a livestream gives away the news before the planned announcement.",
      "The couple argues with management over whether the announcement should be sold as an exclusive.",
      "A false breakup rumor spreads at exactly the moment the pair is trying to keep the pregnancy out of the press.",
    ],
    outcomes: [
      "They eventually announce the news on their own terms and become unexpectedly protective of their private life.",
      "{name} and {romanticName} reject a lucrative reality special and choose a low-profile pregnancy instead.",
      "The reveal turns their chaotic showmance into the most stable relationship to come out of the season.",
      "They return months later with a simple photo and no sponsorships, surprising almost everyone.",
    ],
    twists: [
      "The cast had known for weeks and somehow kept the secret.",
      "The first congratulatory message comes from the housemate least expected to support them.",
      "A magazine prints the wrong due month and creates a second wave of rumors.",
      "The couple names no brands, despite receiving dozens of offers.",
    ],
  },
  {
    id: "altar_disappearance",
    category: "marriage_breakup",
    tone: "tragic",
    weight: 1.1,
    cooldownGroup: "wedding_disaster",
    badge: "LEFT AT THE ALTAR",
    eligibility: { tagsAny: ['romance'], requiresRelation: 'romantic' },
    headlines: [
      "{name}'s Wedding Ends Before the Vows",
      "A Missing Bridegroom, a Full Church, and {name}",
      "The Ceremony That Became a Search Party",
      "{name} Faces the Ultimate Wedding Shock",
    ],
    setups: [
      "{name} and {romanticName} plan a private wedding only for details to leak days before the ceremony.",
      "After months of public declarations, {name} arrives for a wedding with {romanticName} expecting the cameras to stay outside.",
      "A heavily guarded ceremony is arranged for {name} and {romanticName} after repeated rumors that the relationship is unstable.",
      "The cast gathers for what is supposed to be the most glamorous wedding of the year.",
    ],
    escalations: [
      "{romanticName} vanishes hours before the vows, leaving a phone, a handwritten note, and several furious relatives behind.",
      "One side of the wedding party abruptly leaves after a private argument nobody will explain.",
      "A message sent minutes before the ceremony suggests one partner learned something devastating that morning.",
      "Guests are asked to remain seated while the wedding planner quietly removes one name from every sign.",
    ],
    outcomes: [
      "The wedding is cancelled, and {name} disappears from public life while lawyers untangle contracts tied to the event.",
      "{name} gives one brief statement, ends the relationship, and refuses to reveal what happened until months later.",
      "The couple never reaches the altar, and the breakup becomes the season's most discussed post-show scandal.",
      "{name} eventually returns without the ring and says only that the truth was worse than the rumors.",
    ],
    twists: [
      "The missing partner had already checked into a hotel under another name.",
      "A bridesmaid knew the ceremony would collapse and told nobody.",
      "The wedding video becomes evidence in a later legal dispute.",
      "The venue keeps the deposit and books a reunion special in the same ballroom.",
    ],
  },
  {
    id: "affair_photos",
    category: "cheating_scandal",
    tone: "bad",
    weight: 1.35,
    cooldownGroup: "affair",
    badge: "AFFAIR EXPOSED",
    eligibility: { tagsAny: ['romance'], requiresRelation: 'romantic' },
    headlines: [
      "Secret Photos Rock {name}'s Romance",
      "{name}, {romanticName}, and the Hotel Balcony Mystery",
      "A Midnight Sighting Blows Up the Showmance",
      "The Affair Rumor {name} Cannot Ignore",
    ],
    setups: [
      "{name} and {romanticName} are still publicly together when photographs place {name} with someone else after midnight.",
      "A supposedly private weekend for {name} becomes tabloid news after a hotel guest recognizes the former housemate.",
      "The relationship with {romanticName} appears stable until a sequence of late-night photographs begins circulating.",
      "{name} is seen leaving a private apartment hours after posting a romantic tribute to {romanticName}.",
    ],
    escalations: [
      "{romanticName} unfollows {name}, then deletes every photograph from the relationship within minutes.",
      "A voice note leaks in which somebody appears to warn {name} that the story is about to break.",
      "The mystery companion gives a short interview that contradicts {name}'s first explanation.",
      "Former housemates take sides publicly, turning the relationship crisis into a cast-wide feud.",
    ],
    outcomes: [
      "{name} admits crossing a line, and the relationship with {romanticName} ends in a joint statement that reads anything but joint.",
      "The pair separates while insisting the full story is more complicated than the photographs suggest.",
      "{name} denies an affair but confirms the relationship with {romanticName} is over.",
      "Months later, {name} and {romanticName} attempt a reconciliation that lasts only long enough to restart the headlines.",
    ],
    twists: [
      "The photographer was invited to the building by someone close to the couple.",
      "The mystery companion had previously dated another housemate.",
      "One photograph was taken weeks earlier than the tabloid claimed.",
      "A second batch of images changes which partner the public believes.",
    ],
  },
  {
    id: "love_triangle",
    category: "cheating_scandal",
    tone: "bad",
    weight: 1.15,
    cooldownGroup: "love_triangle",
    badge: "LOVE TRIANGLE",
    eligibility: { tagsAny: ['romance'], requiresRelation: 'romantic' },
    headlines: [
      "{name} Caught in a Three-Way Romance Scandal",
      "The Love Triangle Nobody Saw Coming",
      "Two Relationships, One Impossible Timeline",
      "{name}'s Secret Messages Ignite a Cast War",
    ],
    setups: [
      "{name}'s relationship with {romanticName} is thrown into chaos when private messages with a second person surface.",
      "A reunion afterparty exposes a second romantic connection that overlaps with {name}'s relationship with {romanticName}.",
      "Fans reconstruct weeks of deleted posts and conclude that {name} may have been maintaining two relationships.",
      "A former flame reappears just as {name} and {romanticName} begin discussing moving in together.",
    ],
    escalations: [
      "The second person releases timestamps, while {romanticName} says the timeline proves a betrayal.",
      "Three different versions of the same weekend are published within twenty-four hours.",
      "A private group chat leaks and shows friends warning {name} that the situation was becoming impossible to hide.",
      "The argument moves from private messages to live television after both sides accept separate interview invitations.",
    ],
    outcomes: [
      "{name} loses both relationships and spends months trying to repair friendships damaged by the fallout.",
      "The triangle ends with {romanticName} walking away and the second relationship collapsing under public pressure.",
      "{name} chooses one relationship, but the decision creates a permanent split in the former cast.",
      "Nobody gets the clean ending they expected, and the story continues through several contradictory reunions.",
    ],
    twists: [
      "The two partners eventually compare messages and become friends.",
      "A producer had warned {name} that the overlap would be discovered.",
      "The most damaging screenshot turns out to be real but badly out of context.",
      "The cast member defending {name} most loudly later changes sides.",
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

export const AFTER_EYE_SCENARIOS_1: ScenarioSpec[] = DRAMA_TEMPLATES.flatMap(compileTemplate)
