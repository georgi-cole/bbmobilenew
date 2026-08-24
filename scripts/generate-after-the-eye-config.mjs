import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

const ROOT = process.cwd()
const SOURCE_DIR = path.join(ROOT, 'src/screens/GameOver')
const OUTPUT_PATH = path.join(ROOT, 'public/config/afterTheEyeOutcomes.json')
const SOURCE_FILES = [1, 2, 3, 4, 5].map((index) =>
  path.join(SOURCE_DIR, `afterTheEyeOutcomeScenarios${index}.ts`)
)
const LINKED_SOURCE = path.join(SOURCE_DIR, 'afterTheEyeOutcomeLinkedScenarios.ts')

const editorial = {
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

const toneLabels = {
  excellent: 'Spectacular',
  good: 'Promising',
  neutral: 'Strange',
  bad: 'Messy',
  tragic: 'Catastrophic',
}

const categories = {
  sudden_fame: "Sudden Fame",
  career_triumph: "Career Triumph",
  career_disaster: "Career Disaster",
  romance: "Romance",
  pregnancy_parenthood: "Pregnancy & Parenthood",
  marriage_breakup: "Love, Marriage & Breakups",
  cheating_scandal: "Cheating Scandal",
  family_secret: "Family Secret",
  public_feud: "Public Feud",
  betrayal: "Betrayal",
  financial_success: "Financial Success",
  financial_ruin: "Financial Ruin",
  legal_trouble: "Legal Trouble",
  crime_scandal: "Crime & Scandal",
  accident_crisis: "Accident & Crisis",
  addiction_recovery: "Addiction & Recovery",
  secret_life: "Secret Life",
  destructive_excess: "Fame & Excess",
  recovery_redemption: "Recovery & Redemption",
  strange_business: "Strange Business",
  social_media: "Social Media",
  reality_tv_obsession: "Reality-TV Obsession",
  conspiracy: "Conspiracy",
  disappearance: "Disappearance",
  ordinary_life: "Unexpectedly Ordinary",
  bizarre_misunderstanding: "Bizarre Misunderstanding",
  absurd_success: "Absurd Success",
}

const supportedPlaceholders = new Set([
  'name',
  'firstName',
  'subject',
  'object',
  'possessive',
  'placement',
  'allyName',
  'rivalName',
  'romanticName',
  'partnerName',
  'competitionWins',
  'nominationCount',
  'seasonNumber',
  'winnerName',
  'publicApproval',
])
const collectionFields = ['headlines', 'subheadlines', 'bodies', 'bulletPoints', 'twists']

function parseSpecArray(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
    reportDiagnostics: true,
  })
  const diagnostics = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  )
  if (diagnostics.length > 0) {
    const messages = diagnostics
      .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
      .join('\n')
    throw new Error(`Could not compile ${path.relative(ROOT, filePath)}:\n${messages}`)
  }

  const module = { exports: {} }
  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(specifier) {
        throw new Error(
          `Scenario source ${path.relative(ROOT, filePath)} cannot import runtime module ${specifier}.`
        )
      },
    },
    {
      filename: filePath,
      timeout: 1000,
    }
  )

  const scenarioArray = Object.values(module.exports).find(Array.isArray)
  if (!scenarioArray) {
    throw new Error(
      `Could not locate the exported scenario array in ${path.relative(ROOT, filePath)}.`
    )
  }
  return scenarioArray
}

function lowerFirst(value) {
  if (!value) return value
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`
}

function expandBeats(beats, index) {
  const [setup, escalation, outcome] = beats
  const bodies = [
    `${setup} ${escalation} ${outcome}`,
    `${setup} Within days, ${lowerFirst(escalation)} What follows is harder to contain: ${lowerFirst(outcome)}`,
    `The story begins quietly. ${setup} Then ${lowerFirst(escalation)} By the time the cameras return, ${lowerFirst(outcome)}`,
    `At first, the facts look simple: ${lowerFirst(setup)} That changes when ${lowerFirst(escalation)} The final turn comes when ${lowerFirst(outcome)}`,
  ]
  return {
    subheadlines: [
      `${setup} ${outcome}`,
      `${escalation} ${outcome}`,
      `What begins in private becomes impossible to contain. ${outcome}`,
    ],
    bodies: [
      bodies[index % bodies.length],
      bodies[(index + 1) % bodies.length],
      bodies[(index + 2) % bodies.length],
    ],
    bulletPoints: [setup, escalation, outcome],
  }
}

function expandScenario(spec, index) {
  const { beats, ...scenario } = spec
  return { ...scenario, ...expandBeats(beats, index) }
}

function placeholders(text) {
  return [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1])
}

function validate(config) {
  const errors = []
  const categoryIds = new Set(Object.keys(config.categories))
  const ids = new Set()

  if (config.version !== 1) errors.push('version must be 1.')
  if (config.scenarios.length < 100) errors.push('at least 100 compiled individual scenarios are required.')
  if (config.linkedScenarios.length < 12) errors.push('at least twelve linked scenarios are required.')

  for (const [collectionName, linked] of [
    ['scenarios', false],
    ['linkedScenarios', true],
  ]) {
    config[collectionName].forEach((scenario, index) => {
      const at = `${collectionName}[${index}]`
      if (typeof scenario.id !== 'string' || !scenario.id.trim())
        errors.push(`${at}.id is missing.`)
      else if (ids.has(scenario.id)) errors.push(`${at}.id duplicates ${scenario.id}.`)
      else ids.add(scenario.id)
      if (!categoryIds.has(scenario.category)) errors.push(`${at}.category is unknown.`)
      if (!Number.isFinite(scenario.weight) || scenario.weight <= 0)
        errors.push(`${at}.weight is invalid.`)
      if (
        !linked &&
        (typeof scenario.cooldownGroup !== 'string' || !scenario.cooldownGroup.trim())
      ) {
        errors.push(`${at}.cooldownGroup is missing.`)
      }
      if (linked && !['ally', 'rival', 'romantic', 'betrayal'].includes(scenario.relation)) {
        errors.push(`${at}.relation is invalid.`)
      }

      const found = new Set()
      for (const field of collectionFields) {
        const values = scenario[field]
        if (
          !Array.isArray(values) ||
          values.length === 0 ||
          values.some((value) => typeof value !== 'string' || !value.trim())
        ) {
          errors.push(`${at}.${field} must be a non-empty string array.`)
          continue
        }
        for (const placeholder of values.flatMap(placeholders)) {
          found.add(placeholder)
          if (!supportedPlaceholders.has(placeholder)) {
            errors.push(`${at}.${field} uses unsupported placeholder {${placeholder}}.`)
          }
        }
      }

      if (!linked) {
        for (const [placeholder, relation] of [
          ['allyName', 'ally'],
          ['rivalName', 'rival'],
          ['romanticName', 'romantic'],
        ]) {
          if (found.has(placeholder) && scenario.eligibility?.requiresRelation !== relation) {
            errors.push(`${at} uses {${placeholder}} without requiresRelation "${relation}".`)
          }
        }
      }
    })
  }

  const tones = new Set(config.scenarios.map((scenario) => scenario.tone))
  for (const tone of ['excellent', 'good', 'neutral', 'bad', 'tragic']) {
    if (!tones.has(tone)) errors.push(`compiled databank is missing tone "${tone}".`)
  }

  for (const requiredCategory of [
    'pregnancy_parenthood',
    'cheating_scandal',
    'accident_crisis',
    'addiction_recovery',
    'crime_scandal',
    'family_secret',
  ]) {
    if (!config.scenarios.some((scenario) => scenario.category === requiredCategory)) {
      errors.push(`compiled databank is missing required drama category "${requiredCategory}".`)
    }
  }

  return errors
}

const scenarioSpecs = SOURCE_FILES.flatMap(parseSpecArray)
const linkedSpecs = parseSpecArray(LINKED_SOURCE)
const config = {
  version: 1,
  editorial,
  toneLabels,
  categories,
  scenarios: scenarioSpecs.map(expandScenario),
  linkedScenarios: linkedSpecs.map((spec, index) =>
    expandScenario(spec, index + scenarioSpecs.length)
  ),
}
const errors = validate(config)
if (errors.length > 0) {
  console.error(`After the Eye config validation failed with ${errors.length} error(s):`)
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

const serialized = `${JSON.stringify(config, null, 2)}\n`
const checkOnly = process.argv.includes('--check')
if (checkOnly) {
  if (fs.existsSync(OUTPUT_PATH)) {
    const existing = fs.readFileSync(OUTPUT_PATH, 'utf8')
    if (existing !== serialized) {
      console.error('The generated server config is out of sync. Run npm run generate:after-eye.')
      process.exit(1)
    }
  }
} else {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, serialized)
}

console.log(
  `After the Eye config is valid: ${config.scenarios.length} individual scenarios, ` +
    `${config.linkedScenarios.length} linked scenarios, ${Object.keys(config.categories).length} categories.`
)
