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
    id: "secret_marriage",
    category: "romance",
    tone: "excellent",
    weight: 1.1,
    cooldownGroup: "secret_marriage",
    badge: "SECRETLY MARRIED",
    eligibility: { tagsAny: ['romance'], requiresRelation: 'romantic' },
    headlines: [
      "{name} and {romanticName} Secretly Married",
      "The Marriage Hidden From Everyone",
      "No Cameras, No Sponsors, Just Vows",
      "{name}'s Biggest Secret Was a Wedding Ring",
    ],
    setups: [
      "{name} and {romanticName} quietly marry after telling friends they are taking a short vacation.",
      "Months of breakup rumors hide the fact that {name} and {romanticName} have already exchanged vows.",
      "A courthouse record reveals that {name} and {romanticName} married long before the reunion special.",
      "The couple rejects a televised wedding and disappears for a ceremony attended by fewer than ten people.",
    ],
    escalations: [
      "The secret unravels when a hotel accidentally addresses the pair by a shared surname.",
      "A former housemate notices matching rings during an unrelated livestream.",
      "A legal document appears online and sends fan communities into detective mode.",
      "Their management teams deny the rumor for hours before realizing the paperwork is public.",
    ],
    outcomes: [
      "The pair confirms the marriage and says keeping one thing private was the best decision they made after the show.",
      "{name} and {romanticName} emerge stronger than expected and turn down offers for a wedding reenactment.",
      "The marriage becomes the rare post-season surprise that actually improves both reputations.",
      "They celebrate publicly only after the story is already impossible to contain.",
    ],
    twists: [
      "The witness was a former rival from the house.",
      "The rings were bought months before the finale.",
      "The couple's families met for the first time at the ceremony.",
      "A fake breakup announcement had been planned to protect the date.",
    ],
  },
  {
    id: "family_sibling",
    category: "family_secret",
    tone: "neutral",
    weight: 1.15,
    cooldownGroup: "family_secret",
    badge: "FAMILY SECRET",
    eligibility: {},
    headlines: [
      "A Stranger Claims to Be {name}'s Sibling",
      "The Family Secret That Found {name} on Television",
      "One Message Rewrites {name}'s Family History",
      "DNA Rumors Surround {name} After the Finale",
    ],
    setups: [
      "A stranger contacts {name} after the finale claiming they share a parent nobody has discussed publicly.",
      "An old family photograph posted online raises questions about a possible sibling {name} never knew existed.",
      "A private message from another country tells {name} that the family story told for years may be incomplete.",
      "A genealogy search carried out by a relative unexpectedly links {name} to another family.",
    ],
    escalations: [
      "Relatives give conflicting accounts, and an old birth record becomes the focus of intense speculation.",
      "{name} initially dismisses the claim until dates and photographs begin matching private family memories.",
      "The alleged sibling refuses payment for interviews and asks only for a private meeting.",
      "A tabloid offers both sides money for a DNA test, which {name} publicly rejects.",
    ],
    outcomes: [
      "{name} confirms a new family connection but asks that the relationship continue away from cameras.",
      "The claim remains partly unresolved, leaving {name} with more questions than answers.",
      "A private meeting takes place, and both sides later describe the result as life-changing without giving details.",
      "The public mystery fades while a cautious private relationship begins.",
    ],
    twists: [
      "The person who first leaked the story was trying to stop the meeting, not promote it.",
      "A relative who denied everything had known for decades.",
      "The alleged sibling had never watched the show.",
      "The most sensational tabloid detail proves to be completely false.",
    ],
  },
  {
    id: "inheritance",
    category: "financial_success",
    tone: "excellent",
    weight: 0.9,
    cooldownGroup: "inheritance",
    badge: "FORTUNE REVEALED",
    eligibility: {},
    headlines: [
      "{name} Inherits a Fortune From a Near Stranger",
      "A Secret Will Changes {name}'s Life",
      "The Estate Nobody Expected",
      "{name}'s Post-Show Payday Has Nothing to Do With Fame",
    ],
    setups: [
      "{name} is named in the will of a distant relative the family rarely discussed.",
      "A lawyer contacts {name} about an estate connected to a branch of the family thought to have disappeared.",
      "An elderly family friend leaves {name} a property and a sealed letter explaining a decades-old debt.",
      "A forgotten inheritance case reopens just weeks after {name} leaves the house.",
    ],
    escalations: [
      "Several relatives challenge the will and accuse {name} of benefiting from family secrets.",
      "The estate includes a valuable property but also documents that expose an old conflict.",
      "A second claimant appears with a competing version of the will.",
      "The money becomes secondary when the legal file reveals why {name} was chosen.",
    ],
    outcomes: [
      "{name} keeps part of the estate, settles with the family, and uses the money to build a far quieter life.",
      "The dispute ends in mediation, leaving {name} financially secure but permanently estranged from several relatives.",
      "{name} wins the case and places part of the inheritance into a family trust.",
      "The estate is divided, but the letter changes {name}'s understanding of the family more than the money does.",
    ],
    twists: [
      "The most valuable item in the estate is not the house but a forgotten collection in storage.",
      "One relative fighting the will later becomes {name}'s closest ally.",
      "The sealed letter contains an apology written years before the show.",
      "The lawyer handling the case turns out to be a fan of the season.",
    ],
  },
  {
    id: "blackmail_audio",
    category: "crime_scandal",
    tone: "bad",
    weight: 1.25,
    cooldownGroup: "blackmail",
    badge: "BLACKMAIL CLAIM",
    eligibility: { tagsAny: ['rivalry', 'controversial'], requiresRelation: 'rival' },
    headlines: [
      "{name} Says Someone Tried to Blackmail Them",
      "A Secret Recording Puts {name} and {rivalName} at War",
      "Cash, Audio, and a Threat to Go Public",
      "{name}'s Feud Takes a Criminal Turn",
    ],
    setups: [
      "{name} receives a demand for money in exchange for keeping a private recording out of the press.",
      "An anonymous account sends {name} clips from a conversation that was never meant to leave a private room.",
      "A person claiming access to damaging audio contacts both {name} and {rivalName}.",
      "The feud between {name} and {rivalName} escalates when an intermediary offers to sell a secret recording.",
    ],
    escalations: [
      "{name} refuses to pay and reports the demand, while excerpts begin appearing online anyway.",
      "{rivalName} denies involvement, but old messages make the public suspicious of everyone around the feud.",
      "Lawyers warn both sides to stop speaking publicly as police begin reviewing the messages.",
      "A second demand arrives from a different account, suggesting the recording has been copied.",
    ],
    outcomes: [
      "The blackmail attempt becomes a formal investigation, and {name} withdraws from public appearances until it is resolved.",
      "{name} is cleared of the rumor at the center of the recording, but the feud with {rivalName} becomes permanent.",
      "Authorities identify a third party behind the demand, leaving both former rivals embarrassed by months of accusations.",
      "The recording is eventually released and proves far less damaging than the blackmail itself.",
    ],
    twists: [
      "The original recording came from a device neither {name} nor {rivalName} owned.",
      "The person demanding money had never met either housemate.",
      "A heavily edited clip had reversed the meaning of the conversation.",
      "{rivalName} ultimately provides evidence that helps {name}.",
    ],
  },
  {
    id: "jewelry_arrest",
    category: "crime_scandal",
    tone: "tragic",
    weight: 0.95,
    cooldownGroup: "crime_arrest",
    badge: "ARREST SHOCK",
    eligibility: {},
    headlines: [
      "{name} Questioned After Luxury Jewelry Vanishes",
      "A Party, a Missing Necklace, and {name}",
      "Police Enter {name}'s Post-Show Story",
      "The Night That Turned Into a Criminal Investigation",
    ],
    setups: [
      "{name} attends a private celebrity party where an expensive piece of jewelry disappears before dawn.",
      "A luxury event becomes a police matter after a borrowed necklace cannot be found and security footage places {name} nearby.",
      "Hours after posing for photographers, {name} is contacted by investigators about property missing from the same venue.",
      "A host reports valuables missing after an afterparty attended by {name} and several unnamed guests.",
    ],
    escalations: [
      "{name} is questioned, tabloids report an arrest before facts are clear, and sponsors suspend campaigns.",
      "A witness changes their story twice, while a blurry security clip is treated online as definitive proof.",
      "The missing item appears in a vehicle connected to the event, deepening suspicion without establishing who put it there.",
      "Lawyers demand corrections as false details spread faster than the official investigation.",
    ],
    outcomes: [
      "{name} is released while the investigation continues, but the reputational damage arrives immediately.",
      "The case against {name} weakens, yet several contracts do not return.",
      "Another suspect eventually emerges, leaving {name} legally safer but publicly shaken.",
      "No charge survives scrutiny, but {name} describes the episode as the moment fame stopped feeling glamorous.",
    ],
    twists: [
      "The jewelry had been moved by event staff before anyone called police.",
      "A viral 'security video' was from a different night.",
      "The person who first accused {name} later retracts the statement.",
      "The missing item is recovered from a location searched on the first day.",
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

export const AFTER_EYE_SCENARIOS_2: ScenarioSpec[] = DRAMA_TEMPLATES.flatMap(compileTemplate)
