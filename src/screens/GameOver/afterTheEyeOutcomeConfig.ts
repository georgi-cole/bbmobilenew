import { AFTER_EYE_LINKED_SCENARIOS } from './afterTheEyeOutcomeLinkedScenarios'
import { AFTER_EYE_SCENARIOS_1 } from './afterTheEyeOutcomeScenarios1'
import { AFTER_EYE_SCENARIOS_2 } from './afterTheEyeOutcomeScenarios2'
import { AFTER_EYE_SCENARIOS_3 } from './afterTheEyeOutcomeScenarios3'
import { AFTER_EYE_SCENARIOS_4 } from './afterTheEyeOutcomeScenarios4'
import { AFTER_EYE_SCENARIOS_5 } from './afterTheEyeOutcomeScenarios5'
import type { BundledAftermathTone } from './afterTheEyeOutcomeTypes'

const EDITORIAL = {
  publicationName: 'AFTER THE EYE',
  slogan: 'All the gossip the cameras missed',
  editionLabel: 'Late Edition',
  sectionLabel: 'What Happened Next?',
  price: '$2.99',
  issuePrefix: 'ISSUE',
  intro: 'The doors closed. The microphones came off. The real chaos had only just begun.',
  closingLine: 'Every story is fictional post-season satire generated from the season you played.',
  photoCaption: 'Post-show sighting. Details remain gloriously disputed.',
  exclusiveLabel: 'EXCLUSIVE',
  loadingLabel: 'Printing the late edition…',
}

const TONE_LABELS: Record<BundledAftermathTone, string> = {
  excellent: 'Spectacular',
  good: 'Promising',
  neutral: 'Strange',
  bad: 'Messy',
  tragic: 'Catastrophic',
}

const CATEGORIES: Record<string, string> = {
  sudden_fame: 'Sudden Fame',
  career_triumph: 'Career Triumph',
  career_disaster: 'Career Disaster',
  romance: 'Romance',
  cheating_scandal: 'Cheating Scandal',
  public_feud: 'Public Feud',
  betrayal: 'Betrayal',
  financial_success: 'Financial Success',
  financial_ruin: 'Financial Ruin',
  legal_trouble: 'Legal Trouble',
  destructive_excess: 'Fame & Excess',
  recovery_redemption: 'Recovery & Redemption',
  strange_business: 'Strange Business',
  social_media: 'Social Media',
  reality_tv_obsession: 'Reality-TV Obsession',
  conspiracy: 'Conspiracy',
  disappearance: 'Disappearance',
  ordinary_life: 'Unexpectedly Ordinary',
  bizarre_misunderstanding: 'Bizarre Misunderstanding',
  absurd_success: 'Absurd Success',
}

const SCENARIO_SPECS = [
  ...AFTER_EYE_SCENARIOS_1,
  ...AFTER_EYE_SCENARIOS_2,
  ...AFTER_EYE_SCENARIOS_3,
  ...AFTER_EYE_SCENARIOS_4,
  ...AFTER_EYE_SCENARIOS_5,
]

function lowerFirst(value: string): string {
  if (!value) return value
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`
}

function expandBeats(beats: [string, string, string], index: number) {
  const [setup, escalation, outcome] = beats
  const bodyVariants = [
    `${setup} ${escalation} ${outcome}`,
    `It begins when ${lowerFirst(setup)} Soon, ${lowerFirst(escalation)} In the end, ${lowerFirst(outcome)}`,
    `At first, ${lowerFirst(setup)} The situation escalates when ${lowerFirst(escalation)} By the final update, ${lowerFirst(outcome)}`,
    `Nobody expects the story to go this far. ${setup} Then ${lowerFirst(escalation)} Finally, ${lowerFirst(outcome)}`,
  ]
  return {
    subheadlines: [`${setup} ${outcome}`, `${escalation} The ending becomes impossible to ignore.`],
    bodies: [
      bodyVariants[index % bodyVariants.length],
      bodyVariants[(index + 1) % bodyVariants.length],
    ],
    bulletPoints: [setup, escalation, outcome],
  }
}

export function createBundledAfterTheEyeConfig() {
  return {
    version: 1 as const,
    editorial: { ...EDITORIAL },
    toneLabels: { ...TONE_LABELS },
    categories: { ...CATEGORIES },
    scenarios: SCENARIO_SPECS.map((spec, index) => ({
      ...spec,
      ...expandBeats(spec.beats, index),
    })).map(({ beats: _beats, ...scenario }) => scenario),
    linkedScenarios: AFTER_EYE_LINKED_SCENARIOS.map((spec, index) => ({
      ...spec,
      ...expandBeats(spec.beats, index + SCENARIO_SPECS.length),
    })).map(({ beats: _beats, ...scenario }) => scenario),
  }
}

export const BUNDLED_AFTER_THE_EYE_CONFIG = createBundledAfterTheEyeConfig()
