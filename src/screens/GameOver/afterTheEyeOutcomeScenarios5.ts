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
    id: 'financial_collapse',
    category: 'financial_ruin',
    tone: 'tragic',
    weight: 0.95,
    cooldownGroup: 'financial_ruin',
    badge: 'BROKE AFTER FAME',
    eligibility: {},
    headlines: [
      '{name} Burns Through the Post-Show Fortune',
      'The Mansion, the Loans, and the Collapse',
      "{name}'s Celebrity Lifestyle Ends in Debt",
      'Fame Made {name} Rich — Briefly',
    ],
    setups: [
      '{name} upgrades almost every part of life after the show, assuming the highest-paying months will continue forever.',
      "A new house, staff, travel, and risky investments turn {name}'s sudden income into equally sudden expenses.",
      '{name} builds a luxury lifestyle around projected earnings rather than money already received.',
      'The first year after the season looks wildly successful from the outside and increasingly unstable on paper.',
    ],
    escalations: [
      'Several deals end at once, tax demands arrive, and a business investment stops returning calls.',
      'Creditors begin filing claims while {name} continues posting from a lifestyle that is mostly financed.',
      'An accountant resigns and later says the warnings had been ignored for months.',
      'A property sale meant to solve the problem reveals that even more debt is attached to the assets.',
    ],
    outcomes: [
      '{name} sells most of the visible symbols of fame and starts rebuilding finances from a much smaller base.',
      'Bankruptcy proceedings end the extravagant chapter and expose how little of the apparent fortune was real.',
      '{name} avoids total insolvency only through a painful restructuring and several years of reduced spending.',
      'The financial collapse becomes more sobering than any eviction night.',
    ],
    twists: [
      'The most expensive car was leased, not owned.',
      'A supposedly profitable side business had never made money.',
      'A former housemate had warned {name} not to sign the largest loan.',
      'One quiet investment survives and later helps fund the recovery.',
    ],
  },
  {
    id: 'defamation_feud',
    category: 'public_feud',
    tone: 'bad',
    weight: 1.1,
    cooldownGroup: 'public_feud',
    badge: 'LAWSUIT FEUD',
    eligibility: { tagsAny: ['rivalry'], requiresRelation: 'rival' },
    headlines: [
      '{name} Sues {rivalName} as the Feud Explodes',
      'The Rivalry Leaves Social Media and Enters Court',
      'One Accusation Too Far',
      '{name} and {rivalName}: From Eviction Night to Legal Fight',
    ],
    setups: [
      'The feud between {name} and {rivalName} continues after the show through interviews, podcasts, and increasingly personal claims.',
      '{rivalName} makes an accusation during a livestream that {name} says is demonstrably false.',
      'Months of subtweets become explicit when {name} and {rivalName} start naming each other in public interviews.',
      'A reunion argument is followed by weeks of escalating allegations between {name} and {rivalName}.',
    ],
    escalations: [
      '{name} sends a legal notice, {rivalName} posts it online, and the dispute becomes larger overnight.',
      'Both sides begin releasing screenshots while lawyers ask them to stop communicating publicly.',
      'Sponsors distance themselves as the feud shifts from entertainment to potential defamation.',
      'A scheduled debate is cancelled after legal teams warn that anything said on stage could become evidence.',
    ],
    outcomes: [
      'The case settles privately, but {name} and {rivalName} never repair the relationship.',
      'Both sides retract specific claims without offering the public the dramatic courtroom ending it expected.',
      '{name} wins a limited legal victory that clarifies one allegation but leaves the broader feud alive.',
      'The lawsuit drains attention, money, and goodwill from both former housemates.',
    ],
    twists: [
      'The settlement includes a clause preventing either side from discussing the settlement.',
      'A screenshot central to the feud turns out to have been forwarded by a third housemate.',
      'The interview host who triggered the dispute later apologizes.',
      'The pair is eventually photographed at the same event, seated at opposite ends of the room.',
    ],
  },
  {
    id: 'ally_betrayal',
    category: 'betrayal',
    tone: 'tragic',
    weight: 1.15,
    cooldownGroup: 'betrayal',
    badge: 'ULTIMATE BETRAYAL',
    eligibility: { tagsAny: ['betrayal', 'alliance_broken'], requiresRelation: 'ally' },
    headlines: [
      "{name}'s Closest Ally Sells the Story",
      'Private Messages Destroy a Post-Show Friendship',
      'The Alliance Ends With a Leak',
      '{name} Learns Loyalty Has a Price',
    ],
    setups: [
      '{name} stays close to {allyName} after the season and shares private details about family, money, and relationships.',
      'A former alliance between {name} and {allyName} appears stronger outside the house than it ever did inside.',
      '{name} and {allyName} begin planning joint work while privately rebuilding trust after the game.',
      'The friendship with {allyName} becomes one of the few parts of post-show life {name} believes is real.',
    ],
    escalations: [
      'A tabloid publishes private messages that could only have come from a very small circle around {name}.',
      '{name} discovers that personal information was offered to multiple outlets during contract negotiations.',
      'An unpublished interview transcript reveals details {name} had told only {allyName}.',
      'A payment record links someone close to the alliance with the outlet that broke the story.',
    ],
    outcomes: [
      '{name} ends the friendship and describes the betrayal as worse than anything that happened in the house.',
      'The alliance collapses permanently, taking several mutual friendships with it.',
      '{allyName} denies selling the story but admits sharing information with someone who did.',
      '{name} withdraws from the joint projects and becomes far more guarded with former castmates.',
    ],
    twists: [
      'The payment was for a different story, complicating the accusation without repairing the friendship.',
      'A mutual friend had warned {name} months earlier.',
      'Part of the leak came from management, not {allyName}.',
      'The two eventually exchange apologies but never become close again.',
    ],
  },
  {
    id: 'death_hoax',
    category: 'bizarre_misunderstanding',
    tone: 'neutral',
    weight: 0.7,
    cooldownGroup: 'death_hoax',
    badge: 'DEATH HOAX',
    eligibility: {},
    headlines: [
      'Internet Falsely Declares {name} Dead',
      '{name} Wakes Up to Their Own Obituary',
      'A Death Hoax Sends Fans Into Panic',
      "The Most Disturbing Rumor of {name}'s Post-Show Life",
    ],
    setups: [
      'A fake screenshot claiming {name} has died begins circulating overnight.',
      'A parody account posts a convincing breaking-news graphic about {name} that loses its original context within minutes.',
      'An old photograph and an unrelated accident report are combined into a false story about {name}.',
      'Fans wake to thousands of posts mourning {name} despite no legitimate source reporting a death.',
    ],
    escalations: [
      'Family phones are overwhelmed, former housemates post confused tributes, and the rumor reaches international fan pages.',
      'A small website copies the claim without checking it, giving the hoax an appearance of legitimacy.',
      'Management cannot reach {name} for several hours because the phone is switched off, making the panic worse.',
      'Brands and media accounts begin drafting condolences before anyone confirms the basic facts.',
    ],
    outcomes: [
      '{name} posts a brief video proving they are alive and condemns the hoax as cruel rather than funny.',
      'The rumor is corrected, but {name} takes a long break from social media after seeing strangers debate the supposed death.',
      '{name} returns safely and asks platforms to act faster on impersonation and fabricated death reports.',
      "The episode ends without physical harm but leaves {name}'s family furious at the machinery of viral misinformation.",
    ],
    twists: [
      'The original post had fewer than fifty followers before it went viral.',
      'One tribute was written by a rival who had not spoken to {name} in years.',
      '{name} was asleep on a flight during the worst of the panic.',
      'The fake graphic used a photograph from the season finale.',
    ],
  },
]

function pick(values: string[], templateIndex: number, variantIndex: number, salt: number): string {
  const cycle = Math.floor(variantIndex / values.length)
  const index =
    (templateIndex * (salt + 3) + variantIndex * (salt * 2 + 1) + cycle * (salt + 1) + salt) %
    values.length
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

export const AFTER_EYE_SCENARIOS_5: ScenarioSpec[] = DRAMA_TEMPLATES.flatMap(compileTemplate)
