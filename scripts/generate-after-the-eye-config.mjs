import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'src/screens/GameOver');
const OUTPUT_PATH = path.join(ROOT, 'public/config/afterTheEyeOutcomes.json');
const SOURCE_FILES = [1, 2, 3, 4, 5].map((index) =>
  path.join(SOURCE_DIR, `afterTheEyeOutcomeScenarios${index}.ts`),
);
const LINKED_SOURCE = path.join(SOURCE_DIR, 'afterTheEyeOutcomeLinkedScenarios.ts');

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
};

const toneLabels = {
  excellent: 'Spectacular',
  good: 'Promising',
  neutral: 'Strange',
  bad: 'Messy',
  tragic: 'Catastrophic',
};

const categories = {
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
};

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
]);
const collectionFields = ['headlines', 'subheadlines', 'bodies', 'bulletPoints', 'twists'];

function parseSpecArray(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const equalsIndex = source.indexOf('=');
  const startIndex = source.indexOf('[', equalsIndex);
  const endIndex = source.lastIndexOf('];');
  if (equalsIndex < 0 || startIndex < 0 || endIndex < 0) {
    throw new Error(`Could not locate the scenario array in ${path.relative(ROOT, filePath)}.`);
  }
  return JSON.parse(source.slice(startIndex, endIndex + 1));
}

function lowerFirst(value) {
  if (!value) return value;
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`;
}

function expandBeats(beats, index) {
  const [setup, escalation, outcome] = beats;
  const bodies = [
    `${setup} ${escalation} ${outcome}`,
    `It begins when ${lowerFirst(setup)} Soon, ${lowerFirst(escalation)} In the end, ${lowerFirst(outcome)}`,
    `At first, ${lowerFirst(setup)} The situation escalates when ${lowerFirst(escalation)} By the final update, ${lowerFirst(outcome)}`,
    `Nobody expects the story to go this far. ${setup} Then ${lowerFirst(escalation)} Finally, ${lowerFirst(outcome)}`,
  ];
  return {
    subheadlines: [
      `${setup} ${outcome}`,
      `${escalation} The ending becomes impossible to ignore.`,
    ],
    bodies: [bodies[index % bodies.length], bodies[(index + 1) % bodies.length]],
    bulletPoints: [setup, escalation, outcome],
  };
}

function expandScenario(spec, index) {
  const { beats, ...scenario } = spec;
  return { ...scenario, ...expandBeats(beats, index) };
}

function placeholders(text) {
  return [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]);
}

function validate(config) {
  const errors = [];
  const categoryIds = new Set(Object.keys(config.categories));
  const ids = new Set();

  if (config.version !== 1) errors.push('version must be 1.');
  if (config.scenarios.length < 100) errors.push('at least 100 individual scenarios are required.');
  if (config.linkedScenarios.length < 4) errors.push('at least four linked scenarios are required.');

  for (const [collectionName, linked] of [['scenarios', false], ['linkedScenarios', true]]) {
    config[collectionName].forEach((scenario, index) => {
      const at = `${collectionName}[${index}]`;
      if (typeof scenario.id !== 'string' || !scenario.id.trim()) errors.push(`${at}.id is missing.`);
      else if (ids.has(scenario.id)) errors.push(`${at}.id duplicates ${scenario.id}.`);
      else ids.add(scenario.id);
      if (!categoryIds.has(scenario.category)) errors.push(`${at}.category is unknown.`);
      if (!Number.isFinite(scenario.weight) || scenario.weight <= 0) errors.push(`${at}.weight is invalid.`);
      if (!linked && (typeof scenario.cooldownGroup !== 'string' || !scenario.cooldownGroup.trim())) {
        errors.push(`${at}.cooldownGroup is missing.`);
      }
      if (linked && !['ally', 'rival', 'romantic', 'betrayal'].includes(scenario.relation)) {
        errors.push(`${at}.relation is invalid.`);
      }

      const found = new Set();
      for (const field of collectionFields) {
        const values = scenario[field];
        if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string' || !value.trim())) {
          errors.push(`${at}.${field} must be a non-empty string array.`);
          continue;
        }
        for (const placeholder of values.flatMap(placeholders)) {
          found.add(placeholder);
          if (!supportedPlaceholders.has(placeholder)) {
            errors.push(`${at}.${field} uses unsupported placeholder {${placeholder}}.`);
          }
        }
      }

      if (!linked) {
        for (const [placeholder, relation] of [['allyName', 'ally'], ['rivalName', 'rival'], ['romanticName', 'romantic']]) {
          if (found.has(placeholder) && scenario.eligibility?.requiresRelation !== relation) {
            errors.push(`${at} uses {${placeholder}} without requiresRelation "${relation}".`);
          }
        }
      }
    });
  }

  return errors;
}

const scenarioSpecs = SOURCE_FILES.flatMap(parseSpecArray);
const linkedSpecs = parseSpecArray(LINKED_SOURCE);
const config = {
  version: 1,
  editorial,
  toneLabels,
  categories,
  scenarios: scenarioSpecs.map(expandScenario),
  linkedScenarios: linkedSpecs.map((spec, index) => expandScenario(spec, index + scenarioSpecs.length)),
};
const errors = validate(config);
if (errors.length > 0) {
  console.error(`After the Eye config validation failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const serialized = `${JSON.stringify(config, null, 2)}\n`;
const checkOnly = process.argv.includes('--check');
if (checkOnly) {
  if (fs.existsSync(OUTPUT_PATH)) {
    const existing = fs.readFileSync(OUTPUT_PATH, 'utf8');
    if (existing !== serialized) {
      console.error('The generated server config is out of sync. Run npm run generate:after-eye.');
      process.exit(1);
    }
  }
} else {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, serialized);
}

console.log(
  `After the Eye config is valid: ${config.scenarios.length} individual scenarios, `
  + `${config.linkedScenarios.length} linked scenarios, ${Object.keys(config.categories).length} categories.`,
);
