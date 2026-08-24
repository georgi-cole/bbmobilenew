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
    id: "relapse_scandal",
    category: "addiction_recovery",
    tone: "bad",
    weight: 0.9,
    cooldownGroup: "relapse",
    badge: "RELAPSE FEARS",
    eligibility: {},
    headlines: [
      "Friends Fear {name} Is Spiraling Again",
      "A Chaotic Night Raises New Concerns for {name}",
      "{name}'s Recovery Faces a Public Setback",
      "The Comeback That Stopped Overnight",
    ],
    setups: [
      "{name} returns to public life after a period of recovery and initially appears stable.",
      "After months away from nightlife, {name} begins attending increasingly intense public events again.",
      "A successful comeback tour places {name} under the same pressures that preceded an earlier treatment break.",
      "Friends become concerned when {name} misses work and stops responding after several high-profile nights out.",
    ],
    escalations: [
      "A confusing public appearance fuels relapse rumors, though people close to {name} warn against diagnosing from clips.",
      "Management cancels several events without explanation while friends travel to stay with {name}.",
      "An argument outside a venue is filmed and replayed widely, worsening a situation that had been private.",
      "The pressure peaks when an unreliable tabloid publishes medical claims that the family immediately rejects.",
    ],
    outcomes: [
      "{name} steps back into treatment and asks the public to treat the setback as a health matter, not a scandal.",
      "The tour is cancelled, and {name} returns to recovery with a stronger boundary between treatment and publicity.",
      "{name} acknowledges a setback without giving details and disappears from the public eye again.",
      "The episode damages several contracts but ultimately pushes {name} back toward structured support.",
    ],
    twists: [
      "The most viral clip was filmed hours before the incident people thought it showed.",
      "A former castmate publicly apologizes for making the situation worse.",
      "Management had wanted {name} to continue working despite warnings from friends.",
      "The cancelled tour later resumes only after a long break.",
    ],
  },
  {
    id: "disappearance_return",
    category: "disappearance",
    tone: "neutral",
    weight: 1.0,
    cooldownGroup: "disappearance",
    badge: "MISSING, THEN FOUND",
    eligibility: {},
    headlines: [
      "{name} Vanishes for Eleven Days",
      "Where Did {name} Go?",
      "A Missing Phone, Cancelled Flights, and No Explanation",
      "{name} Returns After a Bizarre Disappearance",
    ],
    setups: [
      "{name} misses two booked appearances, stops answering messages, and appears to leave home without a phone.",
      "Friends report losing contact with {name} after a sudden decision to cancel every public commitment.",
      "A missed flight and an abandoned social account trigger concern when nobody close to {name} can explain the silence.",
      "{name} disappears from the celebrity circuit so completely that management files a missing-person report.",
    ],
    escalations: [
      "False sightings spread across several cities while family members ask amateur investigators to stop interfering.",
      "A parked car is found in another region, creating a wave of theories that grow more dramatic by the hour.",
      "Former housemates coordinate privately while tabloids publish increasingly implausible explanations.",
      "The situation becomes national news after a scheduled live interview airs with an empty chair.",
    ],
    outcomes: [
      "{name} returns safely and says the disappearance was a deliberate escape from pressure, not a crime.",
      "The search ends when {name} contacts family from a remote location and asks for privacy.",
      "{name} reappears, ends several management contracts, and refuses to explain every missing day.",
      "The episode closes without a sensational answer, but {name}'s relationship with fame changes permanently.",
    ],
    twists: [
      "The person reporting the first 'sighting' later admits guessing.",
      "{name} had left written instructions that management failed to pass to family.",
      "A former rival knew {name} was safe but had promised not to say where.",
      "The empty-chair interview becomes more famous than the explanation.",
    ],
  },
  {
    id: "witness_secret",
    category: "secret_life",
    tone: "neutral",
    weight: 0.85,
    cooldownGroup: "secret_life",
    badge: "DOUBLE LIFE?",
    eligibility: {},
    headlines: [
      "{name}'s Hidden Past Surfaces",
      "The Name {name} Used Before the Show",
      "A Sealed Court File Triggers Wild Questions",
      "What Was {name} Keeping Secret?",
    ],
    setups: [
      "An old legal record links {name} to a different surname and a period of life never mentioned on the show.",
      "A local newspaper archive reveals that {name} once gave evidence in a case that received regional attention.",
      "A former acquaintance claims {name} deliberately hid an important chapter of life before entering the house.",
      "Documents circulated online show {name} living under a different surname years before becoming a contestant.",
    ],
    escalations: [
      "Speculation jumps immediately to criminal theories, even though the documents do not show {name} accused of any crime.",
      "{name}'s representatives threaten action against outlets inventing details around a protected legal matter.",
      "A retired reporter confirms part of the history but refuses to reveal why the name changed.",
      "People connected to the old case ask the press to stop reopening events that affected several families.",
    ],
    outcomes: [
      "{name} explains only that the old identity was connected to personal safety and leaves the rest private.",
      "The scandal fades when official records show the most dramatic claims were false.",
      "{name} confirms the documents are real but refuses to turn a difficult past into entertainment.",
      "The mystery remains partly unresolved, and public interest eventually shifts elsewhere.",
    ],
    twists: [
      "The old surname had been visible in public records all along.",
      "The person who revived the story was trying to defend {name}.",
      "A tabloid quietly removes its most dramatic claim after receiving a legal letter.",
      "Another housemate admits learning the truth during casting and keeping it private.",
    ],
  },
  {
    id: "career_comeback",
    category: "career_triumph",
    tone: "excellent",
    weight: 1.0,
    cooldownGroup: "career_comeback",
    badge: "COMEBACK KING",
    eligibility: { tagsAny: ['winner', 'runner_up', 'fan_favorite', 'early_exit'] },
    headlines: [
      "{name} Pulls Off the Comeback Nobody Predicted",
      "One Role Changes Everything for {name}",
      "From Reality TV to Serious Success",
      "{name} Finally Finds the Right Spotlight",
    ],
    setups: [
      "{name}'s first months after the show are messy and full of failed sponsorships.",
      "Several reality offers collapse before {name} accepts a much smaller opportunity outside the usual celebrity circuit.",
      "After being dismissed as a short-lived reality personality, {name} takes an unexpected professional risk.",
      "{name} disappears from entertainment news and quietly trains for a new career.",
    ],
    escalations: [
      "The new project attracts attention because {name} is far better at it than critics expected.",
      "A small role becomes a breakout moment and forces former skeptics to reassess the entire post-show trajectory.",
      "Industry figures begin calling after a performance that was never supposed to receive national attention.",
      "A single appearance goes viral for skill rather than scandal, changing the tone around {name} almost overnight.",
    ],
    outcomes: [
      "{name} builds a durable career that eventually matters more than the season that created the fame.",
      "The comeback succeeds because {name} stops chasing celebrity and starts treating the work seriously.",
      "{name} becomes one of the few housemates whose second act is bigger than the first.",
      "Years later, the reality-show label is a footnote rather than the headline.",
    ],
    twists: [
      "The opportunity came from someone who originally refused to meet {name}.",
      "The first contract paid less than a single sponsored post.",
      "A former rival publicly becomes one of {name}'s biggest supporters.",
      "The project was almost cancelled before release.",
    ],
  },
  {
    id: "career_collapse",
    category: "career_disaster",
    tone: "bad",
    weight: 1.0,
    cooldownGroup: "career_collapse",
    badge: "CAREER FREEFALL",
    eligibility: { tagsAny: ['winner', 'runner_up', 'fan_favorite', 'controversial'] },
    headlines: [
      "{name}'s Post-Show Empire Collapses in One Week",
      "Sponsors Abandon {name} After Scandal",
      "Seven Deals, Seven Cancellations",
      "The Fame Machine Turns on {name}",
    ],
    setups: [
      "{name} signs a rapid series of sponsorships and television deals immediately after the finale.",
      "A management team builds an aggressive celebrity brand around {name} within days of leaving the house.",
      "For several months, {name} appears to be the season's biggest commercial success.",
      "A packed schedule leaves {name} moving from one endorsement to another with almost no control over the messaging.",
    ],
    escalations: [
      "An old recording resurfaces, context is disputed, and brands begin suspending deals before {name} can respond.",
      "A disastrous interview creates a second controversy while the first is still unfolding.",
      "Management issues contradictory apologies that make the situation significantly worse.",
      "Several companies invoke morality clauses on the same afternoon, creating the appearance of total collapse.",
    ],
    outcomes: [
      "{name} loses most of the commercial empire and spends the next year rebuilding without the original management team.",
      "The collapse ends the first version of {name}'s celebrity career, though a quieter comeback remains possible.",
      "{name} survives financially but becomes far less marketable and far more cautious.",
      "The scandal burns through almost every fast deal signed after the season.",
    ],
    twists: [
      "The manager who wrote the worst apology is fired before sunset.",
      "One sponsor stays and gains public praise for waiting for more facts.",
      "The resurfaced recording had already been reviewed during casting.",
      "The scandal later becomes a case study in crisis-management courses.",
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

export const AFTER_EYE_SCENARIOS_4: ScenarioSpec[] = DRAMA_TEMPLATES.flatMap(compileTemplate)
