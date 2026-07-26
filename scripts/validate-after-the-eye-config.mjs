import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const BUNDLED_PATH = path.join(ROOT, 'src/screens/GameOver/afterTheEyeOutcomes.json');
const SERVER_PATH = path.join(ROOT, 'public/config/afterTheEyeOutcomes.json');
const REQUIRED_EDITORIAL_FIELDS = [
  'publicationName',
  'slogan',
  'editionLabel',
  'sectionLabel',
  'price',
  'issuePrefix',
  'intro',
  'closingLine',
  'photoCaption',
  'exclusiveLabel',
  'loadingLabel',
];
const REQUIRED_COLLECTIONS = ['headlines', 'subheadlines', 'bodies', 'bulletPoints', 'twists'];
const SUPPORTED_PLACEHOLDERS = new Set([
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function placeholders(text) {
  return [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/g)].map((match) => match[1]);
}

function validateConfig(config, label) {
  const errors = [];
  if (config.version !== 1) errors.push(`${label}: version must be 1.`);
  if (!config.editorial || typeof config.editorial !== 'object') {
    errors.push(`${label}: editorial is missing.`);
  } else {
    for (const field of REQUIRED_EDITORIAL_FIELDS) {
      if (typeof config.editorial[field] !== 'string' || !config.editorial[field].trim()) {
        errors.push(`${label}: editorial.${field} must be a non-empty string.`);
      }
    }
  }

  const categories = new Set(Object.keys(config.categories ?? {}));
  if (categories.size === 0) errors.push(`${label}: categories must not be empty.`);
  const ids = new Set();

  for (const [collectionName, linked] of [['scenarios', false], ['linkedScenarios', true]]) {
    const scenarios = config[collectionName];
    if (!Array.isArray(scenarios)) {
      errors.push(`${label}: ${collectionName} must be an array.`);
      continue;
    }

    scenarios.forEach((scenario, index) => {
      const at = `${label}: ${collectionName}[${index}]`;
      if (typeof scenario.id !== 'string' || !scenario.id.trim()) {
        errors.push(`${at}.id is missing.`);
      } else if (ids.has(scenario.id)) {
        errors.push(`${at}.id duplicates ${scenario.id}.`);
      } else {
        ids.add(scenario.id);
      }
      if (!categories.has(scenario.category)) errors.push(`${at}.category is unknown.`);
      if (!Number.isFinite(scenario.weight) || scenario.weight <= 0) {
        errors.push(`${at}.weight must be greater than zero.`);
      }
      if (!linked && (typeof scenario.cooldownGroup !== 'string' || !scenario.cooldownGroup.trim())) {
        errors.push(`${at}.cooldownGroup is missing.`);
      }

      const foundPlaceholders = new Set();
      for (const field of REQUIRED_COLLECTIONS) {
        const values = scenario[field];
        if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string' || !value.trim())) {
          errors.push(`${at}.${field} must be a non-empty string array.`);
          continue;
        }
        values.flatMap(placeholders).forEach((placeholder) => {
          foundPlaceholders.add(placeholder);
          if (!SUPPORTED_PLACEHOLDERS.has(placeholder)) {
            errors.push(`${at}.${field} uses unsupported placeholder {${placeholder}}.`);
          }
        });
      }

      if (!linked) {
        const requiredRelation = scenario.eligibility?.requiresRelation;
        const relationRules = [
          ['allyName', 'ally'],
          ['rivalName', 'rival'],
          ['romanticName', 'romantic'],
        ];
        relationRules.forEach(([placeholder, relation]) => {
          if (foundPlaceholders.has(placeholder) && requiredRelation !== relation) {
            errors.push(`${at} uses {${placeholder}} without requiresRelation "${relation}".`);
          }
        });
      }
    });
  }

  if ((config.scenarios?.length ?? 0) < 100) {
    errors.push(`${label}: at least 100 individual scenarios are required.`);
  }
  return errors;
}

const bundled = readJson(BUNDLED_PATH);
const server = readJson(SERVER_PATH);
const errors = [
  ...validateConfig(bundled, 'bundled config'),
  ...validateConfig(server, 'server config'),
];

if (JSON.stringify(bundled) !== JSON.stringify(server)) {
  errors.push('Bundled and server config copies are out of sync.');
}

if (errors.length > 0) {
  console.error(`After the Eye config validation failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(
    `After the Eye config is valid: ${bundled.scenarios.length} individual scenarios, `
    + `${bundled.linkedScenarios.length} linked scenarios, ${Object.keys(bundled.categories).length} categories.`,
  );
}
