#!/usr/bin/env node
/**
 * generate-skins-manifest.mjs
 *
 * Scans public/assets/skins/ for image files and heuristically maps them to
 * the canonical theme keys used by backgroundTheme.ts.  Writes the result to
 * public/assets/skins/skins.json (pretty-printed).
 *
 * Usage:
 *   node ./scripts/generate-skins-manifest.mjs
 *
 * Run this locally after adding or renaming skin image files, then optionally
 * commit the generated skins.json alongside your changes.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKINS_DIR = path.resolve(__dirname, '..', 'public', 'assets', 'skins');
const MANIFEST_PATH = path.join(SKINS_DIR, 'skins.json');

/** Canonical theme keys (must match ThemeKey in backgroundTheme.ts). */
const THEME_KEYS = [
  'sunrise',
  'day',
  'sunset',
  'night',
  'rain',
  'snow',
  'snowday',
  'thunderstorm',
  'xmasDay',
  'xmasEve',
  'xmasNight',
];

/**
 * Substrings to look for in a filename (lower-cased) to identify each key.
 * Earlier entries in the array = more canonical match; used for sort priority.
 * NOTE: Keep in sync with the CANDIDATES map in src/utils/backgroundTheme.ts
 * so the generator can detect all filenames used by the runtime prober.
 */
const KEY_HINTS = {
  sunrise:      ['sunrise'],
  day:          ['day', 'daily', 'autumn', 'leaves'], // checked after xmasDay/snowday to avoid conflicts
  sunset:       ['sunset'],
  night:        ['night'],       // checked in DETECTION_PRIORITY before 'snow'; covers night-snow-background
  rain:         ['rain'],
  snowday:      ['snowday'],     // must come before 'snow'
  snow:         ['snow', 'blizzard'],
  thunderstorm: ['thunder', 'storm'],
  xmasDay:      ['xmas-day', 'xmasday', 'santa-day', 'santaday', 'christmas-day',
                 'xmas-background'], // 'xmas-background' is not a substring of 'xmas-*-background' so it uniquely matches xmas-background.{ext}
  xmasEve:      ['xmas-eve', 'xmaseve', 'christmas-eve'],
  xmasNight:    ['xmas-night', 'xmasnight', 'xmasy-night', 'christmas-night'],
};

/**
 * Priority order for key detection — more-specific keys are checked first to
 * avoid partial-match ambiguity.  'night' is checked before 'snow' so that
 * 'night-snow-background.png' maps to night rather than snow.
 */
const DETECTION_PRIORITY = [
  'xmasDay', 'xmasEve', 'xmasNight',
  'snowday', 'thunderstorm',
  'sunrise', 'sunset',
  'rain', 'night', 'snow',
  'day',
];

/** Supported image extensions. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif']);

function isImageFile(filename) {
  return IMAGE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

/**
 * Returns the theme key and the index of the matching hint within that key's
 * hints array for a given filename.  Earlier hint index = more canonical name.
 * Returns null if no key matches.
 */
function detectKeyWithHintIndex(filename) {
  const lower = filename.toLowerCase();
  for (const key of DETECTION_PRIORITY) {
    const hints = KEY_HINTS[key] ?? [];
    const hintIndex = hints.findIndex((h) => lower.includes(h));
    if (hintIndex !== -1) {
      return { key, hintIndex };
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

let skinsStats;
try {
  skinsStats = fs.statSync(SKINS_DIR);
} catch (err) {
  console.error(`[generate-skins-manifest] ERROR: unable to access skins path: ${SKINS_DIR}`);
  console.error(`  ${String(err)}`);
  process.exit(1);
}

if (!skinsStats.isDirectory()) {
  console.error(`[generate-skins-manifest] ERROR: skins path is not a directory: ${SKINS_DIR}`);
  console.error('  Ensure public/assets/skins is a directory, not a file.');
  process.exit(1);
}

const allFiles = fs.readdirSync(SKINS_DIR).filter((f) => isImageFile(f));

if (allFiles.length === 0) {
  console.warn('[generate-skins-manifest] WARNING: no image files found in', SKINS_DIR);
  console.warn('  The manifest will be empty.  Run scripts/fetch-skins.sh to download assets.');
}

// Build per-key candidate lists with hint-index metadata for sorting.
/** @type {Record<string, Array<{file: string, hintIndex: number}>>} */
const keyGroups = {};
for (const file of allFiles) {
  const match = detectKeyWithHintIndex(file);
  if (!match) {
    console.log(`  [skip] ${file}  (no matching theme key)`);
    continue;
  }
  if (!keyGroups[match.key]) keyGroups[match.key] = [];
  keyGroups[match.key].push({ file, hintIndex: match.hintIndex });
}

// Sort each group and emit manifest entries.
// Sort order: earlier hint index (more canonical) > no spaces/parens > alphabetical.
const manifest = {};
for (const key of THEME_KEYS) {
  const group = keyGroups[key];
  if (!group || group.length === 0) continue;

  group.sort((a, b) => {
    if (a.hintIndex !== b.hintIndex) return a.hintIndex - b.hintIndex;
    const aComplex = /[\s()]/.test(a.file) ? 1 : 0;
    const bComplex = /[\s()]/.test(b.file) ? 1 : 0;
    if (aComplex !== bComplex) return aComplex - bComplex;
    return a.file.localeCompare(b.file);
  });

  manifest[key] = group[0].file;
  console.log(`  [map]  ${group[0].file}  → ${key}`);
  for (let i = 1; i < group.length; i++) {
    console.log(`  [dup]  ${group[i].file}  → ${key} (already mapped to ${group[0].file}; skipping)`);
  }
}

// Report any theme keys that received no mapping
const unmapped = THEME_KEYS.filter((k) => !manifest[k]);
if (unmapped.length > 0) {
  console.warn('\n[generate-skins-manifest] WARNING: no file found for keys:', unmapped.join(', '));
  console.warn('  These keys will fall back to candidate probing at runtime.');
}

fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\n[generate-skins-manifest] Wrote ${MANIFEST_PATH}`);
